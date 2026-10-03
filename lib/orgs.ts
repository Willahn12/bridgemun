"use client";

import { supabase } from "@/lib/supabase";

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

type OrgRow = { id: string; name: string; invite_code: string };
/* PostgREST returns an embedded many-to-one row as an object, but be tolerant of an array. */
const one = <T,>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v);

export async function listMyOrgs(userId: string): Promise<Org[]> {
  const { data, error } = await supabase()
    .from("memberships")
    .select("role, organizations(id, name, invite_code)")
    .eq("user_id", userId);
  if (error) throw new Error(error.message);
  return (data ?? [])
    .map((r) => {
      const o = one(r.organizations as OrgRow | OrgRow[] | null);
      return o ? { id: o.id, name: o.name, inviteCode: o.invite_code, role: r.role as Role } : null;
    })
    .filter((o): o is Org => o !== null)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getOrg(orgId: string, userId: string): Promise<Org | null> {
  const orgs = await listMyOrgs(userId);
  return orgs.find((o) => o.id === orgId) ?? null;
}

export async function createOrg(name: string): Promise<string> {
  const { data, error } = await supabase().rpc("create_org", { org_name: name.trim() });
  if (error) throw new Error(error.message);
  return (data as { id: string }).id;
}

export async function joinOrg(code: string): Promise<string> {
  const { data, error } = await supabase().rpc("join_org", { code });
  if (error) throw new Error(error.message);
  return data as string;
}

export async function listMembers(orgId: string): Promise<Member[]> {
  const { data, error } = await supabase()
    .from("memberships")
    .select("user_id, role, joined_at, profiles(display_name)")
    .eq("org_id", orgId);
  if (error) throw new Error(error.message);
  const order: Record<Role, number> = { admin: 0, teacher: 1, student: 2 };
  return (data ?? [])
    .map((r) => {
      const p = one(r.profiles as { display_name: string } | { display_name: string }[] | null);
      return {
        userId: r.user_id as string,
        name: p?.display_name?.trim() || "Unnamed",
        role: r.role as Role,
        joinedAt: r.joined_at as string,
      };
    })
    .sort((a, b) => order[a.role] - order[b.role] || a.name.localeCompare(b.name));
}

export async function setRole(orgId: string, userId: string, role: Role) {
  const { error } = await supabase().from("memberships").update({ role }).eq("org_id", orgId).eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function removeMember(orgId: string, userId: string) {
  const { error } = await supabase().from("memberships").delete().eq("org_id", orgId).eq("user_id", userId);
  if (error) throw new Error(error.message);
}

export async function deleteOrg(orgId: string) {
  const { error } = await supabase().from("organizations").delete().eq("id", orgId);
  if (error) throw new Error(error.message);
}

export function friendlyOrgError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid invite")) return "That invite code was not found. Check it and try again.";
  if (m.includes("sign in")) return "Sign in first.";
  if (m.includes("row-level security") || m.includes("permission")) return "You do not have permission to do that.";
  if (m.includes("check constraint")) return "The name must be between 2 and 120 characters.";
  return message;
}
