"use client";

import { useState } from "react";
import Link from "next/link";
import { Trash } from "@phosphor-icons/react";
import PageHero from "@/components/PageHero";
import { useAuth } from "@/lib/auth";
import { toneStyle } from "@/lib/tone";
import { MODE_LABEL, deleteSession, sessionTitle, useSavedSessions, useSaveError, type Session } from "@/lib/sessions";

type Tab = "practice" | "room";

const average = (s: Session) =>
  s.report?.scores.length ? s.report.scores.reduce((n, x) => n + x.score, 0) / s.report.scores.length : null;

export default function HistoryPage() {
  const { user, ready } = useAuth();
  const sessions = useSavedSessions();
  const saveError = useSaveError();
  const [tab, setTab] = useState<Tab>("practice");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  if (ready && !user) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">Past chats</h1>
        <p className="mt-3 text-muted">Sign in to see your saved sessions, reports and coaching.</p>
        <Link href="/login" className="btn btn-primary mt-6">
          Sign in
        </Link>
      </main>
    );
  }

  const practice = sessions.filter((s) => s.source !== "room");
  const rooms = sessions.filter((s) => s.source === "room");
  const shown = tab === "practice" ? practice : rooms;

  const scored = sessions.map(average).filter((n): n is number => n !== null);
  const overall = scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : null;

  return (
    <main style={toneStyle("history")}>
      <PageHero kind="history" title="Past chats">
        <p>Every session you saved, with its report, your coaching and the full transcript.</p>
        <p className="mt-5 flex flex-wrap gap-3 text-base">
          {[
            [String(practice.length), "practice"],
            [String(rooms.length), "online rooms"],
            [overall !== null ? overall.toFixed(1) : "-", "average score"],
          ].map(([n, label]) => (
            <span key={label} className="rounded-full border-2 border-ink bg-surface px-4 py-1.5 font-semibold text-ink">
              <span className="font-display text-lg font-extrabold">{n}</span> {label}
            </span>
          ))}
        </p>
      </PageHero>

      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div role="tablist" aria-label="Kind of session" className="flex gap-2">
          {(
            [
              ["practice", "Practice", practice.length],
              ["room", "Online rooms", rooms.length],
            ] as const
          ).map(([key, label, n]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`rounded-full border-2 border-ink px-5 py-2 text-sm font-bold transition-all ${
                tab === key ? "bg-[var(--tone)] shadow-[3px_3px_0_var(--ink)]" : "bg-surface hover:-translate-y-0.5"
              }`}
            >
              {label} <span className="ml-1 font-mono text-xs">{n}</span>
            </button>
          ))}
        </div>

        {saveError && (
          <p role="alert" className="mt-4 text-sm text-danger">
            {saveError}
          </p>
        )}

        {shown.length === 0 ? (
          <div className="tone-card mt-8 p-6">
            <p className="font-display text-xl font-bold">{tab === "practice" ? "No practice sessions saved yet." : "No online rooms yet."}</p>
            <p className="mt-1 text-muted">
              {tab === "practice"
                ? "Finish a session in AI Delegate and it will be listed here."
                : "When an online room ends, your copy of the report is kept here."}
            </p>
            <Link href={tab === "practice" ? "/delegate" : "/room"} className="btn btn-primary mt-4">
              {tab === "practice" ? "Start practising" : "Go to Online Room"}
            </Link>
          </div>
        ) : (
          <ul className="mt-8 grid gap-5 md:grid-cols-2">
            {shown.map((s) => {
              const avg = average(s);
              const ring = avg === null ? "var(--sky)" : avg >= 4 ? "var(--mint)" : avg >= 3 ? "var(--sun)" : "var(--coral)";
              return (
                <li key={s.id} className="group relative">
                  <Link
                    href={s.source === "room" ? `/report/${s.id}` : `/delegate?open=${s.id}`}
                    className="tone-card flex items-center gap-4 p-4 pr-12 transition-transform duration-200 hover:-translate-y-1"
                  >
                    <span
                      className="grid size-16 shrink-0 place-items-center rounded-full border-[3px] border-ink font-display text-xl font-extrabold"
                      style={{ background: ring }}
                    >
                      {avg !== null ? avg.toFixed(1) : "..."}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-display text-lg font-bold">{sessionTitle(s)}</span>
                      <span className="block truncate text-sm text-muted">
                        {s.source === "room" ? "Online room" : MODE_LABEL[s.mode]}, {new Date(s.endedAt ?? s.updatedAt).toLocaleDateString()}
                      </span>
                      <span className="mt-1 flex gap-2 text-xs font-semibold">
                        <span className="rounded-full bg-sunk px-2 py-0.5">{s.report ? "Report ready" : "In progress"}</span>
                        {s.report?.coach && <span className="rounded-full bg-sunk px-2 py-0.5">Coached</span>}
                      </span>
                    </span>
                  </Link>
                  <button
                    type="button"
                    aria-label={confirmId === s.id ? `Confirm deleting ${sessionTitle(s)}` : `Delete ${sessionTitle(s)}`}
                    onClick={() => {
                      if (confirmId !== s.id) return setConfirmId(s.id);
                      setConfirmId(null);
                      deleteSession(s.id);
                    }}
                    onBlur={() => setConfirmId(null)}
                    className={`absolute right-2 top-2 rounded p-2 text-xs transition-opacity focus-visible:opacity-100 ${
                      confirmId === s.id ? "bg-sunk font-medium text-danger opacity-100" : "text-muted opacity-0 hover:text-danger group-hover:opacity-100"
                    }`}
                  >
                    {confirmId === s.id ? "Delete?" : <Trash aria-hidden="true" size={16} />}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </main>
  );
}
