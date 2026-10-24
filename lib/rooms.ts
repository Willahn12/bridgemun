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
  type QueryFieldFilterConstraint,
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
  /** An AI seat the host switched off during the session: its turns are skipped. */
  off?: boolean;
}

/** One country's place in a forum. AI seats are played by an AI delegate; the rest are open for people. */
export interface Seat {
  country: string;
  ai: boolean;
}

export const MIN_SEATS = 5;
export const MAX_SEATS = 30;
export const DURATIONS = [30, 60] as const;

/** Seconds each delegation gets for one speech in each stage. */
export interface TurnLimits {
  opening: number;
  debate: number;
  closing: number;
}

/* Rooms with no end time use these. */
export const DEFAULT_LIMITS: TurnLimits = { opening: 120, debate: 90, closing: 120 };

/** Shares the forum's time out fairly: every delegation gets the same time per stage. About 15% is kept for the
    judge, and an opening statement gets a quarter more than a debate or closing speech. */
export function splitTime(totalSeconds: number, delegations: number, rounds = 2): TurnLimits {
  const units = Math.max(1, delegations) * (1.25 + rounds + 1);
  const u = Math.max(20, Math.min(150, Math.floor((totalSeconds * 0.85) / units)));
  return { opening: Math.round(u * 1.25), debate: u, closing: u };
}

/** A floor vote the moderator opened. Ballots live in the `ballots` subcollection. */
export interface Voting {
  id: string;
  question: string;
  status: "open" | "closed";
}

export interface Ballot {
  voteId: string;
  userId: string | null;
  country: string;
  vote: "for" | "against" | "abstain";
  reason: string;
}

export interface Room {
  id: string;
  code: string;
  hostId: string;
  committee: string;
  topic: string;
  subtopic: string;
  aiCountry: string;
  aiCountries: string[];
  judge: boolean;
  visibility: RoomVisibility;
  /** "class" rooms: the organization whose members see it listed. */
  orgId: string | null;
  orgName: string | null;
  status: RoomStatus;
  phase: RoomPhase;
  turnOrder: TurnEntry[];
  cursor: number;
  turnUser: string | null;
  turnDeadline: string | null;
  report: Report | null;
  createdAt: string;
  endedAt: string | null;
  /** Forums made with the seat form. Older rooms have none and use free-typed countries. */
  seats: Seat[] | null;
  /** When the host planned to start, if scheduled. */
  startsAt: string | null;
  /** Session length in minutes, if the room has one. */
  durationMin: number | null;
  /** When the session went live and when its time runs out. */
  liveAt: string | null;
  endsAt: string | null;
  voting: Voting | null;
  /** People may still join after the forum has started. */
  lateJoin: boolean;
  /** A fixed end time the host chose, instead of a length. */
  endAt: string | null;
  /** Each delegation's speaking time, set when the forum starts. */
  limits: TurnLimits | null;
}

export interface RoomMember {
  userId: string;
  country: string;
  name: string;
  /** The host chose to moderate instead of taking a seat, so they never get a turn. */
  moderator: boolean;
  /** The AI voice that reads this person's speeches aloud, if they chose one. */
  voice: number | null;
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
  /** Said live over the microphone: everyone already heard it, so it is not read out again. */
  live: boolean;
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
    subtopic: (r.subtopic as string | null) ?? "",
    aiCountry: r.ai_country as string,
    aiCountries: aiOf(r),
    judge: r.judge as boolean,
    visibility: r.visibility === "public" || r.visibility === "class" ? r.visibility : "private",
    orgId: (r.org_id as string | null) ?? null,
    orgName: (r.org_name as string | null) ?? null,
    status: r.status as RoomStatus,
    phase: ((r.phase as RoomPhase | null) ?? "lobby"),
    turnOrder: ((r.turn_order as TurnEntry[] | null) ?? []),
    cursor: ((r.cursor as number | null) ?? 0),
    turnUser: ((r.turn_user as string | null) ?? null),
    turnDeadline: ((r.turn_deadline as string | null) ?? null),
    report: (r.report as Report | null) ?? null,
    createdAt: toIso(r.created_at),
    endedAt: r.ended_at ? toIso(r.ended_at) : null,
    seats: Array.isArray(r.seats) ? (r.seats as Seat[]) : null,
    startsAt: (r.starts_at as string | null) ?? null,
    durationMin: (r.duration_min as number | null) ?? null,
    liveAt: (r.live_at as string | null) ?? null,
    endsAt: (r.ends_at as string | null) ?? null,
    voting: (r.voting as Voting | null) ?? null,
    lateJoin: r.late_join === true,
    endAt: (r.end_at as string | null) ?? null,
    limits: (r.limits as TurnLimits | null) ?? null,
  };
}

