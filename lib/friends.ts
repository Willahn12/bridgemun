"use client";

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
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

/* Friends and direct messages. A friendship is one document per pair of people (`friendships/{a}_{b}`, ids
   sorted), pending until the other person accepts. Its `messages` subcollection is the thread. Besides text, a
   message can carry a card: a practice session's summary, a report's scores, or a saved research briefing.
   Cards hold a snapshot, so the friend never needs access to the original session. */

export interface Friendship {
  id: string;
  users: [string, string];
  names: Record<string, string>;
  status: "pending" | "accepted";
  requestedBy: string;
  lastText: string;
  lastAt: number;
}

export type Card =
  | { kind: "session"; title: string; committee: string; country: string; mode: string; date: number; excerpt: string }
  | { kind: "report"; title: string; committee: string; country: string; date: number; average: number | null; summary: string; strengths: string[] }
  | { kind: "research"; id: string; title: string; committee: string };

export interface DirectMessage {
  id: string;
  by: string;
  byName: string;
  text: string;
  card: Card | null;
  at: number;
}

const pairId = (a: string, b: string) => (a < b ? `${a}_${b}` : `${b}_${a}`);
const millis = (t: unknown) => (t instanceof Timestamp ? t.toMillis() : Date.now());
const randomCode = () => Array.from({ length: 8 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");

function me(): string {
  const uid = currentUser()?.id;
  if (!uid) throw new Error("Sign in first.");
  return uid;
}

const toFriendship = (id: string, d: Record<string, unknown>): Friendship => ({
  id,
  users: d.users as [string, string],
  names: (d.names as Record<string, string>) ?? {},
  status: d.status === "accepted" ? "accepted" : "pending",
  requestedBy: d.requestedBy as string,
  lastText: (d.lastText as string) ?? "",
  lastAt: millis(d.lastAt),
});

/** This person's friend code, made the first time they need one. */
export async function myFriendCode(): Promise<string> {
  const uid = me();
  const ref = doc(db(), "users", uid);
  const snap = await getDoc(ref);
  const existing = snap.data()?.friendCode as string | undefined;
  if (existing) return existing;
  const code = randomCode();
  await setDoc(ref, { friendCode: code }, { merge: true });
  return code;
}

export async function addFriendByCode(code: string): Promise<void> {
  const uid = me();
  const clean = code.trim().toUpperCase();
  if (!/^[A-Z0-9]{8}$/.test(clean)) throw new Error("A friend code has 8 letters and numbers.");
  const found = await getDocs(query(collection(db(), "users"), where("friendCode", "==", clean), limit(1)));
  if (found.empty) throw new Error("No one has that friend code. Check it and try again.");
  const other = found.docs[0];
  if (other.id === uid) throw new Error("That is your own friend code.");
  const id = pairId(uid, other.id);
  const ref = doc(db(), "friendships", id);
  const existing = await getDoc(ref).catch(() => null);
  if (existing?.exists()) {
    const f = toFriendship(id, existing.data());
    if (f.status === "accepted") throw new Error("You are already friends.");
    if (f.requestedBy === uid) throw new Error("You already sent them a request.");
    await acceptFriend(id); // they had asked you first
    return;
  }
  const users = [uid, other.id].sort() as [string, string];
  await setDoc(ref, {
    users,
    names: { [uid]: await myDisplayName(uid), [other.id]: ((other.data().displayName as string) || "A friend").trim() },
    status: "pending",
    requestedBy: uid,
    lastText: "",
    lastAt: Timestamp.now(),
  });
}

export function watchFriendships(userId: string, onChange: (all: Friendship[]) => void, onError: (e: Error) => void) {
  return onSnapshot(
    query(collection(db(), "friendships"), where("users", "array-contains", userId)),
    (snap) => onChange(snap.docs.map((d) => toFriendship(d.id, d.data())).sort((a, b) => b.lastAt - a.lastAt)),
    (e) => onError(e),
  );
}

export async function acceptFriend(id: string) {
  await updateDoc(doc(db(), "friendships", id), { status: "accepted", lastAt: Timestamp.now() });
}

/** Declining a request and removing a friend are the same: the friendship and its thread go. */
export async function removeFriend(id: string) {
  const msgs = await getDocs(collection(db(), "friendships", id, "messages")).catch(() => null);
  await Promise.all((msgs?.docs ?? []).map((m) => deleteDoc(m.ref).catch(() => undefined)));
  await deleteDoc(doc(db(), "friendships", id));
}

export function watchMessages(friendshipId: string, onChange: (all: DirectMessage[]) => void, onError: (e: Error) => void) {
  return onSnapshot(
    collection(db(), "friendships", friendshipId, "messages"),
    (snap) =>
      onChange(
        snap.docs
          .map((d) => {
            const m = d.data();
            return { id: d.id, by: m.by as string, byName: (m.byName as string) || "", text: (m.text as string) ?? "", card: (m.card as Card | null) ?? null, at: millis(m.at) };
          })
          .sort((a, b) => a.at - b.at),
      ),
    (e) => onError(e),
  );
}

export async function sendDirect(friendshipId: string, text: string, card: Card | null = null) {
  const uid = me();
  const body = text.trim().slice(0, 2000);
  if (!body && !card) return;
  await addDoc(collection(db(), "friendships", friendshipId, "messages"), {
    by: uid,
    byName: await myDisplayName(uid),
    text: body,
    card,
    at: Timestamp.now(),
  });
  const preview = body || (card?.kind === "research" ? `Shared research: ${card.title}` : card?.kind === "report" ? `Shared a report: ${card.title}` : `Shared a practice session: ${card?.title ?? ""}`);
  await updateDoc(doc(db(), "friendships", friendshipId), { lastText: preview.slice(0, 140), lastAt: Timestamp.now() });
}
