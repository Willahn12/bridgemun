"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowUp, Broadcast, Check, CheckSquare, Copy, Microphone, MicrophoneSlash, Play, Robot, ShieldCheck, SignOut, SpeakerHigh, Stop, Timer, UsersThree, X } from "@phosphor-icons/react";
import { defaultVoice, PERSON_VOICES, rememberedVoice, rememberVoice } from "@/lib/voices";
import { toneStyle } from "@/lib/tone";
import ZoomTile from "@/components/ZoomTile";
import NotesPanel from "@/components/NotesPanel";
import { createForumMeeting, zoomAvailable } from "@/lib/zoomClient";
import { broadcast, listen, type Broadcast as LiveLink } from "@/lib/liveAudio";
import { useAuth, displayName } from "@/lib/auth";
import { useDictation, useRecorder, useSpeaker } from "@/lib/voice";
import { flushSaves, saveSession, type Session } from "@/lib/sessions";
import { usePinHeader } from "@/components/SiteHeader";
import Flag from "@/components/Flag";
import {
  castAiBallots,
  castBallot,
  clipUrl,
  DEFAULT_LIMITS,
  friendlyRoomError,
  listBallots,
  splitTime,
  watchBallots,
  type Ballot,
  type Seat,
  type Voting,
  getRoom,
  leaveRoom,
  listRoomLines,
  listRoomMembers,
  postLine,
  setMyVoice,
  updateRoom,
  uploadClip,
  watchRoom,
  type Room,
  type RoomLine,
  type RoomMember,
  type RoomPhase,
  type TurnEntry,
} from "@/lib/rooms";

const JUDGE_VOICE = 5;
const DEBATE_ROUNDS = 2;
/* Seconds each human gets per turn. */
/** A speaker's time in this room, in seconds: shared out from the forum's length when it started, or the defaults. */
const limitFor = (r: Room | null, stage: "opening" | "debate" | "closing") => r?.limits?.[stage] ?? DEFAULT_LIMITS[stage];

/* About 2.6 words a second is a comfortable speaking pace. A speech that would run over the speaker's time is
   read a little faster, never more than 1.3 times, so it stays easy to follow. */
function paceFor(r: Room | null, text: string): number {
  if (!r?.limits || r.phase === "lobby") return 1;
  const seconds = text.split(/\s+/).length / 2.6;
  return Math.min(1.3, Math.max(1, seconds / limitFor(r, r.phase)));
}
const PHASE_LABEL: Record<string, string> = {
  lobby: "Waiting to start",
  opening: "Opening statements",
  debate: "Debate",
  closing: "Closing statements",
};

type Stage = "opening" | "debate" | "closing";

const YIELD_TEXT = "Yields the floor.";

/* How the room hears a person: their AI voice reading their words, a recording of their voice, or their voice live. */
type SpeakMode = "ai" | "own" | "live";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** The topic as the AI sees it, with the subtopic folded in. */
const agenda = (r: Room) => (r.subtopic ? `${r.topic}: ${r.subtopic}` : r.topic).slice(0, 200);

/** Countries the AI is playing right now (seats switched off mid-session are left out). */
const activeAi = (r: Room) => r.aiCountries.filter((c) => !r.turnOrder.some((t) => t.name === c && t.off));

const mmss = (ms: number) => {
  const s = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
};

