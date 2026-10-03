"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowUp, Check, Copy, Microphone, Play, Record, Stop, TextT, X } from "@phosphor-icons/react";
import { useAuth, displayName } from "@/lib/auth";
import { useDictation, useRecorder, useSpeaker } from "@/lib/voice";
import { flushSaves, saveSession, type Session } from "@/lib/sessions";
import { usePinHeader } from "@/components/SiteHeader";
import {
  clipUrl,
  friendlyRoomError,
  getRoom,
  leaveRoom,
  listRoomLines,
  listRoomMembers,
  postLine,
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
const LIMIT: Record<"opening" | "debate" | "closing", number> = { opening: 120, debate: 90, closing: 120 };
const PHASE_LABEL: Record<string, string> = {
  lobby: "Waiting to start",
  opening: "Opening statements",
  debate: "Debate",
  closing: "Closing statements",
};

type Stage = "opening" | "debate" | "closing";

const YIELD_TEXT = "Yields the floor.";

/* Each human gets their own voice when their words are read out. Voices 1 to 4; 0 is the AI and 5 the judge. */
function humanVoice(userId: string | null): number {
  let n = 0;
  for (const ch of userId ?? "") n += ch.charCodeAt(0);
  return 1 + (n % 4);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
  const [menuOpen, setMenuOpen] = useState(false);
  const [clip, setClip] = useState<{ blob: Blob; url: string } | null>(null);
  const [sending, setSending] = useState(false);

  const roomRef = useRef<Room | null>(null);
  const membersRef = useRef<RoomMember[]>([]);
  const linesRef = useRef<RoomLine[]>([]);
  const seenRef = useRef(new Set<string>());
  const queueRef = useRef<{ text?: string; clip?: string; voice: number; who: string }[]>([]);
  const drainingRef = useRef(false);
  const speakOnRef = useRef(true);
  const flowRunRef = useRef(false);
  const flowTokenRef = useRef(0);
  const resumedRef = useRef(false);
  const waiterRef = useRef<{ userId: string; done: (r: "spoke" | "timeout" | "cancel", line?: RoomLine) => void } | null>(null);
  const userIdRef = useRef<string | undefined>(undefined);
  const wasLiveRef = useRef(false);
  const savedCopyRef = useRef(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const stickRef = useRef(true);
  const speaker = useSpeaker();
  const speak = speaker.speak; // stable across renders, unlike the speaker object
  const playUrl = speaker.playUrl;
  const stopSpeech = speaker.stop;
  const recorder = useRecorder();

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
        await speak(item.text, item.voice);
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
        if (!speakOnRef.current || src.userId === userIdRef.current || src.text === YIELD_TEXT) return;
        queueRef.current.push(
          src.audioPath
            ? { clip: src.audioPath, voice: 0, who: src.speaker }
            : { text: src.text, voice: humanVoice(src.userId), who: src.speaker },
        );
        drain();
      };

      if (l.kind === "human") {
        // With a judge, the words are read after the judge acknowledges the delegate (see below).
        if (!roomRef.current?.judge) readOut(l);
      } else {
        if (speakOnRef.current) {
          queueRef.current.push({ text: l.text, voice: l.kind === "chair" ? JUDGE_VOICE : 0, who: l.speaker });
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
          const humans = membersRef.current.map((m) => m.country || m.name);
          const res = await fetch("/api/delegate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              mode: r.aiCountries.length > 1 ? "committee" : "table",
              committee: r.committee,
              topic: r.topic,
              humanCountry: humans.join(", ").slice(0, 95),
              aiCountries: r.aiCountries,
              lines: linesRef.current.map((l) => ({ speaker: l.speaker, kind: l.kind, text: l.text })),
              directive,
              judge: r.judge,
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
      if (!r || !r.turnOrder.length) return;
      const entry: TurnEntry = r.turnOrder[i % r.turnOrder.length];
      if (entry.kind === "human" && !membersRef.current.some((m) => m.userId === entry.userId)) return; // they left

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
        return;
      }

      await patchRoom({ phase: stage, cursor: i, turn_user: null, turn_deadline: null }, { phase: stage, cursor: i, turnUser: null, turnDeadline: null });
      await say(`The chair recognizes the delegate of ${entry.name}. You have the floor.`);
      const ms = LIMIT[stage] * 1000;
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
    },
    [patchRoom, runAi, say, waitForHuman],
  );

  const finishSession = useCallback(async () => {
    const r = roomRef.current;
    if (!r) return;
    setEnding(true);
    setError(null);
    try {
      stopSpeech();
      queueRef.current = [];
      await patchRoom({ turn_user: null, turn_deadline: null }, { turnUser: null, turnDeadline: null });
      if (r.judge) await runAi("adjourn");
      const res = await fetch("/api/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "table",
          committee: r.committee,
          topic: r.topic,
          humanCountry: "",
          aiCountries: r.aiCountries,
          lines: linesRef.current.map((l) => ({ speaker: l.speaker, kind: l.kind, text: l.text })),
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
      setError(friendlyRoomError(e instanceof Error ? e.message : "Could not end the session."));
    } finally {
      setEnding(false);
    }
  }, [stopSpeech, patchRoom, runAi]);

  /* Opening statements, debate rounds, closing statements, adjourn. Resumes from a saved position. */
  const drive = useCallback(
    async (startStage: Stage, startCursor: number) => {
      if (flowRunRef.current) return;
      flowRunRef.current = true;
      const token = ++flowTokenRef.current;
      try {
        const n = roomRef.current?.turnOrder.length ?? 0;
        if (!n) return;
        const plan: [Stage, number][] = [
          ["opening", n],
          ["debate", n * DEBATE_ROUNDS],
          ["closing", n],
        ];
        let started = false;
        for (const [stage, count] of plan) {
          if (!started && stage !== startStage) continue;
          const from = started ? 0 : startCursor;
          started = true;
          if (from === 0 && stage === "debate") {
            await say(`Opening statements are complete. The floor is now open for debate. Each delegate will speak in turn, for ${DEBATE_ROUNDS} rounds.`);
          }
          if (from === 0 && stage === "closing") {
            await say("Debate is closed. Closing statements will be heard in the same order as the opening.");
          }
          for (let i = from; i < count; i++) {
            if (flowTokenRef.current !== token) return;
            await doTurn(stage, i);
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

  async function start() {
    const r = roomRef.current;
    if (!r) return;
    setStarting(true);
    setError(null);
    resumedRef.current = true; // the resume effect must not start the flow while the judge is still opening
    try {
      const humans: TurnEntry[] = membersRef.current.map((m) => ({ name: m.country || m.name, kind: "human", userId: m.userId }));
      const ais: TurnEntry[] = r.aiCountries.map((c) => ({ name: c, kind: "ai", userId: null }));
      const order = shuffle([...humans, ...ais]);
      await patchRoom(
        { status: "live", phase: "opening", turn_order: order, cursor: 0, turn_user: null, turn_deadline: null },
        { status: "live", phase: "opening", turnOrder: order, cursor: 0, turnUser: null, turnDeadline: null },
      );
      if (r.judge) await runAi("open", undefined, order.map((o) => o.name));
      drive("opening", 0);
    } catch (e) {
      setError(friendlyRoomError(e instanceof Error ? e.message : "Could not start."));
    } finally {
      setStarting(false);
    }
  }

  async function endEarly() {
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

  /* Clock for the countdown. */
  useEffect(() => {
    if (!room?.turnDeadline) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [room?.turnDeadline]);

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
  }, [loaded, userId, id, receive]);

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

  async function beginSpeaking(kind: "text" | "record") {
    setMenuOpen(false);
    clearClip();
    dictation.start();
    if (kind === "record") await recorder.start();
  }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myTurn]);

  /* Close the Speak menu on Escape or a click elsewhere. */
  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !(e.target as HTMLElement).closest("[data-speak-menu]")) setMenuOpen(false);
    };
    document.addEventListener("keydown", close);
    document.addEventListener("mousedown", close);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("mousedown", close);
    };
  }, [menuOpen]);

  async function send(text: string, useClip = true) {
    const attached = useClip ? clip : null;
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
        } catch {
          setError("Your recording could not be uploaded, so your words were sent as text.");
        }
      }
      const line = await postLine(room.id, userId, myLabel, "human", body, { audioPath });
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

  const chip = (active: boolean, floor = false) =>
    `rounded-[var(--radius-ui)] border px-3 py-1.5 text-sm transition-colors ${
      active ? "border-accent bg-accent text-accent-ink" : "border-line bg-surface"
    } ${floor ? "outline outline-2 outline-offset-2 outline-danger" : ""}`;
  const live = room.status === "live";
  const lowTime = secondsLeft !== null && secondsLeft <= 10;

  return (
    <main
      className={`mx-auto flex max-w-4xl flex-col px-4 sm:px-6 ${
        room.status === "ended" ? "py-8" : "h-[calc(100dvh-4rem)] overflow-hidden py-4"
      }`}
    >
      <div className="flex shrink-0 flex-wrap items-start justify-between gap-3 border-b border-line pb-3">
        <div className="min-w-0">
          <p className="text-sm text-muted">Online room, {room.visibility}{room.judge ? ", judge presiding" : ", no judge"}</p>
          <h1 className="text-xl font-semibold tracking-tight">{room.topic}</h1>
          <p className="text-sm text-muted">{room.committee}</p>
          <p className="mt-1 text-sm font-medium text-accent">
            {room.status === "ended" ? "Adjourned" : PHASE_LABEL[room.phase as RoomPhase]}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2 print:hidden">
          {live && (
            <div
              role="timer"
              aria-label="Time left for the current speaker"
              className={`min-w-32 rounded-[var(--radius-ui)] border-2 px-4 py-1.5 text-center ${
                secondsLeft !== null ? "border-danger" : "border-line"
              } ${lowTime ? "bg-danger/10" : "bg-surface"}`}
            >
              <p className="text-xs text-muted">{secondsLeft !== null ? "Time left" : "Speaker's time"}</p>
              <p className={`font-mono text-2xl font-semibold leading-tight ${lowTime ? "text-danger" : ""}`}>{clock || "-:--"}</p>
            </div>
          )}
          <div className="flex flex-wrap items-center justify-end gap-3">
          {room.status !== "ended" && (
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
          )}
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
          {isHost && room.status === "live" && (
            <button type="button" className="btn" disabled={ending} onClick={endEarly}>
              {ending ? "Ending…" : room.judge ? "Judge: end session" : "End and get report"}
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
            {room.status === "ended" ? "Close" : "Leave room"}
          </button>
          </div>
        </div>
      </div>

      {room.status === "ended" && (
        <div className="mt-6 rounded-[var(--radius-ui)] border border-line bg-surface p-5">
          <h2 className="text-lg font-semibold tracking-tight">{room.report ? "Your report is ready" : "Preparing the report"}</h2>
          <p className="mt-1 max-w-[60ch] text-sm text-muted">
            {room.report
              ? "It is saved in your account under Past chats, together with this transcript and your coaching."
              : "This takes a few seconds."}
          </p>
          {room.report && (
            <div className="mt-4 flex flex-wrap gap-3">
              <Link href={`/report/${room.id}`} className="btn btn-primary">
                Open the report
              </Link>
              <Link href="/history" className="btn">
                Past chats
              </Link>
            </div>
          )}
          <h2 className="mb-1 mt-8 text-lg font-semibold tracking-tight">Transcript</h2>
        </div>
      )}

      <ul className="flex shrink-0 flex-wrap gap-2 pt-3 print:hidden" aria-label="In the room">
        {room.judge && (
          <li className={chip(speakingWho === "Judge")}>
            Judge <span className="ml-1 text-xs opacity-70">AI</span>
          </li>
        )}
        {room.aiCountries.map((c) => (
          <li key={c} className={chip(speakingWho === c, live && current?.kind === "ai" && current.name === c)}>
            {c} <span className="ml-1 text-xs opacity-70">AI</span>
          </li>
        ))}
        {members.map((m) => (
          <li
            key={m.userId}
            className={`${chip(room.turnUser === m.userId, room.turnUser === m.userId)} ${room.turnUser === m.userId ? "" : "border-dashed text-muted"}`}
          >
            {label(m)}
            {m.userId === room.hostId && <span className="ml-1 text-xs opacity-80">host</span>}
            {m.userId === userId && <span className="ml-1 text-xs opacity-80">you</span>}
          </li>
        ))}
      </ul>

      {room.status === "live" && (
        <p className="mt-3 shrink-0 rounded-[var(--radius-ui)] border border-line bg-surface px-4 py-2.5 text-sm" role="status">
          {myTurn ? (
            <>
              <span className="font-semibold">Your turn.</span> Give your {stageWord}.
            </>
          ) : room.turnUser ? (
            <>
              Waiting for <span className="font-semibold">{label(members.find((m) => m.userId === room.turnUser) ?? { userId: "", country: "", name: "a delegate" })}</span> to speak.
            </>
          ) : current?.kind === "ai" ? (
            <>
              <span className="font-semibold">{current.name}</span> is speaking.
            </>
          ) : (
            <>The judge is speaking.</>
          )}
        </p>
      )}

      {room.status === "lobby" && (
        <section className="mt-4 shrink-0 rounded-[var(--radius-ui)] border border-line bg-surface p-5" aria-labelledby="lobby">
          <h2 id="lobby" className="text-lg font-semibold tracking-tight">
            {isHost ? "Invite people" : `Waiting for ${host ? label(host) : "the host"} to start`}
          </h2>
          <p className="mt-1 max-w-[60ch] text-sm text-muted">
            Share this code. Everyone who joins appears above. No one can join after the session starts.
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <code className="rounded-[var(--radius-ui)] border border-line bg-sunk px-4 py-2 font-mono text-xl tracking-widest">
              {room.code}
            </code>
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
                <Play aria-hidden="true" size={16} weight="fill" /> {starting ? "Starting…" : "Start the session"}
              </button>
            )}
          </div>
          {isHost && (
            <p className="helper">
              After you press Start, the whole session runs on its own from this tab. Keep it open.
            </p>
          )}
        </section>
      )}

      <div
        ref={chatRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className={`space-y-5 py-4 ${room.status === "ended" ? "" : "min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1"}`}
        aria-live="polite"
      >
        {lines.length === 0 && room.status !== "lobby" && <p className="text-muted">No one has spoken yet.</p>}
        {lines.map((l) =>
          l.kind === "chair" ? (
            <p key={l.id} className="max-w-[72ch] border-l-2 border-line pl-3 text-sm leading-relaxed text-muted">
              <span className="font-medium text-ink">Judge. </span>
              {l.text}
            </p>
          ) : (
            <div key={l.id} className={l.kind === "human" && l.userId === userId ? "ml-auto max-w-[88%]" : "max-w-[88%]"}>
              <p className="mb-1 text-xs font-medium text-muted">{l.speaker}</p>
              <div
                className={`break-words rounded-[var(--radius-ui)] border p-3.5 leading-relaxed ${
                  l.kind === "human" && l.userId === userId ? "border-transparent bg-accent text-accent-ink" : "border-line bg-surface"
                }`}
              >
                {l.text}
              </div>
            </div>
          ),
        )}
        {aiBusy && <p className="text-sm text-muted">The AI is preparing a reply…</p>}
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

      {room.status === "live" && (
        <div className="shrink-0 border-t border-line bg-background pb-1 pt-3">
          {clip && (
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
            placeholder={myTurn ? `Speak as ${myLabel}. Enter to send…` : "You can speak when the judge calls on you."}
          />
          <div className="mt-2 flex flex-wrap justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              <div className="relative" data-speak-menu>
                <button
                  type="button"
                  onClick={dictation.listening || recorder.recording ? endSpeaking : () => setMenuOpen((o) => !o)}
                  disabled={!myTurn || (!dictation.supported && !recorder.supported)}
                  aria-haspopup="menu"
                  aria-expanded={menuOpen}
                  aria-pressed={dictation.listening || recorder.recording}
                  className={`btn ${dictation.listening || recorder.recording ? "btn-live pulse-ring" : ""}`}
                >
                  {dictation.listening || recorder.recording ? (
                    <Stop aria-hidden="true" size={18} weight="fill" />
                  ) : (
                    <Microphone aria-hidden="true" size={18} />
                  )}
                  {dictation.listening || recorder.recording ? (recorder.recording ? "Stop recording" : "Stop") : "Speak"}
                </button>
                {menuOpen && (
                  <div
                    role="menu"
                    aria-label="How do you want to speak?"
                    className="absolute bottom-full left-0 z-20 mb-2 w-72 rounded-[var(--radius-ui)] border border-line bg-surface p-1.5 shadow-lg"
                  >
                    <button
                      type="button"
                      role="menuitem"
                      disabled={!dictation.supported}
                      onClick={() => beginSpeaking("text")}
                      className="flex w-full items-start gap-3 rounded-[var(--radius-ui)] px-3 py-2.5 text-left hover:bg-sunk disabled:opacity-50"
                    >
                      <TextT aria-hidden="true" size={20} className="mt-0.5 shrink-0" />
                      <span>
                        <span className="block text-sm font-medium">Speech to text</span>
                        <span className="block text-xs text-muted">Your words appear in the box. The room hears them read aloud.</span>
                      </span>
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      disabled={!recorder.supported}
                      onClick={() => beginSpeaking("record")}
                      className="flex w-full items-start gap-3 rounded-[var(--radius-ui)] px-3 py-2.5 text-left hover:bg-sunk disabled:opacity-50"
                    >
                      <Record aria-hidden="true" size={20} className="mt-0.5 shrink-0" />
                      <span>
                        <span className="block text-sm font-medium">Record speech</span>
                        <span className="block text-xs text-muted">Your words appear in the box, and the room hears your own voice.</span>
                      </span>
                    </button>
                  </div>
                )}
              </div>
              <button type="button" className="btn" disabled={!myTurn || sending} onClick={() => send(YIELD_TEXT, false)}>
                Yield the floor
              </button>
            </div>
            <button
              type="button"
              onClick={() => send(input)}
              disabled={!myTurn || sending || recorder.recording || (!input.trim() && !clip)}
              className="btn btn-primary"
            >
              <ArrowUp aria-hidden="true" size={18} weight="bold" />
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
