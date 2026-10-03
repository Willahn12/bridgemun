import { NextResponse } from "next/server";
import { complete, llmConfigured } from "@/lib/llm";

type Mode = "solo" | "committee" | "table";
type Directive = "reply" | "continue" | "opening" | "closing" | "vote" | "open" | "adjourn";
const DIRECTIVES: Directive[] = ["reply", "continue", "opening", "closing", "vote", "open", "adjourn"];

interface Body {
  mode: Mode;
  committee: string;
  topic: string;
  humanCountry: string;
  aiCountries: string[];
  lines: { speaker: string; kind: "human" | "ai" | "chair"; text: string }[];
  directive: Directive;
  judge: boolean;
  order: string[];
  only?: string;
}

const short = (v: unknown, n: number) => typeof v === "string" && v.trim().length > 0 && v.length <= n;

function parse(v: unknown): Body | null {
  if (!v || typeof v !== "object") return null;
  const b = v as Record<string, unknown>;
  const mode = b.mode;
  if (mode !== "solo" && mode !== "committee" && mode !== "table") return null;
  if (!short(b.committee, 200) || !short(b.topic, 200)) return null;
  if (!Array.isArray(b.aiCountries) || b.aiCountries.length < 1 || b.aiCountries.length > 5) return null;
  if (!b.aiCountries.every((c) => short(c, 100))) return null;
  if (!Array.isArray(b.lines) || b.lines.length > 200) return null;
  const lines = b.lines.filter(
    (l) => l && short(l.speaker, 100) && ["human", "ai", "chair"].includes(l.kind) && short(l.text, 4000),
  );
  return {
    mode,
    committee: b.committee as string,
    topic: b.topic as string,
    humanCountry: short(b.humanCountry, 100) ? (b.humanCountry as string).trim() : "another member state",
    aiCountries: b.aiCountries as string[],
    lines,
    directive: DIRECTIVES.includes(b.directive as Directive) ? (b.directive as Directive) : "reply",
    judge: b.judge === true,
    order: Array.isArray(b.order) ? b.order.filter((n): n is string => short(n, 100)).slice(0, 6) : [],
    only:
      short(b.only, 100) && (b.aiCountries as string[]).some((c) => c.toLowerCase() === (b.only as string).toLowerCase())
        ? (b.only as string)
        : undefined,
  };
}

function task(b: Body): string {
  const all = b.aiCountries.map((c) => `"${c}"`).join(", ");
  switch (b.directive) {
    case "open":
      return `You are the presiding judge. Open the session. Call it to order, name the committee and the topic, say the speaking order for opening statements was drawn by lot, and read the order out: ${b.order.join(", ")}. ${b.mode === "table" ? '("Room" is the group of people at the table.)' : ""} Say each delegate has about 90 seconds. 2 to 3 short sentences, at most 40 words. Return JSON only: {"chair":"<what you say>"}`;
    case "adjourn":
      return `You are the presiding judge. Close the session with brief remarks: thank the delegations, mention the topic and one theme that actually came up in the debate, and declare the session adjourned. 2 to 3 sentences, at most 50 words. Do not give scores and do not name a winner. Return JSON only: {"chair":"<what you say>"}`;
    case "opening":
      if (b.only) return `Write ONE opening statement, from the AI delegation "${b.only}" only. 60 to 90 words. It states its country's position on the topic and makes one concrete proposal. It may briefly acknowledge earlier speakers, but should not argue with them yet.`;
      return `Write ONE opening statement from EACH AI delegation (${all}), in that order. 60 to 90 words each. Each states its country's position on the topic and makes one concrete proposal. If the human delegate already spoke, a delegation may briefly acknowledge them, but otherwise do not reference other delegations.`;
    case "closing":
      if (b.only) return `Write ONE closing statement, from the AI delegation "${b.only}" only. 50 to 80 words. It summarises its position, credits the strongest point made by another delegation (by name), and says whether it will support or oppose a resolution on this topic.`;
      return `Write ONE closing statement from EACH AI delegation (${all}), in that order. 50 to 80 words each. Each summarises its position, credits the strongest point made by another delegation (by name), and says whether it will support or oppose a resolution on this topic.`;
    case "vote":
      return `The chair has put a motion to close debate to a vote. Each AI delegation (${all}) votes "for", "against" or "abstain", in line with its real country's interests and how the debate has gone. Delegations that still have important points to make may vote against. Give a reason of at most 15 words. Return JSON only: {"votes":[{"country":"<delegation>","vote":"for|against|abstain","reason":"<reason>"}]}`;
    case "continue":
      if (b.only) return `Write exactly 1 speech from the AI delegation "${b.only}" only, developing its position and responding to the latest points in the room.`;
      return b.mode === "committee"
        ? `Write 2 speeches from two DIFFERENT AI delegations. They debate each other and the earlier speakers. Where their real positions differ, they must disagree openly and name each other. Do not address the human delegate.`
        : `Write exactly 1 speech from the single AI delegation, developing its position further.`;
    default:
      if (b.only) return `Write exactly 1 speech from the AI delegation "${b.only}" only. It speaks because the judge has just called on it. It responds to the latest points made in the room and, where its real position differs, answers the delegates who spoke by name.`;
      return b.mode === "committee"
        ? `Write 2 speeches from two DIFFERENT AI delegations. Each responds to the human delegate's latest speech. Where the two delegations' real positions differ, the second speaker also answers the first by name. Pick the delegations with the most to say.`
        : b.mode === "table"
          ? `Write exactly 1 speech from the single AI delegation. It responds to the most recent points made in the room, and speaks only because it is its turn.`
          : `Write exactly 1 speech from the single AI delegation, replying directly to the human delegate's latest speech or question.`;
  }
}

