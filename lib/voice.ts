"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/* ---------- Speech to text (browser Web Speech API, free) ---------- */

interface RecognitionResult {
  isFinal: boolean;
  0: { transcript: string };
}
interface RecognitionEvent {
  resultIndex: number;
  results: ArrayLike<RecognitionResult>;
}
interface Recognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start(): void;
  stop(): void;
  onresult: ((e: RecognitionEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
}
type RecognitionCtor = new () => Recognition;

function getCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export function useDictation(onFinal: (text: string) => void, lang = "en-US") {
  const supported = useSyncExternalStore(
    () => () => {},
    () => getCtor() !== null,
    () => false,
  );
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<Recognition | null>(null);
  const onFinalRef = useRef(onFinal);

  useEffect(() => {
    onFinalRef.current = onFinal;
  }, [onFinal]);

  useEffect(() => {
    return () => recRef.current?.stop();
  }, []);

  const start = useCallback(() => {
    const Ctor = getCtor();
    if (!Ctor) return;
    setError(null);
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = lang;
    rec.onresult = (e) => {
      let live = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) onFinalRef.current(r[0].transcript.trim());
        else live += r[0].transcript;
      }
      setInterim(live);
    };
    rec.onerror = (e) => {
      if (e.error === "not-allowed") setError("Microphone access was blocked. Allow it in your browser settings.");
      else if (e.error !== "no-speech" && e.error !== "aborted") setError(`Dictation error: ${e.error}`);
    };
    rec.onend = () => {
      setListening(false);
      setInterim("");
    };
    recRef.current = rec;
    rec.start();
    setListening(true);
  }, [lang]);

  const stop = useCallback(() => recRef.current?.stop(), []);

  return { supported, listening, interim, error, start, stop };
}

/* ---------- Recording your own voice ---------- */

const RECORD_TYPES = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];

export function useRecorder() {
  const supported = useSyncExternalStore(
    () => () => {},
    () => typeof MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia,
    () => false,
  );
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<MediaRecorder | null>(null);
  const doneRef = useRef<((b: Blob | null) => void) | null>(null);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const type = RECORD_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
      const rec = new MediaRecorder(stream, type ? { mimeType: type } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => {
        if (e.data.size) chunks.push(e.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        doneRef.current?.(chunks.length ? new Blob(chunks, { type: rec.mimeType || type || "audio/webm" }) : null);
        doneRef.current = null;
      };
      rec.start();
      recRef.current = rec;
      setRecording(true);
    } catch {
      setError("Microphone access was blocked. Allow it in your browser settings.");
    }
  }, []);

  /* Stops and hands back the recording (null if there was nothing). */
  const stop = useCallback(
    () =>
      new Promise<Blob | null>((resolve) => {
        const rec = recRef.current;
        if (!rec || rec.state === "inactive") return resolve(null);
        doneRef.current = resolve;
        rec.stop();
      }),
    [],
  );

  useEffect(
    () => () => {
      if (recRef.current && recRef.current.state !== "inactive") recRef.current.stop();
    },
    [],
  );

  return { supported, recording, error, start, stop };
}

/* ---------- Text to speech (ElevenLabs via /api/tts) ---------- */

/* Split into sentence-sized chunks so playback starts after the first sentence
   instead of waiting for the whole speech. */
export function splitChunks(text: string, max = 240): string[] {
  const sentences = text.replace(/\s+/g, " ").trim().match(/[^.!?]+[.!?]+["')\]]*|[^.!?]+$/g) ?? [text];
  const chunks: string[] = [];
  let cur = "";
  for (const raw of sentences) {
    const sentence = raw.trim();
    if (!sentence) continue;
    if (cur && (cur.length + sentence.length + 1 > max || cur.length >= 90)) {
      chunks.push(cur);
      cur = sentence;
    } else {
      cur = cur ? `${cur} ${sentence}` : sentence;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

type Fetched = { url: string } | { error: string };

/* A busy or briefly unreachable voice service is retried, so one hiccup does not drop a sentence. */
async function fetchChunk(text: string, voice: number): Promise<Fetched> {
  let last = "Could not reach the voice service";
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await new Promise((r) => setTimeout(r, 500 * attempt));
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voice }),
      });
      if (res.ok) return { url: URL.createObjectURL(await res.blob()) };
      const body = await res.json().catch(() => ({}));
      last = body.error ?? `Voice request failed (${res.status})`;
      if (res.status < 500 && res.status !== 429) break; // a bad request will not fix itself
    } catch {
      last = "Could not reach the voice service";
    }
  }
  return { error: last };
}

export function useSpeaker() {
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const runRef = useRef(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const finishRef = useRef<(() => void) | null>(null);

  const stop = useCallback(() => {
    runRef.current++;
    audioRef.current?.pause();
    audioRef.current = null;
    finishRef.current?.();
    finishRef.current = null;
    setPlaying(false);
    setLoading(false);
  }, []);

  useEffect(() => stop, [stop]);

  /* Resolves when the speech has finished, or has been stopped. */
  const speak = useCallback(async (text: string, voice = 0) => {
    stop();
    const run = runRef.current;
    const chunks = splitChunks(text);
    if (!chunks.length) return;
    setError(null);
    setLoading(true);

    let pending = fetchChunk(chunks[0], voice);
    try {
      for (let i = 0; i < chunks.length; i++) {
        const got = await pending;
        // Prefetch the next sentence while this one plays.
        pending = i + 1 < chunks.length ? fetchChunk(chunks[i + 1], voice) : Promise.resolve({ error: "" });
        if (runRef.current !== run) {
          if ("url" in got) URL.revokeObjectURL(got.url);
          return;
        }
        if ("error" in got) {
          // Skip only this sentence and carry on with the rest of the speech.
          setError(got.error);
          continue;
        }
        setLoading(false);
        setPlaying(true);
        await new Promise<void>((resolve) => {
          const audio = new Audio(got.url);
          audioRef.current = audio;
          finishRef.current = resolve;
          audio.onended = () => resolve();
          audio.onerror = () => resolve();
          audio.play().catch(() => {
            setError("Your browser blocked audio. Click Play to hear it.");
            resolve();
          });
        });
        URL.revokeObjectURL(got.url);
        if (runRef.current !== run) return;
      }
    } finally {
      if (runRef.current === run) {
        setLoading(false);
        setPlaying(false);
      }
      const rest = await pending;
      if ("url" in rest) URL.revokeObjectURL(rest.url);
    }
  }, [stop]);

  /* Plays a finished recording. Resolves when it ends or is stopped. */
  const playUrl = useCallback(
    async (url: string) => {
      stop();
      const run = runRef.current;
      setPlaying(true);
      await new Promise<void>((resolve) => {
        const audio = new Audio(url);
        audioRef.current = audio;
        finishRef.current = resolve;
        audio.onended = () => resolve();
        audio.onerror = () => resolve();
        audio.play().catch(() => {
          setError("Your browser blocked audio. Click anywhere on the page, then try again.");
          resolve();
        });
      });
      if (runRef.current === run) setPlaying(false);
    },
    [stop],
  );

  return { speak, playUrl, stop, loading, playing, error };
}
