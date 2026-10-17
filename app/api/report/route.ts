import { NextResponse } from "next/server";
import { complete, llmConfigured } from "@/lib/llm";

interface Line {
  speaker: string;
  kind: "human" | "ai" | "chair";
  text: string;
}

const CRITERIA = ["Clarity", "Argument and evidence", "Country position", "Diplomatic language", "Engaging with others"];

const str = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
const list = (v: unknown, max: number, n: number) =>
  Array.isArray(v) ? v.map((x) => str(x, n)).filter(Boolean).slice(0, max) : [];

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
  const isTable = b.mode === "table";
  const humanSpeeches = lines.filter((l) => l.kind === "human" && l.text !== "Yields the floor.");

  // Nothing to judge: say so instead of asking the model, which would otherwise grade the AI delegations.
  if (!humanSpeeches.length) {
    return NextResponse.json({
      report: {
        summary: "No student spoke during this session, so there is nothing to score yet. Next time, give at least an opening statement and the coach can give you feedback.",
        scores: [],
        strengths: [],
        improvements: [],
        moments: [],
        nextSteps: ["Give an opening statement when the judge calls on you.", "Try at least two speeches so there is enough to assess."],
      },
    });
  }
  const who = isTable ? "the human speakers in the room, as a group (they may be labelled by country or as \"Room\"), not the AI delegation or the judge" : `the human delegate (${str(b.humanCountry, 100) || "You"})`;

  const system = `You write end-of-session feedback reports for students practising Model United Nations. The students are beginners, often around 12 to 15 years old.
Evaluate ONLY ${who}, not the AI delegations. Use the transcript below. Only lines marked [STUDENT] were said by a student; never grade [AI delegation] or [Judge] lines.

Be encouraging but honest. Do not inflate scores. Refer to specific things they actually said.
If the student spoke fewer than 2 times, say there was too little to assess fully and score cautiously.

Score each criterion as a whole number from 1 to 5: ${CRITERIA.join("; ")}.
Scale: 3 is a solid beginner performance, 4 is clearly strong, 5 is rare and needs standout evidence. Short sessions with only a couple of speeches should rarely score above 3 in "Argument and evidence" or "Engaging with others".
"moments" quotes MUST be copied word for word from the student's own lines. Give 1 to 3 moments.
Use plain, simple English. No em-dashes.

Return JSON only in exactly this shape:
{"summary":"<3 to 4 sentences>","scores":[{"criterion":"<name>","score":<1-5>,"comment":"<one sentence>"}],"strengths":["..."],"improvements":["..."],"moments":[{"quote":"<verbatim>","note":"<why it worked or how to improve it>"}],"nextSteps":["<concrete thing to practise next time>"]}
Give 2 to 4 strengths, 2 to 4 improvements, and 2 to 3 next steps.`;

  const context = `Committee: ${str(b.committee, 200)}\nTopic: ${str(b.topic, 200)}\nAI delegations: ${Array.isArray(b.aiCountries) ? (b.aiCountries as string[]).join(", ") : ""}\nStudent speeches: ${humanSpeeches.length}\n\nTranscript:\n${lines
    .slice(-120)
    // Every line says who spoke, so the model can never mistake an AI delegation for a student.
    .map((l) => `[${l.kind === "human" ? "STUDENT" : l.kind === "ai" ? "AI delegation" : "Judge"}] ${l.speaker}: ${l.text}`)
    .join("\n")}`;

  try {
    const raw = await complete({ system, maxTokens: 1600, json: true, messages: [{ role: "user", content: context }] });
    const p = JSON.parse(raw) as Record<string, unknown>;
    const scoresIn = Array.isArray(p.scores) ? (p.scores as Record<string, unknown>[]) : [];
    const scores = CRITERIA.map((name) => {
      const found = scoresIn.find((s) => str(s.criterion, 80).toLowerCase() === name.toLowerCase());
      const n = Math.round(Number(found?.score));
      return { criterion: name, score: Number.isFinite(n) ? Math.min(5, Math.max(1, n)) : 3, comment: str(found?.comment, 300) };
    });
    // Keep only quotes that really appear in the student's own lines.
    const studentText = humanSpeeches.map((l) => l.text).join("\n");
    const moments = (Array.isArray(p.moments) ? (p.moments as Record<string, unknown>[]) : [])
      .map((m) => ({ quote: str(m.quote, 400), note: str(m.note, 300) }))
      .filter((m) => m.quote && studentText.includes(m.quote))
      .slice(0, 3);

    return NextResponse.json({
      report: {
        summary: str(p.summary, 900),
        scores,
        strengths: list(p.strengths, 4, 300),
        improvements: list(p.improvements, 4, 300),
        moments,
        nextSteps: list(p.nextSteps, 3, 300),
      },
    });
  } catch (e) {
    const detail = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: "The report could not be created.", detail }, { status: 502 });
  }
}
