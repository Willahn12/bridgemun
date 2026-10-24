"use client";

import { useSyncExternalStore } from "react";
import { doc, deleteDoc, getDoc, getDocs, collection, query, where, Timestamp, writeBatch } from "firebase/firestore";
import { currentUser, subscribeAuth } from "@/lib/auth";
import { db } from "@/lib/firebase";
import type { Procedure } from "@/lib/motions";
import type { PointType } from "@/lib/points";

export type Mode = "solo" | "committee" | "table";

/* Marker for the human (or, in table mode, the room) inside a speaking order. */
export const HUMAN = "__human__";

export interface Line {
  id: string;
  speaker: string;
  kind: "human" | "ai" | "chair";
  text: string;
  /** Said during an unmoderated caucus: informal, and not counted against debate time. */
  informal?: boolean;
  /** A point the human delegate raised (not a speech, so not counted against debate time). */
  point?: PointType;
  /** The human delegate introducing a draft resolution (not counted against debate time). */
  resolution?: boolean;
}

export type Phase = "opening" | "debate" | "closing" | "ended";

export const PHASE_LABEL: Record<Phase, string> = {
  opening: "Opening statements",
  debate: "General debate",
  closing: "Closing statements",
  ended: "Adjourned",
};

/* Personal coaching, written after a session and kept with its report. */
export interface Coach {
  overview: string;
  focusAreas: { title: string; why: string; howTo: string }[];
  phrases: { instead: string; say: string }[];
  rewrite: { original: string; improved: string; why: string } | null;
  drills: { name: string; steps: string; minutes: number }[];
  study: { topic: string; why: string }[];
  encouragement: string;
}

export interface Report {
  summary: string;
  scores: { criterion: string; score: number; comment: string }[];
  strengths: string[];
  improvements: string[];
  moments: { quote: string; note: string }[];
  nextSteps: string[];
  coach?: Coach;
}

export interface Session {
  id: string;
  mode: Mode;
  committee: string;
  topic: string;
  humanCountry: string;
  aiCountries: string[];
  lines: Line[];
  updatedAt: number;
  phase?: Phase;
  report?: Report;
  startedAt?: number;
  endedAt?: number;
  judge?: boolean;
  order?: string[];
  cursor?: number;
  /** Motion system state: debate limit, extensions, a moderated caucus in progress, AI motion counters. */
  procedure?: Procedure;
  /** Where it came from. Online rooms keep a copy of the session in each member's account. */
  source?: "practice" | "room";
  /** Set once a session is shared with an organization (handed in as an assignment). */
  orgId?: string;
}

export const MODE_LABEL: Record<Mode, string> = {
  solo: "Solo practice",
  committee: "Committee practice",
  table: "Comp mode, table",
};

export const uid = () => Math.random().toString(36).slice(2, 10);
export const newSessionId = () => crypto.randomUUID();

export function sessionTitle(s: Session): string {
  const who = s.aiCountries.join(", ") || "AI";
  return `${who}: ${s.topic}`;
}

/* ---------- Saved sessions, stored in the signed-in user's Firestore account ----------
   Guests cannot save. Everything below is a no-op until someone is signed in. */

const EMPTY: Session[] = [];
let sessions: Session[] = EMPTY;
let saveError: string | null = null;
let lastUserId: string | null = null;
let initialised = false;
const listeners = new Set<() => void>();
const pending = new Map<string, Session>();
let timer: ReturnType<typeof setTimeout> | null = null;

const emit = () => listeners.forEach((l) => l());
const toMillis = (t: unknown) => (t instanceof Timestamp ? t.toMillis() : Date.now());

function toDoc(s: Session, userId: string) {
  return {
    source: s.source ?? "practice",
    id: s.id,
    userId,
    orgId: s.orgId ?? null,
    mode: s.mode,
    committee: s.committee,
    topic: s.topic,
    humanCountry: s.humanCountry,
    aiCountries: s.aiCountries,
    judge: s.judge ?? true,
    speakingOrder: s.order ?? [],
    cursor: s.cursor ?? 0,
    phase: s.phase ?? "debate",
    procedure: s.procedure ?? null,
    lines: s.lines,
    report: s.report ?? null,
    startedAt: Timestamp.fromMillis(s.startedAt ?? Date.now()),
    endedAt: s.endedAt ? Timestamp.fromMillis(s.endedAt) : null,
    updatedAt: Timestamp.now(),
  };
}

