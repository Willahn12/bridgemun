/* The motion system for practice sessions: motion types, the inputs each one needs, the order competing
   motions are voted on, and the limits that keep AI delegations from running the committee.
   Pure functions only, so the session view and the API route can both use them. */

export type MotionType = "close" | "unmod" | "mod" | "extend";

export interface Motion {
  id: string;
  type: MotionType;
  /** Delegation that moved it. */
  by: string;
  mover: "human" | "ai";
  /** Moderated caucus: the narrower topic to discuss. */
  topic?: string;
  /** Moderated caucus: total length. Unmoderated caucus: how long the committee leaves formal debate. */
  minutes?: number;
  /** Moderated caucus: seconds each speaker gets. */
  speakingTime?: number;
  /** Extend debate: how many more speeches the human delegate gets. */
  extra?: number;
  /** AI motions only: why the delegation suggests it, shown to the human. */
  reason?: string;
  /** AI motions stay a suggestion until the human delegate seconds them. */
  seconded: boolean;
  at: number;
}

/* Procedure state kept with the session. */
export interface Procedure {
  /** Human speeches allowed before debate closes on time (opening statement included). */
  limit: number;
  extensions: number;
  /** A moderated caucus in progress. `left` counts the human delegate's remaining speeches in it. */
  caucus?: { topic: string; speakingTime: number; left: number };
  /** Motion rounds held so far, and the last one an AI delegation suggested a motion in. */
  rounds: number;
  aiLastRound: number;
  aiSuggestions: number;
  /** The draft resolution introduced during debate, voted on after closing statements. */
  resolution?: Resolution;
}

export interface Resolution {
  title: string;
  sponsor: string;
  clauses: string[];
  /** Set once the committee has voted. */
  result?: { for: number; against: number; abstain: number; passed: boolean };
}

/* Why a draft resolution cannot be introduced as written, or null if it can. */
export function checkResolution(title: string, clauses: string[]): string | null {
  if (title.trim().length < 3 || title.length > 150) return "Give the draft resolution a title (3 to 150 characters).";
  if (clauses.length < 1) return "Write at least one operative clause.";
  if (clauses.length > 8) return "Keep it to 8 operative clauses or fewer.";
  if (clauses.some((c) => c.length < 5 || c.length > 400)) return "Each clause should be 5 to 400 characters.";
  return null;
}

/* One clause per line; numbering and trailing punctuation typed by the student are tidied away. */
export const splitClauses = (text: string) =>
  text
    .split("\n")
    .map((c) => c.replace(/^\s*\d+[.)]\s*/, "").replace(/[;,]\s*$/, "").trim())
    .filter(Boolean);

export const DEBATE_LIMIT = 8;
export const newProcedure = (): Procedure => ({ limit: DEBATE_LIMIT, extensions: 0, rounds: 0, aiLastRound: -99, aiSuggestions: 0 });

/* Lower rank is voted on first: the more a motion disrupts the committee, the earlier it is considered. */
export const MOTION_INFO: Record<MotionType, { label: string; rank: number; when: string; inputs: string }> = {
  close: {
    label: "Close debate",
    rank: 1,
    when: "The committee has heard enough and is ready for closing statements.",
    inputs: "No values. Human delegates only, after at least two speeches.",
  },
  unmod: {
    label: "Unmoderated caucus",
    rank: 2,
    when: "Delegations need informal time to lobby, form blocs and draft ideas together.",
    inputs: "Duration (1 to 10 minutes).",
  },
  mod: {
    label: "Moderated caucus",
    rank: 3,
    when: "Debate is too broad and should focus on one sub-topic with short speeches.",
    inputs: "Topic, total duration (2 to 10 minutes), speaking time (30 to 120 seconds).",
  },
  extend: {
    label: "Extend debate",
    rank: 4,
    when: "Debate time is nearly up but there are still important points to make.",
    inputs: "Additional speeches (1 to 4). Only when 3 or fewer speeches remain, at most twice.",
  },
};

/* AI delegations: at most one suggestion per motion round, never two rounds in a row, at most three a session. */
export const AI_MAX_SUGGESTIONS = 3;
export const AI_MOTION_TYPES: MotionType[] = ["unmod", "mod", "extend"];

export function describe(m: Motion): string {
  const label = MOTION_INFO[m.type].label;
  switch (m.type) {
    case "mod":
      return `${label} on "${m.topic}", ${m.minutes} minutes total, ${m.speakingTime} seconds per speaker`;
    case "unmod":
      return `${label} of ${m.minutes} minutes`;
    case "extend":
      return `${label} by ${m.extra} speech${m.extra === 1 ? "" : "es"}`;
    default:
      return label;
  }
}

/* Speeches a moderated caucus allows: its total time divided by the speaking time. */
export const caucusSpeeches = (m: Motion) => Math.max(1, Math.floor(((m.minutes ?? 0) * 60) / (m.speakingTime ?? 60)));

export interface Context {
  /** Human speeches counted against the debate limit so far. */
  spoken: number;
  procedure: Procedure;
  /** Motions already on the floor this round. */
  floor: Motion[];
}

const between = (v: number | undefined, lo: number, hi: number) => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;

/* Why a motion is out of order, or null if the chair can accept it. */
export function checkMotion(m: Motion, ctx: Context): string | null {
  if (ctx.floor.some((x) => x.by === m.by)) return "Each delegation may have only one motion on the floor at a time.";
  const remaining = ctx.procedure.limit - ctx.spoken;
  switch (m.type) {
    case "close":
      if (m.mover === "ai") return "Only human delegates may move to close debate.";
      if (ctx.spoken < 2) return "Speak at least twice before moving to close debate.";
      return null;
    case "unmod":
      return between(m.minutes, 1, 10) ? null : "An unmoderated caucus lasts 1 to 10 minutes.";
    case "mod":
      if (!m.topic?.trim() || m.topic.length > 120) return "Give the caucus a topic (up to 120 characters).";
      if (!between(m.minutes, 2, 10)) return "A moderated caucus lasts 2 to 10 minutes in total.";
      if (!between(m.speakingTime, 30, 120)) return "Speaking time is 30 to 120 seconds.";
      if (caucusSpeeches(m) < 2) return "The total time must allow at least two speeches.";
      if (ctx.procedure.caucus) return "A moderated caucus is already in progress.";
      return null;
    case "extend":
      if (!between(m.extra, 1, 4)) return "Extend debate by 1 to 4 speeches.";
      if (ctx.procedure.extensions >= 2) return "Debate has already been extended twice.";
      if (remaining > 3) return `Debate can only be extended when 3 or fewer speeches remain (${remaining} left).`;
      return null;
  }
}

/* Whether an AI delegation may suggest a motion in the round about to start. */
export function aiMayMove(p: Procedure): string | null {
  if (p.aiSuggestions >= AI_MAX_SUGGESTIONS) return "AI delegations have used all their motions this session.";
  if (p.aiLastRound === p.rounds - 1) return "AI delegations sit out the round after one they moved in.";
  return null;
}

/* The order motions are voted on:
   1. Most disruptive type first (close, unmoderated, moderated, extend).
   2. Same type: the longer caucus first, since it takes more of the committee's time.
   3. Still tied: a human delegate's motion before an AI delegation's.
   4. Still tied: whichever was submitted first. */
export function byPriority(a: Motion, b: Motion): number {
  return (
    MOTION_INFO[a.type].rank - MOTION_INFO[b.type].rank ||
    (b.minutes ?? 0) - (a.minutes ?? 0) ||
    (a.mover === b.mover ? 0 : a.mover === "human" ? -1 : 1) ||
    a.at - b.at
  );
}
