"use client";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { getSession, type Session } from "@/lib/sessions";
import type { Org } from "@/lib/orgs";
import { db } from "@/lib/firebase";

const toIso = (t: unknown) => (t instanceof Timestamp ? t.toDate().toISOString() : null);
/** Firestore 'in' queries accept at most 30 values, so longer lists are split and merged. */
async function chunkedIn<T>(ids: string[], run: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
  if (!ids.length) return [];
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += 30) chunks.push(ids.slice(i, i + 30));
  const results = await Promise.all(chunks.map(run));
  return results.flat();
}

/* ---------- Assignments ---------- */

export interface Assignment {
  id: string;
  orgId: string;
  title: string;
  description: string;
  dueAt: string | null;
  createdAt: string;
}

function toAssignment(id: string, r: Record<string, unknown>): Assignment {
  return {
    id,
    orgId: r.orgId as string,
    title: r.title as string,
    description: (r.description as string) ?? "",
    dueAt: toIso(r.dueAt),
    createdAt: toIso(r.createdAt) ?? new Date().toISOString(),
  };
}

export async function listAssignments(orgId: string): Promise<Assignment[]> {
  const snap = await getDocs(query(collection(db(), "assignments"), where("orgId", "==", orgId)));
  return snap.docs
    .map((d) => toAssignment(d.id, d.data()))
    .sort((a, b) => (a.dueAt ? Date.parse(a.dueAt) : Infinity) - (b.dueAt ? Date.parse(b.dueAt) : Infinity));
}

export async function getAssignment(id: string): Promise<Assignment | null> {
  const snap = await getDoc(doc(db(), "assignments", id));
  return snap.exists() ? toAssignment(snap.id, snap.data()) : null;
}

export async function createAssignment(
  orgId: string,
  userId: string,
  v: { title: string; description: string; dueAt: string | null },
) {
  await addDoc(collection(db(), "assignments"), {
    orgId,
    createdBy: userId,
    title: v.title.trim(),
    description: v.description.trim(),
    dueAt: v.dueAt ? Timestamp.fromMillis(Date.parse(v.dueAt)) : null,
    createdAt: serverTimestamp(),
  });
}

export async function deleteAssignment(id: string) {
  await deleteDoc(doc(db(), "assignments", id));
}

/* ---------- Submissions ---------- */

export interface Submission {
  assignmentId: string;
  userId: string;
  sessionId: string | null;
  submittedAt: string;
}

const submissionId = (assignmentId: string, userId: string) => `${assignmentId}_${userId}`;

function toSubmission(r: Record<string, unknown>): Submission {
  return {
    assignmentId: r.assignmentId as string,
    userId: r.userId as string,
    sessionId: (r.sessionId as string | null) ?? null,
    submittedAt: toIso(r.submittedAt) ?? new Date().toISOString(),
  };
}

/** Submissions for the given assignments. Students only ever get their own back; staff get the whole class. */
export async function listSubmissions(assignmentIds: string[]): Promise<Submission[]> {
  return chunkedIn(assignmentIds, async (chunk) => {
    const snap = await getDocs(query(collection(db(), "submissions"), where("assignmentId", "in", chunk)));
    return snap.docs.map((d) => toSubmission(d.data()));
  });
}

export interface SessionSummary {
  id: string;
  topic: string;
  committee: string;
  aiCountries: string[];
  updatedAt: string;
  hasReport: boolean;
}

/** The signed-in user's finished sessions, newest first. */
export async function myFinishedSessions(userId: string): Promise<SessionSummary[]> {
  const snap = await getDocs(
    query(collection(db(), "sessions"), where("userId", "==", userId), where("phase", "==", "ended")),
  );
  return snap.docs
    .map((d) => {
      const r = d.data();
      return {
        id: d.id,
        topic: r.topic as string,
        committee: r.committee as string,
        aiCountries: (r.aiCountries as string[]) ?? [],
        updatedAt: toIso(r.updatedAt) ?? new Date().toISOString(),
        hasReport: r.report != null,
      };
    })
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
    .slice(0, 50);
}

/** Hands in a session. It is shared with the organization's teachers by attaching it to the organization. */
export async function submitSession(a: Assignment, userId: string, sessionId: string) {
  await updateDoc(doc(db(), "sessions", sessionId), { orgId: a.orgId });
  await setDoc(doc(db(), "submissions", submissionId(a.id, userId)), {
    assignmentId: a.id,
    userId,
    sessionId,
    submittedAt: serverTimestamp(),
  });
}

export async function withdrawSubmission(assignmentId: string, userId: string) {
  await deleteDoc(doc(db(), "submissions", submissionId(assignmentId, userId)));
}

/** Teachers reading a student's handed-in session. */
export async function getSessionForReview(sessionId: string): Promise<Session | null> {
  return getSession(sessionId);
}

