"use client";

import { useSyncExternalStore } from "react";
import { currentUser, subscribeAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

export type Mode = "solo" | "committee" | "table";

/* Marker for the human (or, in table mode, the room) inside a speaking order. */
export const HUMAN = "__human__";

export interface Line {
  id: string;
  speaker: string;
  kind: "human" | "ai" | "chair";
  text: string;
}

export type Phase = "opening" | "debate" | "closing" | "ended";

export const PHASE_LABEL: Record<Phase, string> = {
  opening: "Opening statements",
  debate: "Moderated caucus",
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
  /** Where it came from. Online rooms keep a copy of the session in each member's account. */
  source?: "practice" | "room";
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

/* ---------- Saved sessions, stored in the signed-in user's Supabase account ----------
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

function toRow(s: Session, userId: string, withSource = true) {
  return {
    ...(withSource ? { source: s.source ?? "practice" } : {}),
    id: s.id,
    user_id: userId,
    mode: s.mode,
    committee: s.committee,
    topic: s.topic,
    human_country: s.humanCountry,
    ai_countries: s.aiCountries,
    judge: s.judge ?? true,
    speaking_order: s.order ?? [],
    cursor: s.cursor ?? 0,
    phase: s.phase ?? "debate",
    lines: s.lines,
    report: s.report ?? null,
    started_at: new Date(s.startedAt ?? Date.now()).toISOString(),
    ended_at: s.endedAt ? new Date(s.endedAt).toISOString() : null,
    updated_at: new Date().toISOString(),
  };
}

export function fromRow(r: Record<string, unknown>): Session {
  return {
    id: r.id as string,
    mode: r.mode as Mode,
    committee: r.committee as string,
    topic: r.topic as string,
    humanCountry: (r.human_country as string) ?? "",
    aiCountries: (r.ai_countries as string[]) ?? [],
    judge: r.judge as boolean,
    order: (r.speaking_order as string[]) ?? [],
    cursor: (r.cursor as number) ?? 0,
    phase: r.phase as Phase,
    lines: (r.lines as Line[]) ?? [],
    report: (r.report as Report | null) ?? undefined,
    source: r.source === "room" ? "room" : "practice",
    startedAt: r.started_at ? Date.parse(r.started_at as string) : undefined,
    endedAt: r.ended_at ? Date.parse(r.ended_at as string) : undefined,
    updatedAt: Date.parse(r.updated_at as string),
  };
}

async function refresh() {
  const user = currentUser();
  if (!user) {
    sessions = EMPTY;
    emit();
    return;
  }
  const { data, error } = await supabase()
    .from("sessions")
    .select("*")
    .order("updated_at", { ascending: false })
    .limit(100);
  if (error) {
    saveError = "Could not load your saved sessions.";
  } else {
    saveError = null;
    sessions = data.map(fromRow);
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
  let { error } = await supabase().from("sessions").upsert(batch.map((s) => toRow(s, user.id)));
  // Until migration 004 is run there is no "source" column, so save without it rather than fail.
  if (error && error.message.includes("source")) {
    ({ error } = await supabase().from("sessions").upsert(batch.map((s) => toRow(s, user.id, false))));
  }
  saveError = error ? "Your last changes could not be saved. Check your connection." : null;
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
  const { error } = await supabase().from("sessions").delete().eq("id", id);
  if (error) {
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
