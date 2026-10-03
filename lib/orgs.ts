"use client";

import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { currentUser } from "@/lib/auth";

export type Role = "admin" | "teacher" | "student";

export const ROLE_LABEL: Record<Role, string> = {
  admin: "Admin",
  teacher: "Teacher",
  student: "Student",
};

export interface Org {
  id: string;
  name: string;
  inviteCode: string;
  role: Role;
}

export interface Member {
  userId: string;
  name: string;
  role: Role;
  joinedAt: string;
}

const isStaff = (r: Role) => r === "admin" || r === "teacher";
export const canSeeInvite = isStaff;

const membershipId = (orgId: string, userId: string) => `${orgId}_${userId}`;
const toIso = (t: unknown) => (t instanceof Timestamp ? t.toDate().toISOString() : new Date().toISOString());
const randomCode = () =>
  Array.from({ length: 8 }, () => "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"[Math.floor(Math.random() * 32)]).join("");

export async function myDisplayName(userId: string): Promise<string> {
  const snap = await getDoc(doc(db(), "users", userId));
  return (snap.data()?.displayName as string | undefined)?.trim() || "Unnamed";
}

export async function listMyOrgs(userId: string): Promise<Org[]> {
  const snap = await getDocs(query(collection(db(), "memberships"), where("userId", "==", userId)));
  const orgs = await Promise.all(
    snap.docs.map(async (m) => {
      const data = m.data();
      const orgSnap = await getDoc(doc(db(), "organizations", data.orgId as string));
      if (!orgSnap.exists()) return null;
      const o = orgSnap.data();
      return { id: orgSnap.id, name: o.name as string, inviteCode: o.inviteCode as string, role: data.role as Role };
    }),
  );
  return orgs.filter((o): o is Org => o !== null).sort((a, b) => a.name.localeCompare(b.name));
}

export async function getOrg(orgId: string, userId: string): Promise<Org | null> {
  const [orgSnap, memberSnap] = await Promise.all([
    getDoc(doc(db(), "organizations", orgId)),
    getDoc(doc(db(), "memberships", membershipId(orgId, userId))),
  ]);
  if (!orgSnap.exists() || !memberSnap.exists()) return null;
  const o = orgSnap.data();
  return { id: orgSnap.id, name: o.name as string, inviteCode: o.inviteCode as string, role: memberSnap.data().role as Role };
}

export async function createOrg(name: string): Promise<string> {
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 120) throw new Error("The name must be between 2 and 120 characters.");
  const uid = currentUser()?.id;
  if (!uid) throw new Error("Sign in first.");

  let code = randomCode();
  for (let i = 0; i < 5; i++) {
    const existing = await getDocs(query(collection(db(), "organizations"), where("inviteCode", "==", code)));
    if (existing.empty) break;
    code = randomCode();
  }

  const orgRef = doc(collection(db(), "organizations"));
  const name2 = await myDisplayName(uid);
  await setDoc(orgRef, { name: trimmed, inviteCode: code, createdBy: uid, createdAt: serverTimestamp() });
  await setDoc(doc(db(), "memberships", membershipId(orgRef.id, uid)), {
    orgId: orgRef.id,
    userId: uid,
    role: "admin",
    name: name2,
    joinedAt: serverTimestamp(),
  });
  return orgRef.id;
}

export async function joinOrg(code: string): Promise<string> {
  const uid = currentUser()?.id;
  if (!uid) throw new Error("Sign in first.");
  const snap = await getDocs(query(collection(db(), "organizations"), where("inviteCode", "==", code.trim().toUpperCase())));
  if (snap.empty) throw new Error("Invalid invite code.");
  const orgId = snap.docs[0].id;

  const memberRef = doc(db(), "memberships", membershipId(orgId, uid));
  const existing = await getDoc(memberRef);
  if (!existing.exists()) {
    const name = await myDisplayName(uid);
    await setDoc(memberRef, { orgId, userId: uid, role: "student", name, joinedAt: serverTimestamp() });
  }
  return orgId;
}

export async function listMembers(orgId: string): Promise<Member[]> {
  const snap = await getDocs(query(collection(db(), "memberships"), where("orgId", "==", orgId)));
  const order: Record<Role, number> = { admin: 0, teacher: 1, student: 2 };
  return snap.docs
    .map((m) => {
      const d = m.data();
      return {
        userId: d.userId as string,
        name: (d.name as string)?.trim() || "Unnamed",
        role: d.role as Role,
        joinedAt: toIso(d.joinedAt),
      };
    })
    .sort((a, b) => order[a.role] - order[b.role] || a.name.localeCompare(b.name));
}

export async function setRole(orgId: string, userId: string, role: Role) {
  await updateDoc(doc(db(), "memberships", membershipId(orgId, userId)), { role });
}

export async function removeMember(orgId: string, userId: string) {
  await deleteDoc(doc(db(), "memberships", membershipId(orgId, userId)));
}

export async function deleteOrg(orgId: string) {
  await deleteDoc(doc(db(), "organizations", orgId));
}

export function friendlyOrgError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid invite")) return "That invite code was not found. Check it and try again.";
  if (m.includes("sign in")) return "Sign in first.";
  if (m.includes("permission") || m.includes("insufficient")) return "You do not have permission to do that.";
  if (m.includes("between 2 and 120")) return "The name must be between 2 and 120 characters.";
  return message;
}
