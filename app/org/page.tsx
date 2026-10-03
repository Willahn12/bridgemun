"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import PageHero from "@/components/PageHero";
import { toneStyle } from "@/lib/tone";
import { useRouter } from "next/navigation";
import { ArrowRight } from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth";
import { ROLE_LABEL, createOrg, friendlyOrgError, joinOrg, listMyOrgs, type Org } from "@/lib/orgs";
import { dueText, myReminders, type Reminder } from "@/lib/classroom";

export default function OrgPage() {
  const router = useRouter();
  const { user, ready } = useAuth();
  const [orgs, setOrgs] = useState<Org[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);

  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<"create" | "join" | null>(null);
  const [error, setError] = useState<{ form: "create" | "join"; message: string } | null>(null);

  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    listMyOrgs(userId)
      .then(async (o) => {
        if (cancelled) return;
        setOrgs(o);
        const r = await myReminders(userId, o).catch(() => []);
        if (!cancelled) setReminders(r);
      })
      .catch((e) => !cancelled && setLoadError(friendlyOrgError(e.message)));
    return () => {
      cancelled = true;
    };
  }, [userId]);

  async function run(form: "create" | "join", action: () => Promise<string>) {
    setBusy(form);
    setError(null);
    try {
      const id = await action();
      router.push(`/org/${id}`);
    } catch (e) {
      setError({ form, message: friendlyOrgError(e instanceof Error ? e.message : "Something went wrong") });
      setBusy(null);
    }
  }

  if (!ready) return <main className="mx-auto max-w-6xl px-4 py-12 sm:px-6" />;

  if (!user) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight md:text-4xl">Organizations</h1>
        <p className="mt-3 max-w-[56ch] leading-relaxed text-muted">
          Create an organization for your school or class, or join one with an invite code. You need an
          account first.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href="/login" className="btn btn-primary">
            Sign in
          </Link>
          <Link href="/signup" className="btn">
            Create an account
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main style={toneStyle("org")}>
      <PageHero kind="org" title="Organizations">
        <p>A school, class or club. Members practise together, and teachers can see how their students are doing.</p>
      </PageHero>
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">

      {reminders.length > 0 && (
        <section className="mt-10" aria-labelledby="coming-up">
          <h2 id="coming-up" className="text-lg font-semibold tracking-tight">
            Coming up
          </h2>
          <ul className="mt-3 divide-y divide-line rounded-[var(--radius-ui)] border border-line bg-surface">
            {reminders.map((r) => (
              <li key={r.assignment.id}>
                <Link
                  href={`/org/${r.assignment.orgId}/assignments/${r.assignment.id}`}
                  className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 transition-colors hover:bg-sunk"
                >
                  <span className="font-medium">{r.assignment.title}</span>
                  <span className={`text-sm ${r.overdue ? "text-danger" : "text-muted"}`}>
                    {r.orgName}, {dueText(r.assignment.dueAt).label.replace("Due ", "due ")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <section aria-labelledby="mine">
          <h2 id="mine" className="text-lg font-semibold tracking-tight">
            Your organizations
          </h2>
          {loadError && (
            <p role="alert" className="mt-3 text-sm text-danger">
              {loadError}
            </p>
          )}
          {orgs === null && !loadError && (
            <div className="mt-3 space-y-2" aria-label="Loading">
              {[0, 1].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-[var(--radius-ui)] bg-sunk" />
              ))}
            </div>
          )}
          {orgs?.length === 0 && (
            <p className="mt-3 max-w-[52ch] leading-relaxed text-muted">
              You are not in any organization yet. Create one, or ask your teacher for an invite code.
            </p>
          )}
          {orgs && orgs.length > 0 && (
            <ul className="mt-3 grid gap-2">
              {orgs.map((o) => (
                <li key={o.id}>
                  <Link
                    href={`/org/${o.id}`}
                    className="group flex items-center justify-between gap-4 rounded-[var(--radius-ui)] border border-line bg-surface p-4 transition-colors hover:border-muted"
                  >
                    <span>
                      <span className="block font-semibold">{o.name}</span>
                      <span className="block text-sm text-muted">{ROLE_LABEL[o.role]}</span>
                    </span>
                    <ArrowRight aria-hidden="true" size={18} className="shrink-0 text-muted transition-transform group-hover:translate-x-1" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="grid h-fit gap-6">
          <form
            className="rounded-[var(--radius-ui)] tone-card p-5"
            onSubmit={(e) => {
              e.preventDefault();
              run("create", () => createOrg(name));
            }}
          >
            <h2 className="text-lg font-semibold tracking-tight">Create an organization</h2>
            <label htmlFor="org-name" className="label mt-4">
              Name
            </label>
            <input
              id="org-name"
              className="field"
              value={name}
              maxLength={120}
              placeholder="Apas Camp Lapu-Lapu Middle School"
              onChange={(e) => setName(e.target.value)}
            />
            <p className="helper">You become its admin.</p>
            {error?.form === "create" && (
              <p role="alert" className="mt-3 text-sm text-danger">
                {error.message}
              </p>
            )}
            <button type="submit" disabled={name.trim().length < 2 || busy !== null} className="btn btn-primary mt-4 w-full">
              {busy === "create" ? "Creating…" : "Create"}
            </button>
          </form>

          <form
            className="rounded-[var(--radius-ui)] tone-card p-5"
            onSubmit={(e) => {
              e.preventDefault();
              run("join", () => joinOrg(code));
            }}
          >
            <h2 className="text-lg font-semibold tracking-tight">Join with an invite code</h2>
            <label htmlFor="invite" className="label mt-4">
              Invite code
            </label>
            <input
              id="invite"
              className="field font-mono uppercase tracking-widest"
              value={code}
              maxLength={16}
              placeholder="A1B2C3D4"
              autoCapitalize="characters"
              spellCheck={false}
              name="invite-code"
              autoComplete="off"
              onChange={(e) => setCode(e.target.value)}
            />
            <p className="helper">You join as a student.</p>
            {error?.form === "join" && (
              <p role="alert" className="mt-3 text-sm text-danger">
                {error.message}
              </p>
            )}
            <button type="submit" disabled={code.trim().length < 4 || busy !== null} className="btn btn-primary mt-4 w-full">
              {busy === "join" ? "Joining…" : "Join"}
            </button>
          </form>
        </div>
      </div>
      </div>
    </main>
  );
}
