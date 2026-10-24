"use client";

import { useState } from "react";
import { Scroll } from "@phosphor-icons/react";
import { checkResolution, splitClauses, type Resolution } from "@/lib/motions";
import type { Ballot } from "@/components/delegate/MotionPanel";

/* Writing a draft resolution during debate. */
export function ResolutionDraft({
  sponsor,
  busy,
  onIntroduce,
  onCancel,
}: {
  sponsor: string;
  busy: boolean;
  onIntroduce: (title: string, clauses: string[]) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  function introduce() {
    const clauses = splitClauses(text);
    const err = checkResolution(title, clauses);
    setError(err);
    if (!err) onIntroduce(title.trim(), clauses);
  }

  return (
    <section aria-label="Draft resolution" className="rounded-[var(--radius-ui)] border border-line bg-surface p-4">
      <div className="flex items-center gap-2">
        <Scroll aria-hidden="true" size={18} />
        <h2 className="font-semibold">Introduce a draft resolution</h2>
      </div>
      <p className="mt-1 text-sm text-muted">
        Sponsored by {sponsor}. The committee votes on it after closing statements. Write one operative clause per line,
        each starting with an action verb such as <i>Calls upon</i>, <i>Encourages</i>, <i>Requests</i> or <i>Establishes</i>.
      </p>
      <label className="mt-3 flex flex-col gap-1 text-sm">
        <span className="text-muted">Title</span>
        <input
          className="field"
          maxLength={150}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="e.g. Reducing single-use plastics in coastal nations"
        />
      </label>
      <label className="mt-3 flex flex-col gap-1 text-sm">
        <span className="text-muted">Operative clauses (1 to 8, one per line)</span>
        <textarea
          rows={4}
          className="field resize-y"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"Calls upon member states to set national targets for cutting single-use plastics by 2030\nRequests a fund to help developing countries build waste collection systems"}
        />
      </label>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" className="btn btn-primary" disabled={busy} onClick={introduce}>
          Introduce draft resolution
        </button>
        <button type="button" className="btn" disabled={busy} onClick={onCancel}>
          Back to debate
        </button>
      </div>
    </section>
  );
}

/* The human delegate's vote on the draft resolution, in voting procedure. */
export function ResolutionBallot({ resolution, onBallot }: { resolution: Resolution; onBallot: (b: Ballot) => void }) {
  return (
    <section aria-label="Vote on the draft resolution" className="rounded-[var(--radius-ui)] border border-accent bg-surface p-4">
      <div className="flex items-center gap-2">
        <Scroll aria-hidden="true" size={18} />
        <h2 className="font-semibold">Voting procedure: {resolution.title}</h2>
      </div>
      <p className="mt-1 text-sm text-muted">Sponsored by {resolution.sponsor}. A simple majority of votes for over votes against adopts it; abstentions do not count either way.</p>
      <ol className="mt-3 list-decimal space-y-1 pl-5 text-sm">
        {resolution.clauses.map((c, i) => (
          <li key={i}>{c}</li>
        ))}
      </ol>
      <div className="mt-4 flex flex-wrap gap-2" role="group" aria-label="Your vote">
        {(["for", "against", "abstain"] as Ballot[]).map((b) => (
          <button key={b} type="button" className={`btn ${b === "for" ? "btn-primary" : ""}`} onClick={() => onBallot(b)}>
            {b === "for" ? "Vote for" : b === "against" ? "Vote against" : "Abstain"}
          </button>
        ))}
      </div>
    </section>
  );
}
