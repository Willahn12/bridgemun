"use client";

import { supabase } from "@/lib/supabase";
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

function toRoom(r: Record<string, unknown>): Room {
  return {
    id: r.id as string,
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
    createdAt: r.created_at as string,
    endedAt: (r.ended_at as string | null) ?? null,
  };
}

const toLine = (r: Record<string, unknown>): RoomLine => ({
  id: r.id as string,
  userId: (r.user_id as string | null) ?? null,
  speaker: r.speaker as string,
  kind: r.kind as RoomLine["kind"],
  text: r.text as string,
  createdAt: r.created_at as string,
  audioPath: (r.audio_path as string | null) ?? null,
  refId: (r.ref_id as string | null) ?? null,
});

const fail = (error: { message: string } | null) => {
  if (error) throw new Error(error.message);
};

export function friendlyRoomError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid room code")) return "That room code was not found. Check it and try again.";
  if (m.includes("has ended")) return "That session has already ended.";
  if (m.includes("already started")) return "That session has already started, so no one else can join.";
  if (m.includes("country taken")) return "That country is already taken in this room. Choose a different one.";
  if (m.includes("between 1 and 4")) return "Add between 1 and 4 AI countries.";
  if (m.includes("sign in")) return "Sign in first.";
  if (m.includes("row-level security")) return "You do not have permission to do that.";
  if (m.includes("005_public_rooms") || m.includes("list_public_rooms")) {
    return "Public rooms are not set up in the database yet. Run supabase/migrations/005_public_rooms.sql in Supabase.";
  }
  if (m.includes("does not exist") || m.includes("schema cache")) {
    return "Online rooms are not set up in the database yet. Run supabase/migrations/002_rooms.sql in Supabase.";
  }
  return message;
}

export async function createRoom(v: {
  isPublic?: boolean;
  committee: string;
  topic: string;
  aiCountries: string[];
  judge: boolean;
  country: string;
}): Promise<string> {
  const { data, error } = await supabase().rpc("create_room", {
    p_committee: v.committee,
    p_topic: v.topic,
    p_ai_countries: v.aiCountries,
    p_judge: v.judge,
    p_country: v.country,
  });
  fail(error);
  const id = (data as { id: string }).id;
  if (v.isPublic) {
    // Rooms start private. Making one public is a separate step by the host.
    const { error: visError } = await supabase().from("rooms").update({ visibility: "public" }).eq("id", id);
    if (visError) throw new Error(visError.message.includes("visibility") ? "public rooms are not set up: run 005_public_rooms.sql" : visError.message);
  }
  return id;
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
  const { data, error } = await supabase().rpc("list_public_rooms");
  fail(error);
  return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
    id: r.id as string,
    code: r.code as string,
    committee: r.committee as string,
    topic: r.topic as string,
    aiCountries: (r.ai_countries as string[]) ?? [],
    judge: r.judge as boolean,
    hostName: r.host_name as string,
    players: (r.players as number) ?? 0,
    createdAt: r.created_at as string,
  }));
}

export async function joinRoom(code: string, country: string): Promise<string> {
  const { data, error } = await supabase().rpc("join_room", { p_code: code, p_country: country });
  fail(error);
  return data as string;
}

export async function getRoom(id: string): Promise<Room | null> {
  const { data, error } = await supabase().from("rooms").select("*").eq("id", id).maybeSingle();
  fail(error);
  return data ? toRoom(data) : null;
}

export async function listRoomMembers(roomId: string): Promise<RoomMember[]> {
  const { data, error } = await supabase()
    .from("room_members")
    .select("user_id, country, joined_at, profiles(display_name)")
    .eq("room_id", roomId)
    .order("joined_at");
  fail(error);
  return (data ?? []).map((r) => {
    const p = Array.isArray(r.profiles) ? r.profiles[0] : r.profiles;
    const name = (p as { display_name?: string } | null)?.display_name?.trim() || "Unnamed";
    return { userId: r.user_id as string, country: (r.country as string) || "", name };
  });
}

export async function listRoomLines(roomId: string): Promise<RoomLine[]> {
  const { data, error } = await supabase()
    .from("room_lines")
    .select("*")
    .eq("room_id", roomId)
    .order("created_at", { ascending: false })
    .limit(300);
  fail(error);
  return (data ?? []).map(toLine).reverse();
}

export async function postLine(
  roomId: string,
  userId: string | null,
  speaker: string,
  kind: RoomLine["kind"],
  text: string,
  extra: { audioPath?: string; refId?: string } = {},
): Promise<RoomLine> {
  const { data, error } = await supabase()
    .from("room_lines")
    .insert({
      room_id: roomId,
      user_id: kind === "human" ? userId : null,
      speaker,
      kind,
      text,
      ...(extra.audioPath ? { audio_path: extra.audioPath } : {}),
      ...(extra.refId ? { ref_id: extra.refId } : {}),
    })
    .select("*")
    .single();
  fail(error);
  return toLine(data as Record<string, unknown>);
}

export async function updateRoom(id: string, fields: Record<string, unknown>) {
  const { error } = await supabase().from("rooms").update(fields).eq("id", id);
  fail(error);
}

export async function leaveRoom(roomId: string, userId: string) {
  const { error } = await supabase().from("room_members").delete().eq("room_id", roomId).eq("user_id", userId);
  fail(error);
}

/** Live updates for everything in a room. Returns a function that stops listening. */
export function watchRoom(
  roomId: string,
  handlers: { onLine: (l: RoomLine) => void; onRoom: (r: Room) => void; onMembersChanged: () => void },
) {
  const sb = supabase();
  const ch = sb
    .channel(`room:${roomId}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "room_lines", filter: `room_id=eq.${roomId}` }, (p) =>
      handlers.onLine(toLine(p.new)),
    )
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "rooms", filter: `id=eq.${roomId}` }, (p) =>
      handlers.onRoom(toRoom(p.new)),
    )
    .on("postgres_changes", { event: "*", schema: "public", table: "room_members", filter: `room_id=eq.${roomId}` }, () =>
      handlers.onMembersChanged(),
    )
    .subscribe();
  return () => {
    sb.removeChannel(ch);
  };
}

/** Uploads a voice recording and returns its storage path. */
export async function uploadClip(roomId: string, userId: string, blob: Blob): Promise<string> {
  const ext = blob.type.includes("mp4") ? "m4a" : blob.type.includes("ogg") ? "ogg" : "webm";
  const path = `${roomId}/${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase().storage.from("room-audio").upload(path, blob, { contentType: blob.type || "audio/webm" });
  fail(error);
  return path;
}

/** A temporary link a room member can play a recording from. */
export async function clipUrl(path: string): Promise<string> {
  const { data, error } = await supabase().storage.from("room-audio").createSignedUrl(path, 3600);
  fail(error);
  return (data as { signedUrl: string }).signedUrl;
}
