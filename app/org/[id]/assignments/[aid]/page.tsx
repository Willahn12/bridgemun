"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft } from "@phosphor-icons/react";
import { useOrgContext } from "@/components/org/OrgProvider";
import ReportView from "@/components/delegate/ReportView";
import {
  deleteAssignment,
  dueText,
  getAssignment,
  getSessionForReview,
  listSubmissions,
  myFinishedSessions,
  submitSession,
  withdrawSubmission,
  type Assignment,
  type SessionSummary,
  type Submission,
} from "@/lib/classroom";
import { friendlyOrgError } from "@/lib/orgs";
import type { Session } from "@/lib/sessions";

export default function AssignmentPage() {
  const { aid } = useParams<{ aid: string }>();
  const router = useRouter();
  const { org, members, userId, isStaff, names } = useOrgContext();
  const [a, setA] = useState<Assignment | null | undefined>(undefined);
  const [subs, setSubs] = useState<Submission[]>([]);
  const [mine, setMine] = useState<SessionSummary[]>([]);
  const [pick, setPick] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tick, setTick] = useState(0);
  const [review, setReview] = useState<{ userId: string; session: Session | null } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const found = await getAssignment(aid);
        if (cancelled) return;
        if (!found || found.orgId !== org.id) return setA(null);
        setA(found);
        const s = await listSubmissions([aid]);
        if (cancelled) return;
        setSubs(s);
        if (!isStaff) {
          const sessions = await myFinishedSessions(userId);
          if (!cancelled) setMine(sessions);
        }
      } catch (e) {
        if (!cancelled) setError(friendlyOrgError(e instanceof Error ? e.message : "Could not load this assignment."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [aid, org.id, isStaff, userId, tick]);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      setTick((t) => t + 1);
    } catch (e) {
      setError(friendlyOrgError(e instanceof Error ? e.message : "Something went wrong"));
    } finally {
      setBusy(false);
    }
  }

  if (a === undefined && !error) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="h-8 w-72 animate-pulse rounded bg-sunk" aria-label="Loading" />
      </main>
    );
  }
  if (!a) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <p className="text-muted">{error ?? "This assignment was not found."}</p>
        <Link href={`/org/${org.id}/assignments`} className="btn mt-4">
          <ArrowLeft aria-hidden="true" size={16} /> Back to assignments
        </Link>
      </main>
    );
  }

  const { label, overdue } = dueText(a.dueAt);
  const myHandIn = subs.find((s) => s.userId === userId);
  const students = members.filter((m) => m.role === "student");

  return (
    <main className="mx-auto max-w-4xl px-4 pb-16 pt-8 sm:px-6">
      <Link href={`/org/${org.id}/assignments`} className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft aria-hidden="true" size={16} /> All assignments
      </Link>
      <h2 className="mt-3 text-2xl font-semibold tracking-tight">{a.title}</h2>
      <p className={`mt-1 text-sm ${overdue && !myHandIn && !isStaff ? "text-danger" : "text-muted"}`}>{label}</p>
      {a.description && <p className="mt-5 max-w-[65ch] whitespace-pre-wrap leading-relaxed">{a.description}</p>}

      {error && (
        <p role="alert" className="mt-4 text-sm text-danger">
          {error}
        </p>
      )}

      {!isStaff && (
        <section className="mt-8 rounded-[var(--radius-ui)] border border-line bg-surface p-5" aria-labelledby="hand-in">
          <h3 id="hand-in" className="text-lg font-semibold tracking-tight">
            Your hand-in
          </h3>
          {myHandIn && (
            <p className="mt-2 text-sm text-muted">
              Handed in {new Date(myHandIn.submittedAt).toLocaleString()}. You can hand in a different session to replace it.
            </p>
          )}
          {mine.length === 0 ? (
            <p className="mt-3 max-w-[56ch] leading-relaxed text-muted">
              You have no finished sessions yet. Practise in AI delegate mode, sign in and save the session, end it
              so a report is made, then come back here to hand it in.{" "}
              <Link href="/delegate" className="font-medium text-accent hover:underline">
                Go to AI delegate
              </Link>
            </p>
          ) : (
            <div className="mt-4 flex flex-wrap items-end gap-3">
              <div className="min-w-0 flex-1">
                <label htmlFor="pick" className="label">Choose a finished session</label>
                <select id="pick" className="field" value={pick} onChange={(e) => setPick(e.target.value)}>
                  <option value="">Select a session</option>
                  {mine.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.aiCountries.join(", ")}: {s.topic} ({new Date(s.updatedAt).toLocaleDateString()})
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className="btn btn-primary"
                disabled={!pick || busy}
                onClick={() => run(() => submitSession(a, userId, pick))}
              >
                {myHandIn ? "Replace hand-in" : "Hand in"}
              </button>
              {myHandIn && (
                <button type="button" className="btn" disabled={busy} onClick={() => run(() => withdrawSubmission(a.id, userId))}>
                  Withdraw
                </button>
              )}
            </div>
          )}
          <p className="helper">Your teachers can read the session and its report once you hand it in.</p>
        </section>
      )}

      {isStaff && (
        <section className="mt-8" aria-labelledby="class">
          <h3 id="class" className="text-lg font-semibold tracking-tight">
            Students ({subs.length} of {students.length} handed in)
          </h3>
          {students.length === 0 ? (
            <p className="mt-3 text-muted">No students have joined yet. Share the invite code from the Members tab.</p>
          ) : (
            <ul className="mt-3 divide-y divide-line rounded-[var(--radius-ui)] border border-line bg-surface">
              {students.map((s) => {
                const sub = subs.find((x) => x.userId === s.userId);
                const open = review?.userId === s.userId;
                return (
                  <li key={s.userId} className="px-4 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <span className="min-w-0">
                        <span className="block truncate font-medium">{names.get(s.userId) ?? s.name}</span>
                        <span className="block text-sm text-muted">
                          {sub ? `Handed in ${new Date(sub.submittedAt).toLocaleString()}` : "Not handed in"}
                        </span>
                      </span>
                      {sub?.sessionId && (
                        <button
                          type="button"
                          className="btn"
                          aria-expanded={open}
                          onClick={async () => {
                            if (open) return setReview(null);
                            setReview({ userId: s.userId, session: null });
                            try {
                              const session = await getSessionForReview(sub.sessionId as string);
                              setReview({ userId: s.userId, session });
                            } catch (e) {
                              setError(friendlyOrgError(e instanceof Error ? e.message : "Could not open the session."));
                            }
                          }}
                        >
                          {open ? "Hide" : "View session"}
                        </button>
                      )}
                    </div>
                    {open && (
                      <div className="mt-4">
                        {review?.session === null ? (
                          <div className="h-24 animate-pulse rounded bg-sunk" aria-label="Loading" />
                        ) : review?.session ? (
                          <>
                            {review.session.report ? (
                              <ReportView
                                report={review.session.report}
                                lines={review.session.lines}
                                humanLabel={s.name}
                                startedAt={review.session.startedAt}
                                endedAt={review.session.endedAt}
                                aiCountries={review.session.aiCountries}
                              />
                            ) : (
                              <p className="text-sm text-muted">This session has no report.</p>
                            )}
                            <h4 className="mb-2 mt-6 font-semibold">Transcript</h4>
                            <ul className="space-y-2 text-sm leading-relaxed">
                              {review.session.lines.map((l) => (
                                <li key={l.id}>
                                  <span className="font-medium">{l.speaker}: </span>
                                  <span className={l.kind === "chair" ? "text-muted" : ""}>{l.text}</span>
                                </li>
                              ))}
                            </ul>
                          </>
                        ) : (
                          <p className="text-sm text-muted">The session could not be opened.</p>
                        )}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          <div className="mt-10 border-t border-line pt-6">
            <button
              type="button"
              className={`btn ${confirmDelete ? "btn-live" : ""}`}
              onClick={async () => {
                if (!confirmDelete) return setConfirmDelete(true);
                try {
                  await deleteAssignment(a.id);
                  router.push(`/org/${org.id}/assignments`);
                } catch (e) {
                  setError(friendlyOrgError(e instanceof Error ? e.message : "Could not delete."));
                }
              }}
              onBlur={() => setConfirmDelete(false)}
            >
              {confirmDelete ? "Click again to delete this assignment" : "Delete assignment"}
            </button>
          </div>
        </section>
      )}
    </main>
  );
}