const aiOf = (r: Record<string, unknown>): string[] =>
  Array.isArray(r.seats)
    ? (r.seats as Seat[]).filter((s) => s.ai).map((s) => s.country)
    : (r.ai_countries as string[] | null)?.length
      ? (r.ai_countries as string[])
      : [r.ai_country as string];

const toLine = (id: string, r: Record<string, unknown>): RoomLine => ({
  id,
  userId: (r.user_id as string | null) ?? null,
  speaker: r.speaker as string,
  kind: r.kind as RoomLine["kind"],
  text: r.text as string,
  createdAt: toIso(r.created_at),
  audioPath: (r.audio_path as string | null) ?? null,
  refId: (r.ref_id as string | null) ?? null,
  live: r.live === true,
});

export function friendlyRoomError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid room code")) return "That room code was not found. Check it and try again.";
  if (m.includes("has ended")) return "That session has already ended.";
  if (m.includes("already started")) return "That session has already started, so no one else can join.";
  if (m.includes("country taken")) return "That country is already taken in this room. Choose a different one.";
  if (m.includes("between 1 and 4")) return "Add between 1 and 4 AI countries.";
  if (m.includes("seat is not open")) return "That country's seat is not open. Choose another one.";
  if (m.includes("choose a seat")) return "Choose the country you will represent.";
  if (m.includes("forum is full")) return "Every seat in this forum is taken.";
  if (m.includes("sign in")) return "Sign in first.";
  if (m.includes("permission-denied") || m.includes("permission denied") || m.includes("insufficient permissions"))
    return "That is not allowed right now. It may not be your turn, or the forum's settings do not allow it.";
  if (m.includes("too long to send")) return "That recording is too long to send. Keep it under two minutes.";
  return message;
}

const randomRoomCode = () =>
  Array.from({ length: 6 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");

/* Private: code only. Public: listed for everyone signed in. Class: listed only for members of one organization. */
export type RoomVisibility = "public" | "private" | "class";

export async function createRoom(v: {
  visibility: RoomVisibility;
  /** Required for a "class" room. */
  org?: { id: string; name: string } | null;
  committee: string;
  topic: string;
  subtopic?: string;
  seats: Seat[];
  /** The host's own seat, or null to moderate without one. */
  hostSeat: string | null;
  judge: boolean;
  startsAt: string | null;
  /** Pick one: a length, a fixed end time, or neither for no end time. */
  durationMin: number | null;
  endAt: string | null;
  lateJoin: boolean;
}): Promise<string> {
  const uid = currentUser()?.id;
  if (!uid) throw new Error("Sign in first.");
  const seats = cleanSeats(v.seats);
  const hostSeat = v.hostSeat ? seats.find((s) => !s.ai && s.country.toLowerCase() === v.hostSeat!.toLowerCase()) : null;
  if (v.hostSeat && !hostSeat) throw new Error("Seat is not open: you cannot take an AI country's seat.");
  const ais = seats.filter((s) => s.ai).map((s) => s.country);
  if (v.durationMin !== null && !(DURATIONS as readonly number[]).includes(v.durationMin)) throw new Error("Choose a length of 30 or 60 minutes.");
  if (v.visibility === "class" && !v.org) throw new Error("Choose which organization can see this forum.");

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
    subtopic: (v.subtopic ?? "").trim().slice(0, 200),
    ai_country: ais[0] ?? "",
    ai_countries: ais,
    seats,
    starts_at: v.startsAt,
    duration_min: v.endAt ? null : v.durationMin,
    end_at: v.endAt,
    late_join: v.lateJoin,
    limits: null,
    live_at: null,
    ends_at: null,
    voting: null,
    judge: v.judge ?? true,
    visibility: v.visibility,
    org_id: v.visibility === "class" ? v.org!.id : null,
    org_name: v.visibility === "class" ? v.org!.name : null,
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
    country: hostSeat?.country ?? "",
    name,
    moderator: !hostSeat,
    joined_at: Timestamp.now(),
  });
  return roomRef.id;
}

/** Trims, de-duplicates and checks the seat list: 5 to 30 different countries. */
export function cleanSeats(seats: Seat[]): Seat[] {
  const out: Seat[] = [];
  for (const s of seats) {
    const country = s.country.trim().slice(0, 100);
    if (country.length < 2 || out.some((o) => o.country.toLowerCase() === country.toLowerCase())) continue;
    out.push({ country, ai: !!s.ai });
  }
  if (out.length < MIN_SEATS || out.length > MAX_SEATS) throw new Error(`Add between ${MIN_SEATS} and ${MAX_SEATS} countries.`);
  return out;
}

