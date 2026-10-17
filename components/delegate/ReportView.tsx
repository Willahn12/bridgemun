"use client";

import { Printer } from "@phosphor-icons/react";
import type { Line, Report } from "@/lib/sessions";

function minutes(ms: number) {
  const m = Math.max(1, Math.round(ms / 60000));
  return `${m} min`;
}

export default function ReportView({
  report,
  lines,
  humanLabel,
  startedAt,
  endedAt,
  aiCountries,
}: {
  report: Report;
  lines: Line[];
  humanLabel: string;
  startedAt?: number;
  endedAt?: number;
  aiCountries: string[];
}) {
  const mine = lines.filter((l) => l.kind === "human");
  const words = mine.reduce((n, l) => n + l.text.trim().split(/\s+/).filter(Boolean).length, 0);
  const stats = [
    { label: "Your speeches", value: String(mine.length) },
    { label: "Words spoken", value: String(words) },
    { label: "Length", value: startedAt && endedAt ? minutes(endedAt - startedAt) : "Not recorded" },
    { label: "AI delegations", value: String(aiCountries.length) },
  ];

  return (
    <section aria-labelledby="report-title" className="tone-card p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="report-title" className="text-2xl font-semibold tracking-tight">
            Session report
          </h2>
          <p className="mt-1 text-sm text-muted">{humanLabel}</p>
        </div>
        <button type="button" className="btn print:hidden" onClick={() => window.print()}>
          <Printer aria-hidden="true" size={18} /> Print or save as PDF
        </button>
      </div>

      <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 border-y border-line py-5 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label}>
            <dt className="text-sm text-muted">{s.label}</dt>
            <dd className="mt-0.5 font-mono text-xl font-medium">{s.value}</dd>
          </div>
        ))}
      </dl>

      <p className="mt-6 max-w-[68ch] leading-relaxed">{report.summary}</p>

      {report.scores.length > 0 && <h3 className="mt-8 text-lg font-semibold tracking-tight">Scores</h3>}
      <ul className="mt-3 divide-y divide-line">
        {report.scores.map((s) => (
          <li key={s.criterion} className="grid gap-1 py-3 sm:grid-cols-[13rem_4rem_1fr] sm:gap-4">
            <span className="font-medium">{s.criterion}</span>
            <span className="font-mono">{s.score} / 5</span>
            <span className="text-muted">{s.comment}</span>
          </li>
        ))}
      </ul>

      {report.strengths.length + report.improvements.length > 0 && (
      <div className="mt-8 grid gap-8 md:grid-cols-2">
        <div>
          <h3 className="text-lg font-semibold tracking-tight">What went well</h3>
          <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed marker:text-muted">
            {report.strengths.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-lg font-semibold tracking-tight">To improve</h3>
          <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed marker:text-muted">
            {report.improvements.map((t, i) => (
              <li key={i}>{t}</li>
            ))}
          </ul>
        </div>
      </div>
      )}

      {report.moments.length > 0 && (
        <>
          <h3 className="mt-8 text-lg font-semibold tracking-tight">Moments from your speeches</h3>
          <ul className="mt-3 space-y-4">
            {report.moments.map((m, i) => (
              <li key={i} className="border-l-2 border-accent pl-4">
                <p className="max-w-[68ch] italic leading-relaxed">&ldquo;{m.quote}&rdquo;</p>
                <p className="mt-1 text-sm text-muted">{m.note}</p>
              </li>
            ))}
          </ul>
        </>
      )}

      <h3 className="mt-8 text-lg font-semibold tracking-tight">Practise next</h3>
      <ul className="mt-3 list-disc space-y-2 pl-5 leading-relaxed marker:text-muted">
        {report.nextSteps.map((t, i) => (
          <li key={i}>{t}</li>
        ))}
      </ul>
    </section>
  );
}
