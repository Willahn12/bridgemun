import { NextResponse } from "next/server";
import { complete, completeStream, llmConfigured } from "@/lib/llm";
import { AI_MOTION_TYPES, MOTION_INFO, type MotionType } from "@/lib/motions";
import { POINT_TYPES, type PointType } from "@/lib/points";

type Mode = "solo" | "committee" | "table";
type Directive = "reply" | "continue" | "opening" | "closing" | "vote" | "open" | "adjourn" | "suggest" | "point";
const DIRECTIVES: Directive[] = ["reply", "continue", "opening", "closing", "vote", "open", "adjourn", "suggest", "point"];

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
  /** vote: the motion being voted on, in words. */
  motion?: string;
  /** suggest: motion types the AI may suggest right now, and how many human speeches remain. */
  allowed?: MotionType[];
  remaining?: number;
  /** A moderated caucus in progress, or an unmoderated caucus (informal talk). */
  caucus?: { topic: string; speakingTime: number };
  informal?: boolean;
  /** The speaker's time in seconds; speeches are written to fit it. */
  seconds?: number;
  /** point: what the human delegate raised. Information points go to the delegation in `only`. */
  point?: { type: PointType; text: string };
  /** vote on a draft resolution: its title and operative clauses. */
  resolution?: { title: string; sponsor: string; clauses: string[] };
  /** One position brief per AI delegation (lib/positions.ts briefLine), so each stays in character. */
  positions: string[];
}

const short = (v: unknown, n: number) => typeof v === "string" && v.trim().length > 0 && v.length <= n;

function parse(v: unknown): Body | null {
  if (!v || typeof v !== "object") return null;
  const b = v as Record<string, unknown>;
  const mode = b.mode;
  if (mode !== "solo" && mode !== "committee" && mode !== "table") return null;
  if (!short(b.committee, 200) || !short(b.topic, 200)) return null;
  if (!Array.isArray(b.aiCountries) || b.aiCountries.length > 30) return null;
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
    order: Array.isArray(b.order) ? b.order.filter((n): n is string => short(n, 100)).slice(0, 31) : [],
    only:
      short(b.only, 100) && (b.aiCountries as string[]).some((c) => c.toLowerCase() === (b.only as string).toLowerCase())
        ? (b.only as string)
        : undefined,
    motion: short(b.motion, 300) ? (b.motion as string) : undefined,
    allowed: Array.isArray(b.allowed) ? AI_MOTION_TYPES.filter((t) => (b.allowed as unknown[]).includes(t)) : [],
    remaining: typeof b.remaining === "number" ? b.remaining : undefined,
    caucus:
      b.caucus && typeof b.caucus === "object" && short((b.caucus as Record<string, unknown>).topic, 120)
        ? {
            topic: (b.caucus as { topic: string }).topic,
            speakingTime: Math.min(120, Math.max(30, Number((b.caucus as { speakingTime?: unknown }).speakingTime) || 60)),
          }
        : undefined,
    informal: b.informal === true,
    seconds: typeof b.seconds === "number" && b.seconds >= 15 && b.seconds <= 300 ? Math.round(b.seconds) : undefined,
    point: parsePoint(b.point),
    positions: Array.isArray(b.positions) ? b.positions.filter((x): x is string => short(x, 1500)).slice(0, 30) : [],
    resolution: parseResolution(b.resolution),
  };
}

function parsePoint(v: unknown): Body["point"] {
  const p = v as { type?: unknown; text?: unknown } | null;
  if (!p || !POINT_TYPES.includes(p.type as PointType) || !short(p.text, 400)) return undefined;
  return { type: p.type as PointType, text: (p.text as string).trim() };
}

function parseResolution(v: unknown): Body["resolution"] {
  const r = v as { title?: unknown; sponsor?: unknown; clauses?: unknown } | null;
  if (!r || !short(r.title, 150) || !short(r.sponsor, 100) || !Array.isArray(r.clauses)) return undefined;
  const clauses = r.clauses.filter((c): c is string => short(c, 400)).slice(0, 8);
  return clauses.length ? { title: (r.title as string).trim(), sponsor: (r.sponsor as string).trim(), clauses } : undefined;
}

