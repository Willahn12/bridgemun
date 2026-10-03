"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth";
import { ROLE_LABEL, friendlyOrgError, getOrg, listMembers, type Member, type Org } from "@/lib/orgs";

interface OrgContext {
  org: Org;
  members: Member[];
  userId: string;
  isStaff: boolean;
  isAdmin: boolean;
  names: Map<string, string>;
  reload: () => void;
}

const Ctx = createContext<OrgContext | null>(null);

export function useOrgContext(): OrgContext {
  const v = useContext(Ctx);
  if (!v) throw new Error("useOrgContext must be used inside an organization page");
  return v;
}

export default function OrgProvider({ id, children }: { id: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, ready } = useAuth();
  const [org, setOrg] = useState<Org | null | undefined>(undefined); // undefined = loading, null = not a member
  const [members, setMembers] = useState<Member[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const userId = user?.id;

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    (async () => {
      try {
        const o = await getOrg(id, userId);
        if (cancelled) return;
        setOrg(o);
        if (o) {
          const m = await listMembers(id);
          if (!cancelled) setMembers(m);
        }
      } catch (e) {
        if (cancelled) return;
        setError(friendlyOrgError(e instanceof Error ? e.message : "Could not load this organization."));
        setOrg(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id, userId, tick]);

  const value = useMemo<OrgContext | null>(() => {
    if (!org || !userId) return null;
    return {
      org,
      members,
      userId,
      isStaff: org.role === "admin" || org.role === "teacher",
      isAdmin: org.role === "admin",
      names: new Map(members.map((m) => [m.userId, m.name])),
      reload: () => setTick((t) => t + 1),
    };
  }, [org, members, userId]);

  if (!ready || (user && org === undefined)) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <div className="h-8 w-64 animate-pulse rounded bg-sunk" aria-label="Loading" />
      </main>
    );
  }

  if (!user) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">Sign in to see this organization</h1>
        <Link href="/login" className="btn btn-primary mt-6">
          Sign in
        </Link>
      </main>
    );
  }

  if (!org || !value) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">Organization not found</h1>
        <p className="mt-3 text-muted">{error ?? "You are not a member of this organization, or it no longer exists."}</p>
        <Link href="/org" className="btn mt-6">
          <ArrowLeft aria-hidden="true" size={16} /> Back to organizations
        </Link>
      </main>
    );
  }

  const base = `/org/${id}`;
  const tabs = [
    { href: base, label: "Members", active: pathname === base },
    { href: `${base}/assignments`, label: "Assignments", active: pathname.startsWith(`${base}/assignments`) },
    { href: `${base}/chat`, label: "Chat", active: pathname.startsWith(`${base}/chat`) },
  ];

  return (
    <Ctx.Provider value={value}>
      <div className="mx-auto max-w-4xl px-4 pt-12 sm:px-6">
        <Link href="/org" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
          <ArrowLeft aria-hidden="true" size={16} /> All organizations
        </Link>
        <h1 className="mt-4 text-3xl font-semibold tracking-tight md:text-4xl">{org.name}</h1>
        <p className="mt-2 text-muted">You are a {ROLE_LABEL[org.role].toLowerCase()} here.</p>
        <nav aria-label="Organization" className="mt-6 flex gap-1 border-b border-line">
          {tabs.map((t) => (
            <Link
              key={t.href}
              href={t.href}
              aria-current={t.active ? "page" : undefined}
              className={`-mb-px border-b-2 px-3 py-2.5 text-sm transition-colors ${
                t.active ? "border-accent font-medium text-ink" : "border-transparent text-muted hover:text-ink"
              }`}
            >
              {t.label}
            </Link>
          ))}
        </nav>
      </div>
      {children}
    </Ctx.Provider>
  );
}