export function fromRow(r: Record<string, unknown>): Session {
  return {
    id: r.id as string,
    mode: r.mode as Mode,
    committee: r.committee as string,
    topic: r.topic as string,
    humanCountry: (r.humanCountry as string) ?? "",
    aiCountries: (r.aiCountries as string[]) ?? [],
    judge: r.judge as boolean,
    order: (r.speakingOrder as string[]) ?? [],
    cursor: (r.cursor as number) ?? 0,
    phase: r.phase as Phase,
    procedure: (r.procedure as Procedure | null) ?? undefined,
    lines: (r.lines as Line[]) ?? [],
    report: (r.report as Report | null) ?? undefined,
    source: r.source === "room" ? "room" : "practice",
    orgId: (r.orgId as string | null) ?? undefined,
    startedAt: r.startedAt ? toMillis(r.startedAt) : undefined,
    endedAt: r.endedAt ? toMillis(r.endedAt) : undefined,
    updatedAt: toMillis(r.updatedAt),
  };
}

export async function getSession(id: string): Promise<Session | null> {
  const snap = await getDoc(doc(db(), "sessions", id));
  return snap.exists() ? fromRow({ id: snap.id, ...snap.data() }) : null;
}

async function refresh() {
  const user = currentUser();
  if (!user) {
    sessions = EMPTY;
    emit();
    return;
  }
  try {
    const snap = await getDocs(query(collection(db(), "sessions"), where("userId", "==", user.id)));
    saveError = null;
    sessions = snap.docs
      .map((d) => fromRow({ id: d.id, ...d.data() }))
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, 100);
  } catch {
    saveError = "Could not load your saved sessions.";
  }
  emit();
}

function init() {
  if (initialised || typeof window === "undefined") return;
  initialised = true;
  subscribeAuth(() => {
    const id = currentUser()?.id ?? null;
    if (id !== lastUserId) {
      lastUserId = id;
      pending.clear();
      refresh();
    }
  });
}

/* Writes queued saves now. Called on a short delay after each change, and when leaving a session. */
export async function flushSaves() {
  if (timer) clearTimeout(timer);
  timer = null;
  const user = currentUser();
  if (!user || pending.size === 0) return;
  const batch = [...pending.values()];
  pending.clear();
  try {
    const b = writeBatch(db());
    for (const s of batch) b.set(doc(db(), "sessions", s.id), toDoc(s, user.id), { merge: true });
    await b.commit();
    saveError = null;
  } catch {
    saveError = "Your last changes could not be saved. Check your connection.";
  }
  emit();
}

export function saveSession(s: Session) {
  if (!currentUser()) return;
  const stamped = { ...s, updatedAt: Date.now() };
  sessions = [stamped, ...sessions.filter((x) => x.id !== s.id)].slice(0, 100);
  pending.set(s.id, stamped);
  emit();
  if (timer) clearTimeout(timer);
  timer = setTimeout(flushSaves, 700);
}

export async function deleteSession(id: string) {
  sessions = sessions.filter((x) => x.id !== id);
  pending.delete(id);
  emit();
  try {
    await deleteDoc(doc(db(), "sessions", id));
  } catch {
    saveError = "That session could not be deleted.";
    emit();
  }
}

/* A finished session that was not saved is kept for this browser tab only, so its report page still works. */
export const stashKey = (id: string) => `bridgemun.unsaved.${id}`;

export function stashSession(s: Session) {
  try {
    sessionStorage.setItem(stashKey(s.id), JSON.stringify(s));
  } catch {
    // storage unavailable: the report page will say it cannot be found
  }
}

export function readStash(id: string): Session | null {
  try {
    const raw = sessionStorage.getItem(stashKey(id));
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function clearStash(id: string) {
  try {
    sessionStorage.removeItem(stashKey(id));
  } catch {
    // nothing to clear
  }
}

function subscribe(cb: () => void) {
  init();
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useSavedSessions(): Session[] {
  return useSyncExternalStore(subscribe, () => sessions, () => EMPTY);
}

export function useSaveError(): string | null {
  return useSyncExternalStore(subscribe, () => saveError, () => null);
}