function task(b: Body): string {
  const all = b.aiCountries.map((c) => `"${c}"`).join(", ");
  switch (b.directive) {
    case "open":
      return `You are the presiding judge. Open the session. Call it to order, name the committee and the topic, say the speaking order for opening statements was drawn by lot, ${b.order.length > 8 ? `name the first three in the order (${b.order.slice(0, 3).join(", ")}) and say the full order is on screen.` : `and read the order out: ${b.order.join(", ")}.`} ${b.mode === "table" ? '("Room" is the group of people at the table.)' : ""} Say each delegate has ${b.seconds ? `${Math.floor(b.seconds / 60) ? `${Math.floor(b.seconds / 60)} minute${b.seconds >= 120 ? "s" : ""}${b.seconds % 60 ? ` and ${b.seconds % 60} seconds` : ""}` : `${b.seconds} seconds`}` : "about 90 seconds"} for their opening statement. 2 to 3 short sentences, at most 40 words. Return JSON only: {"chair":"<what you say>"}`;
    case "adjourn":
      return `You are the presiding judge. Close the session with brief remarks: thank the delegations, mention the topic and one theme that actually came up in the debate, and declare the session adjourned. 2 to 3 sentences, at most 50 words. Do not give scores and do not name a winner. Return JSON only: {"chair":"<what you say>"}`;
    case "opening":
      if (b.only) return `Write ONE opening statement, from the AI delegation "${b.only}" only. 60 to 90 words. It states its country's position on the topic and makes one concrete proposal. It may briefly acknowledge earlier speakers, but should not argue with them yet.`;
      return `Write ONE opening statement from EACH AI delegation (${all}), in that order. 60 to 90 words each. Each states its country's position on the topic and makes one concrete proposal. If the human delegate already spoke, a delegation may briefly acknowledge them, but otherwise do not reference other delegations.`;
    case "closing":
      if (b.only) return `Write ONE closing statement, from the AI delegation "${b.only}" only. 50 to 80 words. It summarises its position, credits the strongest point made by another delegation (by name), and says whether it will support or oppose a resolution on this topic.`;
      return `Write ONE closing statement from EACH AI delegation (${all}), in that order. 50 to 80 words each. Each summarises its position, credits the strongest point made by another delegation (by name), and says whether it will support or oppose a resolution on this topic.`;
    case "point": {
      const pt = b.point;
      if (pt?.type === "information" && b.only) {
        return `The human delegate (${b.humanCountry}) has raised a point of information to "${b.only}", asking: "${pt.text}". Write exactly 1 answer, from the AI delegation "${b.only}" only. 25 to 60 words. Answer the question directly and honestly from its country's real position, starting with a short address such as "The delegation of ${b.only} thanks the delegate for the question." Do not ask a question back.`;
      }
      if (pt?.type === "order") {
        return `You are the presiding judge. The human delegate (${b.humanCountry}) has raised a point of order: "${pt.text}". Using the session so far, rule on it. A point of order is about procedure: speaking time, staying on the topic, courtesy, or the order of speakers. It is not a way to disagree with what a delegate said; if it is really about content, rule it not well taken and kindly say that points of order concern procedure only and suggest a point of information or a speech instead. Start with "The point is well taken." or "The point is not well taken." and give a one-sentence reason, and if well taken, what happens now. At most 50 words. Return JSON only: {"chair":"<what you say>"}`;
      }
      return `You are the presiding judge. The human delegate (${b.humanCountry}) has raised a point of parliamentary inquiry: "${pt?.text ?? ""}". Answer the question about procedure clearly and accurately for THIS session: opening statements in the drawn order, then general debate, where delegates may raise motions (moderated caucus, unmoderated caucus, extend debate, close debate) and points (information, order, parliamentary inquiry); a draft resolution introduced during debate is voted on after closing statements, then the session adjourns. If the question is not about procedure, say so kindly. At most 50 words. Return JSON only: {"chair":"<what you say>"}`;
    }
    case "vote":
      if (b.resolution) {
        return `The committee is in voting procedure on the draft resolution "${b.resolution.title}", sponsored by ${b.resolution.sponsor}. Its operative clauses: ${b.resolution.clauses.map((c, i) => `${i + 1}. ${c}`).join(" ")} Each AI delegation (${all}) votes "for", "against" or "abstain" on the resolution as a whole, in line with its real country's interests and how the debate has gone. Return JSON only: {"votes":[{"country":"<delegation>","vote":"for|against|abstain","reason":"<reason of at most 15 words>"}]}`;
      }
      return `The chair has put a motion to a vote: ${b.motion ?? "close debate"}. Each AI delegation (${all}) votes "for", "against" or "abstain", in line with its real country's interests and how the debate has gone. Return JSON only: {"votes":[{"country":"<delegation>","vote":"for|against|abstain","reason":"<reason of at most 15 words>"}]}`;
    case "suggest": {
      const types = (b.allowed ?? []).map((t) => `"${t}" (${MOTION_INFO[t].label}: ${MOTION_INFO[t].when})`).join("; ");
      return `The chair has opened the floor to motions. Decide whether ONE AI delegation (${all}) should suggest a motion now. Suggest one only if it would genuinely help the debate; otherwise return {"motion":null}. Allowed types: ${types}. The human delegate has ${b.remaining ?? "several"} speeches left before debate closes on time; only suggest "extend" if that is 3 or fewer. Values: "mod" needs "topic" (a narrow sub-topic, at most 12 words), "minutes" (2 to 10) and "speakingTime" (30 to 120 seconds); "unmod" needs "minutes" (1 to 10); "extend" needs "extra" (1 to 4 speeches). Give a reason of at most 20 words, spoken to the human delegate. Return JSON only: {"motion":{"country":"<delegation>","type":"mod|unmod|extend","topic":"...","minutes":5,"speakingTime":60,"extra":2,"reason":"..."}} or {"motion":null}`;
    }
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
  // A delegation called from the speakers' list was already recognized by the app.
  const wantsChair = b.judge && !b.informal && (b.directive === "reply" || (b.directive === "continue" && !b.only));
  const isJudgeOnly = b.directive === "open" || b.directive === "adjourn" || (b.directive === "point" && b.point?.type !== "information");
  const shape = isJudgeOnly || b.directive === "vote" || b.directive === "suggest"
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
  const debating = b.directive === "reply" || b.directive === "continue";
  const caucusRules =
    debating && b.informal
      ? `\nThe committee is in an UNMODERATED CAUCUS: informal lobbying, not formal speeches. Each message is 1 to 3 conversational sentences, with no "Honourable Chair". Delegations look for allies, propose working together on a draft resolution, or push back informally.\n`
      : debating && b.caucus
        ? `\nA MODERATED CAUCUS is in progress on the sub-topic "${b.caucus.topic}". Every speech must stay on that sub-topic and fit the ${b.caucus.speakingTime}-second speaking time (at most ${Math.round(b.caucus.speakingTime * 2.3)} words).${wantsChair ? " The judge rules the human delegate out of order if they leave the sub-topic." : ""}\n`
        : "";
  return `You run the AI delegates${b.judge ? " and the presiding judge" : ""} in a Model United Nations session, for students who are learning.
Committee: ${b.committee}
Agenda topic: ${b.topic}
AI delegations you play: ${b.aiCountries.map((c) => `"${c}"`).join(", ")}
Human delegate represents: ${b.humanCountry}
${
    b.positions.length
      ? `\nPosition briefs. Each AI delegation must stay consistent with its own brief: it may adapt its tactics, answer new arguments and concede genuinely reasonable points, but it never contradicts its stance or crosses its red lines, and its votes follow the brief.\n${b.positions.map((p) => `- ${p}`).join("\n")}\n`
      : ""
  }
${task(b)}
${shape}${judgeRules}${caucusRules}
Speech rules:
- Formal MUN language: "Honourable Chair", "The delegation of X believes...", "yields the floor". Spoken style, no bullet points, no headings, no stage directions.
- Each delegation defends its country's real, publicly known foreign policy. Never switch sides to be agreeable. Concede only what is genuinely reasonable, and say so diplomatically.
- If unsure of a fact, keep the claim general. Never invent statistics, quotes or resolution numbers.
- Never speak for the human delegate or for a delegation you do not play.
- Lines from "Judge" are procedural announcements, not speeches.
- Do not use em-dashes.${
    b.seconds
      ? `\n- Each speech must fit in ${b.seconds} seconds when read aloud: at most ${Math.round(b.seconds * 2.4)} words. This limit overrides any word range above.`
      : ""
  }`;
}

/* Checks and trims the model's JSON into what the app expects. Throws if it is unusable. */
function finalize(body: Body, raw: string, allowed: Map<string, string>): Record<string, unknown> {
  const parsed = JSON.parse(raw) as {
    speeches?: { country?: string; text?: string }[];
    votes?: { country?: string; vote?: string; reason?: string }[];
    motion?: Record<string, unknown> | null;
    chair?: string;
  };
  const chair = typeof parsed.chair === "string" ? parsed.chair.trim().slice(0, 500) : "";

  if (body.directive === "point" && body.point?.type !== "information") {
    if (!chair) throw new Error("The judge returned nothing.");
    return { chair };
  }

  if (body.directive === "open" || body.directive === "adjourn") {
    if (!chair) throw new Error("The judge returned nothing.");
    // The model sometimes carries on the debate instead of closing it; never let that through.
    if (body.directive === "adjourn" && !/adjourn/i.test(chair)) {
      return { chair: "Thank you, delegates, for your contributions today. This session is now adjourned." };
    }
    return { chair };
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
    return { votes };
  }

  if (body.directive === "suggest") {
    const m = parsed.motion;
    const country = allowed.get(String(m?.country ?? "").toLowerCase());
    const type = m?.type as MotionType;
    if (!m || !country || !(body.allowed ?? []).includes(type)) return { motion: null };
    const int = (v: unknown) => (typeof v === "number" ? Math.round(v) : undefined);
    return {
      motion: {
        country,
        type,
        topic: typeof m.topic === "string" ? m.topic.trim().slice(0, 120) : undefined,
        minutes: int(m.minutes),
        speakingTime: int(m.speakingTime),
        extra: int(m.extra),
        reason: typeof m.reason === "string" ? m.reason.trim().slice(0, 200) : undefined,
      },
    };
  }

  const limit = body.only ? 1 : body.directive === "opening" || body.directive === "closing" ? 5 : 2;
  const speeches = (parsed.speeches ?? [])
    .map((s) => ({ country: allowed.get((s.country ?? "").toLowerCase()), text: (s.text ?? "").trim() }))
    .filter((s): s is { country: string; text: string } => Boolean(s.country && s.text))
    .slice(0, limit);
  if (!speeches.length) throw new Error("The model returned no usable speech.");
  // Only debate replies carry the judge's words; for opening and closing statements the app has already
  // recognized the speaker, and a second recognition from the model would repeat it.
  const wantsChair = body.judge && !body.informal && (body.directive === "reply" || (body.directive === "continue" && !body.only));
  return { speeches, ...(wantsChair && chair ? { chair } : {}) };
}

/* While the model is still writing: the speeches (and judge line) so far, for showing them as they appear.
   Tolerant of cut-off JSON; strings that are not finished yet are returned as far as they go. */
const STR = String.raw`"((?:[^"\\]|\\.)*)("|$)`;
function readPartial(raw: string): { chair?: string; speeches: { country: string; text: string }[] } {
  const unescape = (t: string) => {
    try {
      return JSON.parse(`"${t.replace(/\\$/, "")}"`) as string;
    } catch {
      return t;
    }
  };
  const chair = raw.match(new RegExp(String.raw`"chair"\s*:\s*` + STR));
  const speeches = [...raw.matchAll(new RegExp(String.raw`"country"\s*:\s*"([^"]*)"\s*,\s*"text"\s*:\s*` + STR, "g"))].map((m) => ({
    country: m[1],
    text: unescape(m[2]),
  }));
  return { ...(chair ? { chair: unescape(chair[1]) } : {}), speeches };
}

export async function POST(req: Request) {
  if (!llmConfigured()) {
    return NextResponse.json({ error: "OPENAI_API_KEY is not set on the server." }, { status: 500 });
  }
  const json = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const body = parse(json);
  if (!body) return NextResponse.json({ error: "Invalid request." }, { status: 400 });

  const transcript = body.lines.length
    ? body.lines
        .slice(-30)
        .map((l) => `${l.speaker}: ${l.text}`)
        .join("\n")
    : "(The session has just started. Nobody has spoken yet.)";
  const allowed = new Map(body.aiCountries.map((c) => [c.toLowerCase(), c]));
  const request = {
    system: system(body),
    maxTokens: 1400,
    json: true,
    messages: [
      {
        role: "user" as const,
        content: `Session so far:\n${transcript}\n\n${
          body.directive === "adjourn"
            ? "The session is over now. Do not call on any delegation. Give your closing remarks and adjourn."
            : "Proceed."
        }`,
      },
    ],
  };

  /* Streaming: one JSON object per line. {"type":"partial",...} while writing, then {"type":"final",...}
     with exactly what the non-streaming response would have been, or {"type":"error",...}. */
  if (json?.stream === true) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        const send = (obj: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
        let raw = "";
        let lastSent = 0;
        try {
          for await (const delta of completeStream(request)) {
            raw += delta;
            if (raw.length - lastSent > 24) {
              lastSent = raw.length;
              send({ type: "partial", ...readPartial(raw) });
            }
          }
          send({ type: "final", ...finalize(body, raw, allowed) });
        } catch (e) {
          send({ type: "error", error: "The delegates could not respond.", detail: e instanceof Error ? e.message : "Unknown error" });
        } finally {
          controller.close();
        }
      },
    });
    return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" } });
  }

  try {
    const raw = await complete(request);
    return NextResponse.json(finalize(body, raw, allowed));
  } catch (e) {
    const detail = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: "The delegates could not respond.", detail }, { status: 502 });
  }
}