function shuffle<T>(items: T[]): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function RoomPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, ready } = useAuth();
  const userId = user?.id;

  const [room, setRoom] = useState<Room | null | undefined>(undefined); // undefined = loading, null = not found
  const [members, setMembers] = useState<RoomMember[]>([]);
  const [lines, setLines] = useState<RoomLine[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [speakOn, setSpeakOn] = useState(true);
  const [speakingWho, setSpeakingWho] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [ending, setEnding] = useState(false);
  const [starting, setStarting] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  /* How the room hears this person: their chosen AI voice reading their words, or a recording of their own voice. */
  const [speakMode, setSpeakMode] = useState<SpeakMode>(() => {
    try {
      const m = localStorage.getItem("bridgemun.speakMode");
      return m === "own" || m === "live" ? m : "ai";
    } catch {
      return "ai";
    }
  });
  const [broadcasting, setBroadcasting] = useState(false); // I am talking live
  const [hearing, setHearing] = useState<string | null>(null); // whose live voice is playing here
  const liveRef = useRef<LiveLink | null>(null);
  const [livePaused, setLivePaused] = useState(false);
  const liveAudioRef = useRef<HTMLAudioElement>(null);
  const [clip, setClip] = useState<{ blob: Blob; url: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [allBallots, setBallots] = useState<Ballot[]>([]);
  const [question, setQuestion] = useState("");
  const [voteBusy, setVoteBusy] = useState(false);
  const [seatBusy, setSeatBusy] = useState<string | null>(null);
  const [videoReady, setVideoReady] = useState(false); // the server has Zoom keys
  const [videoBusy, setVideoBusy] = useState(false);
  /* The pop-up with this person's speaking times shows once per forum. */
  const [timesSeen, setTimesSeen] = useState(() => {
    try {
      return sessionStorage.getItem(`bridgemun.times.${id}`) === "1";
    } catch {
      return false;
    }
  });

  const roomRef = useRef<Room | null>(null);
  const membersRef = useRef<RoomMember[]>([]);
  const linesRef = useRef<RoomLine[]>([]);
  const seenRef = useRef(new Set<string>());
  const queueRef = useRef<{ text?: string; clip?: string; voice: number; who: string; rate?: number }[]>([]);
  const drainingRef = useRef(false);
  const speakOnRef = useRef(true);
  const flowRunRef = useRef(false);
  const flowTokenRef = useRef(0);
  const resumedRef = useRef(false);
  const waiterRef = useRef<{ userId: string; done: (r: "spoke" | "timeout" | "cancel", line?: RoomLine) => void } | null>(null);
  const userIdRef = useRef<string | undefined>(undefined);
  const wasLiveRef = useRef(false);
  const savedCopyRef = useRef(false);
  const finishingRef = useRef(false);
  const autoStartRef = useRef(false);
  const startingRef = useRef(false);
  /* Host only, during a live forum: puts people who joined late at the end of the speaking order. */
  const lateJoinRef = useRef<(m: RoomMember[]) => void>(() => {});
  const chatRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const speaker = useSpeaker();
  const speak = speaker.speak; // stable across renders, unlike the speaker object
  const playUrl = speaker.playUrl;
  const stopSpeech = speaker.stop;
  const recorder = useRecorder();
  const preview = useSpeaker(); // separate from the room's speaker, so a preview never cuts off a speech

  useEffect(() => {
    speakOnRef.current = speakOn;
  }, [speakOn]);
  useEffect(() => {
    userIdRef.current = userId;
  }, [userId]);

  const isHost = !!room && room.hostId === userId;
  const me = members.find((m) => m.userId === userId);
  const myLabel = me?.country || (user ? displayName(user) : "You");
  const myTurn = !!room && room.status === "live" && !!userId && room.turnUser === userId;
  usePinHeader(!!room && room.status !== "ended");

  /* ----- Speaking the AI and judge lines that arrive, one after another ----- */
  const drain = useCallback(async () => {
    if (drainingRef.current) return;
    drainingRef.current = true;
    while (queueRef.current.length && speakOnRef.current) {
      const item = queueRef.current.shift()!;
      setSpeakingWho(item.who);
      if (item.clip) {
        const url = await clipUrl(item.clip).catch(() => null);
        if (url) await playUrl(url);
      } else if (item.text) {
        await speak(item.text, item.voice, item.rate);
      }
    }
    queueRef.current = [];
    setSpeakingWho(null);
    drainingRef.current = false;
  }, [speak, playUrl]);

  /* ----- Every line, whoever posted it, goes through here exactly once ----- */
  const receive = useCallback(
    (l: RoomLine) => {
      if (seenRef.current.has(l.id)) return;
      seenRef.current.add(l.id);
      linesRef.current = [...linesRef.current, l];
      setLines(linesRef.current);

      /* Everyone else hears what a delegate said: their recording, or their words read aloud.
         The speaker does not need to hear themselves. */
      const readOut = (src: RoomLine) => {
        if (!speakOnRef.current || src.userId === userIdRef.current || src.text === YIELD_TEXT || src.live) return;
        queueRef.current.push(
          src.audioPath
            ? { clip: src.audioPath, voice: 0, who: src.speaker }
            : {
                text: src.text,
                voice: membersRef.current.find((m) => m.userId === src.userId)?.voice ?? defaultVoice(src.userId),
                who: src.speaker,
                rate: paceFor(roomRef.current, src.text),
              },
        );
        drain();
      };

      if (l.kind === "human") {
        // With a judge, the words are read after the judge acknowledges the delegate (see below).
        if (!roomRef.current?.judge) readOut(l);
      } else {
        if (speakOnRef.current) {
          queueRef.current.push({
            text: l.text,
            voice: l.kind === "chair" ? JUDGE_VOICE : 0,
            who: l.speaker,
            rate: l.kind === "ai" ? paceFor(roomRef.current, l.text) : 1,
          });
          drain();
        }
        if (l.kind === "chair" && l.refId) {
          const src = linesRef.current.find((x) => x.id === l.refId);
          if (src) readOut(src);
        }
      }
      // The host's flow is waiting for this person to speak.
      if (l.kind === "human" && l.userId && waiterRef.current?.userId === l.userId) waiterRef.current.done("spoke", l);
    },
    [drain],
  );

  /* ----- Host only: everything below runs in the host's browser ----- */

  /* Waits until the host's own audio has finished, so the next turn does not start over the top of it. */
  const settle = useCallback(async (text: string) => {
    if (speakOnRef.current) {
      const t0 = Date.now();
      await sleep(80);
      while ((drainingRef.current || queueRef.current.length) && Date.now() - t0 < 180000) await sleep(150);
    } else {
      await sleep(Math.min(15000, text.split(/\s+/).length * 280));
    }
  }, []);

  const post = useCallback(
    async (kind: "ai" | "chair", speakerName: string, text: string, refId?: string) => {
      const r = roomRef.current;
      if (!r) return;
      receive(await postLine(r.id, null, speakerName, kind, text, { refId }));
      await settle(text);
    },
    [receive, settle],
  );

  /* A chair line from a button the host pressed (votes, seats). It is read aloud like any other line, but the
     button does not wait for the reading to finish. */
  const announce = useCallback(
    async (text: string) => {
      const r = roomRef.current;
      if (!r) return;
      receive(await postLine(r.id, null, r.judge ? "Judge" : "Moderator", "chair", text));
    },
    [receive],
  );

  const say = useCallback(
    async (text: string, refId?: string) => {
      if (roomRef.current?.judge) await post("chair", "Judge", text, refId);
    },
    [post],
  );

  const patchRoom = useCallback(async (fields: Record<string, unknown>, local: Partial<Room>) => {
    const r = roomRef.current;
    if (!r) return;
    await updateRoom(r.id, fields);
    const next = { ...r, ...local };
    roomRef.current = next;
    setRoom(next);
  }, []);

  /* Asks the server for the AI's words. Returns false if it still failed after retries. */
  const runAi = useCallback(
    async (directive: "open" | "reply" | "adjourn" | "opening" | "closing", only?: string, order?: string[]) => {
      const r = roomRef.current;
      if (!r) return true;
      setAiBusy(true);
      setError(null);
      let body: { chair?: string; speeches?: { country: string; text: string }[]; error?: string } | null = null;
      let failure = "The AI could not respond.";
      // Only the request is retried, never the posting, so nothing can be said twice.
      for (let attempt = 0; attempt < 3 && !body; attempt++) {
        if (attempt) await sleep(1200 * attempt);
        try {
          const humans = membersRef.current.filter((m) => !m.moderator).map((m) => m.country || m.name);
          const res = await fetch("/api/delegate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode: r.aiCountries.length > 1 ? "committee" : "table",
              committee: r.committee,
              topic: agenda(r),
              humanCountry: humans.join(", ").slice(0, 95),
              aiCountries: activeAi(r),
              lines: linesRef.current.slice(-150).map((l) => ({ speaker: l.speaker, kind: l.kind, text: l.text })),
              directive,
              judge: r.judge,
              seconds: limitFor(r, directive === "opening" || directive === "open" ? "opening" : directive === "closing" ? "closing" : "debate"),
              order: order ?? [],
              only,
            }),
          });
          const got = await res.json();
          if (res.ok) body = got;
          else failure = got.error ?? "Request failed";
        } catch (e) {
          failure = e instanceof Error ? e.message : failure;
        }
      }
      try {
        if (!body) {
          setError(friendlyRoomError(failure));
          return false;
        }
        if (body.chair) await post("chair", "Judge", body.chair);
        for (const s of body.speeches ?? []) await post("ai", s.country, s.text);
        return true;
      } catch (e) {
        setError(friendlyRoomError(e instanceof Error ? e.message : "The AI could not respond."));
        return false;
      } finally {
        setAiBusy(false);
      }
    },
    [post],
  );

  const waitForHuman = useCallback((uid: string, ms: number) => {
    return new Promise<{ result: "spoke" | "timeout" | "cancel"; line?: RoomLine }>((resolve) => {
      const t = setTimeout(() => {
        waiterRef.current = null;
        resolve({ result: "timeout" });
      }, ms);
      waiterRef.current = {
        userId: uid,
        done: (result, line) => {
          clearTimeout(t);
          waiterRef.current = null;
          resolve({ result, line });
        },
      };
    });
  }, []);

  const doTurn = useCallback(
    async (stage: Stage, i: number) => {
      const r = roomRef.current;
      if (!r || !r.turnOrder.length) return false;
      const entry: TurnEntry = r.turnOrder[i % r.turnOrder.length];
      if (entry.off) return false; // an AI seat the host switched off
      if (entry.kind === "human" && !membersRef.current.some((m) => m.userId === entry.userId)) return false; // they left

      if (entry.kind === "ai") {
        await patchRoom({ phase: stage, cursor: i, turn_user: null, turn_deadline: null }, { phase: stage, cursor: i, turnUser: null, turnDeadline: null });
        let ok: boolean;
        if (stage === "debate") {
          ok = await runAi("reply", entry.name); // the judge's recognition comes with the reply
        } else {
          await say(`The chair recognizes the delegate of ${entry.name}.`);
          ok = await runAi(stage, entry.name);
        }
        if (!ok) await say(`The delegate of ${entry.name} could not be heard just now. The floor moves on.`);
        return true;
      }

      await patchRoom({ phase: stage, cursor: i, turn_user: null, turn_deadline: null }, { phase: stage, cursor: i, turnUser: null, turnDeadline: null });
      await say(`The chair recognizes the delegate of ${entry.name}. You have the floor.`);
      // Nobody's turn runs past the end of the forum.
      const left = r.endsAt ? Date.parse(r.endsAt) - Date.now() : Infinity;
      const ms = Math.min(limitFor(r, stage) * 1000, Math.max(5000, left));
      const deadline = new Date(Date.now() + ms).toISOString();
      await patchRoom({ turn_user: entry.userId, turn_deadline: deadline }, { turnUser: entry.userId, turnDeadline: deadline });
      const { result, line } = await waitForHuman(entry.userId as string, ms);
      await patchRoom({ turn_user: null, turn_deadline: null }, { turnUser: null, turnDeadline: null });
      if (result === "timeout") await say(`Time is up for the delegate of ${entry.name}. The floor moves on.`);
      // The judge acknowledges the delegate, and then everyone hears what was said.
      if (result === "spoke" && line) {
        if (line.text === YIELD_TEXT) await say(`The chair acknowledges the delegate of ${entry.name}, who yields the floor.`);
        else await say(`The chair acknowledges the delegate of ${entry.name}.`, line.id);
      }
      return true;
    },
    [patchRoom, runAi, say, waitForHuman],
  );

  /* Counts the ballots, announces the result and closes the vote. */
  const closeVote = useCallback(async () => {
    const r = roomRef.current;
    const v = r?.voting;
    if (!r || !v || v.status !== "open") return;
    setVoteBusy(true);
    try {
      const all = await listBallots(r.id, v.id);
      const n = (k: Ballot["vote"]) => all.filter((b) => b.vote === k).length;
      const [yes, no, abstain] = [n("for"), n("against"), n("abstain")];
      const closed: Voting = { ...v, status: "closed" };
      await patchRoom({ voting: closed }, { voting: closed });
      const outcome = yes > no ? "The motion passes." : yes === no && yes > 0 ? "The vote is tied, so the motion fails." : "The motion fails.";
      await announce(
        `Voting is closed on: ${v.question}. ${yes} for, ${no} against, ${abstain} ${abstain === 1 ? "abstention" : "abstentions"}. ${outcome}`,
      );
    } catch (e) {
      setError(friendlyRoomError(e instanceof Error ? e.message : "Could not close the vote."));
    } finally {
      setVoteBusy(false);
    }
  }, [patchRoom, announce]);

  const finishSession = useCallback(async () => {
    const r = roomRef.current;
    if (!r || finishingRef.current) return;
    finishingRef.current = true;
    setEnding(true);
    setError(null);
    try {
      stopSpeech();
      queueRef.current = [];
      if (r.voting?.status === "open") await closeVote();
      await patchRoom({ turn_user: null, turn_deadline: null }, { turnUser: null, turnDeadline: null });
      if (r.judge) await runAi("adjourn");
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "table",
          committee: r.committee,
          topic: agenda(r),
          humanCountry: "",
          aiCountries: r.aiCountries,
          lines: linesRef.current.slice(-300).map((l) => ({ speaker: l.speaker, kind: l.kind, text: l.text })),
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "The report could not be created.");
      const endedAt = new Date().toISOString();
      await patchRoom(
        { status: "ended", report: body.report, ended_at: endedAt },
        { status: "ended", report: body.report, endedAt },
      );
    } catch (e) {
      finishingRef.current = false; // let the host try again
      setError(friendlyRoomError(e instanceof Error ? e.message : "Could not end the session."));
    } finally {
      setEnding(false);
    }
  }, [stopSpeech, patchRoom, runAi, closeVote]);

  /* Opening statements, debate, closing statements, adjourn. Resumes from a saved position.
     A forum with a length debates in rounds until it is time for closing statements, and stops when time
     runs out. Older rooms without one have a fixed number of debate rounds. */
  const drive = useCallback(
    async (startStage: Stage, startCursor: number) => {
      if (flowRunRef.current) return;
      flowRunRef.current = true;
      const token = ++flowTokenRef.current;
      const len = () => roomRef.current?.turnOrder.length ?? 0;
      const active = () => roomRef.current?.turnOrder.filter((t) => !t.off).length ?? 0;
      const timed = () => !!roomRef.current?.endsAt;
      const timeLeft = () => {
        const e = roomRef.current?.endsAt;
        return e ? Date.parse(e) - Date.now() : Infinity;
      };
      // Time kept back for closing statements: about 40 seconds a delegation, at most a third of the forum.
      const reserve = () => {
        const r = roomRef.current;
        const total = r?.endsAt && r.liveAt ? Date.parse(r.endsAt) - Date.parse(r.liveAt) : 0;
        return Math.min(active() * (limitFor(r, "closing") + 15) * 1000, total / 3);
      };
      try {
        if (!len()) return;
        const stages: Stage[] = ["opening", "debate", "closing"];
        const first = stages.indexOf(startStage);
        for (let si = first; si < stages.length; si++) {
          const stage = stages[si];
          let i = si === first ? startCursor : 0;
          const more = () => {
            if (timeLeft() <= 0 || !active()) return false;
            if (stage === "debate") return timed() ? timeLeft() > reserve() : i < len() * DEBATE_ROUNDS;
            return i < len();
          };
          if (i === 0 && stage === "debate" && more()) {
            await say(
              timed()
                ? "Opening statements are complete. The floor is now open for debate. Delegates will speak in turn until it is time for closing statements."
                : `Opening statements are complete. The floor is now open for debate. Each delegate will speak in turn, for ${DEBATE_ROUNDS} rounds.`,
            );
          }
          if (i === 0 && stage === "closing" && more()) {
            await say("Debate is closed. Closing statements will be heard in the same order as the opening.");
          }
          let idle = 0; // turns in a row with no one to speak; a whole lap of them ends the stage
          while (more() && idle < len()) {
            if (flowTokenRef.current !== token) return;
            idle = (await doTurn(stage, i)) ? 0 : idle + 1;
            i++;
          }
          if (timeLeft() <= 0) {
            await say("Time is up for this forum.");
            break;
          }
        }
        if (flowTokenRef.current === token) await finishSession();
      } catch (e) {
        setError(friendlyRoomError(e instanceof Error ? e.message : "The session hit a problem."));
      } finally {
        if (flowTokenRef.current === token) flowRunRef.current = false;
      }
    },
    [doTurn, finishSession, say],
  );

  /* Host only: turns a country's seat over to the AI or back. Mid-session, a new AI seat joins the end of the
     speaking order and a switched-off one is skipped. Seats a person has taken cannot be given to the AI. */
  async function toggleSeatAi(country: string) {
    const r = roomRef.current;
    if (!r?.seats || r.status === "ended") return;
    if (membersRef.current.some((m) => m.country.toLowerCase() === country.toLowerCase())) return;
    setSeatBusy(country);
    setError(null);
    try {
      const seats: Seat[] = r.seats.map((s) => (s.country === country ? { ...s, ai: !s.ai } : s));
      const on = !!seats.find((s) => s.country === country)?.ai;
      const ais = seats.filter((s) => s.ai).map((s) => s.country);
      let order = r.turnOrder;
      if (r.status === "live") {
        const has = order.some((t) => t.name === country);
        order = has
          ? order.map((t) => (t.name === country ? { ...t, kind: "ai" as const, userId: null, off: !on } : t))
          : on
            ? [...order, { name: country, kind: "ai" as const, userId: null }]
            : order;
      }
      await patchRoom(
        { seats, ai_countries: ais, ai_country: ais[0] ?? "", turn_order: order },
        { seats, aiCountries: ais, aiCountry: ais[0] ?? "", turnOrder: order },
      );
      if (r.status === "live") {
        await announce(on ? `The delegation of ${country} joins the session.` : `The delegation of ${country} has left the session.`);
      }
    } catch (e) {
      setError(friendlyRoomError(e instanceof Error ? e.message : "Could not change that seat."));
    } finally {
      setSeatBusy(null);
    }
  }

  /* Host only: opens a floor vote. The AI delegations vote straight away; people vote from their own screens. */
  async function openVote() {
    const r = roomRef.current;
    const q = question.trim();
    if (!r || r.status !== "live" || q.length < 3 || r.voting?.status === "open") return;
    setVoteBusy(true);
    setError(null);
    try {
      const voting: Voting = { id: Math.random().toString(36).slice(2, 10), question: q.slice(0, 300), status: "open" };
      await patchRoom({ voting }, { voting });
      setQuestion("");
      const ai = activeAi(r);
      const aiVotes = ai.length
        ? fetch("/api/delegate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode: ai.length > 1 ? "committee" : "table",
              committee: r.committee,
              topic: agenda(r),
              humanCountry: "",
              aiCountries: ai,
              lines: linesRef.current.slice(-150).map((l) => ({ speaker: l.speaker, kind: l.kind, text: l.text })),
              directive: "vote",
              judge: r.judge,
              order: [],
              motion: voting.question,
            }),
          })
            .then((res) => (res.ok ? res.json() : null))
            .then((body: { votes?: { country: string; vote: Ballot["vote"]; reason: string }[] } | null) =>
              body?.votes?.length ? castAiBallots(r.id, voting.id, body.votes) : undefined,
            )
            .catch(() => setError("The AI delegations could not vote this time."))
        : Promise.resolve();
      await announce(`The floor is open for voting on: ${voting.question}. Delegates, cast your ballot: for, against or abstain.`);
      await aiVotes;
    } catch (e) {
      setError(friendlyRoomError(e instanceof Error ? e.message : "Could not open the vote."));
    } finally {
      setVoteBusy(false);
    }
  }

  async function start() {
    const r = roomRef.current;
    if (!r) return;
    setStarting(true);
    startingRef.current = true;
    setError(null);
    resumedRef.current = true; // the resume effect must not start the flow while the judge is still opening
    try {
      const humans: TurnEntry[] = membersRef.current
        .filter((m) => !m.moderator)
        .map((m) => ({ name: m.country || m.name, kind: "human", userId: m.userId }));
      const ais: TurnEntry[] = r.aiCountries.filter(Boolean).map((c) => ({ name: c, kind: "ai", userId: null }));
      const order = shuffle([...humans, ...ais]);
      if (!order.length) throw new Error("No delegations yet: turn on AI for a country, or wait for people to join.");
      const liveAt = new Date().toISOString();
      if (r.endAt && Date.parse(r.endAt) < Date.now() + 5 * 60000) {
        throw new Error("The end time you set is less than 5 minutes away. Make a new forum with a later end time.");
      }
      const endsAt = r.endAt ?? (r.durationMin ? new Date(Date.now() + r.durationMin * 60000).toISOString() : null);
      // The time is shared between every delegation, counting open seats too when people may still join.
      const open = r.lateJoin && r.seats ? r.seats.filter((s) => !s.ai && !order.some((o) => o.name === s.country)).length : 0;
      const limits = endsAt ? splitTime((Date.parse(endsAt) - Date.now()) / 1000, order.length + open, DEBATE_ROUNDS) : DEFAULT_LIMITS;
      await patchRoom(
        { status: "live", phase: "opening", turn_order: order, cursor: 0, turn_user: null, turn_deadline: null, live_at: liveAt, ends_at: endsAt, limits },
        { status: "live", phase: "opening", turnOrder: order, cursor: 0, turnUser: null, turnDeadline: null, liveAt, endsAt, limits },
      );
      addVideo(); // the forum does not wait for Zoom; video joins whenever it is ready
      if (r.judge) await runAi("open", undefined, order.map((o) => o.name));
      drive("opening", 0);
    } catch (e) {
      setError(friendlyRoomError(e instanceof Error ? e.message : "Could not start."));
    } finally {
      setStarting(false);
      startingRef.current = false;
    }
  }

  /* Host only: gives the live forum its own Zoom meeting, if the server has Zoom keys. */
  async function addVideo() {
    const r = roomRef.current;
    if (!r || r.zoom || !(await zoomAvailable())) return;
    setVideoBusy(true);
    try {
      const minutes = r.endsAt ? Math.ceil((Date.parse(r.endsAt) - Date.now()) / 60000) + 10 : 120;
      const zoom = await createForumMeeting(agenda(r), minutes);
      await patchRoom({ zoom }, { zoom });
    } catch (e) {
      setError(`Video could not start: ${e instanceof Error ? e.message : "Zoom did not answer."} The forum carries on without it.`);
    } finally {
      setVideoBusy(false);
    }
  }

  async function endEarly() {
    if (finishingRef.current) return;
    flowTokenRef.current++;
    waiterRef.current?.done("cancel");
    flowRunRef.current = false;
    await finishSession();
  }

  /* ----- Load and subscribe ----- */
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let stop: (() => void) | null = null;
    (async () => {
      try {
        const r = await getRoom(id);
        if (cancelled) return;
        roomRef.current = r;
        setRoom(r);
        if (!r) return;
        const [m, l] = await Promise.all([listRoomMembers(id), listRoomLines(id)]);
        if (cancelled) return;
        membersRef.current = m;
        setMembers(m);
        l.forEach((x) => seenRef.current.add(x.id));
        linesRef.current = l;
        setLines(l);
        stop = watchRoom(id, {
          onLine: receive,
          onRoom: (next) => {
            roomRef.current = next;
            setRoom(next);
          },
          onMembersChanged: () =>
            listRoomMembers(id)
              .then((mm) => {
                membersRef.current = mm;
                setMembers(mm);
                lateJoinRef.current(mm);
              })
              .catch(() => {}),
        });
        setLoaded(true);
      } catch (e) {
        if (!cancelled) {
          setError(friendlyRoomError(e instanceof Error ? e.message : "Could not open this room."));
          setRoom(null);
        }
      }
    })();
    return () => {
      cancelled = true;
      stop?.();
      // Deliberately reads the latest value: this stops the host's flow when leaving the page.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      flowTokenRef.current++;
      flowRunRef.current = false;
      waiterRef.current?.done("cancel");
    };
  }, [id, userId, receive]);

  /* If the host reloads the page during a live session, carry on from where it was. */
  useEffect(() => {
    if (!loaded || resumedRef.current) return;
    const r = roomRef.current;
    if (r && r.status === "live" && r.hostId === userId && r.phase !== "lobby") {
      resumedRef.current = true;
      drive(r.phase as Stage, r.cursor);
    }
  }, [loaded, userId, drive]);

  /* Clock for the countdowns: the speaker's turn, the forum's time left, and a scheduled start. */
  const ticking = !!room && (room.status === "live" || (room.status === "lobby" && !!room.startsAt));
  useEffect(() => {
    if (!ticking) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [ticking]);

  /* Host only: a scheduled forum starts on its own at its time, if this tab is open. */
  useEffect(() => {
    const r = roomRef.current;
    if (!r || r.hostId !== userId || r.status !== "lobby" || !r.startsAt || autoStartRef.current || starting) return;
    if (now >= Date.parse(r.startsAt)) {
      autoStartRef.current = true;
      start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- start reads everything through refs
  }, [now, userId, starting]);

  /* Host only: a safety net. If the forum's time ran out and the flow has not wrapped up a little later, end it. */
  useEffect(() => {
    if (!isHost || room?.status !== "live" || !room.endsAt || ending) return;
    if (now > Date.parse(room.endsAt) + 20000) endEarly();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- endEarly reads everything through refs
  }, [now, isHost, room?.status, room?.endsAt, ending]);

  /* Everyone: plays whoever is talking live, as long as "Speak replies" is on. */
  const isLive = room?.status === "live";
  useEffect(() => {
    if (!isLive || !userId) return;
    return listen(
      id,
      userId,
      (from, stream) => {
        const el = liveAudioRef.current;
        if (!el) return;
        el.srcObject = stream;
        el.play().catch(() => setError("Your browser blocked live audio. Click anywhere on the page to allow it."));
        setHearing(from);
      },
      (from) => setHearing((h) => (h === from ? null : h)),
    );
  }, [id, isLive, userId]);
  useEffect(() => {
    if (liveAudioRef.current) liveAudioRef.current.muted = !speakOn;
  }, [speakOn]);

  /* Whether to offer video at all. */
  useEffect(() => {
    let on = true;
    zoomAvailable().then((ok) => on && setVideoReady(ok));
    return () => {
      on = false;
    };
  }, []);

  /* Everyone: live ballots for the vote that is open or was last held. */
  const voteId = room?.voting?.id;
  useEffect(() => {
    if (!voteId) return;
    return watchBallots(id, voteId, setBallots);
  }, [id, voteId]);

  /* When the session ends, keep a copy in this person's own account and open the report page. */
  useEffect(() => {
    if (room?.status === "live") wasLiveRef.current = true;
  }, [room?.status]);
  useEffect(() => {
    if (!room || room.status !== "ended" || !room.report || !userId || !loaded || savedCopyRef.current) return;
    savedCopyRef.current = true;
    const mine = members.find((m) => m.userId === userId);
    const copy: Session = {
      id: room.id,
      mode: "table",
      committee: room.committee,
      topic: room.topic,
      humanCountry: mine?.country ?? "",
      aiCountries: room.aiCountries,
      lines: linesRef.current.map((l) => ({ id: l.id, speaker: l.speaker, kind: l.kind, text: l.text })),
      updatedAt: Date.now(),
      phase: "ended",
      report: room.report,
      startedAt: Date.parse(room.createdAt),
      endedAt: room.endedAt ? Date.parse(room.endedAt) : Date.now(),
      judge: room.judge,
      source: "room",
    };
    saveSession(copy);
    if (wasLiveRef.current) flushSaves().then(() => router.push(`/report/${room.id}`));
  }, [room, members, userId, loaded, router]);

  /* Realtime can miss an event now and then. Re-reading the room every few seconds means nobody is
     stuck waiting for a turn, and the host never misses a delegate's speech. */
  useEffect(() => {
    if (!loaded || !userId) return;
    const t = setInterval(async () => {
      const r = roomRef.current;
      if (!r || r.status === "ended") return;
      /* Host only, a watchdog: if this tab's forum engine has stopped while the forum is live (the page was
         refreshed in the background, a hot reload, a crash), start it again from the turn it was on. */
      if (r.hostId === userId && r.status === "live" && r.phase !== "lobby" && !flowRunRef.current && !finishingRef.current && !startingRef.current) {
        resumedRef.current = true;
        drive(r.phase as Stage, r.cursor);
      }
      try {
        const [fresh, l] = await Promise.all([r.hostId === userId ? Promise.resolve(null) : getRoom(id), listRoomLines(id)]);
        if (fresh) {
          roomRef.current = fresh;
          setRoom(fresh);
        }
        l.forEach(receive);
      } catch {
        // the next tick will try again
      }
    }, 4000);
    return () => clearInterval(t);
  }, [loaded, userId, id, receive, drive]);

  useEffect(() => {
    const el = chatRef.current;
    if (!el || !stickRef.current) return;
    el.scrollTo({
      top: el.scrollHeight,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  }, [lines, aiBusy]);

  /* ----- Dictation into the message box ----- */
  const dictation = useDictation(
    useCallback((t: string) => setInput((cur) => (cur && !cur.endsWith(" ") ? `${cur} ${t}` : `${cur}${t}`)), []),
  );

  function clearClip() {
    setClip((c) => {
      if (c) URL.revokeObjectURL(c.url);
      return null;
    });
  }

  /* AI voice: dictation fills the box. Own voice: "Unmute" records you (with live captions in the box). */
  async function beginSpeaking() {
    clearClip();
    dictation.start();
    if (speakMode === "own") await recorder.start();
  }

  function chooseMode(m: SpeakMode) {
    if (dictation.listening || recorder.recording || broadcasting) return;
    setSpeakMode(m);
    clearClip();
    try {
      localStorage.setItem("bridgemun.speakMode", m);
    } catch {
      // the choice still applies until the page is reloaded
    }
  }

  /* Talking live: the microphone goes to everyone in the room now, and the captions become the speech's text. */
  async function goLive() {
    if (!room || !userId || broadcasting) return;
    setError(null);
    try {
      const listeners = membersRef.current.filter((m) => m.userId !== userId).map((m) => m.userId);
      liveRef.current = await broadcast(room.id, userId, listeners);
      setLivePaused(false);
      setBroadcasting(true);
      dictation.start();
    } catch (e) {
      setError(
        e instanceof DOMException && e.name === "NotAllowedError"
          ? "Microphone access was blocked. Allow it in your browser settings."
          : friendlyRoomError(e instanceof Error ? e.message : "Could not go live."),
      );
    }
  }

  /* Pausing mutes the microphone and the captions; the connection stays open so resuming is instant. */
  function togglePause() {
    const live = liveRef.current;
    if (!live) return;
    const next = !livePaused;
    live.setPaused(next);
    setLivePaused(next);
    if (next) dictation.stop();
    else dictation.start();
  }

  async function endLive(andSend: boolean) {
    dictation.stop();
    const live = liveRef.current;
    liveRef.current = null;
    setBroadcasting(false);
    setLivePaused(false);
    await live?.stop().catch(() => {});
    if (andSend) await send(input.trim() || "(Spoke live)", false, true);
  }

  async function chooseVoice(v: number) {
    rememberVoice(v);
    if (!room) return;
    try {
      await setMyVoice(room.id, v);
    } catch (e) {
      setError(friendlyRoomError(e instanceof Error ? e.message : "Could not change your voice."));
    }
  }

  const previewVoice = (v: number) =>
    preview.speak(`Honourable Chair, distinguished delegates. This is how the room will hear my speeches.`, v);

  async function endSpeaking() {
    dictation.stop();
    if (recorder.recording) {
      const blob = await recorder.stop();
      if (blob) setClip({ blob, url: URL.createObjectURL(blob) });
    }
  }

  /* When the turn ends, stop listening and throw away an unfinished recording. */
  useEffect(() => {
    if (myTurn) return;
    dictation.stop();
    recorder.stop();
    if (liveRef.current) endLive(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTurn]);

  useEffect(() => {
    lateJoinRef.current = (mm) => {
      const r = roomRef.current;
      if (!r || r.status !== "live" || r.hostId !== userId) return;
      const fresh = mm.filter((m) => !m.moderator && !r.turnOrder.some((t) => t.userId === m.userId));
      if (!fresh.length) return;
      const order = [...r.turnOrder, ...fresh.map((m) => ({ name: m.country || m.name, kind: "human" as const, userId: m.userId }))];
      patchRoom({ turn_order: order }, { turnOrder: order })
        .then(() => Promise.all(fresh.map((m) => announce(`The delegation of ${m.country || m.name} joins the session.`))))
        .catch(() => {});
    };
  }, [userId, patchRoom, announce]);

  /* Everyone in a seat gets a voice as soon as they are in the room: the one they used last time, or one of their own. */
  const needsVoice = !!room && !!userId && !!me && !me.moderator && me.voice === null;
  useEffect(() => {
    if (!needsVoice || !room || !userId) return;
    setMyVoice(room.id, rememberedVoice() ?? defaultVoice(userId)).catch(() => {});
  }, [needsVoice, room, userId]);

  async function send(text: string, useClip = true, live = false) {
    const attached = useClip && speakMode === "own" ? clip : null;
    const typed = text.trim();
    const body = typed || (attached ? "(Spoken recording)" : "");
    if (!body || !room || !userId || !myTurn || sending || recorder.recording) return;
    if (dictation.listening) dictation.stop();
    setSending(true);
    setError(null);
    stickRef.current = true;
    try {
      let audioPath: string | undefined;
      if (attached) {
        try {
          audioPath = await uploadClip(room.id, userId, attached.blob);
        } catch (e) {
          setError(
            e instanceof Error && e.message.includes("too long")
              ? friendlyRoomError(e.message)
              : "Your recording could not be sent, so the room will hear your words in your AI voice.",
          );
        }
      }
      const line = await postLine(room.id, userId, myLabel, "human", body, { audioPath, live });
      setInput("");
      clearClip();
      receive(line);
    } catch (e) {
      setError(friendlyRoomError(e instanceof Error ? e.message : "Could not send."));
    } finally {
      setSending(false);
    }
  }

  if (!ready || (user && room === undefined)) {
    return (
      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <div className="h-8 w-64 animate-pulse rounded bg-sunk" aria-label="Loading" />
      </main>
    );
  }
  if (!user) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">Sign in to join this room</h1>
        <Link href="/login" className="btn btn-primary mt-6">
          Sign in
        </Link>
      </main>
    );
  }
  if (!room) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">Room not found</h1>
        <p className="mt-3 text-muted">{error ?? "You are not in this room, or it no longer exists. Ask the host for the code."}</p>
        <Link href="/room" className="btn mt-6">
          Back to Online Room
        </Link>
      </main>
    );
  }

  const host = members.find((m) => m.userId === room.hostId);
  const label = (m: RoomMember) => m.country || m.name;
  const current: TurnEntry | null =
    room.status === "live" && room.turnOrder.length ? room.turnOrder[room.cursor % room.turnOrder.length] : null;
  const secondsLeft = room.turnDeadline ? Math.max(0, Math.round((Date.parse(room.turnDeadline) - now) / 1000)) : null;
  const clock = secondsLeft === null ? "" : `${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, "0")}`;
  const stageWord = room.phase === "opening" ? "opening statement" : room.phase === "closing" ? "closing statement" : "turn in the debate";
  const live = room.status === "live";
  const lowTime = secondsLeft !== null && secondsLeft <= 10;
  const sessionLeft = live && room.endsAt ? Date.parse(room.endsAt) - now : null;
  const startsIn = room.status === "lobby" && room.startsAt ? Date.parse(room.startsAt) - now : null;
  const moderator = members.find((m) => m.moderator);

  /* Everyone with a place at the table, in seat order. */
  type Delegation = { country: string; ai: boolean; member?: RoomMember };
  const delegations: Delegation[] = room.seats
    ? room.seats.map((seat) => {
        const member = members.find((m) => !m.moderator && m.country.toLowerCase() === seat.country.toLowerCase());
        return { country: seat.country, ai: seat.ai && !member, member };
      })
    : [
        ...room.aiCountries.filter(Boolean).map((c) => ({ country: c, ai: true })),
        ...members.filter((m) => !m.moderator).map((m) => ({ country: label(m), ai: false, member: m })),
      ];
  const isSpeaking = (d: Delegation) =>
    speakingWho === d.country ||
    (live && !!d.member && room.turnUser === d.member.userId) ||
    (live && d.ai && !room.turnUser && current?.kind === "ai" && current.name === d.country);
  const speakingNow = delegations.find(isSpeaking);
  const emptySeats = room.seats ? delegations.filter((d) => !d.member) : [];
  const joined = delegations.filter((d) => d.member).length;
  const inDebate = delegations.filter((d) => d.member || d.ai);

  const voting = room.voting;
  // Ballots from an earlier vote can linger for a moment after a new one opens.
  const ballots = voting ? allBallots.filter((b) => b.voteId === voting.id) : [];
  const myBallot = ballots.find((b) => b.userId === userId);
  const canVote = live && voting?.status === "open" && !!me && !me.moderator;
  const count = (k: Ballot["vote"]) => ballots.filter((b) => b.vote === k).length;
  const voters = delegations.filter((d) => d.member || d.ai).length;

  /* Who has the floor, shown in the dark tile (under the video button when the forum has Zoom). */
  const floorCard = speakingNow ? (
    <>
      <span className="pulse-ring flex size-24 items-center justify-center overflow-hidden rounded-full ring-4 ring-white/20">
        <Flag country={speakingNow.country} className="h-24 w-24 rounded-full" />
      </span>
      <p className="mt-4 text-center font-display text-xl font-bold">{speakingNow.country}</p>
      <p className="text-sm text-white/70">{speakingNow.ai ? "AI delegate" : speakingNow.member?.name}</p>
    </>
  ) : (
    <>
      <span className="flex size-20 items-center justify-center rounded-full bg-white/10 font-display text-3xl font-bold">
        {(moderator?.name ?? host?.name ?? "M").slice(0, 1).toUpperCase()}
      </span>
      <p className="mt-4 text-sm text-white/70">{live ? (room.judge ? "The judge has the floor" : "The floor is open") : "Waiting to start"}</p>
    </>
  );

  if (room.status === "ended") {
    return (
      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6" style={toneStyle("room")}>
        <p className="text-sm text-muted">Forum adjourned</p>
        <h1 className="font-display text-3xl font-bold tracking-tight">{room.topic}</h1>
        {room.subtopic && <p className="font-medium">{room.subtopic}</p>}
        <p className="text-sm text-muted">{room.committee}</p>
        <div className="tone-card mt-6 p-5">
          <h2 className="text-lg font-semibold tracking-tight">{room.report ? "Your report is ready" : "Preparing the report"}</h2>
          <p className="mt-1 max-w-[60ch] text-sm text-muted">
            {room.report
              ? "It is saved in your account under Past chats, together with this transcript and your coaching."
              : "This takes a few seconds."}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            {room.report && (
              <Link href={`/report/${room.id}`} className="btn btn-primary">
                Open the report
              </Link>
            )}
            <Link href="/history" className="btn">
              Past chats
            </Link>
            <Link href="/room" className="btn">
              Close
            </Link>
          </div>
        </div>
        {error && (
          <p role="alert" className="mt-4 text-sm text-danger">
            {error}
          </p>
        )}
        <h2 className="mb-2 mt-8 text-lg font-semibold tracking-tight">Transcript</h2>
        <Transcript lines={lines} userId={userId} />
      </main>
    );
  }

  return (
    <main className="mx-auto flex max-w-[90rem] flex-col px-4 py-4 sm:px-6 xl:h-[calc(100dvh-4rem)] xl:overflow-hidden" style={toneStyle("room")}>
      {/* ---------- Agenda bar ---------- */}
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-line pb-3">
        <div className="flex min-w-0 items-center gap-3">
          <span className="shrink-0 rounded-[var(--radius-ui)] border border-line bg-surface px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-muted">
            Current agenda
          </span>
          <div className="min-w-0">
            <h1 className="truncate font-display text-xl font-bold leading-tight sm:text-2xl">{room.topic}</h1>
            <p className="truncate text-sm text-muted">
              {room.subtopic ? `${room.subtopic} · ` : ""}
              {room.committee}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {live ? (
            <span className="flex items-center gap-1.5 rounded-full bg-danger px-3 py-1 text-xs font-bold uppercase tracking-wider text-white">
              <span className="size-2 animate-pulse rounded-full bg-white" aria-hidden="true" /> On air
            </span>
          ) : (
            <span className="rounded-full border border-line px-3 py-1 text-xs font-bold uppercase tracking-wider text-muted">Lobby</span>
          )}
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={speakOn}
              onChange={(e) => {
                setSpeakOn(e.target.checked);
                if (!e.target.checked) {
                  queueRef.current = [];
                  speaker.stop();
                  setSpeakingWho(null);
                }
              }}
              className="size-4 accent-[var(--accent)]"
            />
            Speak replies
          </label>
          {(speaker.playing || speaker.loading) && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                queueRef.current = [];
                speaker.stop();
              }}
            >
              <Stop aria-hidden="true" size={16} weight="fill" /> Silence
            </button>
          )}
          <button
            type="button"
            className="btn"
            onClick={async () => {
              if (!isHost && userId && room.status === "lobby") await leaveRoom(room.id, userId).catch(() => {});
              router.push("/room");
            }}
          >
            <SignOut aria-hidden="true" size={16} /> Leave
          </button>
        </div>
      </div>

      {/* ---------- Once live: every delegation as a small bubble; the speaker glows green ---------- */}
      {live && (
        <div className="mt-3 flex shrink-0 items-center gap-4 overflow-x-auto rounded-[var(--radius-ui)] border border-line bg-surface px-4 py-2.5">
          <p className="shrink-0 text-[11px] font-bold uppercase leading-tight tracking-wider text-muted">
            Delegations
            <span className="block font-normal normal-case tracking-normal">
              {inDebate.length} · {joined} {joined === 1 ? "person" : "people"}
            </span>
          </p>
          <ul className="flex items-start gap-3" aria-label="Delegations">
            {/* Empty seats only matter to the host, who can give them to the AI; everyone else sees who is debating. */}
            {(isHost ? delegations : inDebate).map((d) => {
              const speaking = isSpeaking(d);
              const mine = !!userId && d.member?.userId === userId;
              const empty = !d.member && !d.ai;
              const canToggle = isHost && !!room.seats && !d.member;
              const title = `${d.country}: ${speaking ? "speaking" : d.member ? `${d.member.name}${d.member.userId === userId ? " (you)" : ""}` : d.ai ? "AI delegate" : "empty"}${
                canToggle ? (d.ai ? ". Click to turn the AI off." : ". Click to turn AI on.") : ""
              }`;
              const bubble = (
                <span className="relative block size-11">
                  {speaking && <span aria-hidden="true" className="absolute inset-0 rounded-full bg-[#22c55e]/40 motion-safe:animate-ping" />}
                  <span
                    className={`relative block size-11 overflow-hidden rounded-full transition-shadow ${
                      // Your own country always has a blue ring, outside the green one while you speak.
                      speaking && mine
                        ? "shadow-[0_0_0_3px_#22c55e,0_0_0_5px_var(--surface),0_0_0_8px_var(--accent),0_0_16px_4px_rgba(34,197,94,0.5)]"
                        : speaking
                          ? "shadow-[0_0_0_3px_#22c55e,0_0_14px_2px_rgba(34,197,94,0.55)]"
                          : mine
                            ? "shadow-[0_0_0_3px_var(--accent),0_0_0_5px_var(--surface),0_0_10px_3px_color-mix(in_oklab,var(--accent)_45%,transparent)]"
                            : "shadow-[0_0_0_1px_var(--line)]"
                    } ${empty ? "opacity-35 grayscale" : ""}`}
                  >
                    <Flag country={d.country} className="h-11 w-11" />
                  </span>
                  {d.ai && (
                    <span className="absolute -bottom-0.5 -right-0.5 flex size-[18px] items-center justify-center rounded-full bg-[var(--violet)] shadow-[0_0_0_2px_var(--surface)]">
                      <Robot aria-hidden="true" size={11} weight="fill" color="#0c2b4b" />
                    </span>
                  )}
                </span>
              );
              return (
                <li key={d.country} className="flex w-14 shrink-0 flex-col items-center gap-1">
                  {canToggle ? (
                    <button
                      type="button"
                      title={title}
                      aria-label={title}
                      aria-pressed={d.ai}
                      disabled={seatBusy !== null}
                      onClick={() => toggleSeatAi(d.country)}
                      className="rounded-full transition-transform hover:scale-105 disabled:opacity-60"
                    >
                      {bubble}
                    </button>
                  ) : (
                    <span title={title} aria-label={title} role="img">
                      {bubble}
                    </span>
                  )}
                  <span
                    className={`w-full truncate text-center text-[10px] font-semibold leading-tight ${
                      speaking ? "text-[#16a34a]" : mine ? "text-accent" : "text-muted"
                    }`}
                  >
                    {d.country}
                  </span>
                  {mine && (
                    <span className="-mt-0.5 rounded-full bg-accent px-1.5 text-[9px] font-bold uppercase leading-[14px] tracking-wider text-accent-ink">
                      You
                    </span>
                  )}
                </li>
              );
            })}
            {!isHost && room.lateJoin && emptySeats.length > 0 && (
              <li className="flex h-11 shrink-0 items-center self-start rounded-full border border-dashed border-line px-3 text-xs font-semibold text-muted">
                +{emptySeats.length} open {emptySeats.length === 1 ? "seat" : "seats"}
              </li>
            )}
          </ul>
        </div>
      )}

      <div
        className={`mt-4 grid min-h-0 flex-1 gap-4 ${
          live ? "xl:grid-cols-[17rem_minmax(0,1fr)_22rem]" : "xl:grid-cols-[18rem_minmax(0,1fr)_24rem]"
        }`}
      >
        {/* ---------- Clock and floor ---------- */}
        <div className="grid content-start gap-4 sm:grid-cols-2 xl:grid-cols-1">
          <div
            role="timer"
            aria-label={live ? "Time left in the forum" : "Time until the forum starts"}
            className="rounded-[var(--radius-ui)] bg-accent px-5 py-4 text-center text-accent-ink shadow-sm"
          >
            <p className="flex items-center justify-center gap-1.5 text-xs font-bold uppercase tracking-wider opacity-80">
              <Timer aria-hidden="true" size={14} weight="bold" />
              {live ? (sessionLeft !== null ? "Remaining" : "Speaker's time") : startsIn !== null && startsIn > 0 ? "Starts in" : room.endAt ? "Ends at" : room.durationMin ? "Length" : "No end time"}
            </p>
            <p className="font-display text-5xl font-bold tabular-nums leading-tight">
              {live
                ? sessionLeft !== null
                  ? mmss(sessionLeft)
                  : clock || "–:––"
                : startsIn !== null && startsIn > 0
                  ? mmss(startsIn)
                  : room.durationMin
                    ? `${room.durationMin}:00`
                    : room.endAt
                      ? new Date(room.endAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
                      : "∞"}
            </p>
            {live && (
              <p className="text-xs opacity-80">
                {room.endsAt ? `ends ${new Date(room.endsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : "No end time"} ·{" "}
                {PHASE_LABEL[room.phase as RoomPhase]}
              </p>
            )}
            {!live && <p className="text-xs opacity-80">{room.startsAt ? new Date(room.startsAt).toLocaleString([], { weekday: "short", hour: "numeric", minute: "2-digit" }) : "Starts when the host is ready"}</p>}
          </div>

          <div className="relative flex aspect-[4/3] flex-col items-center justify-center overflow-hidden rounded-[var(--radius-ui)] bg-[#0c1a2b] p-4 text-white xl:aspect-[3/4]">
            {live && room.zoom ? (
              <ZoomTile meetingNumber={room.zoom.meetingNumber} password={room.zoom.password} userName={myLabel}>
                {floorCard}
              </ZoomTile>
            ) : (
              floorCard
            )}
            {live && secondsLeft !== null && (
              <p
                className={`absolute right-3 top-3 rounded-full px-2.5 py-0.5 font-mono text-sm font-semibold ${lowTime ? "bg-danger" : "bg-white/15"}`}
                aria-label="Time left for this speaker"
              >
                {clock}
              </p>
            )}
            <p className="absolute bottom-3 left-3 text-xs text-white/70">
              {speakingNow ? `${speakingNow.country} (speaking)` : "Floor"}
            </p>
            {(hearing || broadcasting) && (
              <p className="absolute left-3 top-3 flex items-center gap-1.5 rounded-full bg-danger px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider">
                <span className="size-1.5 animate-pulse rounded-full bg-white" aria-hidden="true" />{" "}
                {broadcasting ? (livePaused ? "You are paused" : "You are live") : "Live voice"}
              </p>
            )}
            <audio ref={liveAudioRef} autoPlay className="hidden" />
          </div>
        </div>

        {/* ---------- Moderator panel and delegations ---------- */}
        <div className={`flex min-h-0 flex-col gap-4 xl:overflow-y-auto xl:pr-1 ${live ? "xl:order-3" : ""}`}>
          <section className="tone-card p-4 sm:p-5" aria-labelledby="mod-title">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 id="mod-title" className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-accent">
                <ShieldCheck aria-hidden="true" size={16} weight="bold" /> Moderator
                <span className="font-normal normal-case tracking-normal text-muted">
                  {moderator ? `${moderator.name}${moderator.userId === userId ? " (you)" : ""}` : host ? `${host.name}, host` : ""}
                </span>
              </h2>
              {isHost && live && videoReady && !room.zoom && (
                <button type="button" className="btn" disabled={videoBusy} onClick={addVideo}>
                  {videoBusy ? "Starting video…" : "Start video"}
                </button>
              )}
              {isHost && live && (
                <button type="button" className="btn border-danger text-danger" disabled={ending} onClick={endEarly}>
                  {ending ? "Ending…" : "End forum session"}
                </button>
              )}
            </div>

            {/* Lobby: invite and start */}
            {room.status === "lobby" && (
              <div className="mt-4">
                <p className="text-sm text-muted">
                  {isHost ? "Share this code. People pick an open country when they join." : `Waiting for ${host ? host.name : "the host"} to start.`}
                </p>
                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <code className="rounded-[var(--radius-ui)] border border-line bg-sunk px-4 py-2 font-mono text-xl tracking-widest">{room.code}</code>
                  <button
                    type="button"
                    className="btn"
                    onClick={async () => {
                      try {
                        await navigator.clipboard.writeText(room.code);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 1800);
                      } catch {
                        setError("Your browser blocked copying. Select the code and copy it by hand.");
                      }
                    }}
                  >
                    {copied ? <Check aria-hidden="true" size={16} /> : <Copy aria-hidden="true" size={16} />}
                    {copied ? "Copied" : "Copy code"}
                  </button>
                  {isHost && (
                    <button type="button" className="btn btn-primary" disabled={starting} onClick={start}>
                      <Play aria-hidden="true" size={16} weight="fill" />
                      {starting ? "Starting…" : startsIn !== null && startsIn > 0 ? "Start now" : "Start the forum"}
                    </button>
                  )}
                </div>
                {isHost && <p className="helper">The forum runs from this tab once it starts, so keep it open.</p>}
              </div>
            )}

            {/* Floor voting */}
            {live && (
              <div className="mt-4 rounded-[var(--radius-ui)] border border-[var(--sun)] bg-[color-mix(in_oklab,var(--sun)_14%,var(--surface))] p-3.5">
                <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider">
                  <CheckSquare aria-hidden="true" size={15} weight="bold" /> Floor voting
                </p>
                {voting?.status === "open" ? (
                  <>
                    <p className="mt-1.5 font-medium">{voting.question}</p>
                    <p className="mt-1 text-sm text-muted">
                      {ballots.length} of {voters} voted · {count("for")} for · {count("against")} against · {count("abstain")} abstain
                    </p>
                    {canVote && (
                      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Your vote">
                        {(["for", "against", "abstain"] as const).map((v) => (
                          <button
                            key={v}
                            type="button"
                            aria-pressed={myBallot?.vote === v}
                            className={`btn capitalize ${myBallot?.vote === v ? "btn-primary" : ""}`}
                            onClick={() =>
                              castBallot(room.id, voting.id, myLabel, v).catch((e) =>
                                setError(friendlyRoomError(e instanceof Error ? e.message : "Your vote was not counted.")),
                              )
                            }
                          >
                            {v}
                          </button>
                        ))}
                      </div>
                    )}
                    {isHost && (
                      <button type="button" className="btn mt-3 w-full" disabled={voteBusy} onClick={closeVote}>
                        {voteBusy ? "Please wait…" : "Close voting and announce the result"}
                      </button>
                    )}
                  </>
                ) : (
                  <>
                    <p className="mt-1 text-sm text-muted">
                      {voting
                        ? `Last vote: ${voting.question}. ${count("for")} for, ${count("against")} against, ${count("abstain")} abstain.`
                        : "Open voting while the forum is live so delegates can cast ballots before the session ends."}
                    </p>
                    {isHost && (
                      <form
                        className="mt-3 grid gap-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          openVote();
                        }}
                      >
                        <label htmlFor="vote-q" className="sr-only">
                          What delegates vote on
                        </label>
                        <input
                          id="vote-q"
                          className="field min-w-0 flex-1"
                          maxLength={300}
                          autoComplete="off"
                          value={question}
                          placeholder="The draft resolution on sea-level rise…"
                          onChange={(e) => setQuestion(e.target.value)}
                        />
                        <button
                          type="submit"
                          disabled={voteBusy || question.trim().length < 3}
                          className="btn border-ink bg-[var(--sun)] font-bold text-[#0c2b4b]"
                        >
                          {voteBusy ? "Opening…" : "Open floor voting"}
                        </button>
                      </form>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Active speaker */}
            {live && (
              <p className="mt-4 flex items-center gap-2 rounded-[var(--radius-ui)] bg-sunk px-3.5 py-2.5 text-sm" role="status">
                {myTurn ? (
                  <>
                    <Microphone aria-hidden="true" size={16} weight="fill" className="text-danger" />
                    <span>
                      <span className="font-semibold">Your turn.</span> Give your {stageWord}.
                    </span>
                  </>
                ) : speakingNow ? (
                  <>
                    <Flag country={speakingNow.country} className="h-4 w-6" />
                    <span>
                      <span className="font-semibold">{speakingNow.country}</span> {room.turnUser ? "has the floor" : "is speaking"}
                    </span>
                  </>
                ) : (
                  <span className="text-muted">{aiBusy ? "The AI is preparing a reply…" : room.judge ? "The judge is speaking." : "No active speaker"}</span>
                )}
              </p>
            )}

            {/* Empty countries, with AI on/off */}
            {!live && room.seats && emptySeats.length > 0 && (
              <div className="mt-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-muted">
                  Empty countries {isHost && <span className="font-normal normal-case tracking-normal">· turn on AI to fill a seat</span>}
                </p>
                <ul className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
                  {emptySeats.map((d) => (
                    <li key={d.country} className="flex flex-col gap-2 rounded-[var(--radius-ui)] border border-line bg-surface p-2.5">
                      <span className="flex min-w-0 items-center gap-2">
                        <Flag country={d.country} />
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-bold uppercase">{d.country}</span>
                          <span className="block text-[11px] text-muted">{d.ai ? "AI delegate" : "Waiting…"}</span>
                        </span>
                      </span>
                      {isHost ? (
                        <button
                          type="button"
                          aria-pressed={d.ai}
                          disabled={seatBusy !== null}
                          onClick={() => toggleSeatAi(d.country)}
                          className={`rounded-full border px-2 py-1 text-[11px] font-bold transition-colors ${
                            d.ai ? "border-ink bg-[var(--violet)] text-[#0c2b4b]" : "border-line text-muted hover:border-ink"
                          }`}
                        >
                          {seatBusy === d.country ? "…" : d.ai ? "AI ON" : "AI OFF"}
                        </button>
                      ) : (
                        <span className="text-center text-[11px] font-bold text-muted">{d.ai ? "AI ON" : "AI OFF"}</span>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </section>

          {/* Delegations: the full grid only before the start; once live, the bubble strip above takes over */}
          {!live && (
          <section className="tone-card p-4 sm:p-5" aria-labelledby="del-title">
            <h2 id="del-title" className="flex flex-wrap items-center gap-2 text-xs font-bold uppercase tracking-wider text-accent">
              <UsersThree aria-hidden="true" size={16} weight="bold" /> Delegations ({delegations.length})
              {moderator && <span className="text-muted">+ 1 moderator</span>}
              <span className="font-normal normal-case tracking-normal text-muted">
                · {joined} {joined === 1 ? "person" : "people"} joined
              </span>
            </h2>
            <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {delegations.map((d) => {
                const speaking = isSpeaking(d);
                return (
                  <li
                    key={d.country}
                    className={`flex items-center gap-2 rounded-[var(--radius-ui)] border p-2.5 transition-colors ${
                      speaking
                        ? "border-accent bg-accent text-accent-ink"
                        : d.member?.userId === userId
                          ? "border-accent bg-[color-mix(in_oklab,var(--accent)_10%,var(--surface))] ring-2 ring-accent"
                          : d.member || d.ai
                            ? "border-line bg-surface"
                            : "border-dashed border-line"
                    }`}
                  >
                    <Flag country={d.country} />
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-bold uppercase">{d.country}</span>
                      <span className={`block truncate text-[11px] ${speaking ? "" : "text-muted"}`}>
                        {speaking
                          ? "Speaking"
                          : d.member
                            ? `${d.member.name}${d.member.userId === userId ? " (you)" : ""}`
                            : d.ai
                              ? "AI delegate"
                              : live
                                ? "Empty"
                                : "Waiting…"}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
          )}
          {me && (
            <NotesPanel
              roomId={room.id}
              limitSeconds={live && room.phase !== "lobby" ? limitFor(room, room.phase) : room.limits ? room.limits.opening : null}
              canUse={myTurn && !me.moderator}
              onUse={(text) => setInput(text)}
            />
          )}
        </div>

        {/* ---------- Transcript and speaking ---------- */}
        <div className={`flex min-h-[28rem] flex-col rounded-[var(--radius-ui)] border border-line bg-surface p-3 xl:min-h-0 ${live ? "xl:order-2" : ""}`}>
          <h2 className="shrink-0 px-1 text-xs font-bold uppercase tracking-wider text-muted">Transcript</h2>
          <div
            ref={chatRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
            }}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-1 py-3"
            aria-live="polite"
          >
            {!live && me && !me.moderator && (
              <VoicePicker
                value={me.voice ?? defaultVoice(userId)}
                onChange={chooseVoice}
                onPreview={previewVoice}
                previewing={preview.playing || preview.loading}
              />
            )}
            {lines.length === 0 && <p className="mt-4 text-sm text-muted">{live ? "No one has spoken yet." : "Speeches will appear here once the forum starts."}</p>}
            <Transcript lines={lines} userId={userId} />
          </div>

          {error && (
            <p role="alert" className="mb-2 shrink-0 text-sm text-danger">
              {error}
            </p>
          )}
          {recorder.error && (
            <p role="alert" className="mb-2 shrink-0 text-sm text-danger">
              {recorder.error}
            </p>
          )}
          {dictation.error && (
            <p role="alert" className="mb-2 shrink-0 text-sm text-danger">
              {dictation.error}
            </p>
          )}
          {dictation.interim && <p className="mb-2 shrink-0 text-sm italic text-muted">{dictation.interim}</p>}

          {live && me?.moderator && (
            <p className="shrink-0 border-t border-line pt-3 text-sm text-muted">
              You are moderating, so you do not take turns. Use the moderator panel to run votes and end the forum.
            </p>
          )}
          {live && !me?.moderator && (
            <div className="shrink-0 border-t border-line bg-background pb-1 pt-3">
              {/* How the room hears you */}
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <div role="radiogroup" aria-label="How the room hears you" className="inline-flex rounded-full border border-line bg-surface p-0.5 text-xs font-semibold">
                  {(
                    [
                      ["ai", "AI voice", Robot, true],
                      ["own", "Record", Microphone, recorder.supported],
                      ["live", "Talk live", Broadcast, typeof RTCPeerConnection !== "undefined"],
                    ] as const
                  ).map(([m, name, Icon, ok]) => (
                    <button
                      key={m}
                      type="button"
                      role="radio"
                      aria-checked={speakMode === m}
                      disabled={!ok || dictation.listening || recorder.recording || broadcasting}
                      onClick={() => chooseMode(m)}
                      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 transition-colors disabled:opacity-50 ${
                        speakMode === m ? "bg-accent text-accent-ink" : "text-muted hover:text-ink"
                      }`}
                    >
                      <Icon aria-hidden="true" size={14} weight={speakMode === m ? "fill" : "regular"} /> {name}
                    </button>
                  ))}
                </div>
                {speakMode === "ai" && me && (
                  <span className="flex items-center gap-1.5">
                    <label htmlFor="my-voice" className="sr-only">
                      Your AI voice
                    </label>
                    <select
                      id="my-voice"
                      className="rounded-full border border-line bg-surface px-3 py-1.5 text-xs font-semibold"
                      value={me.voice ?? defaultVoice(userId)}
                      onChange={(e) => chooseVoice(Number(e.target.value))}
                    >
                      {PERSON_VOICES.map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name}, {v.note.toLowerCase()}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="rounded-full border border-line p-1.5 text-muted hover:text-ink"
                      aria-label="Hear this voice"
                      title="Hear this voice"
                      onClick={() => (preview.playing || preview.loading ? preview.stop() : previewVoice(me.voice ?? defaultVoice(userId)))}
                    >
                      {preview.playing || preview.loading ? <Stop aria-hidden="true" size={14} weight="fill" /> : <SpeakerHigh aria-hidden="true" size={14} />}
                    </button>
                  </span>
                )}
              </div>
              {speakMode === "own" && clip && (
                <div className="mb-2 flex items-center gap-2 rounded-[var(--radius-ui)] border border-line bg-surface px-3 py-2">
                  <audio controls src={clip.url} className="h-9 min-w-0 flex-1" aria-label="Your recording" />
                  <button type="button" className="btn" onClick={clearClip} aria-label="Remove the recording">
                    <X aria-hidden="true" size={16} />
                  </button>
                </div>
              )}
              <label htmlFor="say" className="sr-only">
                Your speech
              </label>
              <textarea
                id="say"
                rows={3}
                value={input}
                disabled={!myTurn}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send(input);
                  }
                }}
                className="field resize-none disabled:opacity-60"
                placeholder={
                  !myTurn
                    ? "You can speak when the judge calls on you."
                    : speakMode === "live"
                      ? "Press Go live and talk: everyone hears you now. Your words appear here as captions…"
                      : speakMode === "own"
                      ? "Press Unmute and talk. Your words appear here as captions…"
                      : `Type or dictate as ${myLabel}. Your AI voice reads it out. Enter to send…`
                }
              />
              <div className="mt-2 flex flex-wrap justify-between gap-2">
                <div className="flex flex-wrap gap-2">
                  {speakMode === "live" ? (
                    broadcasting ? (
                      <>
                        <button
                          type="button"
                          onClick={togglePause}
                          aria-pressed={livePaused}
                          className={`btn ${livePaused ? "" : "btn-live pulse-ring"}`}
                        >
                          {livePaused ? (
                            <>
                              <Microphone aria-hidden="true" size={18} /> Resume
                            </>
                          ) : (
                            <>
                              <MicrophoneSlash aria-hidden="true" size={18} /> Pause
                            </>
                          )}
                        </button>
                        <button type="button" onClick={() => endLive(true)} className="btn btn-primary">
                          {livePaused ? "Paused" : "Live"} · End and send
                        </button>
                      </>
                    ) : (
                      <button type="button" onClick={goLive} disabled={!myTurn} className="btn">
                        <Broadcast aria-hidden="true" size={18} /> Go live
                      </button>
                    )
                  ) : speakMode === "own" ? (
                    <button
                      type="button"
                      onClick={recorder.recording ? endSpeaking : beginSpeaking}
                      disabled={!myTurn || !recorder.supported}
                      aria-pressed={recorder.recording}
                      className={`btn ${recorder.recording ? "btn-live pulse-ring" : ""}`}
                    >
                      {recorder.recording ? (
                        <MicrophoneSlash aria-hidden="true" size={18} weight="fill" />
                      ) : (
                        <Microphone aria-hidden="true" size={18} />
                      )}
                      {recorder.recording ? "Mute" : clip ? "Record again" : "Unmute"}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={dictation.listening ? endSpeaking : beginSpeaking}
                      disabled={!myTurn || !dictation.supported}
                      aria-pressed={dictation.listening}
                      className={`btn ${dictation.listening ? "btn-live pulse-ring" : ""}`}
                    >
                      {dictation.listening ? <Stop aria-hidden="true" size={18} weight="fill" /> : <Microphone aria-hidden="true" size={18} />}
                      {dictation.listening ? "Stop" : "Dictate"}
                    </button>
                  )}
                  <button type="button" className="btn" disabled={!myTurn || sending} onClick={() => send(YIELD_TEXT, false)}>
                    Yield the floor
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => send(input)}
                  disabled={!myTurn || sending || recorder.recording || broadcasting || (!input.trim() && !(speakMode === "own" && clip))}
                  className="btn btn-primary"
                >
                  <ArrowUp aria-hidden="true" size={18} weight="bold" />
                  {sending ? "Sending…" : "Send"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ---------- Your speaking times, shown once when the forum starts ---------- */}
      {live && room.limits && me && !me.moderator && !timesSeen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation">
          <div role="dialog" aria-modal="true" aria-labelledby="times-title" className="tone-card w-full max-w-md p-6">
            <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-accent">
              <Timer aria-hidden="true" size={16} weight="bold" /> Your speaking time
            </p>
            <h2 id="times-title" className="mt-1 font-display text-2xl font-bold">
              {me.country || myLabel}, here is your time
            </h2>
            <p className="mt-1 text-sm text-muted">
              {room.endsAt
                ? `The forum's time is shared equally between ${room.lateJoin && room.seats ? room.seats.length : room.turnOrder.length} countries. It ends at ${new Date(room.endsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.`
                : "This forum has no end time, so everyone gets the standard times."}
            </p>
            <dl className="mt-4 divide-y divide-line rounded-[var(--radius-ui)] border border-line">
              {(
                [
                  ["opening", "Opening statement"],
                  ["debate", `Each debate turn (${DEBATE_ROUNDS} rounds or more)`],
                  ["closing", "Closing statement"],
                ] as const
              ).map(([k, name]) => (
                <div key={k} className="flex items-center justify-between px-4 py-2.5">
                  <dt className="text-sm">{name}</dt>
                  <dd className="font-mono text-lg font-semibold">{mmss(limitFor(room, k) * 1000)}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 text-sm text-muted">
              A timer appears in the corner when it is your turn. If your AI voice reads your speech, it reads a little faster when needed to fit.
            </p>
            <button
              type="button"
              autoFocus
              className="btn btn-primary mt-5 w-full"
              onClick={() => {
                setTimesSeen(true);
                try {
                  sessionStorage.setItem(`bridgemun.times.${id}`, "1");
                } catch {
                  // shown again after a reload, which is harmless
                }
              }}
            >
              Got it
            </button>
          </div>
        </div>
      )}

      {/* ---------- Your turn: a countdown in the corner ---------- */}
      {myTurn && secondsLeft !== null && (
        <div
          role="timer"
          aria-label="Time left for your speech"
          className={`fixed bottom-5 right-5 z-40 flex items-center gap-3 rounded-full border-2 py-2 pl-2 pr-5 shadow-lg ${
            lowTime ? "border-danger bg-danger text-white" : "border-[#22c55e] bg-surface"
          }`}
        >
          <svg viewBox="0 0 36 36" className="size-12 -rotate-90" aria-hidden="true">
            <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="4" />
            <circle
              cx="18"
              cy="18"
              r="15.5"
              fill="none"
              stroke={lowTime ? "#fff" : "#22c55e"}
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${(97.4 * secondsLeft) / Math.max(1, limitFor(room, room.phase === "lobby" ? "debate" : room.phase))} 97.4`}
            />
          </svg>
          <span>
            <span className="block text-[11px] font-bold uppercase tracking-wider opacity-80">Your turn</span>
            <span className="block font-mono text-2xl font-bold tabular-nums leading-none">{clock}</span>
          </span>
        </div>
      )}
    </main>
  );
}

/* The speeches so far. The judge's and moderator's words are set apart from the delegates'. */
function Transcript({ lines, userId }: { lines: RoomLine[]; userId: string | undefined }) {
  return (
    <div className="space-y-4">
      {lines.map((l) =>
        l.kind === "chair" ? (
          <p key={l.id} className="max-w-[72ch] border-l-2 border-line pl-3 text-sm leading-relaxed text-muted">
            <span className="font-medium text-ink">{l.speaker}. </span>
            {l.text}
          </p>
        ) : (
          <div key={l.id} className={l.kind === "human" && l.userId === userId ? "ml-auto max-w-[92%]" : "max-w-[92%]"}>
            <p className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted">
              <Flag country={l.speaker} className="h-3 w-4" />
              {l.speaker}
            </p>
            <div
              className={`break-words rounded-[var(--radius-ui)] border p-3 text-sm leading-relaxed ${
                l.kind === "human" && l.userId === userId ? "border-transparent bg-accent text-accent-ink" : "border-line bg-background"
              }`}
            >
              {l.text}
            </div>
          </div>
        ),
      )}
    </div>
  );
}

/* Before the forum starts: the AI voice that will read this person's speeches, with a preview of each. */
function VoicePicker({
  value,
  onChange,
  onPreview,
  previewing,
}: {
  value: number;
  onChange: (v: number) => void;
  onPreview: (v: number) => void;
  previewing: boolean;
}) {
  return (
    <fieldset className="rounded-[var(--radius-ui)] border border-line bg-background p-3.5">
      <legend className="px-1 text-xs font-bold uppercase tracking-wider text-muted">Your AI voice</legend>
      <p className="text-sm text-muted">
        When you type or dictate a speech, the room hears it in this voice. You can also talk in your own voice during the forum.
      </p>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1">
        {PERSON_VOICES.map((v) => (
          <label
            key={v.id}
            className={`flex cursor-pointer items-center gap-3 rounded-[var(--radius-ui)] border px-3 py-2 transition-colors ${
              value === v.id ? "border-accent bg-[color-mix(in_oklab,var(--accent)_10%,var(--surface))]" : "border-line bg-surface hover:border-ink"
            }`}
          >
            <input type="radio" name="my-voice" className="size-4 accent-[var(--accent)]" checked={value === v.id} onChange={() => onChange(v.id)} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">{v.name}</span>
              <span className="block text-xs text-muted">{v.note}</span>
            </span>
            <button
              type="button"
              className="rounded-full border border-line p-1.5 text-muted hover:text-ink disabled:opacity-50"
              aria-label={`Hear ${v.name}`}
              title={`Hear ${v.name}`}
              disabled={previewing}
              onClick={(e) => {
                e.preventDefault();
                onPreview(v.id);
              }}
            >
              <SpeakerHigh aria-hidden="true" size={14} />
            </button>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
