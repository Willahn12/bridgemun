"use client";

import { supabase } from "@/lib/supabase";
import { fromRow, type Session } from "@/lib/sessions";
import type { Org } from "@/lib/orgs";

/* ---------- Assignments ---------- */

export interface Assignment {
  id: string;
  orgId: string;
  title: string;
  description: string;
  dueAt: string | null;
  createdAt: string;
}

function toAssignment(r: Record<string, unknown>): Assignment {
  return {
    id: r.id as string,
    orgId: r.org_id as string,
    title: r.title as string,
    description: (r.description as string) ?? "",
    dueAt: (r.due_at as string | null) ?? null,
    createdAt: r.created_at as string,
  };
}

const fail = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};

export async function listAssignments(orgId: string): Promise<Assignment[]> {
  const { data, error } = await supabase()
    .from("assignments")
    .select("*")
    .eq("org_id", orgId)
    .order("due_at", { ascending: true, nullsFirst: false });
  fail(error);
  return (data ?? []).map(toAssignment);
}

export async function getAssignment(id: string): Promise<Assignment | null> {
  const { data, error } = await supabase().from("assignments").select("*").eq("id", id).maybeSingle();
  fail(error);
  return data ? toAssignment(data) : null;
}

export async function createAssignment(
  orgId: string,
  userId: string,
  v: { title: string; description: string; dueAt: string | null },
) {
  const { error } = await supabase()
    .from("assignments")
    .insert({ org_id: orgId, created_by: userId, title: v.title.trim(), description: v.description.trim(), due_at: v.dueAt });
  fail(error);
}

export async function deleteAssignment(id: string) {
  const { error } = await supabase().from("assignments").delete().eq("id", id);
  fail(error);
}

/* ---------- Submissions ---------- */

export interface Submission {
  assignmentId: string;
  userId: string;
  sessionId: string | null;
  submittedAt: string;
}

const toSubmission = (r: Record<string, unknown>): Submission => ({
  assignmentId: r.assignment_id as string,
  userId: r.user_id as string,
  sessionId: (r.session_id as string | null) ?? null,
  submittedAt: r.submitted_at as string,
});

/** Submissions for the given assignments. Students only ever get their own back; staff get the whole class. */
export async function listSubmissions(assignmentIds: string[]): Promise<Submission[]> {
  if (!assignmentIds.length) return [];
  const { data, error } = await supabase().from("submissions").select("*").in("assignment_id", assignmentIds);
  fail(error);
  return (data ?? []).map(toSubmission);
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
  const { data, error } = await supabase()
    .from("sessions")
    .select("id, topic, committee, ai_countries, updated_at, report")
    .eq("user_id", userId)
    .eq("phase", "ended")
    .order("updated_at", { ascending: false })
    .limit(50);
  fail(error);
  return (data ?? []).map((r) => ({
    id: r.id as string,
    topic: r.topic as string,
    committee: r.committee as string,
    aiCountries: (r.ai_countries as string[]) ?? [],
    updatedAt: r.updated_at as string,
    hasReport: r.report !== null,
  }));
}

/** Hands in a session. It is shared with the organization's teachers by attaching it to the organization. */
export async function submitSession(a: Assignment, userId: string, sessionId: string) {
  const sb = supabase();
  const shared = await sb.from("sessions").update({ org_id: a.orgId }).eq("id", sessionId).eq("user_id", userId);
  fail(shared.error);
  const { error } = await sb
    .from("submissions")
    .upsert({ assignment_id: a.id, user_id: userId, session_id: sessionId, submitted_at: new Date().toISOString() });
  fail(error);
}

export async function withdrawSubmission(assignmentId: string, userId: string) {
  const { error } = await supabase().from("submissions").delete().eq("assignment_id", assignmentId).eq("user_id", userId);
  fail(error);
}

/** Teachers reading a student's handed-in session. */
export async function getSessionForReview(sessionId: string): Promise<Session | null> {
  const { data, error } = await supabase().from("sessions").select("*").eq("id", sessionId).maybeSingle();
  fail(error);
  return data ? fromRow(data) : null;
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
  const horizon = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  const { data, error } = await supabase()
    .from("assignments")
    .select("*")
    .in("org_id", studentOrgs.map((o) => o.id))
    .not("due_at", "is", null)
    .lte("due_at", horizon)
    .order("due_at", { ascending: true });
  fail(error);
  const assignments = (data ?? []).map(toAssignment);
  const done = new Set((await listSubmissions(assignments.map((a) => a.id))).filter((s) => s.userId === userId).map((s) => s.assignmentId));
  const names = new Map(studentOrgs.map((o) => [o.id, o.name]));
  const now = Date.now();
  return assignments
    .filter((a) => !done.has(a.id))
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

const toMessage = (r: Record<string, unknown>): Message => ({
  id: r.id as string,
  channelId: r.channel_id as string,
  userId: r.user_id as string,
  body: r.body as string,
  createdAt: r.created_at as string,
});

export async function listChannels(orgId: string): Promise<Channel[]> {
  const { data, error } = await supabase().from("channels").select("id, name").eq("org_id", orgId).order("created_at");
  fail(error);
  return (data ?? []) as Channel[];
}

export async function createChannel(orgId: string, name: string): Promise<Channel> {
  const { data, error } = await supabase()
    .from("channels")
    .insert({ org_id: orgId, name: name.trim().toLowerCase().replace(/\s+/g, "-").slice(0, 40) })
    .select("id, name")
    .single();
  fail(error);
  return data as Channel;
}

export async function listMessages(channelId: string): Promise<Message[]> {
  const { data, error } = await supabase()
    .from("messages")
    .select("*")
    .eq("channel_id", channelId)
    .order("created_at", { ascending: false })
    .limit(100);
  fail(error);
  return (data ?? []).map(toMessage).reverse();
}

export async function sendMessage(channelId: string, userId: string, body: string): Promise<Message> {
  const { data, error } = await supabase()
    .from("messages")
    .insert({ channel_id: channelId, user_id: userId, body: body.trim() })
    .select("*")
    .single();
  fail(error);
  return toMessage(data as Record<string, unknown>);
}

export async function deleteMessage(id: string) {
  const { error } = await supabase().from("messages").delete().eq("id", id);
  fail(error);
}

/** Live updates for a channel. Returns a function that stops listening. */
export function watchMessages(channelId: string, onInsert: (m: Message) => void, onDelete: (id: string) => void) {
  const sb = supabase();
  const ch = sb
    .channel(`messages:${channelId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `channel_id=eq.${channelId}` }, (p) =>
      onInsert(toMessage(p.new)),
    )
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "messages" }, (p) => {
      const id = (p.old as { id?: string }).id;
      if (id) onDelete(id);
    })
    .subscribe();
  return () => {
    sb.removeChannel(ch);
  };
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
