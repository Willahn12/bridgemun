"use client";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { currentUser } from "@/lib/auth";
import { myDisplayName } from "@/lib/orgs";
import { db } from "@/lib/firebase";
import type { Report } from "@/lib/sessions";

export type RoomStatus = "lobby" | "live" | "ended";
export type RoomPhase = "lobby" | "opening" | "debate" | "closing";

/** One place in the drawn speaking order. */
export interface TurnEntry {
  name: string;
  kind: "ai" | "human";
  userId: string | null;
}

export interface Room {
  id: string;
  code: string;
  hostId: string;
  committee: string;
  topic: string;
  aiCountry: string;
  aiCountries: string[];
  judge: boolean;
  visibility: "public" | "private";
  status: RoomStatus;
  phase: RoomPhase;
  turnOrder: TurnEntry[];
  cursor: number;
  turnUser: string | null;
  turnDeadline: string | null;
  report: Report | null;
  createdAt: string;
  endedAt: string | null;
}

export interface RoomMember {
  userId: string;
  country: string;
  name: string;
}

export interface RoomLine {
  id: string;
  userId: string | null;
  speaker: string;
  kind: "human" | "ai" | "chair";
  text: string;
  createdAt: string;
  /** Storage path of a voice recording, if the speaker recorded one. */
  audioPath: string | null;
  /** For the judge's acknowledgement: the line it introduces. */
  refId: string | null;
}

/* Firestore document fields below deliberately keep the same snake_case names the app already
   reads and writes through updateRoom(id, fields), so that file needs no changes here. */

const toIso = (t: unknown) => (t instanceof Timestamp ? t.toDate().toISOString() : new Date().toISOString());

function toRoom(id: string, r: Record<string, unknown>): Room {
  return {
    id,
    code: r.code as string,
    hostId: r.host_id as string,
    committee: r.committee as string,
    topic: r.topic as string,
    aiCountry: r.ai_country as string,
    aiCountries: ((r.ai_countries as string[] | null)?.length ? (r.ai_countries as string[]) : [r.ai_country as string]),
    judge: r.judge as boolean,
    visibility: r.visibility === "public" ? "public" : "private",
    status: r.status as RoomStatus,
    phase: ((r.phase as RoomPhase | null) ?? "lobby"),
    turnOrder: ((r.turn_order as TurnEntry[] | null) ?? []),
    cursor: ((r.cursor as number | null) ?? 0),
    turnUser: ((r.turn_user as string | null) ?? null),
    turnDeadline: ((r.turn_deadline as string | null) ?? null),
    report: (r.report as Report | null) ?? null,
    createdAt: toIso(r.created_at),
    endedAt: r.ended_at ? toIso(r.ended_at) : null,
  };
}

const toLine = (id: string, r: Record<string, unknown>): RoomLine => ({
  id,
  userId: (r.user_id as string | null) ?? null,
  speaker: r.speaker as string,
  kind: r.kind as RoomLine["kind"],
  text: r.text as string,
  createdAt: toIso(r.created_at),
  audioPath: (r.audio_path as string | null) ?? null,
  refId: (r.ref_id as string | null) ?? null,
});

export function friendlyRoomError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid room code")) return "That room code was not found. Check it and try again.";
  if (m.includes("has ended")) return "That session has already ended.";
  if (m.includes("already started")) return "That session has already started, so no one else can join.";
  if (m.includes("country taken")) return "That country is already taken in this room. Choose a different one.";
  if (m.includes("between 1 and 4")) return "Add between 1 and 4 AI countries.";
  if (m.includes("sign in")) return "Sign in first.";
  if (m.includes("permission-denied") || m.includes("permission denied")) return "You do not have permission to do that.";
  if (m.includes("recordings are not set up")) return "Voice recordings are not set up yet for this room.";
  return message;
}

function validateAiCountries(aiCountries: string[], myCountry: string): string[] {
  const cleaned = aiCountries.map((c) => c.trim().slice(0, 100)).filter((c) => c.length >= 2);
  if (cleaned.length < 1 || cleaned.length > 4) throw new Error("Choose between 1 and 4 AI countries.");
  const lower = cleaned.map((c) => c.toLowerCase());
  if (new Set(lower).size !== lower.length) throw new Error("Country taken: the AI countries must be different.");
  const me = myCountry.trim().toLowerCase();
  if (me && lower.includes(me)) throw new Error("Country taken: an AI delegate already represents that country.");
  return cleaned;
}

