"use client";

import {
  arrayRemove,
  arrayUnion,
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { currentUser } from "@/lib/auth";
import { myDisplayName } from "@/lib/orgs";

/* Saved research briefings in Firestore (`research`). The owner can share one by link: anyone signed in
   who opens the link can join as a collaborator and add follow-up questions and notes. The document id is
   the secret, the same idea as a room code. */

export interface Source {
  title: string;
  url: string;
}

export interface Followup {
  id: string;
  question: string;
  answer: string;
  sources: Source[];
  by: string;
  byName: string;
  at: number;
}

export interface Note {
  id: string;
  text: string;
  by: string;
  byName: string;
  at: number;
}

export interface Research {
  id: string;
  ownerId: string;
  ownerName: string;
  country: string;
  committee: string;
  topic: string;
  brief: string;
  sources: Source[];
  followups: Followup[];
  notes: Note[];
  collaborators: string[];
  collaboratorNames: Record<string, string>;
  createdAt: number;
  updatedAt: number;
}

const millis = (t: unknown) => (t instanceof Timestamp ? t.toMillis() : typeof t === "number" ? t : Date.now());
const rid = () => Math.random().toString(36).slice(2, 10);

function toResearch(id: string, d: Record<string, unknown>): Research {
  return {
    id,
    ownerId: d.ownerId as string,
    ownerName: (d.ownerName as string) || "Someone",
    country: d.country as string,
    committee: d.committee as string,
    topic: d.topic as string,
    brief: (d.brief as string) ?? "",
    sources: (d.sources as Source[]) ?? [],
    followups: ((d.followups as Followup[]) ?? []).slice().sort((a, b) => a.at - b.at),
    notes: ((d.notes as Note[]) ?? []).slice().sort((a, b) => a.at - b.at),
    collaborators: (d.collaborators as string[]) ?? [],
    collaboratorNames: (d.collaboratorNames as Record<string, string>) ?? {},
    createdAt: millis(d.createdAt),
    updatedAt: millis(d.updatedAt),
  };
}

function me(): string {
  const uid = currentUser()?.id;
  if (!uid) throw new Error("Sign in first.");
  return uid;
}

export async function saveResearch(r: { country: string; committee: string; topic: string; brief: string; sources: Source[] }): Promise<string> {
  const uid = me();
  const ref = doc(collection(db(), "research"));
  await setDoc(ref, {
    ownerId: uid,
    ownerName: await myDisplayName(uid),
    country: r.country.trim().slice(0, 100),
    committee: r.committee.trim().slice(0, 200),
    topic: r.topic.trim().slice(0, 200),
    brief: r.brief.slice(0, 30000),
    sources: r.sources.slice(0, 20),
    followups: [],
    notes: [],
    collaborators: [],
    collaboratorNames: {},
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  });
  return ref.id;
}

/** Briefings this person owns or collaborates on, newest first. */
export async function listMyResearch(userId: string): Promise<Research[]> {
  const col = collection(db(), "research");
  const [owned, shared] = await Promise.all([
    getDocs(query(col, where("ownerId", "==", userId))),
    getDocs(query(col, where("collaborators", "array-contains", userId))),
  ]);
  const all = new Map<string, Research>();
  [...owned.docs, ...shared.docs].forEach((d) => all.set(d.id, toResearch(d.id, d.data())));
  return [...all.values()].sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getResearch(id: string): Promise<Research | null> {
  const snap = await getDoc(doc(db(), "research", id));
  return snap.exists() ? toResearch(snap.id, snap.data()) : null;
}

export function watchResearch(id: string, onChange: (r: Research | null) => void, onError: (e: Error) => void): () => void {
  return onSnapshot(
    doc(db(), "research", id),
    (snap) => onChange(snap.exists() ? toResearch(snap.id, snap.data()) : null),
    (e) => onError(e),
  );
}

export async function joinResearch(id: string): Promise<void> {
  const uid = me();
  await updateDoc(doc(db(), "research", id), {
    collaborators: arrayUnion(uid),
    [`collaboratorNames.${uid}`]: await myDisplayName(uid),
    updatedAt: Timestamp.now(),
  });
}

export async function leaveResearch(id: string): Promise<void> {
  const uid = me();
  await updateDoc(doc(db(), "research", id), {
    collaborators: arrayRemove(uid),
    [`collaboratorNames.${uid}`]: deleteField(),
    updatedAt: Timestamp.now(),
  });
}

export async function addFollowup(id: string, f: { question: string; answer: string; sources: Source[] }): Promise<void> {
  const uid = me();
  const entry: Followup = {
    id: rid(),
    question: f.question.slice(0, 500),
    answer: f.answer.slice(0, 8000),
    sources: f.sources.slice(0, 10),
    by: uid,
    byName: await myDisplayName(uid),
    at: Date.now(),
  };
  await updateDoc(doc(db(), "research", id), { followups: arrayUnion(entry), updatedAt: Timestamp.now() });
}

export async function addNote(id: string, text: string): Promise<void> {
  const uid = me();
  const entry: Note = { id: rid(), text: text.trim().slice(0, 2000), by: uid, byName: await myDisplayName(uid), at: Date.now() };
  await updateDoc(doc(db(), "research", id), { notes: arrayUnion(entry), updatedAt: Timestamp.now() });
}

export async function removeNote(id: string, note: Note): Promise<void> {
  await updateDoc(doc(db(), "research", id), { notes: arrayRemove(note), updatedAt: Timestamp.now() });
}

export async function deleteResearch(id: string): Promise<void> {
  await deleteDoc(doc(db(), "research", id));
}

/** Reads the research route's stream: text as it arrives, then the cited sources. */
export async function streamResearch(
  body: Record<string, unknown>,
  onText: (textSoFar: string) => void,
): Promise<{ text: string; sources: Source[] }> {
  const res = await fetch("/api/research", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!res.ok || !res.body) {
    const err = await res.json().catch(() => ({}));
    throw new Error((err as { error?: string }).error ?? "Request failed");
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let sources: Source[] = [];
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      const ev = JSON.parse(line) as { type: string; text?: string; sources?: Source[]; error?: string };
      if (ev.type === "delta" && ev.text) {
        text += ev.text;
        onText(text);
      } else if (ev.type === "done") sources = ev.sources ?? [];
      else if (ev.type === "error") throw new Error(ev.error ?? "The research request failed.");
    }
  }
  return { text, sources };
}
