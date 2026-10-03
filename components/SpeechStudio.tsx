"use client";

import { useCallback, useState } from "react";
import { Microphone, SpeakerHigh, Stop, Trash } from "@phosphor-icons/react";
import { useDictation, useSpeaker } from "@/lib/voice";

const MAX_CHARS = 2500;

export default function SpeechStudio({ rows = 9 }: { rows?: number }) {
  const [text, setText] = useState("");

  const append = useCallback((chunk: string) => {
    if (chunk) setText((t) => (t && !t.endsWith(" ") ? `${t} ${chunk}` : `${t}${chunk}`));
  }, []);

  const dictation = useDictation(append);
  const speaker = useSpeaker();

  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const tooLong = text.length > MAX_CHARS;
  const error = dictation.error ?? speaker.error;

  return (
    <div className="rounded-[var(--radius-ui)] border border-line bg-surface p-4 sm:p-5">
      <label htmlFor="speech-text" className="label">
        Your speech
      </label>
      <textarea
        id="speech-text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={rows}
        className="field resize-y"
        placeholder="Type, paste, or press Dictate and speak."
      />
      {dictation.interim && (
        <p className="mt-2 text-sm italic text-muted" aria-live="polite">
          {dictation.interim}
        </p>
      )}
      <div className="mt-1 flex items-center justify-between">
        <p className={`helper ${tooLong ? "!text-danger" : ""}`}>
          {words} words, {text.length}/{MAX_CHARS} characters
        </p>
        {!dictation.supported && (
          <p className="helper">Dictation needs Chrome, Edge or Safari.</p>
        )}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={dictation.listening ? dictation.stop : dictation.start}
          disabled={!dictation.supported}
          aria-pressed={dictation.listening}
          className={`btn ${dictation.listening ? "btn-live pulse-ring" : ""}`}
        >
          {dictation.listening ? <Stop aria-hidden="true" size={18} weight="fill" /> : <Microphone aria-hidden="true" size={18} />}
          {dictation.listening ? "Stop dictating" : "Dictate"}
        </button>
        {speaker.playing ? (
          <button type="button" onClick={speaker.stop} className="btn btn-primary">
            <Stop aria-hidden="true" size={18} weight="fill" />
            Stop
          </button>
        ) : (
          <button
            type="button"
            onClick={() => speaker.speak(text)}
            disabled={speaker.loading || !text.trim() || tooLong}
            className="btn btn-primary"
          >
            <SpeakerHigh aria-hidden="true" size={18} />
            {speaker.loading ? "Preparing audio…" : "Read aloud"}
          </button>
        )}
        <button
          type="button"
          onClick={() => setText("")}
          disabled={!text}
          className="btn"
          aria-label="Clear text"
        >
          <Trash aria-hidden="true" size={18} />
          Clear
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