const randomRoomCode = () =>
  Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");

export async function createRoom(v: {
  isPublic?: boolean;
  committee: string;
  topic: string;
  aiCountries: string[];
  judge: boolean;
  country: string;
}): Promise<string> {
  const uid = currentUser()?.id;
  if (!uid) throw new Error("Sign in first.");
  const ais = validateAiCountries(v.aiCountries, v.country);
  const me = v.country.trim().slice(0, 100);

  let code = randomRoomCode();
  for (let i = 0; i < 5; i++) {
    const existing = await getDocs(query(collection(db(), "rooms"), where("code", "==", code)));
    if (existing.empty) break;
    code = randomRoomCode();
  }

  const name = await myDisplayName(uid);
  const roomRef = doc(collection(db(), "rooms"));
  await setDoc(roomRef, {
    code,
    host_id: uid,
    host_name: name,
    committee: v.committee.trim(),
    topic: v.topic.trim(),
    ai_country: ais[0],
    ai_countries: ais,
    judge: v.judge ?? true,
    visibility: v.isPublic ? "public" : "private",
    status: "lobby",
    phase: "lobby",
    turn_order: [],
    cursor: 0,
    turn_user: null,
    turn_deadline: null,
    report: null,
    created_at: Timestamp.now(),
    ended_at: null,
  });
  await setDoc(doc(db(), "rooms", roomRef.id, "members", uid), {
    user_id: uid,
    country: me,
    name,
    joined_at: Timestamp.now(),
  });
  return roomRef.id;
}

/** A public room that has not started yet. */
export interface PublicRoom {
  id: string;
  code: string;
  committee: string;
  topic: string;
  aiCountries: string[];
  judge: boolean;
  hostName: string;
  players: number;
  createdAt: string;
}

export async function listPublicRooms(): Promise<PublicRoom[]> {
  const snap = await getDocs(
    query(collection(db(), "rooms"), where("visibility", "==", "public"), where("status", "==", "lobby")),
  );
  const horizon = Date.now() - 6 * 3600 * 1000;
  const fresh = snap.docs.filter((d) => {
    const c = d.data().created_at as Timestamp | undefined;
    return c ? c.toMillis() > horizon : false;
  });
  const rooms = await Promise.all(
    fresh.slice(0, 50).map(async (d) => {
      const r = d.data();
      const count = await getCountFromServer(collection(db(), "rooms", d.id, "members"));
      return {
        id: d.id,
        code: r.code as string,
        committee: r.committee as string,
        topic: r.topic as string,
        aiCountries: ((r.ai_countries as string[] | null)?.length ? (r.ai_countries as string[]) : [r.ai_country as string]),
        judge: r.judge as boolean,
        hostName: (r.host_name as string)?.trim() || "A host",
        players: count.data().count,
        createdAt: toIso(r.created_at),
      };
    }),
  );
  return rooms.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export async function joinRoom(code: string, country: string): Promise<string> {
  const uid = currentUser()?.id;
  if (!uid) throw new Error("Sign in first.");
  const snap = await getDocs(query(collection(db(), "rooms"), where("code", "==", code.trim().toUpperCase())));
  if (snap.empty) throw new Error("Invalid room code");
  const roomDoc = snap.docs[0];
  const r = roomDoc.data();
  if (r.status === "ended") throw new Error("This session has ended");

  const memberRef = doc(db(), "rooms", roomDoc.id, "members", uid);
  const already = await getDoc(memberRef);
  if (already.exists()) return roomDoc.id; // coming back to a room you are already in
  if (r.status !== "lobby") throw new Error("This session has already started");

  const me = country.trim().slice(0, 100);
  if (me) {
    const ais = ((r.ai_countries as string[] | null)?.length ? (r.ai_countries as string[]) : [r.ai_country as string]);
    const membersSnap = await getDocs(collection(db(), "rooms", roomDoc.id, "members"));
    const taken = [...ais.map((c) => c.toLowerCase()), ...membersSnap.docs.map((m) => ((m.data().country as string) || "").toLowerCase())];
    if (taken.includes(me.toLowerCase())) throw new Error("Country taken: someone in this room already represents that country");
  }

  const name = await myDisplayName(uid);
  await setDoc(memberRef, { user_id: uid, country: me, name, joined_at: Timestamp.now() });
  return roomDoc.id;
}

export async function getRoom(id: string): Promise<Room | null> {
  const snap = await getDoc(doc(db(), "rooms", id));
  return snap.exists() ? toRoom(snap.id, snap.data()) : null;
}

export async function listRoomMembers(roomId: string): Promise<RoomMember[]> {
  const snap = await getDocs(collection(db(), "rooms", roomId, "members"));
  return snap.docs
    .map((d) => {
      const r = d.data();
      return {
        userId: r.user_id as string,
        country: (r.country as string) || "",
        name: (r.name as string)?.trim() || "Unnamed",
        joinedAt: (r.joined_at as Timestamp | undefined)?.toMillis() ?? 0,
      };
    })
    .sort((a, b) => a.joinedAt - b.joinedAt)
    .map(({ userId, country, name }) => ({ userId, country, name }));
}

export async function listRoomLines(roomId: string): Promise<RoomLine[]> {
  const snap = await getDocs(collection(db(), "rooms", roomId, "lines"));
  return snap.docs
    .map((d) => toLine(d.id, d.data()))
    .sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt))
    .slice(-300);
}

