"use client";

import { useState } from "react";
import { ArrowLineDown, NotePencil } from "@phosphor-icons/react";

/* A delegate's private notes during a forum, and a draft of their next speech. Kept in this browser only
   (per forum), so they survive a reload but nobody else can read them. */

const load = (key: string) => {
  try {
    return localStorage.getItem(key) ?? "";
  } catch {
    return "";
  }
};

const save = (key: string, value: string) => {
  try {
    localStorage.setItem(key, value);
  } catch {
    // private window or full storage: the text still stays on screen until the page closes
  }
};

const WORDS_PER_SECOND = 2.6; // the same comfortable pace the forum uses when it reads speeches aloud

export default function NotesPanel({
  roomId,
  limitSeconds,
  canUse,
  onUse,
}: {
  roomId: string;
  /** This person's time for the current stage, to compare the draft against. */
  limitSeconds: number | null;
  /** Whether the draft can go into the speech box right now (it is their turn). */
  canUse: boolean;
  onUse: (text: string) => void;
}) {
  const [tab, setTab] = useState<"notes" | "draft">("notes");
  const [notes, setNotes] = useState(() => load(`bridgemun.notes.${roomId}`));
  const [draft, setDraft] = useState(() => load(`bridgemun.draft.${roomId}`));

  const words = draft.trim() ? draft.trim().split(/\s+/).length : 0;
  const seconds = Math.round(words / WORDS_PER_SECOND);
  const tooLong = limitSeconds !== null && seconds > limitSeconds;
  const fmt = (s: number) => (s >= 60 ? `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}` : `${s} s`);

  return (
    <section className="tone-card flex min-h-[16rem] flex-1 flex-col p-4" aria-labelledby="notes-title">
      <div className="flex items-center justify-between gap-2">
        <h2 id="notes-title" className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-accent">
          <NotePencil aria-hidden="true" size={16} weight="bold" /> My notes
        </h2>
        <div role="tablist" aria-label="Notes" className="inline-flex rounded-full border border-line p-0.5 text-xs font-semibold">
          {(
            [
              ["notes", "Notes"],
              ["draft", "Next speech prep"],
            ] as const
          ).map(([k, name]) => (
            <button
              key={k}
              type="button"
              role="tab"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={`rounded-full px-3 py-1 transition-colors ${tab === k ? "bg-accent text-accent-ink" : "text-muted hover:text-ink"}`}
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      {tab === "notes" ? (
        <>
          <label htmlFor="my-notes" className="sr-only">
            Notes
          </label>
          <textarea
            id="my-notes"
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              save(`bridgemun.notes.${roomId}`, e.target.value);
            }}
            placeholder={"Points other countries made, ideas, rebuttals…\n\nChina: wants funding through partnerships\nAsk: who pays for teachers?"}
            className="field mt-3 min-h-40 flex-1 resize-none text-sm leading-relaxed"
          />
          <p className="mt-2 text-xs text-muted">Only you can see these. They are saved in this browser.</p>
        </>
      ) : (
        <>
          <label htmlFor="my-draft" className="sr-only">
            Draft of your next speech
          </label>
          <textarea
            id="my-draft"
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              save(`bridgemun.draft.${roomId}`, e.target.value);
            }}
            placeholder="Honourable Chair, distinguished delegates…"
            className="field mt-3 min-h-40 flex-1 resize-none text-sm leading-relaxed"
          />
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <p className={`text-xs ${tooLong ? "font-semibold text-danger" : "text-muted"}`}>
              {words} {words === 1 ? "word" : "words"} · about {fmt(seconds)}
              {limitSeconds !== null && ` of ${fmt(limitSeconds)}`}
              {tooLong && ", too long"}
            </p>
            <button
              type="button"
              className="btn text-xs"
              disabled={!canUse || !draft.trim()}
              title={canUse ? "Copy this draft into your speech box" : "Available when it is your turn"}
              onClick={() => onUse(draft.trim())}
            >
              <ArrowLineDown aria-hidden="true" size={14} /> Put in speech box
            </button>
          </div>
        </>
      )}
    </section>
  );
}
