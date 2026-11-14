"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Broadcast, DeviceMobile, User, UsersThree } from "@phosphor-icons/react";
import type { Mode } from "@/lib/sessions";

const CARD =
  "group relative flex h-full flex-col rounded-[var(--radius-ui)] border-2 border-ink p-6 text-left shadow-[6px_6px_0_var(--ink)] transition-all duration-200 hover:-translate-y-1 hover:shadow-[9px_9px_0_var(--ink)] active:translate-y-0 active:shadow-[3px_3px_0_var(--ink)]";

const BADGE = "mb-5 grid size-16 place-items-center rounded-2xl border-2 border-ink bg-[var(--tone)] transition-transform duration-200 group-hover:-rotate-6 group-hover:scale-110";

export default function ModePicker({ onPick }: { onPick: (mode: Mode) => void }) {
  const [compOpen, setCompOpen] = useState(false);

  return (
    <div className="grid gap-6">
      <div className="grid gap-6 md:grid-cols-3">
        <button type="button" className={CARD} style={{ background: "var(--surface)", "--tone": "var(--cyan)" } as React.CSSProperties} onClick={() => onPick("solo")}>
          <span className={BADGE}>
            <User aria-hidden="true" size={34} weight="fill" color="#0c2b4b" />
          </span>
          <span className="font-display text-2xl font-extrabold leading-tight text-ink">Practice, solo</span>
          <span className="mt-2 flex-1 leading-relaxed text-muted">One AI delegate. Talk back and forth, one on one.</span>
          <ArrowRight aria-hidden="true" size={24} weight="bold" className="mt-5 text-ink transition-transform group-hover:translate-x-1.5" />
        </button>

        <button type="button" className={CARD} style={{ background: "var(--surface)", "--tone": "var(--sun)" } as React.CSSProperties} onClick={() => onPick("committee")}>
          <span className={BADGE}>
            <UsersThree aria-hidden="true" size={34} weight="fill" color="#0c2b4b" />
          </span>
          <span className="font-display text-2xl font-extrabold leading-tight text-ink">Practice, with several AI delegates</span>
          <span className="mt-2 flex-1 leading-relaxed text-muted">
            A full room of AI countries. They listen, answer, argue with each other, and give you the floor.
          </span>
          <ArrowRight aria-hidden="true" size={24} weight="bold" className="mt-5 text-ink transition-transform group-hover:translate-x-1.5" />
        </button>

        <button
          type="button"
          className={CARD}
          style={{ background: "var(--surface)", "--tone": "var(--mint)" } as React.CSSProperties}
          aria-expanded={compOpen}
          onClick={() => setCompOpen((v) => !v)}
        >
          <span className={BADGE}>
            <Broadcast aria-hidden="true" size={34} weight="fill" color="#0c2b4b" />
          </span>
          <span className="font-display text-2xl font-extrabold leading-tight text-ink">Comp mode</span>
          <span className="mt-2 flex-1 leading-relaxed text-muted">
            One AI delegate against a group of real people. Choose how the group takes part.
          </span>
          <ArrowRight
            aria-hidden="true"
            size={24}
            weight="bold"
            className={`mt-5 text-ink transition-transform ${compOpen ? "rotate-90" : "group-hover:translate-x-1.5"}`}
          />
        </button>
      </div>

      {compOpen && (
        <div className="grid gap-5 rounded-[var(--radius-ui)] border-2 border-ink bg-sunk p-5 sm:grid-cols-2 sm:p-6">
          <Link
            href="/room"
            className="group flex items-start gap-4 rounded-[var(--radius-ui)] border-2 border-ink bg-surface p-5 shadow-[4px_4px_0_var(--cyan)] transition-transform hover:-translate-y-1"
          >
            <span className="grid size-12 shrink-0 place-items-center rounded-xl border-2 border-ink bg-[var(--cyan)]">
              <Broadcast aria-hidden="true" size={26} weight="fill" color="#0c2b4b" />
            </span>
            <span>
              <span className="block font-display text-lg font-bold">Online room</span>
              <span className="mt-1 block text-sm leading-relaxed text-muted">
                Everyone joins from their own computer with an account. Find a public room or host your own, public or
                private, with a judge and AI delegates.
              </span>
            </span>
          </Link>
          <button
            type="button"
            onClick={() => onPick("table")}
            className="group flex items-start gap-4 rounded-[var(--radius-ui)] border-2 border-ink bg-surface p-5 text-left shadow-[4px_4px_0_var(--coral)] transition-transform hover:-translate-y-1"
          >
            <span className="grid size-12 shrink-0 place-items-center rounded-xl border-2 border-ink bg-[var(--coral)]">
              <DeviceMobile aria-hidden="true" size={26} weight="fill" color="#0c2b4b" />
            </span>
            <span>
              <span className="block font-display text-lg font-bold">Table mode</span>
              <span className="mt-1 block text-sm leading-relaxed text-muted">
                One device in the room. The AI listens to the conversation and speaks when it is its turn.
              </span>
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
