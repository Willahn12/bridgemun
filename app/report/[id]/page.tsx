"use client";

import { useEffect, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react";
import CoachPanel from "@/components/CoachPanel";
import ReportView from "@/components/delegate/ReportView";
import { useAuth } from "@/lib/auth";
import {
  MODE_LABEL,
  clearStash,
  fromRow,
  saveSession,
  sessionTitle,
  stashKey,
  stashSession,
  useSavedSessions,
  type Coach,
  type Session,
} from "@/lib/sessions";
import { supabase } from "@/lib/supabase";
import { toneStyle } from "@/lib/tone";

export default function ReportPage() {
  const { id } = useParams<{ id: string }>();
  const { user, ready } = useAuth();
  const saved = useSavedSessions();
  const [fetched, setFetched] = useState<Session | null | undefined>(undefined); // undefined = not tried yet
  // A finished session that was not saved lives in this tab's sessionStorage. undefined = not read yet.
  const rawStash = useSyncExternalStore(
    () => () => {},
    () => {
      try {
        return sessionStorage.getItem(stashKey(id));
      } catch {
        return null;
      }
    },
    () => undefined,
  );
  const [stashEdit, setStashEdit] = useState<Session | null | undefined>(undefined); // set once this page changes it
  const stash = useMemo<Session | null | undefined>(() => {
    if (stashEdit !== undefined) return stashEdit;
    if (rawStash === undefined) return undefined;
    try {
      return rawStash ? (JSON.parse(rawStash) as Session) : null;
    } catch {
      return null;
    }
  }, [rawStash, stashEdit]);

  const inStore = saved.find((s) => s.id === id);

  /* The saved list may not have loaded yet, so ask for this one directly. */
  useEffect(() => {
    if (!user || inStore || fetched !== undefined) return;
    let cancelled = false;
    supabase()
      .from("sessions")
      .select("*")
      .eq("id", id)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setFetched(data ? fromRow(data) : null);
      });
    return () => {
      cancelled = true;
    };
  }, [user, inStore, fetched, id]);

  const session = inStore ?? fetched ?? stash ?? null;

  if (!ready || stash === undefined || (user && !session && fetched === undefined)) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <div className="h-8 w-64 animate-pulse rounded bg-sunk" aria-label="Loading" />
      </main>
    );
  }
  if (!user && !session) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">Sign in to see this report</h1>
        <Link href="/login" className="btn btn-primary mt-6">
          Sign in
        </Link>
      </main>
    );
  }
  if (!session) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">Report not found</h1>
        <p className="mt-3 text-muted">It may have been deleted, or it belongs to another account.</p>
        <Link href="/history" className="btn mt-6">
          Back to Past chats
        </Link>
      </main>
    );
  }

  const s = session;
  const humanLabel = s.mode === "table" ? "The room" : s.humanCountry || "You";
  const isRoom = s.source === "room";

  const unsaved = !inStore && !fetched && !!stash;

  function saveCoach(coach: Coach) {
    if (!s.report) return;
    const next = { ...s, report: { ...s.report, coach } };
    if (unsaved) {
      stashSession(next);
      setStashEdit(next);
    } else saveSession(next);
  }

  function keep() {
    saveSession(s);
    clearStash(s.id);
    setStashEdit(null);
  }

  return (
    <main style={toneStyle("history")} className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <Link href="/history" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink print:hidden">
        <ArrowLeft aria-hidden="true" size={16} /> Past chats
      </Link>
      {unsaved && (
        <div role="status" className="mt-4 rounded-[var(--radius-ui)] border border-line bg-surface px-4 py-3 text-sm print:hidden">
          <p className="font-medium">This session is not saved.</p>
          <p className="mt-0.5 text-muted">The report and coaching disappear when you close this tab.</p>
          {user ? (
            <button type="button" className="btn btn-primary mt-3" onClick={keep}>
              Save to my account
            </button>
          ) : (
            <Link href="/login" className="btn btn-primary mt-3">
              Sign in to save it
            </Link>
          )}
        </div>
      )}
      <p className="mt-4 text-sm text-muted">
        {isRoom ? "Online room" : MODE_LABEL[s.mode]}, {new Date(s.endedAt ?? s.updatedAt).toLocaleDateString()}
      </p>
      <h1 className="text-4xl font-extrabold leading-tight md:text-5xl">{s.topic}</h1>
      <p className="mt-1 text-muted">
        {s.committee}
        {s.aiCountries.length > 0 && <>. {sessionTitle(s).split(":")[0]} played by AI.</>}
      </p>

      {s.report ? (
        <div className="mt-8 space-y-8">
          <ReportView
            report={s.report}
            lines={s.lines}
            humanLabel={humanLabel}
            startedAt={s.startedAt}
            endedAt={s.endedAt}
            aiCountries={s.aiCountries}
          />
          <CoachPanel session={s} onCoach={saveCoach} />
        </div>
      ) : (
        <div className="mt-8 rounded-[var(--radius-ui)] border border-line bg-surface p-5">
          <p className="font-medium">This session has no report yet.</p>
          <p className="mt-1 text-sm text-muted">Finish the session to get a report and coaching.</p>
          <Link href="/delegate" className="btn btn-primary mt-4">
            Go to AI Delegate
          </Link>
        </div>
      )}

      <section aria-labelledby="transcript" className="mt-10">
        <h2 id="transcript" className="text-xl font-semibold tracking-tight">
          Transcript
        </h2>
        <p className="mt-1 text-sm text-muted">Everything that was said, in order. Read it next to your report.</p>
        <div className="mt-5 space-y-5">
          {s.lines.length === 0 && <p className="text-muted">Nothing was recorded.</p>}
          {s.lines.map((l) =>
            l.kind === "chair" ? (
              <p key={l.id} className="max-w-[72ch] border-l-2 border-line pl-3 text-sm leading-relaxed text-muted">
                <span className="font-medium text-ink">Judge. </span>
                {l.text}
              </p>
            ) : (
              <div key={l.id} className="max-w-[88%]">
                <p className="mb-1 text-xs font-medium text-muted">{l.speaker}</p>
                <div
                  className={`break-words rounded-[var(--radius-ui)] border p-3.5 leading-relaxed ${
                    l.kind === "human" ? "border-accent bg-surface" : "border-line bg-surface"
                  }`}
                >
                  {l.text}
                </div>
              </div>
            ),
          )}
        </div>
      </section>
    </main>
  );
}
