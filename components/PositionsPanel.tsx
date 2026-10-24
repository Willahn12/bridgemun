"use client";

import { STANCE_LABEL, type Position } from "@/lib/positions";

const STANCE_COLOR: Record<Position["stance"], string> = {
  support: "var(--mint)",
  neutral: "var(--sun)",
  oppose: "var(--coral)",
  mixed: "var(--violet)",
};

/* Where the AI delegations stand, so a student can plan arguments. Collapsed by default. */
export default function PositionsPanel({ positions, className = "" }: { positions: Position[]; className?: string }) {
  if (!positions.length) return null;
  return (
    <details className={`group rounded-[var(--radius-ui)] border border-line bg-surface text-sm ${className}`}>
      <summary className="cursor-pointer select-none px-3 py-2 font-medium">Where the AI delegations stand</summary>
      <ul className="space-y-3 border-t border-line px-3 py-3">
        {positions.map((p) => (
          <li key={p.country}>
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{p.country}</span>
              <span className="rounded-full border border-ink px-2 py-0.5 text-xs font-bold text-[#0c2b4b]" style={{ background: STANCE_COLOR[p.stance] }}>
                {STANCE_LABEL[p.stance]}
              </span>
              <span className="text-muted">{p.attitude}</span>
            </p>
            <p className="mt-1 leading-relaxed">{p.summary}</p>
            {p.redLines.length > 0 && <p className="mt-1 text-muted">Will not accept: {p.redLines.join("; ")}</p>}
            {p.origin === "dataset" ? (
              <p className="mt-1 text-xs text-muted">
                From checked research:{" "}
                {p.sources.map((s, i) => (
                  <span key={s.url}>
                    {i > 0 && "; "}
                    <a href={s.url} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-ink">
                      {s.title}
                    </a>
                  </span>
                ))}
              </p>
            ) : (
              <p className="mt-1 text-xs text-muted">AI summary, not checked. Verify it in your own research.</p>
            )}
          </li>
        ))}
      </ul>
    </details>
  );
}
