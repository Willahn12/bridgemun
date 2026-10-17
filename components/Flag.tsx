"use client";

import { useState } from "react";
import { flagUrl } from "@/components/countries";

/* A country's flag, or its initials in a box when the name is not a UN member state or the image fails. */
export default function Flag({ country, className = "h-5 w-7" }: { country: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  const src = flagUrl(country);
  if (!src || failed) {
    const initials = country
      .split(/\s+/)
      .map((w) => w[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
    return (
      <span
        aria-hidden="true"
        className={`${className} inline-flex shrink-0 items-center justify-center rounded-[3px] bg-sunk font-mono text-[10px] font-bold text-muted`}
      >
        {initials}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- tiny remote flags; next/image would need remote config for no gain
    <img
      src={src}
      alt=""
      aria-hidden="true"
      onError={() => setFailed(true)}
      className={`${className} shrink-0 rounded-[3px] object-cover ring-1 ring-black/10`}
    />
  );
}