/* ---------- Reminders: what is coming up across all my organizations ---------- */

export interface Reminder {
  assignment: Assignment;
  orgName: string;
  overdue: boolean;
}

export async function myReminders(userId: string, orgs: Org[]): Promise<Reminder[]> {
  const studentOrgs = orgs.filter((o) => o.role === "student");
  if (!studentOrgs.length) return [];
  const horizon = Date.now() + 7 * 24 * 3600 * 1000;
  const assignments = (
    await chunkedIn(
      studentOrgs.map((o) => o.id),
      async (chunk) => {
        const snap = await getDocs(query(collection(db(), "assignments"), where("orgId", "in", chunk)));
        return snap.docs.map((d) => toAssignment(d.id, d.data()));
      },
    )
  ).filter((a) => a.dueAt && Date.parse(a.dueAt) <= horizon);
  const done = new Set(
    (await listSubmissions(assignments.map((a) => a.id))).filter((s) => s.userId === userId).map((s) => s.assignmentId),
  );
  const names = new Map(studentOrgs.map((o) => [o.id, o.name]));
  const now = Date.now();
  return assignments
    .filter((a) => !done.has(a.id))
    .sort((a, b) => Date.parse(a.dueAt as string) - Date.parse(b.dueAt as string))
    .map((a) => ({ assignment: a, orgName: names.get(a.orgId) ?? "", overdue: Date.parse(a.dueAt as string) < now }));
}

/* ---------- Chat ---------- */

export interface Channel {
  id: string;
  name: string;
}
export interface Message {
  id: string;
  channelId: string;
  userId: string;
  body: string;
  createdAt: string;
}

const toMessage = (id: string, r: Record<string, unknown>): Message => ({
  id,
  channelId: r.channelId as string,
  userId: r.userId as string,
  body: r.body as string,
  createdAt: toIso(r.createdAt) ?? new Date().toISOString(),
});

export async function listChannels(orgId: string): Promise<Channel[]> {
  const snap = await getDocs(query(collection(db(), "channels"), where("orgId", "==", orgId)));
  return snap.docs
    .map((d) => ({ id: d.id, name: d.data().name as string, createdAt: d.data().createdAt as Timestamp | undefined }))
    .sort((a, b) => (a.createdAt?.toMillis() ?? 0) - (b.createdAt?.toMillis() ?? 0))
    .map((c) => ({ id: c.id, name: c.name }));
}

export async function createChannel(orgId: string, name: string): Promise<Channel> {
  const cleaned = name.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 40);
  const ref = await addDoc(collection(db(), "channels"), { orgId, name: cleaned, createdAt: serverTimestamp() });
  return { id: ref.id, name: cleaned };
}

export async function listMessages(channelId: string): Promise<Message[]> {
  const snap = await getDocs(query(collection(db(), "messages"), where("channelId", "==", channelId)));
  return snap.docs
    .map((d) => toMessage(d.id, d.data()))
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .slice(-100);
}

export async function sendMessage(channelId: string, userId: string, body: string): Promise<Message> {
  const ref = await addDoc(collection(db(), "messages"), {
    channelId,
    userId,
    body: body.trim(),
    createdAt: serverTimestamp(),
  });
  const snap = await getDoc(ref);
  return toMessage(ref.id, snap.data() ?? {});
}

export async function deleteMessage(id: string) {
  await deleteDoc(doc(db(), "messages", id));
}

/** Live updates for a channel. Returns a function that stops listening. */
export function watchMessages(channelId: string, onInsert: (m: Message) => void, onDelete: (id: string) => void) {
  const seen = new Set<string>();
  const unsub = onSnapshot(query(collection(db(), "messages"), where("channelId", "==", channelId)), (snap) => {
    for (const change of snap.docChanges()) {
      if (change.type === "added" && !seen.has(change.doc.id)) {
        seen.add(change.doc.id);
        onInsert(toMessage(change.doc.id, change.doc.data()));
      } else if (change.type === "removed") {
        seen.delete(change.doc.id);
        onDelete(change.doc.id);
      }
    }
  });
  return unsub;
}

/* ---------- Dates ---------- */

export function dueText(iso: string | null): { label: string; overdue: boolean } {
  if (!iso) return { label: "No due date", overdue: false };
  const due = new Date(iso);
  const diff = due.getTime() - Date.now();
  const days = Math.round(Math.abs(diff) / 86400000);
  const when = due.toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const rel =
    diff < 0
      ? days === 0
        ? "overdue today"
        : `overdue by ${days} day${days === 1 ? "" : "s"}`
      : days === 0
        ? "due today"
        : `in ${days} day${days === 1 ? "" : "s"}`;
  return { label: `Due ${when}, ${rel}`, overdue: diff < 0 };
}
