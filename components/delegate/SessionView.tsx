"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowUp, Ear, Microphone, Play, SpeakerHigh, Stop } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import { currentUser, useAuth } from "@/lib/auth";
import { useDictation, useSpeaker } from "@/lib/voice";
import ReportView from "@/components/delegate/ReportView";
import MotionPanel, { type Ballot, type Draft } from "@/components/delegate/MotionPanel";
import PointPanel from "@/components/delegate/PointPanel";
import { ResolutionBallot, ResolutionDraft } from "@/components/delegate/ResolutionPanel";
import { pointLine, type PointType } from "@/lib/points";
import {
  AI_MOTION_TYPES,
  afterSpeaking,
  aiMayMove,
  byPriority,
  caucusSpeeches,
  checkMotion,
  describe,
  newProcedure,
  type Motion,
  type Procedure,
} from "@/lib/motions";
import { usePinHeader } from "@/components/SiteHeader";
import {
  HUMAN,
  MODE_LABEL,
  PHASE_LABEL,
  stashSession,
  flushSaves,
  saveSession,
  uid,
  type Line,
  type Phase,
  type Report,
  type Session,
} from "@/lib/sessions";

interface Speech {
  country: string;
  text: string;
}
type Directive = "reply" | "continue" | "opening" | "closing" | "vote" | "open" | "adjourn" | "suggest" | "point";
type Round = "opening" | "closing";