/** Seats a person could still take: not AI, and not claimed by someone already in the room. */
export function openSeats(seats: Seat[], members: { country: string }[]): Seat[] {
  const taken = new Set(members.map((m) => m.country.toLowerCase()));
  return seats.filter((s) => !s.ai && !taken.has(s.country.toLowerCase()));
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
  subtopic: string;
  seats: Seat[] | null;
  /** Countries people have already taken. */
  taken: string[];
  startsAt: string | null;
  durationMin: number | null;
  endAt: string | null;
  /** A live forum that still lets people join. */
  live: boolean;
  /** Set for a class-only forum: the organization it is listed for. */
  orgName: string | null;
}

/** Public forums, plus class-only forums of the organizations in `orgIds` (the viewer's own). */
export async function listPublicRooms(orgIds: string[] = []): Promise<PublicRoom[]> {
  const all = collection(db(), "rooms");
  const joinable = (visibility: QueryFieldFilterConstraint[]) => [
    getDocs(query(all, ...visibility, where("status", "==", "lobby"))),
    getDocs(query(all, ...visibility, where("status", "==", "live"), where("late_join", "==", true))),
  ];
  const groups: QueryFieldFilterConstraint[][] = [[where("visibility", "==", "public")]];
  for (let i = 0; i < orgIds.length; i += 30) {
    groups.push([where("visibility", "==", "class"), where("org_id", "in", orgIds.slice(i, i + 30))]);
  }
  const snaps = await Promise.all(groups.flatMap(joinable));
  const horizon = Date.now() - 6 * 3600 * 1000;
  const fresh = snaps.flatMap((s) => s.docs).filter((d) => {
    const c = d.data().created_at as Timestamp | undefined;
    return c ? c.toMillis() > horizon : false;
  });
  const rooms = await Promise.all(
    fresh.slice(0, 50).map(async (d) => {
      const r = d.data();
      const members = await getDocs(collection(db(), "rooms", d.id, "members"));
      return {
        id: d.id,
        code: r.code as string,
        committee: r.committee as string,
        topic: r.topic as string,
        aiCountries: aiOf(r),
        judge: r.judge as boolean,
        hostName: (r.host_name as string)?.trim() || "A host",
        // People with a seat; a host who only moderates is not a delegation.
        players: members.docs.filter((m) => m.data().moderator !== true).length,
        createdAt: toIso(r.created_at),
        subtopic: (r.subtopic as string | null) ?? "",
        seats: Array.isArray(r.seats) ? (r.seats as Seat[]) : null,
        taken: members.docs.map((m) => (m.data().country as string) || "").filter(Boolean),
        startsAt: (r.starts_at as string | null) ?? null,
        durationMin: (r.duration_min as number | null) ?? null,
        endAt: (r.end_at as string | null) ?? null,
        live: r.status === "live",
        orgName: r.visibility === "class" ? ((r.org_name as string | null) ?? "Your class") : null,
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
  if (r.status !== "lobby" && r.late_join !== true) throw new Error("This session has already started");

  let me = country.trim().slice(0, 100);
  const membersSnap = await getDocs(collection(db(), "rooms", roomDoc.id, "members"));
  const memberCountries = membersSnap.docs.map((m) => ({ country: (m.data().country as string) || "" }));
  if (Array.isArray(r.seats)) {
    const open = openSeats(r.seats as Seat[], memberCountries);
    if (!open.length) throw new Error("This forum is full");
    if (!me) throw new Error("Choose a seat");
    const seat = open.find((s) => s.country.toLowerCase() === me.toLowerCase());
    if (!seat) throw new Error("That seat is not open");
    me = seat.country;
  } else if (me) {
    const taken = [...aiOf(r).map((c) => c.toLowerCase()), ...memberCountries.map((m) => m.country.toLowerCase())];
    if (taken.includes(me.toLowerCase())) throw new Error("Country taken: someone in this room already represents that country");
  }

  const name = await myDisplayName(uid);
  await setDoc(memberRef, { user_id: uid, country: me, name, moderator: false, joined_at: Timestamp.now() });
  return roomDoc.id;
}

/** Finds a room by its code, with the seats people could still take. */
export async function findRoomByCode(code: string): Promise<{ room: Room; open: Seat[] }> {
  const snap = await getDocs(query(collection(db(), "rooms"), where("code", "==", code.trim().toUpperCase())));
  if (snap.empty) throw new Error("Invalid room code");
  const room = toRoom(snap.docs[0].id, snap.docs[0].data());
  const members = await listRoomMembers(room.id);
  return { room, open: room.seats ? openSeats(room.seats, members) : [] };
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
        moderator: r.moderator === true,
        voice: typeof r.voice === "number" ? r.voice : null,
        joinedAt: (r.joined_at as Timestamp | undefined)?.toMillis() ?? 0,
      };
    })
    .sort((a, b) => a.joinedAt - b.joinedAt)
    .map(({ userId, country, name, moderator, voice }) => ({ userId, country, name, moderator, voice }));
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
  extra: { audioPath?: string; refId?: string; live?: boolean } = {},
): Promise<RoomLine> {
  const data = {
    user_id: kind === "human" ? userId : null,
    speaker,
    kind,
    text,
    created_at: Timestamp.now(),
    ...(extra.audioPath ? { audio_path: extra.audioPath } : {}),
    ...(extra.refId ? { ref_id: extra.refId } : {}),
    ...(extra.live ? { live: true } : {}),
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

/* ----- Floor voting ----- */

const toBallot = (r: Record<string, unknown>): Ballot => ({
  voteId: r.vote_id as string,
  userId: (r.user_id as string | null) ?? null,
  country: r.country as string,
  vote: r.vote as Ballot["vote"],
  reason: (r.reason as string | null) ?? "",
});

/** A delegate's own ballot. Voting again replaces it while the vote is open. */
export async function castBallot(roomId: string, voteId: string, country: string, vote: Ballot["vote"]) {
  const uid = currentUser()?.id;
  if (!uid) throw new Error("Sign in first.");
  await setDoc(doc(db(), "rooms", roomId, "ballots", `${voteId}_${uid}`), {
    vote_id: voteId,
    user_id: uid,
    country,
    vote,
    reason: "",
    at: Timestamp.now(),
  });
}

/** Host only: the AI delegations' ballots. */
export async function castAiBallots(roomId: string, voteId: string, votes: { country: string; vote: Ballot["vote"]; reason: string }[]) {
  await Promise.all(
    votes.map((v, i) =>
      setDoc(doc(db(), "rooms", roomId, "ballots", `${voteId}_ai${i}`), {
        vote_id: voteId,
        user_id: null,
        country: v.country,
        vote: v.vote,
        reason: v.reason.slice(0, 200),
        at: Timestamp.now(),
      }),
    ),
  );
}

/** Live ballots for one vote. Returns a function that stops listening. */
export function watchBallots(roomId: string, voteId: string, onChange: (b: Ballot[]) => void) {
  return onSnapshot(query(collection(db(), "rooms", roomId, "ballots"), where("vote_id", "==", voteId)), (snap) =>
    onChange(snap.docs.map((d) => toBallot(d.data()))),
  );
}

export async function listBallots(roomId: string, voteId: string): Promise<Ballot[]> {
  const snap = await getDocs(query(collection(db(), "rooms", roomId, "ballots"), where("vote_id", "==", voteId)));
  return snap.docs.map((d) => toBallot(d.data()));
}

/** Changes the AI voice that reads your speeches in this room. */
export async function setMyVoice(roomId: string, voice: number) {
  const uid = currentUser()?.id;
  if (!uid) throw new Error("Sign in first.");
  await updateDoc(doc(db(), "rooms", roomId, "members", uid), { voice });
}

/* ----- Recordings of a person's own voice -----
   Firebase Storage needs the paid plan, so a recording is kept in a Firestore document instead, as base64.
   At the recorder's 24 kbps a two-minute turn is about 480 KB, under the 1 MB document limit. */

const MAX_CLIP_CHARS = 950_000;

const blobToBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("Could not read the recording."));
    r.readAsDataURL(blob);
  });

/** Saves a recording and returns its path, which goes on the speech's line as `audio_path`. */
export async function uploadClip(roomId: string, userId: string, blob: Blob): Promise<string> {
  const data = await blobToBase64(blob);
  if (data.length > MAX_CLIP_CHARS) throw new Error("That recording is too long to send. Keep it under two minutes.");
  const ref = await addDoc(collection(db(), "rooms", roomId, "clips"), {
    user_id: userId,
    mime: blob.type || "audio/webm",
    data,
    created_at: Timestamp.now(),
  });
  return `rooms/${roomId}/clips/${ref.id}`;
}

/** A playable link for a recording. */
export async function clipUrl(path: string): Promise<string> {
  const snap = await getDoc(doc(db(), path));
  if (!snap.exists()) throw new Error("That recording is no longer available.");
  const r = snap.data();
  return `data:${r.mime as string};base64,${r.data as string}`;
}