function system(b: Body): string {
  const wantsChair = b.judge && (b.directive === "reply" || b.directive === "continue");
  const isJudgeOnly = b.directive === "open" || b.directive === "adjourn";
  const shape = isJudgeOnly || b.directive === "vote"
    ? ""
    : wantsChair
      ? `\nReturn JSON only, in exactly this shape:\n{"chair":"<judge's words>","speeches":[{"country":"<one of the AI delegations, spelled exactly as listed>","text":"<the speech>"}]}\n`
      : `\nReturn JSON only, in exactly this shape:\n{"speeches":[{"country":"<one of the AI delegations, spelled exactly as listed>","text":"<the speech>"}]}\n`;
  const judgeRules = wantsChair
    ? `
The judge line ("chair"), at most 40 words, is spoken before the speeches. Always start by recognizing the delegation(s) about to speak, for example "The chair recognizes the delegate of X." Then add a ruling ONLY when it is needed:
- a point of order if the human delegate was off topic or discourteous, or used inappropriate language;
- a time reminder if the human delegate's last speech was clearly longer than about 150 words;
- an answer if the human delegate asked a procedural question.
Be neutral, firm and courteous. Rule on the human delegate only; the AI delegations are already in line.
`
    : "";
  return `You run the AI delegates${b.judge ? " and the presiding judge" : ""} in a Model United Nations session, for students who are learning.
Committee: ${b.committee}
Agenda topic: ${b.topic}
AI delegations you play: ${b.aiCountries.map((c) => `"${c}"`).join(", ")}
Human delegate represents: ${b.humanCountry}

${task(b)}
${shape}${judgeRules}
Speech rules:
- Formal MUN language: "Honourable Chair", "The delegation of X believes...", "yields the floor". Spoken style, no bullet points, no headings, no stage directions.
- Each delegation defends its country's real, publicly known foreign policy. Never switch sides to be agreeable. Concede only what is genuinely reasonable, and say so diplomatically.
- If unsure of a fact, keep the claim general. Never invent statistics, quotes or resolution numbers.
- Never speak for the human delegate or for a delegation you do not play.
- Lines from "Judge" are procedural announcements, not speeches.
- Do not use em-dashes.`;
}

export async function POST(req: Request) {
  if (!llmConfigured()) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not set on the server." }, { status: 500 });
  }
  const body = parse(await req.json().catch(() => null));
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const transcript = body.lines.length
    ? body.lines
        .slice(-30)
        .map((l) => `${l.speaker}: ${l.text}`)
        .join("\n")
    : "(The session has just started. Nobody has spoken yet.)";
  const allowed = new Map(body.aiCountries.map((c) => [c.toLowerCase(), c]));

  try {
    const raw = await complete({
      system: system(body),
      maxTokens: 1400,
      json: true,
      messages: [{ role: "user", content: `Session so far:\n${transcript}\n\nProceed.` }],
    });
    const parsed = JSON.parse(raw) as {
      speeches?: { country?: string; text?: string }[];
      votes?: { country?: string; vote?: string; reason?: string }[];
      chair?: string;
    };
    const chair = typeof parsed.chair === "string" ? parsed.chair.trim().slice(0, 500) : "";

    if (body.directive === "open" || body.directive === "adjourn") {
      if (!chair) throw new Error("The judge returned nothing.");
      return NextResponse.json({ chair });
    }

    if (body.directive === "vote") {
      const votes = (parsed.votes ?? [])
        .map((v) => ({
          country: allowed.get((v.country ?? "").toLowerCase()),
          vote: ["for", "against", "abstain"].includes(v.vote ?? "") ? (v.vote as string) : "abstain",
          reason: (v.reason ?? "").trim(),
        }))
        .filter((v): v is { country: string; vote: string; reason: string } => Boolean(v.country));
      if (!votes.length) throw new Error("The model returned no votes.");
      return NextResponse.json({ votes });
    }

    const limit = body.only ? 1 : body.directive === "opening" || body.directive === "closing" ? 5 : 2;
    const speeches = (parsed.speeches ?? [])
      .map((s) => ({ country: allowed.get((s.country ?? "").toLowerCase()), text: (s.text ?? "").trim() }))
      .filter((s): s is { country: string; text: string } => Boolean(s.country && s.text))
      .slice(0, limit);
    if (!speeches.length) throw new Error("The model returned no usable speech.");
    return NextResponse.json({ speeches, ...(body.judge && chair ? { chair } : {}) });
  } catch (e) {
    const detail = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: "The delegates could not respond.", detail }, { status: 502 });
  }
}
