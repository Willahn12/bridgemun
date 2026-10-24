"use client";

import { useState } from "react";
import { HandPalm } from "@phosphor-icons/react";
import { POINT_INFO, POINT_TYPES, checkPoint, type PointType } from "@/lib/points";

export default function PointPanel({
  delegations,
  busy,
  onRaise,
  onCancel,
}: {
  delegations: string[];
  busy: boolean;
  onRaise: (type: PointType, text: string, to?: string) => void;
  onCancel: () => void;
}) {
  const [type, setType] = useState<PointType>("information");
  const [to, setTo] = useState(delegations[0] ?? "");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  function raise() {
    const err = checkPoint(type, text, type === "information" ? to : undefined, delegations);
    setError(err);
    if (!err) onRaise(type, text.trim(), type === "information" ? to : undefined);
  }

  return (
    <section aria-label="Raise a point" className="rounded-[var(--radius-ui)] border border-line bg-surface p-4">
      <div className="flex items-center gap-2">
        <HandPalm aria-hidden="true" size={18} />
        <h2 className="font-semibold">Raise a point</h2>
      </div>
      <p className="mt-1 text-sm text-muted">A point is not a speech, so it does not use up your debate time.</p>

      <fieldset className="mt-3 grid gap-2 sm:grid-cols-3">
        <legend className="sr-only">Kind of point</legend>
        {POINT_TYPES.map((t) => (
          <label
            key={t}
            className={`cursor-pointer rounded-[var(--radius-ui)] border p-3 text-sm ${type === t ? "border-accent" : "border-line"}`}
          >
            <span className="flex items-center gap-2 font-medium">
              <input
                type="radio"
                name="point-type"
                value={t}
                checked={type === t}
                onChange={() => {
                  setType(t);
                  setError(null);
                }}
                className="accent-[var(--accent)]"
              />
              {POINT_INFO[t].label}
            </span>
            <span className="mt-1 block text-muted">{POINT_INFO[t].when}</span>
          </label>
        ))}
      </fieldset>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        {type === "information" && (
          <label className="flex flex-col gap-1 text-sm">
            <span className="text-muted">Question for</span>
            <select className="field" value={to} onChange={(e) => setTo(e.target.value)}>
              {delegations.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex min-w-56 flex-1 flex-col gap-1 text-sm">
          <span className="text-muted">{type === "order" ? "What went wrong" : "Your question"}</span>
          <input
            className="field"
            maxLength={400}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                raise();
              }
            }}
            placeholder={POINT_INFO[type].placeholder}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={raise}>
          Raise point
        </button>
        <button type="button" className="btn" disabled={busy} onClick={onCancel}>
          Back to debate
        </button>
      </div>
    </section>
  );
}
