/* Where each AI delegation stands on the topic, so its speeches and votes stay true to its real country.
   Positions come from a curated research dataset (data/positions/*.json) when one covers the topic and
   country, and otherwise from a short AI-written brief made once at the start of a session.
   Types and the dataset lookup only, so both the server and the session pages can import this. */

import plastic from "@/data/positions/plastic-pollution.json";

export type Stance = "support" | "neutral" | "oppose" | "mixed";

export interface Position {
  country: string;
  stance: Stance;
  attitude: string;
  summary: string;
  points: string[];
  redLines: string[];
  allies: string[];
  /** "dataset": checked research with sources. "generated": an AI summary, not verified. */
  origin: "dataset" | "generated";
  sources: { title: string; url: string }[];
}

interface DatasetCountry {
  aliases: string[];
  stance: string;
  attitude: string;
  summary: string;
  points: string[];
  redLines: string[];
  allies: string[];
  sources: { title: string; url: string }[];
}

interface Dataset {
  id: string;
  title: string;
  keywords: string[];
  countries: Record<string, DatasetCountry>;
}

const DATASETS: Dataset[] = [plastic as Dataset];

export const STANCE_LABEL: Record<Stance, string> = {
  support: "Supports",
  neutral: "Neutral",
  oppose: "Opposes",
  mixed: "Mixed",
};

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** The dataset whose keywords appear in the topic, if any. */
export function datasetFor(topic: string): Dataset | null {
  const t = ` ${norm(topic)} `;
  return DATASETS.find((d) => d.keywords.some((k) => t.includes(` ${norm(k)}`))) ?? null;
}

/** A curated position for this country on this topic, or null when the research does not cover it. */
export function curatedPosition(country: string, topic: string): Position | null {
  const d = datasetFor(topic);
  if (!d) return null;
  const want = norm(country);
  const entry = Object.entries(d.countries).find(([name, c]) => norm(name) === want || c.aliases.some((a) => norm(a) === want));
  if (!entry) return null;
  const [, c] = entry;
  return {
    country,
    stance: (["support", "neutral", "oppose", "mixed"].includes(c.stance) ? c.stance : "mixed") as Stance,
    attitude: c.attitude,
    summary: c.summary,
    points: c.points,
    redLines: c.redLines,
    allies: c.allies,
    origin: "dataset",
    sources: c.sources,
  };
}

/** The short form sent with each AI request: enough to keep a delegation in character. */
export function briefLine(p: Position): string {
  return `${p.country} (${STANCE_LABEL[p.stance].toLowerCase()}, ${p.attitude}): ${p.summary} Key points: ${p.points.join(" ")} Red lines: ${p.redLines.join("; ") || "none stated"}. Allies: ${p.allies.join(", ") || "none stated"}.`;
}
