"use client";

import { useState } from "react";
import { GraduationCap, Sparkle } from "@phosphor-icons/react";
import type { Coach, Session } from "@/lib/sessions";

export default function CoachPanel({ session, onCoach }: { session: Session; onCoach: (c: Coach) => void }) {
  const coach = session.report?.coach;
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: session.mode,
          committee: session.committee,
          topic: session.topic,
          humanCountry: session.humanCountry,
          lines: session.lines.map((l) => ({ speaker: l.speaker, kind: l.kind, text: l.text })),
          report: session.report,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Coaching could not be created.");
      onCoach(body.coach as Coach);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Coaching could not be created.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section aria-labelledby="coach-title" className="tone-card p-5 sm:p-7" style={{ "--tone": "var(--sun)" } as React.CSSProperties}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="coach-title" className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            <GraduationCap aria-hidden="true" size={26} /> Your coach
          </h2>
          <p className="mt-1 max-w-[60ch] text-sm text-muted">
            Where to improve, what to learn next, and exercises to practise. Written about your own speeches.
          </p>
        </div>
        {coach && (
          <button type="button" className="btn print:hidden" disabled={busy} onClick={ask}>
            {busy ? "Working…" : "Write it again"}
          </button>
        )}
      </div>

      {!coach && (
        <div className="mt-5">
          <button type="button" className="btn btn-primary" disabled={busy} onClick={ask}>
            <Sparkle aria-hidden="true" size={18} weight="fill" /> {busy ? "Your coach is reading…" : "Get my coaching"}
          </button>
          {busy && <p className="helper">This takes about 15 seconds.</p>}
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}

      {coach && (
        <div className="mt-6 space-y-8">
          <p className="max-w-[68ch] leading-relaxed">{coach.overview}</p>

          {coach.focusAreas.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold tracking-tight">Work on these first</h3>
              <ol className="mt-3 space-y-4">
                {coach.focusAreas.map((f, i) => (
                  <li key={i} className="grid grid-cols-[2rem_1fr] gap-3">
                    <span className="font-mono text-lg text-muted">{i + 1}</span>
                    <div>
                      <p className="font-medium">{f.title}</p>
                      <p className="mt-1 text-muted">{f.why}</p>
                      <p className="mt-2 leading-relaxed">
                        <span className="font-medium">Try this: </span>
                        {f.howTo}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {coach.rewrite && (
            <div>
              <h3 className="text-lg font-semibold tracking-tight">Your words, made stronger</h3>
              <div className="mt-3 grid gap-4 md:grid-cols-2">
                <blockquote className="rounded-[var(--radius-ui)] border border-line bg-sunk p-4">
                  <p className="mb-1 text-xs font-medium text-muted">What you said</p>
                  <p className="leading-relaxed">{coach.rewrite.original}</p>
                </blockquote>
                <blockquote className="rounded-[var(--radius-ui)] border border-accent bg-background p-4">
                  <p className="mb-1 text-xs font-medium text-accent">A stronger version</p>
                  <p className="leading-relaxed">{coach.rewrite.improved}</p>
                </blockquote>
              </div>
              <p className="mt-3 max-w-[68ch] text-sm text-muted">{coach.rewrite.why}</p>
            </div>
          )}

          {coach.phrases.length > 0 && (
            <div>
              <h3 className="text-lg font-semibold tracking-tight">Say it like a diplomat</h3>
              <ul className="mt-3 divide-y divide-line">
                {coach.phrases.map((p, i) => (
                  <li key={i} className="grid gap-1 py-3 md:grid-cols-2 md:gap-6">
                    <p className="text-muted line-through decoration-line">{p.instead}</p>
                    <p className="font-medium">{p.say}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid gap-8 md:grid-cols-2">
            {coach.drills.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold tracking-tight">Practise this week</h3>
                <ul className="mt-3 space-y-4">
                  {coach.drills.map((d, i) => (
                    <li key={i}>
                      <p className="font-medium">
                        {d.name} <span className="font-mono text-sm font-normal text-muted">{d.minutes} min</span>
                      </p>
                      <p className="mt-1 leading-relaxed text-muted">{d.steps}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {coach.study.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold tracking-tight">Learn about</h3>
                <ul className="mt-3 space-y-4">
                  {coach.study.map((t, i) => (
                    <li key={i}>
                      <p className="font-medium">{t.topic}</p>
                      <p className="mt-1 leading-relaxed text-muted">{t.why}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {coach.encouragement && <p className="max-w-[68ch] border-l-2 border-accent pl-4 leading-relaxed">{coach.encouragement}</p>}
        </div>
      )}
    </section>
  );
}
