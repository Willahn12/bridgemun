import { NextResponse } from "next/server";
import { complete, llmConfigured } from "@/lib/llm";
import { curatedPosition, type Position, type Stance } from "@/lib/positions";

/* Position briefs for the AI delegations of a session: curated research where it covers the country and
   topic, and one AI call for the rest. Called once when a session or forum starts. */

const short = (v: unknown, n: number) => typeof v === "string" && v.trim().length > 0 && v.length <= n;
const STANCES: Stance[] = ["support", "neutral", "oppose", "mixed"];
const list = (v: unknown, n: number, len: number) =>
  Array.isArray(v) ? v.filter((x): x is string => short(x, len)).map((x) => x.trim()).slice(0, n) : [];

export async function POST(req: Request) {
  const b = (await req.json().catch(() => null)) as { committee?: unknown; topic?: unknown; countries?: unknown } | null;
  if (!b || !short(b.committee, 200) || !short(b.topic, 300) || !Array.isArray(b.countries)) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const countries = [...new Set(b.countries.filter((c): c is string => short(c, 100)).map((c) => c.trim()))].slice(0, 30);
  const topic = (b.topic as string).trim();
  const committee = (b.committee as string).trim();

  const found = new Map<string, Position>();
  for (const c of countries) {
    const p = curatedPosition(c, topic);
    if (p) found.set(c, p);
  }
  const missing = countries.filter((c) => !found.has(c));

  if (missing.length && llmConfigured()) {
    try {
      const raw = await complete({
        system: `You brief AI delegates in a Model United Nations practice app for students. For each country, give its real, publicly known position on the agenda topic, as of your knowledge. Be accurate and specific; if a country has no clear public position, say so and infer cautiously from its usual foreign policy, marking stance "mixed". Never invent statistics, quotes or resolution numbers. Plain English, no em-dashes.
Return JSON only: {"positions":[{"country":"<exactly as given>","stance":"support|neutral|oppose|mixed","attitude":"<2 to 5 words, e.g. Cautious bridge-builder>","summary":"<at most 35 words: what it wants and why>","points":["<argument it would make>", "...", "(2 or 3 items, at most 25 words each)"],"redLines":["<what it will not accept>", "(1 or 2 items)"],"allies":["<country or bloc>", "(1 to 4 items)"]}]}
"stance" is relative to the main proposal in the topic (for example a binding treaty, a ban, a new fund).`,
        maxTokens: 400 + missing.length * 220,
        json: true,
        messages: [{ role: "user", content: `Committee: ${committee}\nAgenda topic: ${topic}\nCountries: ${missing.join("; ")}` }],
      });
      const parsed = JSON.parse(raw) as { positions?: Record<string, unknown>[] };
      for (const p of parsed.positions ?? []) {
        const country = missing.find((c) => c.toLowerCase() === String(p.country ?? "").toLowerCase());
        if (!country || found.has(country) || !short(p.summary, 400)) continue;
        found.set(country, {
          country,
          stance: STANCES.includes(p.stance as Stance) ? (p.stance as Stance) : "mixed",
          attitude: short(p.attitude, 60) ? (p.attitude as string).trim() : "Unclear",
          summary: (p.summary as string).trim(),
          points: list(p.points, 3, 300),
          redLines: list(p.redLines, 2, 200),
          allies: list(p.allies, 4, 80),
          origin: "generated",
          sources: [],
        });
      }
    } catch {
      // Without briefs the delegates still work from their general knowledge; nothing to show the student.
    }
  }

  return NextResponse.json({ positions: countries.map((c) => found.get(c)).filter(Boolean) });
}
