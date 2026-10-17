"use client";

import { useState } from "react";
import { Gavel, Robot, User } from "@phosphor-icons/react";
import { MOTION_INFO, byPriority, describe, type Motion, type MotionType } from "@/lib/motions";

export type Ballot = "for" | "against" | "abstain";
export type Draft = Pick<Motion, "type" | "topic" | "minutes" | "speakingTime" | "extra">;

/* Close debate keeps its own button in the session, as before. */
const TYPES: MotionType[] = ["mod", "unmod", "extend"];

function Num({ label, value, onChange, min, max }: { label: string; value: number; onChange: (n: number) => void; min: number; max: number }) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted">{label}</span>
      <input type="number" className="field w-28" min={min} max={max} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

export default function MotionPanel({
  floor,
  ballot,
  busy,
  voting,
  aiNote,
  onSubmit,
  onSecond,
  onDecline,
  onWithdraw,
  onVote,
  onBallot,
  onCancel,
}: {
  floor: Motion[];
  /** The motion the human delegate is being asked to vote on. */
  ballot: Motion | null;
  busy: boolean;
  voting: boolean;
  /** Why no AI delegation may suggest a motion this round, if one may not. */
  aiNote: string | null;
  onSubmit: (d: Draft) => string | null;
  onSecond: (id: string) => void;
  onDecline: (id: string) => void;
  onWithdraw: (id: string) => void;
  onVote: () => void;
  onBallot: (b: Ballot) => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<MotionType>("mod");
  const [topic, setTopic] = useState("");
  const [minutes, setMinutes] = useState(5);
  const [speakingTime, setSpeakingTime] = useState(60);
  const [extra, setExtra] = useState(2);
  const [error, setError] = useState<string | null>(null);

  const ordered = [...floor].sort(byPriority);
  const mine = floor.some((m) => m.mover === "human");

  function submit() {
    const draft: Draft =
      type === "mod" ? { type, topic: topic.trim(), minutes, speakingTime } : type === "unmod" ? { type, minutes } : { type, extra };
    const err = onSubmit(draft);
    setError(err);
    if (!err) setTopic("");
  }

  return (
    <section aria-label="Motions" className="rounded-[var(--radius-ui)] border border-line bg-surface p-4">
      <div className="flex items-center gap-2">
        <Gavel aria-hidden="true" size={18} />
        <h2 className="font-semibold">The floor is open to motions</h2>
      </div>
      <p className="mt-1 text-sm text-muted">Motions are listed in the order they will be voted on. The first one to pass is carried out and the rest fall.</p>

      {ordered.length > 0 && (
        <ol className="mt-3 space-y-2">
          {ordered.map((m, i) => (
            <li key={m.id} className={`rounded-[var(--radius-ui)] border p-3 text-sm ${ballot?.id === m.id ? "border-accent" : "border-line"}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p>
                  <span className="mr-2 font-semibold">{i + 1}.</span>
                  {describe(m)}
                </p>
                <span className="flex items-center gap-1 text-xs text-muted">
                  {m.mover === "ai" ? <Robot aria-hidden="true" size={14} /> : <User aria-hidden="true" size={14} />}
                  {m.by}
                  {m.mover === "ai" && (m.seconded ? ", seconded" : ", needs a second")}
                </span>
              </div>
              {m.reason && <p className="mt-1 text-muted">&ldquo;{m.reason}&rdquo;</p>}
              {!voting && (
                <div className="mt-2 flex gap-2">
                  {m.mover === "ai" && !m.seconded && (
                    <>
                      <button type="button" className="btn btn-primary" onClick={() => onSecond(m.id)}>
                        Second it
                      </button>
                      <button type="button" className="btn" onClick={() => onDecline(m.id)}>
                        Decline
                      </button>
                    </>
                  )}
                  {m.mover === "human" && (
                    <button type="button" className="btn" onClick={() => onWithdraw(m.id)}>
                      Withdraw
                    </button>
                  )}
                </div>
              )}
            </li>
          ))}
        </ol>
      )}

      {ballot && (
        <div className="mt-3 rounded-[var(--radius-ui)] border border-accent p-3" role="group" aria-label="Your vote">
          <p className="text-sm font-medium">Your vote: {describe(ballot)}</p>
          <div className="mt-2 flex gap-2">
            {(["for", "against", "abstain"] as Ballot[]).map((b) => (
              <button key={b} type="button" className={`btn ${b === "for" ? "btn-primary" : ""}`} onClick={() => onBallot(b)}>
                {b[0].toUpperCase() + b.slice(1)}
              </button>
            ))}
          </div>
        </div>
      )}

      {!voting && !mine && (
        <div className="mt-4 border-t border-line pt-4">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-muted">Motion</span>
              <select className="field" value={type} onChange={(e) => { setType(e.target.value as MotionType); setError(null); }}>
                {TYPES.map((t) => (
                  <option key={t} value={t}>
                    {MOTION_INFO[t].label}
                  </option>
                ))}
              </select>
            </label>
            {type === "mod" && (
              <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm">
                <span className="text-muted">Topic</span>
                <input className="field" maxLength={120} value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="e.g. Funding for clean water in rural areas" />
              </label>
            )}
            {(type === "mod" || type === "unmod") && <Num label="Total minutes" value={minutes} onChange={setMinutes} min={1} max={10} />}
            {type === "mod" && <Num label="Seconds per speaker" value={speakingTime} onChange={setSpeakingTime} min={30} max={120} />}
            {type === "extend" && <Num label="Extra speeches" value={extra} onChange={setExtra} min={1} max={4} />}
            <button type="button" className="btn" onClick={submit}>
              Submit motion
            </button>
          </div>
          <p className="mt-2 text-xs text-muted">
            {MOTION_INFO[type].when} {MOTION_INFO[type].inputs}
          </p>
          {error && (
            <p role="alert" className="mt-2 text-sm text-danger">
              Out of order: {error}
            </p>
          )}
        </div>
      )}

      {aiNote && <p className="mt-3 text-xs text-muted">{aiNote}</p>}

      {!voting && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" className="btn btn-primary" disabled={busy || floor.length === 0} onClick={onVote}>
            Put motions to a vote
          </button>
          <button type="button" className="btn" disabled={busy} onClick={onCancel}>
            Back to debate
          </button>
        </div>
      )}
    </section>
  );
}
