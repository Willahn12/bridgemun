"use client";

import { useState } from "react";
import { Plus, X } from "@phosphor-icons/react";
import { MODE_LABEL, type Mode } from "@/lib/sessions";
import CountryInput from "@/components/CountryInput";

export interface SetupResult {
  committee: string;
  topic: string;
  humanCountry: string;
  aiCountries: string[];
  judge: boolean;
}

const MAX_AI = 5;

export default function SetupForm({
  mode,
  onBack,
  onSubmit,
  initialCountry = "",
}: {
  mode: Mode;
  initialCountry?: string;
  onBack: () => void;
  onSubmit: (r: SetupResult) => void;
}) {
  const multi = mode === "committee";
  const [committee, setCommittee] = useState("");
  const [topic, setTopic] = useState("");
  const [humanCountry, setHumanCountry] = useState(initialCountry);
  const [ai, setAi] = useState<string[]>(multi ? ["", ""] : [""]);
  const [judge, setJudge] = useState(true);

  const cleaned = ai.map((c) => c.trim());
  const mine = humanCountry.trim().toLowerCase();
  /* Free typing is allowed, so the same country can be entered twice; catch that here (including your own country). */
  const problem =
    committee.trim() === ""
      ? "Enter a committee."
      : topic.trim() === ""
        ? "Enter a topic."
        : !cleaned.every(Boolean)
          ? "Choose a country for every AI delegation."
          : new Set(cleaned.map((c) => c.toLowerCase())).size !== cleaned.length
            ? "Each AI delegation needs a different country."
            : mine && cleaned.some((c) => c.toLowerCase() === mine)
              ? `You already represent ${humanCountry.trim()}. Pick a different country for the AI.`
              : null;
  const valid = problem === null;

  return (
    <form
      className="rounded-[var(--radius-ui)] border border-line bg-surface p-5 sm:p-6"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) onSubmit({ committee: committee.trim(), topic: topic.trim(), humanCountry: humanCountry.trim(), aiCountries: cleaned, judge: mode === "table" ? judge : true });
      }}
    >
      <div className="mb-5 flex items-center justify-between">
        <h2 className="text-lg font-semibold tracking-tight">{MODE_LABEL[mode]}</h2>
        <button type="button" onClick={onBack} className="text-sm text-muted hover:text-ink">
          Change mode
        </button>
      </div>

      <div className="grid gap-4">
        <div>
          <label htmlFor="committee" className="label">Committee</label>
          <input id="committee" className="field" maxLength={200} value={committee} placeholder="UN Environment Assembly" onChange={(e) => setCommittee(e.target.value)} />
        </div>
        <div>
          <label htmlFor="topic" className="label">Topic</label>
          <input id="topic" className="field" maxLength={200} value={topic} placeholder="Financing climate adaptation in developing countries" onChange={(e) => setTopic(e.target.value)} />
        </div>
        <div>
          <label htmlFor="human" className="label">You represent</label>
          <CountryInput id="human" value={humanCountry} placeholder="Kenya" exclude={ai} onChange={setHumanCountry} />
          <p className="helper">Optional.</p>
        </div>

        <fieldset>
          <legend className="label">{multi ? "AI delegations" : "AI delegate represents"}</legend>
          <div className="grid gap-2">
            {ai.map((c, i) => (
              <div key={i} className="flex gap-2">
                <CountryInput
                  aria-label={`AI delegation ${i + 1}`}
                  value={c}
                  placeholder={["India", "Germany", "Brazil", "Japan", "Nigeria"][i]}
                  exclude={[humanCountry, ...ai.filter((_, j) => j !== i)]}
                  onChange={(v) => setAi(ai.map((x, j) => (j === i ? v : x)))}
                />
                {multi && ai.length > 2 && (
                  <button type="button" className="btn" aria-label={`Remove delegation ${i + 1}`} onClick={() => setAi(ai.filter((_, j) => j !== i))}>
                    <X aria-hidden="true" size={16} />
                  </button>
                )}
              </div>
            ))}
          </div>
          {multi && ai.length < MAX_AI && (
            <button type="button" className="btn mt-2" onClick={() => setAi([...ai, ""])}>
              <Plus aria-hidden="true" size={16} /> Add delegation
            </button>
          )}
          {mode === "table" && (
            <p className="helper">The AI joins your group as this country and answers when its name is called.</p>
          )}
        </fieldset>

        {mode === "table" ? (
          <fieldset>
            <legend className="label">Does this session need a judge?</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                { v: true, t: "Yes, AI judge", d: "Opens the session, draws who goes first, steps in with rulings, and closes it." },
                { v: false, t: "No judge", d: "Your group runs the session itself, for example with a teacher." },
              ].map((o) => (
                <label
                  key={String(o.v)}
                  className={`cursor-pointer rounded-[var(--radius-ui)] border p-3 transition-colors focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-accent ${
                    judge === o.v ? "border-accent" : "border-line hover:border-muted"
                  }`}
                >
                  <input type="radio" name="judge" className="sr-only" checked={judge === o.v} onChange={() => setJudge(o.v)} />
                  <span className="block text-sm font-semibold">{o.t}</span>
                  <span className="mt-0.5 block text-sm text-muted">{o.d}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : (
          <p className="text-sm text-muted">
            An AI judge presides: it opens the session, draws the speaking order, calls on each delegation, and closes the session.
          </p>
        )}
      </div>

      {problem && (committee || topic || cleaned.some(Boolean)) && (
        <p role="alert" className="mt-6 text-sm text-danger">{problem}</p>
      )}
      <button type="submit" disabled={!valid} className="btn btn-primary mt-6 w-full">
        Continue to save options
      </button>
    </form>
  );
}
