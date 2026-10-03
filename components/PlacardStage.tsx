"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, CaretDown } from "@phosphor-icons/react";
import { COUNTRIES } from "@/components/countries";

const AI_POOL = ["Japan", "Brazil", "Kenya", "Philippines", "Germany", "Indonesia", "Canada", "Egypt", "Norway", "Chile"];

/* The two AI delegates who sit beside you: never the same country as yours. */
function neighbours(country: string): [string, string] {
  const free = AI_POOL.filter((c) => c.toLowerCase() !== country.trim().toLowerCase());
  const start = country.trim().length % free.length;
  return [free[start], free[(start + 3) % free.length]];
}

/* Long names shrink to fit the card. */
const nameSize = (name: string) => `${Math.min(5, Math.max(1.7, 42 / Math.max(name.length, 1)))}rem`;

export default function PlacardStage() {
  const [country, setCountry] = useState("Philippines");
  const name = country;
  const [left, right] = neighbours(name);
  const query = name ? `?country=${encodeURIComponent(name)}` : "";

  return (
    <div className="stage">
      <div className="mx-auto mb-6 max-w-[30rem]">
        <p className="font-display text-3xl font-extrabold tracking-tight">Try it out now</p>
        <p className="mt-1 text-muted">Pick a country and see your placard. Then research it or debate as it.</p>
      </div>
      <div className="relative mx-auto aspect-[5/4.5] w-full max-w-[30rem]">
        <Back name={left} className="placard-a" fill="var(--sun)" pos={{ "--rot": "-5deg", "--x": "-10px", "--y": "-6px" }} delay={120} />
        <Back name={right} className="placard-b" fill="var(--mint)" pos={{ "--rot": "4deg", "--x": "10px", "--y": "-2px" }} delay={240} />

        <div
          className="placard deal absolute inset-x-[6%] bottom-0 top-[19%] z-10 flex flex-col"
          style={{ "--delay": "0ms" } as React.CSSProperties}
        >
          <div key={country} className="flip flex flex-1 flex-col justify-center px-6 text-center">
            <p className="text-sm font-medium text-muted">Delegate of</p>
            <p
              className="mt-1 break-words font-display font-extrabold leading-[0.95] tracking-tight"
              style={{ fontSize: nameSize(name || "Your country") }}
            >
              {name || <span className="text-muted">Your country</span>}
            </p>
          </div>
          {/* The back of the folded card, seen from the other side of the table. */}
          <div className="relative h-[28%] border-t-[3px] border-ink bg-sunk px-6">
            <span aria-hidden="true" className="absolute inset-x-0 -top-px h-3 bg-gradient-to-b from-ink/15 to-transparent" />
            <p className="flex h-full items-center justify-center text-sm text-muted">BridgeMUN committee</p>
          </div>
        </div>
      </div>

      <div className="mx-auto mt-8 max-w-[30rem]">
        <label htmlFor="country" className="label">
          Your country
        </label>
        <div className="relative">
          <select
            id="country"
            className="field cursor-pointer appearance-none pr-10 font-medium"
            value={country}
            onChange={(e) => setCountry(e.target.value)}
          >
            {COUNTRIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <CaretDown aria-hidden="true" size={18} weight="bold" className="pointer-events-none absolute right-3.5 top-1/2 -translate-y-1/2 text-accent" />
        </div>
        <div className="mt-6 flex flex-wrap gap-3">
          <Link href={`/research${query}`} className="btn btn-primary">
            Research {name || "your country"}
            <ArrowRight aria-hidden="true" size={18} />
          </Link>
          <Link href={`/delegate${query}`} className="btn">
            Debate as {name || "your country"}
          </Link>
        </div>
      </div>
    </div>
  );
}

function Back({
  name,
  className,
  pos,
  delay,
  fill,
}: {
  name: string;
  className: string;
  fill: string;
  pos: Record<string, string>;
  delay: number;
}) {
  return (
    <div
      aria-hidden="true"
      className={`placard deal absolute inset-x-[6%] bottom-[10%] top-[2%] flex items-start justify-between px-5 pt-2.5 ${className}`}
      style={{ ...pos, "--delay": `${delay}ms`, background: fill } as React.CSSProperties}
    >
      <p className="font-display text-lg font-bold leading-none">{name}</p>
      <p className="text-xs font-semibold">AI delegate</p>
    </div>
  );
}
