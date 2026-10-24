"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ChatCircleText, Copy, NotePencil, Trash, UserPlus } from "@phosphor-icons/react";
import Brief from "@/components/Brief";
import SourceList from "@/components/SourceList";
import { useAuth } from "@/lib/auth";
import { toneStyle } from "@/lib/tone";
import {
  addFollowup,
  addNote,
  deleteResearch,
  joinResearch,
  leaveResearch,
  removeNote,
  streamResearch,
  watchResearch,
  type Research,
  type Source,
} from "@/lib/research";

const when = (ms: number) => new Date(ms).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export default function ResearchDocPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { user, ready } = useAuth();
  const [doc, setDoc] = useState<Research | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<{ question: string; text: string; sources: Source[] } | null>(null);
  const [asking, setAsking] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    return watchResearch(id, setDoc, (e) => setError(e.message));
  }, [id, userId]);

  if (ready && !user) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">Shared research</h1>
        <p className="mt-3 text-muted">Sign in to open this briefing.</p>
        <Link href="/login" className="btn btn-primary mt-6">
          Sign in
        </Link>
      </main>
    );
  }
  if (doc === null) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">Briefing not found</h1>
        <p className="mt-3 text-muted">It may have been deleted, or the link is wrong.</p>
        <Link href="/research" className="btn mt-6">
          Back to research
        </Link>
      </main>
    );
  }
  if (!doc || !user) {
    return <main className="mx-auto max-w-4xl px-4 py-16 text-muted sm:px-6">{error ?? "Loading…"}</main>;
  }

  const owner = doc.ownerId === user.id;
  const member = owner || doc.collaborators.includes(user.id);
  const people = [doc.ownerName, ...doc.collaborators.map((c) => doc.collaboratorNames[c] || "A classmate")];

  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    const q = question.trim();
    if (!q || asking || !doc) return;
    setAsking(true);
    setError(null);
    setAnswer({ question: q, text: "", sources: [] });
    try {
      const done = await streamResearch(
        { mode: "followup", country: doc.country, committee: doc.committee, topic: doc.topic, brief: doc.brief, question: q },
        (text) => setAnswer({ question: q, text, sources: [] }),
      );
      await addFollowup(doc.id, { question: q, answer: done.text, sources: done.sources });
      setQuestion("");
      setAnswer(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "The question could not be answered.");
    } finally {
      setAsking(false);
    }
  }

  return (
    <main style={toneStyle("research")} className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
      <Link href="/research" className="inline-flex items-center gap-1.5 text-sm text-muted hover:text-ink">
        <ArrowLeft aria-hidden="true" size={16} /> Research
      </Link>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-muted">{doc.committee}</p>
          <h1 className="font-display text-3xl font-bold leading-tight">
            {doc.country}: {doc.topic}
          </h1>
          <p className="mt-1 text-sm text-muted">
            {people.length > 1 ? `Shared research: ${people.join(", ")}` : `By ${doc.ownerName}`} · updated {when(doc.updatedAt)}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {member && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                navigator.clipboard?.writeText(window.location.href).then(() => {
                  setCopied(true);
                  setTimeout(() => setCopied(false), 2000);
                });
              }}
            >
              <Copy aria-hidden="true" size={16} /> {copied ? "Link copied" : "Copy share link"}
            </button>
          )}
          {!member && (
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => act(() => joinResearch(doc.id))}>
              <UserPlus aria-hidden="true" size={16} /> Join this research
            </button>
          )}
          {member && !owner && (
            <button type="button" className="btn" disabled={busy} onClick={() => act(async () => { await leaveResearch(doc.id); router.push("/research"); })}>
              Leave
            </button>
          )}
          {owner &&
            (confirmDelete ? (
              <button type="button" className="btn text-danger" disabled={busy} onClick={() => act(async () => { await deleteResearch(doc.id); router.push("/research"); })}>
                <Trash aria-hidden="true" size={16} /> Delete for everyone
              </button>
            ) : (
              <button type="button" className="btn" onClick={() => setConfirmDelete(true)}>
                <Trash aria-hidden="true" size={16} /> Delete
              </button>
            ))}
        </div>
      </header>

      {!member && (
        <p className="tone-card mt-6 p-4 text-sm">
          {doc.ownerName} shared this briefing. Join it to ask follow-up questions and add notes that everyone in it can see.
        </p>
      )}
      {error && (
        <p role="alert" className="mt-6 rounded-[var(--radius-ui)] border border-danger p-4 text-sm text-danger">
          {error}
        </p>
      )}

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)]">
        <article>
          <Brief markdown={doc.brief} />
          <SourceList sources={doc.sources} />

          <section className="mt-10 border-t border-line pt-6" aria-labelledby="fu-title">
            <h2 id="fu-title" className="flex items-center gap-2 text-lg font-semibold">
              <ChatCircleText aria-hidden="true" size={20} /> Follow-up questions
            </h2>
            {doc.followups.length === 0 && !answer && <p className="mt-2 text-sm text-muted">Ask anything about this assignment. Answers are checked against current sources and saved here.</p>}
            <ol className="mt-4 space-y-6">
              {doc.followups.map((f) => (
                <li key={f.id}>
                  <p className="font-medium">{f.question}</p>
                  <p className="text-xs text-muted">
                    Asked by {f.byName}, {when(f.at)}
                  </p>
                  <div className="mt-2">
                    <Brief markdown={f.answer} />
                  </div>
                  <SourceList sources={f.sources} title="Sources for this answer" />
                </li>
              ))}
              {answer && (
                <li aria-live="polite">
                  <p className="font-medium">{answer.question}</p>
                  <div className="mt-2">{answer.text ? <Brief markdown={answer.text} /> : <p className="text-sm text-muted">Searching current sources…</p>}</div>
                </li>
              )}
            </ol>
            {member && (
              <form onSubmit={ask} className="mt-5 flex flex-col gap-2 sm:flex-row">
                <label htmlFor="fu-q" className="sr-only">
                  Your question
                </label>
                <input
                  id="fu-q"
                  className="field flex-1"
                  maxLength={500}
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="e.g. What did this country say at the last negotiating session?"
                />
                <button type="submit" className="btn btn-primary" disabled={!question.trim() || asking}>
                  {asking ? "Answering…" : "Ask"}
                </button>
              </form>
            )}
          </section>
        </article>

        <aside className="h-fit space-y-4">
          <section className="tone-card p-5" aria-labelledby="notes-title">
            <h2 id="notes-title" className="flex items-center gap-2 font-semibold">
              <NotePencil aria-hidden="true" size={18} /> Shared notes
            </h2>
            <p className="mt-1 text-sm text-muted">Everyone in this research sees these: arguments, quotes to check, speech ideas.</p>
            <ul className="mt-3 space-y-3">
              {doc.notes.map((n) => (
                <li key={n.id} className="rounded-[var(--radius-ui)] border border-line p-3 text-sm">
                  <p className="whitespace-pre-wrap leading-relaxed">{n.text}</p>
                  <p className="mt-1 flex items-center justify-between gap-2 text-xs text-muted">
                    <span>
                      {n.byName}, {when(n.at)}
                    </span>
                    {(n.by === user.id || owner) && (
                      <button type="button" className="hover:text-danger" disabled={busy} onClick={() => act(() => removeNote(doc.id, n))}>
                        Remove
                      </button>
                    )}
                  </p>
                </li>
              ))}
            </ul>
            {member && (
              <form
                className="mt-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const t = note.trim();
                  if (t) act(async () => { await addNote(doc.id, t); setNote(""); });
                }}
              >
                <label htmlFor="note" className="sr-only">
                  Add a note
                </label>
                <textarea id="note" rows={3} className="field resize-y" maxLength={2000} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Add a note for the group…" />
                <button type="submit" className="btn mt-2 w-full" disabled={!note.trim() || busy}>
                  Add note
                </button>
              </form>
            )}
          </section>
        </aside>
      </div>
    </main>
  );
}