export async function postLine(
  roomId: string,
  userId: string | null,
  speaker: string,
  kind: RoomLine["kind"],
  text: string,
  extra: { audioPath?: string; refId?: string } = {},
): Promise<RoomLine> {
  const data = {
    user_id: kind === "human" ? userId : null,
    speaker,
    kind,
    text,
    created_at: Timestamp.now(),
    ...(extra.audioPath ? { audio_path: extra.audioPath } : {}),
    ...(extra.refId ? { ref_id: extra.refId } : {}),
  };
  const ref = await addDoc(collection(db(), "rooms", roomId, "lines"), data);
  return toLine(ref.id, data);
}

export async function updateRoom(id: string, fields: Record<string, unknown>) {
  await updateDoc(doc(db(), "rooms", id), fields);
}

export async function leaveRoom(roomId: string, userId: string) {
  await deleteDoc(doc(db(), "rooms", roomId, "members", userId));
}

/** Live updates for everything in a room. Returns a function that stops listening. */
export function watchRoom(
  roomId: string,
  handlers: { onLine: (l: RoomLine) => void; onRoom: (r: Room) => void; onMembersChanged: () => void },
) {
  const seenLines = new Set<string>();
  const unsubLines = onSnapshot(collection(db(), "rooms", roomId, "lines"), (snap) => {
    for (const change of snap.docChanges()) {
      if (change.type === "added" && !seenLines.has(change.doc.id)) {
        seenLines.add(change.doc.id);
        handlers.onLine(toLine(change.doc.id, change.doc.data()));
      }
    }
  });
  let firstRoom = true;
  const unsubRoom = onSnapshot(doc(db(), "rooms", roomId), (snap) => {
    if (firstRoom) {
      firstRoom = false;
      return;
    }
    if (snap.exists()) handlers.onRoom(toRoom(snap.id, snap.data()));
  });
  const unsubMembers = onSnapshot(collection(db(), "rooms", roomId, "members"), () => {
    handlers.onMembersChanged();
  });
  return () => {
    unsubLines();
    unsubRoom();
    unsubMembers();
  };
}

/** Uploads a voice recording and returns its storage path. Firebase Storage is not set up for this project yet. */
export async function uploadClip(_roomId: string, _userId: string, _blob: Blob): Promise<string> {
  throw new Error("Voice recordings are not set up yet for this room.");
}

/** A temporary link a room member can play a recording from. */
export async function clipUrl(_path: string): Promise<string> {
  throw new Error("Voice recordings are not set up yet for this room.");
}
