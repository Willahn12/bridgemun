import { NextResponse } from "next/server";
import { complete, llmConfigured } from "@/lib/llm";

interface Line {
  speaker: string;
  kind: "human" | "ai" | "chair";
  text: string;
}

const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const arr = (v: unknown, max: number) =>
  Array.isArray(v) ? (v as Record<string, unknown>[]).filter((x) => x && typeof x === "object").slice(0, max) : [];

export async function POST(req: Request) {
  if (!llmConfigured()) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not set on the server." }, { status: 500 });
  }
  const b = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!b || !Array.isArray(b.lines) || b.lines.length === 0 || b.lines.length > 300) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }
  const lines = (b.lines as Line[]).filter(
    (l) => l && typeof l.speaker === "string" && typeof l.text === "string" && ["human", "ai", "chair"].includes(l.kind),
  );
  const me = str(b.humanCountry, 100);
  const isTable = b.mode === "table";
  // In a room several people speak. Coach only the person asking, who is labelled by their country.
  const mine = lines.filter((l) => l.kind === "human" && (!isTable || !me || l.speaker === me));
  if (mine.length === 0) {
    return NextResponse.json({ error: "There is nothing you said in this session to coach." }, { status: 400 });
  }
  const report = b.report && typeof b.report === "object" ? (b.report as Record<string, unknown>) : null;
  const scores = arr(report?.scores, 8)
    .map((s) => `${str(s.criterion, 60)}: ${Number(s.score) || "?"}/5 (${str(s.comment, 200)})`)
    .join("\n");

  const system = `You are a friendly, honest Model United Nations coach for a student, usually 12 to 15 years old and new to MUN. Coach ONLY the student's own speeches, marked "STUDENT" below. Do not coach the AI delegations or the judge.

Give practical coaching that helps them get better next time, and teach them things they may not know yet (MUN terms, how to structure a speech, diplomatic phrasing, how to use evidence). Refer to what they actually said. Be warm and specific, never vague. Use plain, simple English. No em-dashes.

Rules:
- "rewrite.original" MUST be copied word for word from one of the student's speeches. Pick a speech that can be improved, and write a better version of about the same length that keeps their ideas and country position.
- "phrases": 2 to 4 pairs. "instead" is something they actually said or a very close paraphrase, "say" is a stronger diplomatic way to say it.
- "focusAreas": 2 to 3 things that would improve their MUN the most, most important first.
- "drills": 2 to 3 short exercises they can do alone or with a friend, each 3 to 10 minutes.
- "study": 2 to 3 topics or skills to learn about (for example "operative clauses", "points of information", or facts about the topic).
- If they said very little, say so kindly and coach on how to get started.

Return JSON only in exactly this shape:
{"overview":"<2 to 3 sentences on where they are now>","focusAreas":[{"title":"","why":"","howTo":""}],"phrases":[{"instead":"","say":""}],"rewrite":{"original":"","improved":"","why":""},"drills":[{"name":"","steps":"","minutes":5}],"study":[{"topic":"","why":""}],"encouragement":"<1 to 2 sentences>"}`;

  const context = `Committee: ${str(b.committee, 200)}\nTopic: ${str(b.topic, 200)}\nStudent's country: ${me || "not given"}\n\nScores from the session report:\n${scores || "none"}\n\nFull transcript for context:\n${lines
    .slice(-100)
    .map((l) => `${mine.includes(l) ? "STUDENT" : l.speaker}: ${l.text}`)
    .join("\n")}`;

  try {
    const raw = await complete({ system, maxTokens: 2200, json: true, messages: [{ role: "user", content: context }] });
    const p = JSON.parse(raw) as Record<string, unknown>;
    const studentText = mine.map((l) => l.text).join("\n");
    const rw = p.rewrite && typeof p.rewrite === "object" ? (p.rewrite as Record<string, unknown>) : null;
    const original = str(rw?.original, 1500);
    const coach = {
      overview: str(p.overview, 700),
      focusAreas: arr(p.focusAreas, 3)
        .map((x) => ({ title: str(x.title, 120), why: str(x.why, 400), howTo: str(x.howTo, 500) }))
        .filter((x) => x.title),
      phrases: arr(p.phrases, 4)
        .map((x) => ({ instead: str(x.instead, 300), say: str(x.say, 300) }))
        .filter((x) => x.instead && x.say),
      // Only keep the rewrite if its "before" really is something the student said.
      rewrite:
        rw && original && studentText.includes(original) && str(rw.improved, 1500)
          ? { original, improved: str(rw.improved, 1500), why: str(rw.why, 400) }
          : null,
      drills: arr(p.drills, 3)
        .map((x) => ({
          name: str(x.name, 120),
          steps: str(x.steps, 500),
          minutes: Math.min(15, Math.max(2, Math.round(Number(x.minutes)) || 5)),
        }))
        .filter((x) => x.name),
      study: arr(p.study, 3)
        .map((x) => ({ topic: str(x.topic, 120), why: str(x.why, 300) }))
        .filter((x) => x.topic),
      encouragement: str(p.encouragement, 300),
    };
    if (!coach.overview) throw new Error("Empty coaching");
    return NextResponse.json({ coach });
  } catch (e) {
    const detail = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: "Coaching could not be created.", detail }, { status: 502 });
  }
}
