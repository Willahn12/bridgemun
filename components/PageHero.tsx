"use client";

import {
  Broadcast,
  ChatsCircle,
  MagnifyingGlass,
  Microphone,
  Scales,
  UsersThree,
} from "@phosphor-icons/react";

/* Each page has its own colour and its own picture at the top, so no two pages look alike. */
import { TONES, type PageKind } from "@/lib/tone";

const ICON = { size: 44, weight: "fill", color: "#0c2b4b", "aria-hidden": true } as const;

/* A row of bars, like a voice meter. */
const BARS = [30, 62, 44, 88, 52, 100, 70, 40, 78, 56, 92, 36, 66, 48];

function Picture({ kind }: { kind: PageKind }) {
  const tile = "grid place-items-center rounded-3xl border-[3px] border-ink";
  switch (kind) {
    case "research":
      // A briefing on paper: sheets with lines of text, and a magnifying glass on top.
      return (
        <div className="relative h-56 w-72">
          {[-7, 5, 0].map((rot, i) => (
            <div
              key={i}
              className="absolute inset-x-4 inset-y-2 rounded-2xl border-[3px] border-ink bg-surface p-5"
              style={{ transform: `rotate(${rot}deg)`, boxShadow: i === 2 ? "8px 8px 0 var(--ink)" : undefined }}
            >
              {i === 2 && (
                <div className="space-y-2.5 pt-2">
                  {[90, 70, 84, 55, 76].map((w, n) => (
                    <div key={n} className="h-2.5 rounded-full bg-[var(--sky)]" style={{ width: `${w}%` }} />
                  ))}
                </div>
              )}
            </div>
          ))}
          <div className={`${tile} absolute -bottom-3 -right-2 size-20 bg-[var(--sun)]`}>
            <MagnifyingGlass {...ICON} />
          </div>
        </div>
      );
    case "delegate":
      // Three seats at the table.
      return (
        <div className="relative h-56 w-80">
          <div className={`${tile} absolute left-0 top-10 size-32 -rotate-6 bg-[var(--cyan)]`}>
            <Scales {...ICON} />
          </div>
          <div className={`${tile} absolute left-24 top-0 size-36 rotate-3 bg-[var(--coral)]`}>
            <UsersThree {...ICON} />
          </div>
          <div className={`${tile} absolute right-0 top-14 size-32 rotate-6 bg-[var(--mint)]`}>
            <Broadcast {...ICON} />
          </div>
        </div>
      );
    case "history":
      // A stack of finished sessions with a score on top.
      return (
        <div className="relative h-52 w-64">
          {[2, 1, 0].map((n) => (
            <div
              key={n}
              className="absolute inset-x-0 rounded-2xl border-[3px] border-ink bg-surface"
              style={{ top: n * 14, bottom: (2 - n) * 14, transform: `translateX(${(2 - n) * 8}px)` }}
            />
          ))}
          <div className="absolute inset-x-5 top-[42px] flex items-center gap-4">
            <div className="grid size-16 place-items-center rounded-full border-[3px] border-ink bg-[var(--sun)] font-display text-2xl font-extrabold">4.2</div>
            <div className="flex-1 space-y-2">
              {[100, 70, 85].map((w, i) => (
                <div key={i} className="h-2.5 rounded-full bg-[var(--sky)]" style={{ width: `${w}%` }} />
              ))}
            </div>
          </div>
        </div>
      );
    case "studio":
      // A voice meter.
      return (
        <div className="flex h-48 items-end gap-2" aria-hidden="true">
          {BARS.map((h, i) => (
            <span
              key={i}
              className="eq w-3.5 rounded-full border-2 border-ink sm:w-4"
              style={{ height: `${h}%`, background: i % 3 === 0 ? "var(--ink)" : i % 3 === 1 ? "var(--coral)" : "var(--sun)", animationDelay: `${i * 90}ms` }}
            />
          ))}
        </div>
      );
    case "org":
      // A class: overlapping people.
      return (
        <div className="relative h-44 w-72">
          {["var(--cyan)", "var(--sun)", "var(--coral)", "var(--mint)", "var(--sky)"].map((c, i) => (
            <div
              key={i}
              className={`${tile} absolute size-24 rounded-full`}
              style={{ left: i * 44, top: i % 2 ? 46 : 0, background: c }}
            >
              <UsersThree {...ICON} size={34} />
            </div>
          ))}
        </div>
      );
    case "room":
      // A signal going out to everyone in the room.
      return (
        <div className="relative grid size-56 place-items-center">
          {[100, 72, 44].map((p, i) => (
            <span
              key={p}
              className="absolute rounded-full border-[3px] border-ink"
              style={{ width: `${p}%`, height: `${p}%`, background: i === 2 ? "var(--violet)" : i === 1 ? "var(--surface)" : "transparent" }}
            />
          ))}
          <Broadcast {...ICON} className="relative" />
        </div>
      );
  }
}

const KIND_ICON = { research: MagnifyingGlass, delegate: Scales, history: ChatsCircle, studio: Microphone, org: UsersThree, room: Broadcast };

export default function PageHero({
  kind,
  title,
  children,
  centered = false,
}: {
  kind: PageKind;
  title: string;
  children: React.ReactNode;
  centered?: boolean;
}) {
  const Icon = KIND_ICON[kind];
  return (
    <header
      style={{ "--tone": TONES[kind] } as React.CSSProperties}
      className="overflow-hidden border-b-[3px] border-ink bg-[color-mix(in_srgb,var(--tone)_22%,var(--background))]"
    >
      <div
        className={`mx-auto grid max-w-6xl items-center gap-8 px-4 py-12 sm:px-6 lg:py-16 ${
          centered ? "justify-items-center text-center" : "lg:grid-cols-[1.2fr_1fr]"
        }`}
      >
        <div className={centered ? "max-w-3xl" : ""}>
          <span
            aria-hidden="true"
            className="mb-5 grid size-14 place-items-center rounded-2xl border-[3px] border-ink shadow-[4px_4px_0_var(--ink)]"
            style={{ background: "var(--tone)", marginInline: centered ? "auto" : undefined }}
          >
            <Icon size={30} weight="fill" color="#0c2b4b" />
          </span>
          <h1 className="text-4xl font-extrabold leading-[1.02] md:text-6xl">{title}</h1>
          <div className={`mt-4 max-w-[54ch] text-lg leading-relaxed text-muted ${centered ? "mx-auto" : ""}`}>{children}</div>
        </div>
        <div className={`hidden lg:block ${centered ? "mt-2" : "justify-self-center"}`} aria-hidden="true">
          <Picture kind={kind} />
        </div>
      </div>
    </header>
  );
}