const JUDGE_VOICE = 5;
/* Firestore rejects undefined fields, so the caucus key is removed rather than cleared. */
function withoutCaucus(p: Procedure): Procedure {
  const next = { ...p };
  delete next.caucus;
  return next;
}
/* "a moderated caucus on ...", "an unmoderated caucus of ...", for the judge's lines. */
function aMotion(m: Motion): string {
  const d = describe(m);
  return `${/^[AEIOU]/.test(d) ? "an" : "a"} ${d.charAt(0).toLowerCase()}${d.slice(1)}`;
}
const reduceMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function SessionView({
  initial,
  save,
  onExit,
}: {
  initial: Session;
  save: boolean;
  onExit: () => void;
}) {
  const router = useRouter();
  const { user: authUser } = useAuth();
  const { mode, aiCountries } = initial;
  const judge = initial.judge ?? mode !== "table";
  const structured = mode !== "table";
  const humanName = initial.humanCountry || (mode === "table" ? "Room" : "You");
  const order = useMemo(() => initial.order ?? [HUMAN, ...initial.aiCountries], [initial]);
  const nameOf = useCallback((n: string) => (n === HUMAN ? humanName : n), [humanName]);

  const [lines, setLines] = useState<Line[]>(initial.lines);
  const linesRef = useRef<Line[]>(initial.lines);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoSpeak, setAutoSpeak] = useState(true);
  const [speaking, setSpeaking] = useState<string | null>(null);
  const [wantListening, setWantListening] = useState(false);
  const [phase, setPhase] = useState<Phase>(initial.phase ?? "debate");
  const [report, setReport] = useState<Report | undefined>(initial.report);
  const [reporting, setReporting] = useState(false);
  const [endedAt, setEndedAt] = useState<number | undefined>(initial.endedAt);
  const [cursor, setCursor] = useState(initial.cursor ?? 0);
  const cursorRef = useRef(initial.cursor ?? 0);
  // A saved session reopened in the middle of a round needs a manual nudge to carry on.
  const [resumable, setResumable] = useState(
    judge && structured && (initial.phase === "opening" || initial.phase === "closing") && initial.lines.length > 0,
  );

  // The motion system: debate limit and caucus state, the motions on the floor, and the human's ballot.
  const [procedure, setProcedureState] = useState<Procedure>(initial.procedure ?? newProcedure());
  const procRef = useRef(procedure);
  const setProcedure = useCallback((p: Procedure) => {
    procRef.current = p;
    setProcedureState(p);
  }, []);
  const [floorOpen, setFloorOpen] = useState(false);
  const [floor, setFloor] = useState<Motion[]>([]);
  const floorRef = useRef<Motion[]>([]);
  const setFloorTo = (f: Motion[]) => {
    floorRef.current = f;
    setFloor(f);
  };
  const [voting, setVoting] = useState(false);
  const [ballot, setBallot] = useState<Motion | null>(null);
  const ballotRef = useRef<((b: Ballot) => void) | null>(null);
  const [aiNote, setAiNote] = useState<string | null>(null);
  const [pointOpen, setPointOpen] = useState(false);
  const [draftOpen, setDraftOpen] = useState(false);
  const [resBallot, setResBallot] = useState(false);
  const resBallotRef = useRef<((b: Ballot) => void) | null>(null);
  const [unmodEnds, setUnmodEnds] = useState<number | null>(null);
  const unmodRef = useRef<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const epochRef = useRef(0); // bumped whenever the flow is cancelled
  const seqRef = useRef(0); // identifies the current delivery of speeches
  const mutedRef = useRef(false);
  const announcedRef = useRef("");
  const mentionRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const speaker = useSpeaker();

  const voiceOf = (country: string) => Math.max(0, aiCountries.indexOf(country));

  const push = useCallback((line: Line) => {
    linesRef.current = [...linesRef.current, line];
    setLines(linesRef.current);
  }, []);

  useEffect(() => {
    if (save) saveSession({ ...initial, lines, phase, report, endedAt, cursor, procedure });
  }, [save, initial, lines, phase, report, endedAt, cursor, procedure]);

  useEffect(() => {
    if (phase === "ended") window.scrollTo({ top: 0, behavior: reduceMotion() ? "auto" : "smooth" });
    else if (stickRef.current) {
      const el = chatRef.current;
      el?.scrollTo({ top: el.scrollHeight, behavior: reduceMotion() ? "auto" : "smooth" });
    }
  }, [lines, thinking, phase]);

  /* A brand new report opens on its own page, saved in the account, with the transcript and coaching beneath it. */
  useEffect(() => {
    if (!report || initial.report) return;
    if (save && currentUser()) {
      flushSaves().finally(() => router.push(`/report/${initial.id}`));
    } else {
      // Not saved: keep it for this tab so the report page and coach still work.
      stashSession({ ...initial, lines: linesRef.current, phase: "ended", report, endedAt: endedAt ?? Date.now() });
      router.push(`/report/${initial.id}`);
    }
  }, [report, initial, save, router, endedAt]);

  const setCursorTo = useCallback((n: number) => {
    cursorRef.current = n;
    setCursor(n);
  }, []);

  /* ---------- The judge ---------- */
  const chair = useCallback(
    (text: string) => push({ id: uid(), speaker: "Judge", kind: "chair", text }),
    [push],
  );

  /* Shows a judge line and speaks it in the judge's own voice. */
  const say = useCallback(
    async (text: string) => {
      chair(text);
      if (!autoSpeak || mutedRef.current) return;
      setSpeaking("Judge");
      await speaker.speak(text, JUDGE_VOICE);
      setSpeaking(null);
    },
    [chair, autoSpeak, speaker],
  );

  /* Returns true only if every speech was delivered without being cancelled. */
  const deliver = useCallback(
    async (speeches: Speech[]): Promise<boolean> => {
      const id = ++seqRef.current;
      mutedRef.current = false;
      for (const s of speeches) {
        if (seqRef.current !== id) return false;
        push({ id: uid(), speaker: s.country, kind: "ai", text: s.text });
        if (!autoSpeak || mutedRef.current) continue;
        setSpeaking(s.country);
        await speaker.speak(s.text, Math.max(0, aiCountries.indexOf(s.country)));
      }
      if (seqRef.current !== id) return false;
      setSpeaking(null);
      return true;
    },
    [push, autoSpeak, speaker, aiCountries],
  );

  const call = useCallback(
    async (directive: Directive, only?: string, extra?: Record<string, unknown>) => {
      const caucus = procRef.current.caucus;
      const res = await fetch("/api/delegate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          committee: initial.committee,
          topic: initial.topic,
          humanCountry: initial.humanCountry,
          aiCountries,
          lines: linesRef.current,
          directive,
          judge,
          order: order.map(nameOf),
          only,
          caucus: caucus ? { topic: caucus.topic, speakingTime: caucus.speakingTime } : undefined,
          informal: unmodRef.current !== null,
          ...extra,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Request failed");
      return body;
    },
    [mode, initial, aiCountries, judge, order, nameOf],
  );

  /* One AI step: optional judge line first, then any speeches. Returns false if it failed or was cancelled. */
  const aiTurn = useCallback(
    async (directive: Directive, only?: string, extra?: Record<string, unknown>): Promise<boolean> => {
      setThinking(true);
      setError(null);
      const epoch = epochRef.current;
      try {
        const body = await call(directive, only, extra);
        if (epochRef.current !== epoch) return false;
        setThinking(false);
        if (body.chair) {
          await say(body.chair);
          if (epochRef.current !== epoch) return false;
        }
        if (body.speeches?.length) return await deliver(body.speeches);
        return true;
      } catch (e) {
        setError(e instanceof Error ? e.message : "Something went wrong");
        return false;
      } finally {
        setThinking(false);
      }
    },
    [call, deliver, say],
  );

  const makeReport = useCallback(async () => {
    setReporting(true);
    setError(null);
    try {
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode,
          committee: initial.committee,
          topic: initial.topic,
          humanCountry: initial.humanCountry,
          aiCountries,
          lines: linesRef.current,
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Request failed");
      setReport(body.report);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The report could not be created");
    } finally {
      setReporting(false);
    }
  }, [mode, initial, aiCountries]);

  const finish = useCallback(async () => {
    epochRef.current++;
    seqRef.current++;
    speaker.stop();
    setSpeaking(null);
    setThinking(false);
    ballotRef.current = null;
    setBallot(null);
    resBallotRef.current = null;
    setResBallot(false);
    setFloorOpen(false);
    unmodRef.current = null;
    setUnmodEnds(null);
    setPhase("ended");
    setEndedAt(Date.now());
    chair("The session is adjourned. Your report is being prepared.");
    await makeReport();
  }, [speaker, chair, makeReport]);

  /* The judge's closing remarks (when there is a judge), then the report. */
  const adjourn = useCallback(async () => {
    if (judge) await aiTurn("adjourn");
    await finish();
  }, [judge, aiTurn, finish]);

  const enterDebate = useCallback(async () => {
    setPhase("debate");
    setCursorTo(0);
    if (mode === "committee") setProcedure({ ...procRef.current, speakers: order.filter((n) => n !== HUMAN) });
    await say(`Opening statements are complete. The floor is now open for general debate on "${initial.topic}".`);
  }, [say, setCursorTo, initial.topic, mode, order, setProcedure]);

  /* After closing statements: the committee votes on the draft resolution, if one was introduced. */
  const votingProcedure = useCallback(async () => {
    const res = procRef.current.resolution;
    if (!res || res.result) return;
    const epoch = epochRef.current;
    await say(`Closing statements are complete. The committee now moves into voting procedure on the draft resolution "${res.title}", sponsored by ${res.sponsor}.`);
    if (epochRef.current !== epoch) return;
    const mine = await new Promise<Ballot>((resolve) => {
      resBallotRef.current = resolve;
      setResBallot(true);
    });
    if (epochRef.current !== epoch) return;
    setThinking(true);
    try {
      const body = await call("vote", undefined, { resolution: { title: res.title, sponsor: res.sponsor, clauses: res.clauses } });
      if (epochRef.current !== epoch) return;
      setThinking(false);
      const votes = body.votes as { country: string; vote: string; reason: string }[];
      const count = (v: string) => votes.filter((x) => x.vote === v).length + (mine === v ? 1 : 0);
      const tally = { for: count("for"), against: count("against"), abstain: count("abstain") };
      const passed = tally.for > tally.against;
      const detail = votes.map((v) => `${v.country}: ${v.vote}${v.reason ? ` (${v.reason})` : ""}`).join(". ");
      chair(`Vote on the draft resolution. ${humanName}: ${mine}. ${detail}.`);
      setProcedure({ ...procRef.current, resolution: { ...res, result: { ...tally, passed } } });
      await say(
        `With ${tally.for} in favour, ${tally.against} against and ${tally.abstain} abstaining, the draft resolution ${passed ? "passes and is adopted by the committee" : "fails"}.`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "The vote could not be held");
      chair("The vote on the draft resolution could not be held.");
    } finally {
      setThinking(false);
    }
  }, [say, call, chair, humanName, setProcedure]);

  function castResBallot(b: Ballot) {
    const resolve = resBallotRef.current;
    resBallotRef.current = null;
    setResBallot(false);
    resolve?.(b);
  }

  /* Runs the drawn speaking order for opening or closing statements. Stops at the human's turn. */
  const runRound = useCallback(
    async (stage: Round) => {
      const epoch = epochRef.current;
      setResumable(false);
      while (cursorRef.current < order.length) {
        const who = order[cursorRef.current];
        if (who === HUMAN) {
          const key = `${stage}-${cursorRef.current}`;
          if (announcedRef.current !== key) {
            announcedRef.current = key;
            chair(`${humanName}, you have the floor for your ${stage} statement.`);
          }
          return;
        }
        await say(`The chair recognizes the delegate of ${who}.`);
        if (epochRef.current !== epoch) return;
        const ok = await aiTurn(stage, who);
        if (!ok || epochRef.current !== epoch) return;
        setCursorTo(cursorRef.current + 1);
      }
      if (stage === "opening") await enterDebate();
      else {
        await votingProcedure();
        if (epochRef.current !== epoch) return;
        await adjourn();
      }
    },
    [order, humanName, chair, say, aiTurn, setCursorTo, enterDebate, adjourn, votingProcedure],
  );

  /* The judge opens the session and draws who goes first. */
  async function startSession() {
    const ok = await aiTurn("open");
    if (!ok) return;
    if (mode === "table") {
      // The table runs its own debate; if the AI drew first place it gives its opening statement now.
      if (order[0] !== HUMAN) await aiTurn("opening", order[0]);
      return;
    }
    await runRound("opening");
  }

  async function beginClosing(announcement: string) {
    await say(announcement);
    setPhase("closing");
    setCursorTo(0);
    await runRound("closing");
  }

  /* Cancel whatever the AI is doing: remaining speeches are dropped. */
  function silence() {
    epochRef.current++;
    seqRef.current++;
    speaker.stop();
    setSpeaking(null);
  }

  /* Stop the voice only. The remaining speeches still appear as text. */
  function mute() {
    mutedRef.current = true;
    speaker.stop();
    setSpeaking(null);
  }

  async function moveToClose() {
    silence();
    setError(null);
    await say("A motion to close debate has been raised. The committee will now vote.");
    setThinking(true);
    const epoch = epochRef.current;
    try {
      const body = await call("vote");
      if (epochRef.current !== epoch) return;
      setThinking(false);
      const votes = body.votes as { country: string; vote: string; reason: string }[];
      const forCount = votes.filter((v) => v.vote === "for").length + 1; // the mover votes for
      const against = votes.filter((v) => v.vote === "against").length;
      const detail = votes.map((v) => `${v.country}: ${v.vote}${v.reason ? ` (${v.reason})` : ""}`).join(". ");
      chair(`Vote on closing debate. ${humanName}: for. ${detail}. Result: ${forCount} for, ${against} against.`);
      if (forCount > against) {
        await beginClosing("The motion passes. Debate is closed. Closing statements will be heard in the same order as the opening.");
      } else {
        await say("The motion fails. Debate continues.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "The vote could not be held");
    } finally {
      setThinking(false);
    }
  }

  /* ---------- Motions (caucuses and extending debate) ---------- */
  const spokenCount = (ls: Line[]) => ls.filter((l) => l.kind === "human" && !l.informal && !l.point && !l.resolution).length;
  const ctx = () => ({ spoken: spokenCount(linesRef.current), procedure: procRef.current, floor: floorRef.current });

  /* The chair opens the floor. One AI delegation may suggest a motion, if the AI rules allow it this round. */
  async function openFloor() {
    silence();
    setError(null);
    const round = procRef.current.rounds + 1;
    setProcedure({ ...procRef.current, rounds: round });
    setFloorTo([]);
    setFloorOpen(true);
    await say("The floor is now open to motions.");
    const blocked = aiMayMove({ ...procRef.current, rounds: round });
    setAiNote(blocked ? `No AI motion this round: ${blocked}` : null);
    if (blocked) return;
    const remaining = procRef.current.limit - spokenCount(linesRef.current);
    const allowed = AI_MOTION_TYPES.filter((t) => t !== "extend" || remaining <= 3);
    setThinking(true);
    const epoch = epochRef.current;
    try {
      const body = await call("suggest", undefined, { allowed, remaining });
      if (epochRef.current !== epoch || !body.motion) return;
      const m: Motion = {
        id: uid(),
        type: body.motion.type,
        by: body.motion.country,
        mover: "ai",
        seconded: false,
        at: Date.now(),
        ...(body.motion.type === "mod" ? { topic: body.motion.topic, minutes: body.motion.minutes, speakingTime: body.motion.speakingTime } : {}),
        ...(body.motion.type === "unmod" ? { minutes: body.motion.minutes } : {}),
        ...(body.motion.type === "extend" ? { extra: body.motion.extra } : {}),
        ...(body.motion.reason ? { reason: body.motion.reason } : {}),
      };
      if (checkMotion(m, ctx())) return; // out of order: the chair does not entertain it
      setFloorTo([...floorRef.current, m]);
      setProcedure({ ...procRef.current, aiLastRound: round, aiSuggestions: procRef.current.aiSuggestions + 1 });
      chair(`The delegate of ${m.by} suggests a motion for ${aMotion(m)}. It needs a second from a human delegate.`);
    } catch {
      // no suggestion this round
    } finally {
      setThinking(false);
    }
  }

  function submitMotion(d: Draft): string | null {
    const m: Motion = { ...d, id: uid(), by: humanName, mover: "human", seconded: true, at: Date.now() };
    const err = checkMotion(m, ctx());
    if (err) return err;
    setFloorTo([...floorRef.current, m]);
    chair(`${humanName} moves for ${aMotion(m)}.`);
    return null;
  }

  function secondMotion(id: string) {
    const m = floorRef.current.find((x) => x.id === id);
    if (!m) return;
    setFloorTo(floorRef.current.map((x) => (x.id === id ? { ...x, seconded: true } : x)));
    chair(`${humanName} seconds the motion from ${m.by}.`);
  }

  function dropMotion(id: string, why: string) {
    setFloorTo(floorRef.current.filter((x) => x.id !== id));
    chair(why);
  }

  async function closeFloor(text: string) {
    setFloorOpen(false);
    setFloorTo([]);
    setAiNote(null);
    await say(text);
  }

  /* The human delegate's vote, given with the buttons in the motions panel. */
  const askBallot = (m: Motion) =>
    new Promise<Ballot>((resolve) => {
      ballotRef.current = resolve;
      setBallot(m);
    });

  function castBallot(b: Ballot) {
    const resolve = ballotRef.current;
    ballotRef.current = null;
    setBallot(null);
    resolve?.(b);
  }

  /* Votes on each motion in priority order. The first one that passes is carried out; the rest fall. */
  async function voteOnMotions() {
    const epoch = epochRef.current;
    setVoting(true);
    setError(null);
    try {
      for (const m of floorRef.current.filter((x) => !x.seconded)) {
        chair(`The motion from ${m.by} was not seconded and falls.`);
      }
      const ordered = floorRef.current.filter((x) => x.seconded).sort(byPriority);
      setFloorTo(ordered);
      if (!ordered.length) return await closeFloor("There are no motions on the floor. Debate continues.");
      if (ordered.length > 1) {
        await say(`The chair will take the motions from most to least disruptive: ${ordered.map((m, i) => `${i + 1}, ${describe(m)}`).join("; ")}.`);
      }
      for (const m of ordered) {
        if (epochRef.current !== epoch) return;
        await say(`The committee will now vote on the motion from ${m.by}: ${describe(m)}.`);
        const mine = m.mover === "human" ? "for" : await askBallot(m);
        if (epochRef.current !== epoch) return;
        setThinking(true);
        const body = await call("vote", undefined, { motion: `${describe(m)} (moved by ${m.by})` });
        setThinking(false);
        if (epochRef.current !== epoch) return;
        const votes = body.votes as { country: string; vote: string; reason: string }[];
        const forCount = votes.filter((v) => v.vote === "for").length + (mine === "for" ? 1 : 0);
        const against = votes.filter((v) => v.vote === "against").length + (mine === "against" ? 1 : 0);
        const detail = votes.map((v) => `${v.country}: ${v.vote}${v.reason ? ` (${v.reason})` : ""}`).join(". ");
        chair(`Vote on ${describe(m)}. ${humanName}: ${mine}. ${detail}. Result: ${forCount} for, ${against} against.`);
        if (forCount > against) {
          setFloorOpen(false);
          setFloorTo([]);
          setAiNote(null);
          await enact(m, ordered.length > 1);
          return;
        }
        await say("The motion fails.");
      }
      await closeFloor("No motion has passed. Debate continues.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The vote could not be held");
    } finally {
      setThinking(false);
      setVoting(false);
    }
  }

  async function enact(m: Motion, others: boolean) {
    const rest = others ? " The remaining motions fall." : "";
    const p = procRef.current;
    switch (m.type) {
      case "close": {
        setProcedure(withoutCaucus(p));
        await beginClosing(`The motion passes. Debate is closed.${rest} Closing statements will be heard in the same order as the opening.`);
        return;
      }
      case "extend":
        setProcedure({ ...p, limit: p.limit + (m.extra ?? 0), extensions: p.extensions + 1 });
        await say(`The motion passes. Debate is extended by ${m.extra} speech${m.extra === 1 ? "" : "es"}.${rest}`);
        return;
      case "mod":
        setProcedure({ ...p, caucus: { topic: m.topic ?? "", speakingTime: m.speakingTime ?? 60, left: caucusSpeeches(m) } });
        await say(`The motion passes.${rest} The committee enters a moderated caucus on "${m.topic}". Each speaker has ${m.speakingTime} seconds. The floor is open.`);
        return;
      case "unmod": {
        const ends = Date.now() + (m.minutes ?? 1) * 60_000;
        unmodRef.current = ends;
        setUnmodEnds(ends);
        setNow(Date.now());
        await say(`The motion passes.${rest} Formal debate is suspended for a ${m.minutes} minute unmoderated caucus. Delegates may speak informally.`);
        return;
      }
    }
  }

  const endUnmod = useCallback(async () => {
    if (unmodRef.current === null) return;
    unmodRef.current = null;
    setUnmodEnds(null);
    await say("The unmoderated caucus has ended. The committee returns to formal debate.");
  }, [say]);

  useEffect(() => {
    if (unmodEnds === null) return;
    const t = setInterval(() => {
      setNow(Date.now());
      if (Date.now() >= unmodEnds) endUnmod();
    }, 1000);
    return () => clearInterval(t);
  }, [unmodEnds, endUnmod]);

  function skipClosing() {
    setCursorTo(cursorRef.current + 1);
    runRound("closing");
  }

  const humanSpeeches = lines.filter((l) => l.kind === "human" && !l.informal && !l.point && !l.resolution).length;

  /* ---------- Draft resolution (voted on after closing statements) ---------- */
  async function introduceResolution(title: string, clauses: string[]) {
    silence();
    setError(null);
    setDraftOpen(false);
    stickRef.current = true;
    push({
      id: uid(),
      speaker: humanName,
      kind: "human",
      text: `Introduces the draft resolution "${title}": ${clauses.map((c, i) => `${i + 1}. ${c}`).join(" ")}`,
      resolution: true,
    });
    setProcedure({ ...procRef.current, resolution: { title, sponsor: humanName, clauses } });
    await say(`The chair thanks the delegate of ${humanName}. The draft resolution "${title}" is introduced and will be put to a vote after closing statements.`);
    await aiTurn("reply");
  }

  /* ---------- Speakers' list (committee mode, general debate) ---------- */
  const speakers = procedure.speakers ?? order.filter((n) => n !== HUMAN);
  const nextUp = speakers[0];
  const showList = mode === "committee" && judge && phase === "debate" && unmodEnds === null && !procedure.caucus;

  async function nextSpeaker() {
    const who = (procRef.current.speakers ?? speakers)[0];
    if (!who || who === HUMAN) return;
    silence();
    setError(null);
    stickRef.current = true;
    const epoch = epochRef.current;
    await say(`The chair recognizes the delegate of ${who} from the speakers' list.`);
    if (epochRef.current !== epoch) return;
    const ok = await aiTurn("continue", who);
    if (ok) setProcedure({ ...procRef.current, speakers: afterSpeaking(procRef.current.speakers ?? speakers, who) });
  }

  function toggleMe() {
    const list = procRef.current.speakers ?? speakers;
    setProcedure({ ...procRef.current, speakers: list.includes(HUMAN) ? list.filter((n) => n !== HUMAN) : [...list, HUMAN] });
  }

  /* ---------- Points (not speeches, so they do not count against debate time) ---------- */
  async function raisePoint(type: PointType, text: string, to?: string) {
    silence();
    setError(null);
    setPointOpen(false);
    stickRef.current = true;
    push({ id: uid(), speaker: humanName, kind: "human", text: pointLine(type, text, to), point: type });
    const point = { type, text };
    if (type === "information" && to) {
      await say(`The delegate of ${to} may respond to the point of information.`);
      await aiTurn("point", to, { point });
      return;
    }
    setThinking(true);
    const epoch = epochRef.current;
    try {
      const body = await call("point", undefined, { point });
      if (epochRef.current !== epoch) return;
      setThinking(false);
      if (body.chair) await say(body.chair);
    } catch (e) {
      setError(e instanceof Error ? e.message : "The chair could not rule on the point");
    } finally {
      setThinking(false);
    }
  }
  const myRoundTurn = judge && lines.length > 0 && order[cursor] === HUMAN;
  const canSpeak = phase === "debate" ? true : myRoundTurn;

  function send() {
    const text = input.trim();
    if (!text || thinking || reporting || !canSpeak || phase === "ended") return;
    if (dictation.listening) dictation.stop();
    silence();
    stickRef.current = true;
    const informal = phase === "debate" && unmodRef.current !== null;
    push({ id: uid(), speaker: humanName, kind: "human", text, ...(informal ? { informal: true } : {}) });
    setInput("");
    if (phase === "opening" || phase === "closing") {
      setCursorTo(cursorRef.current + 1);
      runRound(phase);
      return;
    }
    const spoken = spokenCount(linesRef.current);
    const limit = procRef.current.limit;
    const caucus = informal ? undefined : procRef.current.caucus;
    // Speaking in general debate takes the student off the speakers' list.
    const list = procRef.current.speakers;
    if (!informal && !caucus && list?.includes(HUMAN)) setProcedure({ ...procRef.current, speakers: list.filter((n) => n !== HUMAN) });
    (async () => {
      const epoch = epochRef.current;
      if (judge && caucus && text.split(/\s+/).length > caucus.speakingTime * 2.5) {
        chair(`The delegate has exceeded the speaking time of ${caucus.speakingTime} seconds.`);
      }
      if (judge && !informal && spoken === limit - 2) {
        chair("Two more interventions remain before debate time expires.");
      }
      const ok = await aiTurn("reply");
      if (!ok || epochRef.current !== epoch) return;
      if (caucus) {
        const left = caucus.left - 1;
        if (left > 0) setProcedure({ ...procRef.current, caucus: { ...caucus, left } });
        else {
          setProcedure(withoutCaucus(procRef.current));
          await say("The moderated caucus has elapsed. The committee returns to general debate.");
          if (epochRef.current !== epoch) return;
        }
      }
      if (judge && !informal && spoken >= limit) {
        await beginClosing("Time for debate has expired. The chair closes the floor. Closing statements will now be heard in the same order as the opening.");
      }
    })();
  }

  /* ----- Table mode: the room is heard through dictation ----- */
  const onHeard = useCallback(
    (text: string) => {
      if (mode === "table") {
        const last = linesRef.current[linesRef.current.length - 1];
        if (last && last.kind === "human" && last.text.length < 1500) {
          linesRef.current = [...linesRef.current.slice(0, -1), { ...last, text: `${last.text} ${text}` }];
          setLines(linesRef.current);
        } else {
          push({ id: uid(), speaker: "Room", kind: "human", text });
        }
        // The AI answers when its country is named, after a short pause so it hears the whole point.
        if (aiCountries.some((c) => text.toLowerCase().includes(c.toLowerCase()))) mentionRef.current = true;
        if (timerRef.current) clearTimeout(timerRef.current);
        if (mentionRef.current) {
          timerRef.current = setTimeout(() => {
            mentionRef.current = false;
            aiTurn("reply");
          }, 1600);
        }
      } else {
        setInput((t) => (t && !t.endsWith(" ") ? `${t} ${text}` : `${t}${text}`));
      }
    },
    [mode, aiCountries, push, aiTurn],
  );

  const dictation = useDictation(onHeard);
  const busy = thinking || speaker.loading || speaker.playing;

  useEffect(() => {
    if (mode !== "table") return;
    if (busy && dictation.listening) dictation.stop();
    else if (wantListening && !busy && !dictation.listening && !dictation.error) dictation.start();
  }, [mode, busy, wantListening, dictation]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  // Make sure the latest changes reach the account when leaving the session or closing the tab.
  // An unsaved session in progress would be lost, so the browser asks first.
  const unsavedRef = useRef(false);
  useEffect(() => {
    unsavedRef.current = !save && lines.length > 0 && phase !== "ended";
  }, [save, lines.length, phase]);
  useEffect(() => {
    const flush = (e?: BeforeUnloadEvent) => {
      flushSaves();
      if (e && unsavedRef.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", flush);
    return () => {
      window.removeEventListener("beforeunload", flush);
      flush();
    };
  }, []);

  const unmodLeft = unmodEnds === null ? 0 : Math.max(0, Math.ceil((unmodEnds - now) / 1000));
  const shownError = error ?? dictation.error ?? speaker.error;
  const ended = phase === "ended";
  usePinHeader(!ended);
  const started = lines.length > 0;
  const stalled =
    judge && structured && (phase === "opening" || phase === "closing") && started && cursor < order.length && order[cursor] !== HUMAN && !busy && (resumable || error !== null);

  const placeholder = !canSpeak
    ? started
      ? "Waiting for the judge to call on you."
      : "Press Start and the judge will open the session."
    : phase === "opening"
      ? "Give your opening statement (about 90 seconds). Enter to send."
      : phase === "closing"
        ? "Give your closing statement. Enter to send."
        : "Speak or type your intervention. Enter to send.";

  return (
    <div className={`flex flex-col ${ended ? "min-h-[70dvh]" : "h-[calc(100dvh-9rem)] min-h-[26rem]"}`}>
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div className="min-w-0">
          <p className="text-sm text-muted">
            {MODE_LABEL[mode]}
            {judge ? ", judge presiding" : ", no judge"}
          </p>
          <h1 className="text-xl font-semibold tracking-tight">{initial.topic}</h1>
          <p className="text-sm text-muted">{initial.committee}</p>
          {structured && <p className="mt-1 text-sm font-medium text-accent">{PHASE_LABEL[phase]}</p>}
          {procedure.resolution && (
            <p className="text-sm text-muted">
              Draft resolution: &ldquo;{procedure.resolution.title}&rdquo;
              {procedure.resolution.result
                ? `, ${procedure.resolution.result.passed ? "adopted" : "failed"} (${procedure.resolution.result.for} for, ${procedure.resolution.result.against} against, ${procedure.resolution.result.abstain} abstaining)`
                : ", vote after closing statements"}
            </p>
          )}
          {phase === "debate" && (unmodEnds !== null || procedure.caucus) && (
            <p className="text-sm text-muted">
              {unmodEnds !== null
                ? `Unmoderated caucus, ${Math.floor(unmodLeft / 60)}:${String(unmodLeft % 60).padStart(2, "0")} left`
                : `Caucus on "${procedure.caucus?.topic}", ${procedure.caucus?.speakingTime}s per speaker, ${procedure.caucus?.left} of your speeches left`}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-3 print:hidden">
          {!ended && (
            <label className="flex items-center gap-2 text-sm text-muted">
              <input
                type="checkbox"
                checked={autoSpeak}
                onChange={(e) => setAutoSpeak(e.target.checked)}
                className="size-4 accent-[var(--accent)]"
              />
              Speak replies
            </label>
          )}
          {(speaker.playing || speaker.loading) && (
            <button type="button" className="btn" onClick={mute}>
              <Stop aria-hidden="true" size={16} weight="fill" /> Silence
            </button>
          )}
          {!ended && started && (
            <button
              type="button"
              className="btn"
              disabled={thinking || reporting}
              onClick={() => {
                silence();
                adjourn();
              }}
            >
              {judge ? "Judge: end session" : "End and get report"}
            </button>
          )}
          <button
            type="button"
            className="btn"
            onClick={() => {
              silence();
              dictation.stop();
              if (!ended && started && authUser) {
                saveSession({ ...initial, lines: linesRef.current, phase, report, endedAt, cursor, procedure });
                flushSaves().finally(onExit);
              } else {
                onExit();
              }
            }}
          >
            {ended ? "Close" : started && authUser ? "Save and leave" : "Leave session"}
          </button>
        </div>
      </div>

      {ended && (
        <div className="mt-6">
          {report ? (
            <ReportView
              report={report}
              lines={lines}
              humanLabel={mode === "table" ? "The room" : humanName}
              startedAt={initial.startedAt}
              endedAt={endedAt}
              aiCountries={aiCountries}
            />
          ) : (
            <div className="rounded-[var(--radius-ui)] border border-line bg-surface p-5 sm:p-7" aria-live="polite">
              {reporting ? (
                <div className="space-y-3" aria-label="Preparing your report">
                  <p className="font-medium">Preparing your report</p>
                  {[80, 95, 65].map((w, i) => (
                    <div key={i} className="h-4 animate-pulse rounded bg-sunk" style={{ width: `${w}%` }} />
                  ))}
                </div>
              ) : (
                <>
                  <p className="font-medium">The report could not be created.</p>
                  <button type="button" className="btn btn-primary mt-3" onClick={makeReport}>
                    Try again
                  </button>
                </>
              )}
            </div>
          )}
          <h2 className="mb-1 mt-10 text-lg font-semibold tracking-tight">Transcript</h2>
        </div>
      )}

      <ul className="flex shrink-0 flex-wrap gap-2 pt-4 print:hidden" aria-label="In the room">
        {judge && (
          <li
            className={`rounded-[var(--radius-ui)] border px-3 py-1.5 text-sm transition-colors ${
              speaking === "Judge" ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface"
            }`}
          >
            Judge
            <span className="ml-2 text-xs opacity-70">{speaking === "Judge" ? "speaking" : "AI"}</span>
          </li>
        )}
        {aiCountries.map((c) => (
          <li
            key={c}
            className={`rounded-[var(--radius-ui)] border px-3 py-1.5 text-sm transition-colors ${
              speaking === c ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface"
            }`}
          >
            {c}
            <span className="ml-2 text-xs opacity-70">{speaking === c ? "speaking" : "AI"}</span>
          </li>
        ))}
        <li className="rounded-[var(--radius-ui)] border border-dashed border-line px-3 py-1.5 text-sm text-muted">
          {mode === "table" ? "The room" : initial.humanCountry || "You"}
        </li>
      </ul>
      {judge && started && (
        <p className="shrink-0 pb-2 pt-3 text-sm text-muted print:hidden">
          Speaking order, drawn by the judge: {order.map(nameOf).join(", ")}
        </p>
      )}
      <div className="pb-2" />

      <div
        ref={chatRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className={`space-y-5 pb-6 ${ended ? "flex-1" : "min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1"}`}
        aria-live="polite"
      >
        {!started && (
          <div className="max-w-[60ch] text-muted">
            {judge ? (
              <>
                <p>
                  The judge will call the session to order, draw the speaking order, call on each delegation
                  in turn, step in when needed, and close the session.
                </p>
                <button type="button" className="btn btn-primary mt-3" disabled={thinking} onClick={startSession}>
                  <Play aria-hidden="true" size={18} weight="fill" /> Start the session
                </button>
              </>
            ) : (
              <p>
                No judge is presiding. Press Start listening. The AI hears the room and speaks when someone
                calls on {aiCountries[0]}, or when you give it the floor.
              </p>
            )}
          </div>
        )}
        {lines.map((l) =>
          l.kind === "chair" ? (
            <p key={l.id} className="max-w-[72ch] border-l-2 border-line pl-3 text-sm leading-relaxed text-muted">
              <span className="font-medium text-ink">Judge. </span>
              {l.text}
            </p>
          ) : (
            <div key={l.id} className={l.kind === "human" ? "ml-auto max-w-[88%]" : "max-w-[88%]"}>
              <p className="mb-1 text-xs font-medium text-muted">{l.speaker}</p>
              <div
                className={`break-words rounded-[var(--radius-ui)] border p-3.5 leading-relaxed ${
                  l.kind === "human" ? "border-transparent bg-accent text-accent-ink" : "border-line bg-surface"
                }`}
              >
                {l.text}
                {l.kind === "ai" && (
                  <button
                    type="button"
                    onClick={() => {
                      silence();
                      setSpeaking(l.speaker);
                      speaker.speak(l.text, voiceOf(l.speaker)).finally(() => setSpeaking(null));
                    }}
                    className="mt-2 flex items-center gap-1.5 text-xs text-muted hover:text-ink print:hidden"
                  >
                    <SpeakerHigh aria-hidden="true" size={14} /> Play
                  </button>
                )}
              </div>
            </div>
          ),
        )}
        {thinking && <p className="text-sm text-muted">The delegation is preparing a reply.</p>}
        {stalled && (
          <button type="button" className="btn" onClick={() => runRound(phase as Round)}>
            <Play aria-hidden="true" size={16} weight="fill" /> Continue the session
          </button>
        )}
      </div>

      {shownError && !ended && (
        <p role="alert" className="mb-3 shrink-0 text-sm text-danger">
          {shownError}
        </p>
      )}
      {dictation.interim && <p className="mb-2 text-sm italic text-muted">{dictation.interim}</p>}

      {!ended && (
        <div className="shrink-0 border-t border-line bg-background pb-2 pt-4">
          {resBallot && procedure.resolution ? (
            <div className="max-h-[50dvh] overflow-y-auto">
              <ResolutionBallot resolution={procedure.resolution} onBallot={castResBallot} />
            </div>
          ) : draftOpen && !floorOpen ? (
            <div className="max-h-[50dvh] overflow-y-auto">
              <ResolutionDraft sponsor={humanName} busy={thinking} onIntroduce={introduceResolution} onCancel={() => setDraftOpen(false)} />
            </div>
          ) : pointOpen && !floorOpen ? (
            <div className="max-h-[50dvh] overflow-y-auto">
              <PointPanel delegations={aiCountries} busy={thinking} onRaise={raisePoint} onCancel={() => setPointOpen(false)} />
            </div>
          ) : floorOpen ? (
            <div className="max-h-[50dvh] overflow-y-auto">
              <MotionPanel
                floor={floor}
                ballot={ballot}
                busy={thinking}
                voting={voting}
                aiNote={aiNote}
                onSubmit={submitMotion}
                onSecond={secondMotion}
                onDecline={(id) => {
                  const m = floor.find((x) => x.id === id);
                  dropMotion(id, `${humanName} declines to second the motion from ${m?.by ?? "the AI delegation"}. It falls.`);
                }}
                onWithdraw={(id) => dropMotion(id, `${humanName} withdraws the motion.`)}
                onVote={voteOnMotions}
                onBallot={castBallot}
                onCancel={() => closeFloor("The motions are withdrawn. Debate continues.")}
              />
            </div>
          ) : mode === "table" ? (
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                disabled={!dictation.supported}
                aria-pressed={wantListening}
                onClick={() => setWantListening((v) => !v)}
                className={`btn ${wantListening ? "btn-live pulse-ring" : "btn-primary"}`}
              >
                {wantListening ? <Stop aria-hidden="true" size={18} weight="fill" /> : <Ear aria-hidden="true" size={18} />}
                {wantListening ? "Stop listening" : "Start listening"}
              </button>
              <button
                type="button"
                className="btn"
                disabled={busy || (judge && !started) || lines.length === 0}
                onClick={() => aiTurn("reply")}
              >
                Give the floor to {aiCountries[0]}
              </button>
              <p className="text-sm text-muted">
                {!dictation.supported
                  ? "Listening needs Chrome, Edge or Safari."
                  : wantListening
                    ? busy
                      ? "Paused while the AI speaks."
                      : "Listening to the room."
                    : "Not listening."}
              </p>
            </div>
          ) : (
            <>
              {showList && (
                <div className="mb-3 flex flex-wrap items-center gap-2 text-sm" aria-label="Speakers' list">
                  <span className="font-medium">Speakers&rsquo; list</span>
                  <ol className="flex flex-wrap gap-1.5">
                    {speakers.map((n, i) => (
                      <li
                        key={n}
                        className={`rounded-full border px-2.5 py-0.5 ${i === 0 ? "border-accent font-medium" : "border-line text-muted"}`}
                      >
                        {n === HUMAN ? `${humanName} (you)` : n}
                      </li>
                    ))}
                  </ol>
                  <button type="button" className="text-sm font-medium text-accent underline-offset-2 hover:underline" onClick={toggleMe}>
                    {speakers.includes(HUMAN) ? "Remove me" : "Add me"}
                  </button>
                  {nextUp === HUMAN && <span className="text-muted">You are next: give your speech.</span>}
                </div>
              )}
              <label htmlFor="turn" className="sr-only">
                Your speech or question
              </label>
              <textarea
                id="turn"
                rows={3}
                value={input}
                disabled={!canSpeak}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
                className="field resize-none disabled:opacity-60"
                placeholder={placeholder}
              />
              <div className="mt-2 flex flex-wrap justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={dictation.listening ? dictation.stop : dictation.start}
                    disabled={!dictation.supported || !canSpeak}
                    aria-pressed={dictation.listening}
                    className={`btn ${dictation.listening ? "btn-live pulse-ring" : ""}`}
                  >
                    {dictation.listening ? <Stop aria-hidden="true" size={18} weight="fill" /> : <Microphone aria-hidden="true" size={18} />}
                    {dictation.listening ? "Stop" : "Speak"}
                  </button>
                  {phase === "debate" && mode === "committee" && showList && (
                    <button
                      type="button"
                      className="btn"
                      disabled={thinking || !nextUp || nextUp === HUMAN}
                      title={nextUp === HUMAN ? "You are next on the speakers' list: give your speech" : undefined}
                      onClick={nextSpeaker}
                    >
                      {nextUp && nextUp !== HUMAN ? `Next speaker: ${nextUp}` : "Next speaker"}
                    </button>
                  )}
                  {phase === "debate" && mode === "committee" && !showList && (
                    <button
                      type="button"
                      className="btn"
                      disabled={thinking || humanSpeeches === 0}
                      onClick={() => aiTurn("continue")}
                    >
                      Let them debate
                    </button>
                  )}
                  {phase === "debate" && (
                    <button
                      type="button"
                      className="btn"
                      disabled={thinking || humanSpeeches < 2 || unmodEnds !== null}
                      title={humanSpeeches < 2 ? "Speak at least twice before moving to close debate" : undefined}
                      onClick={moveToClose}
                    >
                      Move to close debate
                    </button>
                  )}
                  {phase === "debate" && judge && (
                    <button
                      type="button"
                      className="btn"
                      disabled={thinking || humanSpeeches === 0 || unmodEnds !== null}
                      title={unmodEnds !== null ? "Motions are not taken during an unmoderated caucus" : humanSpeeches === 0 ? "Speak once before raising a motion" : undefined}
                      onClick={openFloor}
                    >
                      Raise a motion
                    </button>
                  )}
                  {phase === "debate" && judge && (
                    <button
                      type="button"
                      className="btn"
                      disabled={thinking || unmodEnds !== null}
                      title={unmodEnds !== null ? "Points are not taken during an unmoderated caucus" : undefined}
                      onClick={() => setPointOpen(true)}
                    >
                      Raise a point
                    </button>
                  )}
                  {phase === "debate" && judge && !procedure.resolution && (
                    <button
                      type="button"
                      className="btn"
                      disabled={thinking || humanSpeeches === 0 || unmodEnds !== null}
                      title={humanSpeeches === 0 ? "Speak once before introducing a draft resolution" : undefined}
                      onClick={() => {
                        setPointOpen(false);
                        setDraftOpen(true);
                      }}
                    >
                      Draft resolution
                    </button>
                  )}
                  {phase === "debate" && unmodEnds !== null && (
                    <button type="button" className="btn" disabled={thinking} onClick={endUnmod}>
                      End caucus early
                    </button>
                  )}
                  {phase === "closing" && myRoundTurn && (
                    <button type="button" className="btn" disabled={thinking} onClick={skipClosing}>
                      Skip my closing statement
                    </button>
                  )}
                </div>
                <button type="button" onClick={send} disabled={!input.trim() || thinking || !canSpeak} className="btn btn-primary">
                  <ArrowUp aria-hidden="true" size={18} weight="bold" />
                  Send
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
