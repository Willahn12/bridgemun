"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowUp, BookOpenText, ChartBar, ChatsCircle, Copy, Exam, UserMinus, UserPlus } from "@phosphor-icons/react";
import PageHero from "@/components/PageHero";
import { useAuth } from "@/lib/auth";
import { toneStyle } from "@/lib/tone";
import { MODE_LABEL, sessionTitle, useSavedSessions, type Session } from "@/lib/sessions";
import { listMyResearch, type Research } from "@/lib/research";
import {
  acceptFriend,
  addFriendByCode,
  myFriendCode,
  removeFriend,
  sendDirect,
  watchFriendships,
  watchMessages,
  type Card,
  type DirectMessage,
  type Friendship,
} from "@/lib/friends";

const when = (ms: number) => new Date(ms).toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
const average = (s: Session) => (s.report?.scores.length ? s.report.scores.reduce((n, x) => n + x.score, 0) / s.report.scores.length : null);

/* Snapshots of a session for a message: the friend sees this card, never the session itself. */
function sessionCard(s: Session): Card {
  const mine = s.lines.filter((l) => l.kind === "human" && !l.point && !l.resolution);
  return {
    kind: "session",
    title: sessionTitle(s),
    committee: s.committee,
    country: s.humanCountry,
    mode: MODE_LABEL[s.mode],
    date: s.endedAt ?? s.updatedAt,
    excerpt: (s.report?.summary || mine[mine.length - 1]?.text || "").slice(0, 600),
  };
}
function reportCard(s: Session): Card {
  return {
    kind: "report",
    title: sessionTitle(s),
    committee: s.committee,
    country: s.humanCountry,
    date: s.endedAt ?? s.updatedAt,
    average: average(s),
    summary: (s.report?.summary ?? "").slice(0, 600),
    strengths: (s.report?.strengths ?? []).slice(0, 3).map((x) => x.slice(0, 200)),
  };
}

function CardView({ card }: { card: Card }) {
  if (card.kind === "research") {
    return (
      <Link href={`/research/${card.id}`} className="block rounded-[var(--radius-ui)] border border-line bg-background p-3 text-sm text-ink hover:border-accent">
        <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
          <BookOpenText aria-hidden="true" size={14} /> Research
        </span>
        <span className="mt-1 block font-semibold">{card.title}</span>
        <span className="block text-muted">{card.committee} · open it to read and join</span>
      </Link>
    );
  }
  return (
    <div className="rounded-[var(--radius-ui)] border border-line bg-background p-3 text-sm text-ink">
      <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted">
        {card.kind === "report" ? <ChartBar aria-hidden="true" size={14} /> : <Exam aria-hidden="true" size={14} />}
        {card.kind === "report" ? "Report" : "Practice session"}
      </span>
      <span className="mt-1 block font-semibold">{card.title}</span>
      <span className="block text-muted">
        {card.country ? `${card.country} · ` : ""}
        {card.committee} · {new Date(card.date).toLocaleDateString()}
        {card.kind === "session" ? ` · ${card.mode}` : ""}
      </span>
      {card.kind === "report" && card.average !== null && <span className="mt-1 block font-semibold">Average score: {card.average.toFixed(1)} / 5</span>}
      {card.kind === "report" ? card.summary && <span className="mt-1 block">{card.summary}</span> : card.excerpt && <span className="mt-1 block">{card.excerpt}</span>}
      {card.kind === "report" && card.strengths.length > 0 && (
        <ul className="mt-1 list-disc pl-5 text-muted">
          {card.strengths.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function FriendsPage() {
  const { user, ready } = useAuth();
  const sessions = useSavedSessions();
  const [code, setCode] = useState<string | null>(null);
  const [friends, setFriends] = useState<Friendship[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [addCode, setAddCode] = useState("");
  const [text, setText] = useState("");
  const [share, setShare] = useState<"session" | "report" | "research" | null>(null);
  const [research, setResearch] = useState<Research[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const threadRef = useRef<HTMLDivElement>(null);

  const userId = user?.id;
  useEffect(() => {
    if (!userId) return;
    myFriendCode().then(setCode).catch(() => setCode(null));
    return watchFriendships(userId, setFriends, (e) => setError(e.message));
  }, [userId]);

  const active = friends.find((f) => f.id === activeId && f.status === "accepted") ?? null;
  useEffect(() => {
    if (!active) return;
    return watchMessages(active.id, setMessages, (e) => setError(e.message));
  }, [active?.id]); // eslint-disable-line react-hooks/exhaustive-deps -- only re-subscribe when the friend changes

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    if (share === "research" && userId && research === null) listMyResearch(userId).then(setResearch).catch(() => setResearch([]));
  }, [share, userId, research]);

  if (ready && !user) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 sm:px-6">
        <h1 className="text-3xl font-semibold tracking-tight">Friends</h1>
        <p className="mt-3 text-muted">Sign in to add friends and message them.</p>
        <Link href="/login" className="btn btn-primary mt-6">
          Sign in
        </Link>
      </main>
    );
  }
  if (!user) return <main className="mx-auto max-w-5xl px-4 py-16 text-muted sm:px-6">Loading…</main>;

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

  const other = (f: Friendship) => f.users.find((u) => u !== user.id) ?? "";
  const nameOf = (f: Friendship) => f.names[other(f)] || "A friend";
  const incoming = friends.filter((f) => f.status === "pending" && f.requestedBy !== user.id);
  const outgoing = friends.filter((f) => f.status === "pending" && f.requestedBy === user.id);
  const accepted = friends.filter((f) => f.status === "accepted");
  const practice = sessions.filter((s) => s.lines.length > 0);
  const reported = sessions.filter((s) => s.report && s.report.scores.length > 0);

  function sendCard(card: Card) {
    if (!active) return;
    act(async () => {
      await sendDirect(active.id, "", card);
      setShare(null);
    });
  }

  return (
    <main style={toneStyle("org")}>
      <PageHero kind="org" title="Friends">
        <p>Add classmates with their friend code, then message them and share practice sessions, reports and research.</p>
      </PageHero>

      <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <aside className="space-y-5">
          <section className="tone-card p-5" aria-labelledby="code-title">
            <h2 id="code-title" className="font-semibold">
              Your friend code
            </h2>
            <div className="mt-2 flex items-center gap-2">
              <span className="font-mono text-2xl font-bold tracking-widest">{code ?? "…"}</span>
              {code && (
                <button
                  type="button"
                  className="btn"
                  onClick={() =>
                    navigator.clipboard?.writeText(code).then(() => {
                      setCopied(true);
                      setTimeout(() => setCopied(false), 2000);
                    })
                  }
                >
                  <Copy aria-hidden="true" size={16} /> {copied ? "Copied" : "Copy"}
                </button>
              )}
            </div>
            <p className="mt-1 text-sm text-muted">Give it to a classmate so they can add you.</p>
            <form
              className="mt-4"
              onSubmit={(e) => {
                e.preventDefault();
                act(async () => {
                  await addFriendByCode(addCode);
                  setAddCode("");
                });
              }}
            >
              <label htmlFor="add-code" className="label">
                Add a friend
              </label>
              <div className="flex gap-2">
                <input id="add-code" className="field flex-1 font-mono uppercase" maxLength={8} value={addCode} onChange={(e) => setAddCode(e.target.value)} placeholder="AB12CD34" autoComplete="off" />
                <button type="submit" className="btn btn-primary" disabled={busy || addCode.trim().length !== 8}>
                  <UserPlus aria-hidden="true" size={16} /> Add
                </button>
              </div>
            </form>
          </section>

          {error && (
            <p role="alert" className="rounded-[var(--radius-ui)] border border-danger p-3 text-sm text-danger">
              {error}
            </p>
          )}

          {incoming.length > 0 && (
            <section className="tone-card p-5" aria-labelledby="req-title">
              <h2 id="req-title" className="font-semibold">
                Friend requests
              </h2>
              <ul className="mt-3 space-y-2">
                {incoming.map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-medium">{nameOf(f)}</span>
                    <span className="flex gap-2">
                      <button type="button" className="btn btn-primary" disabled={busy} onClick={() => act(() => acceptFriend(f.id))}>
                        Accept
                      </button>
                      <button type="button" className="btn" disabled={busy} onClick={() => act(() => removeFriend(f.id))}>
                        Decline
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="tone-card p-5" aria-labelledby="friends-title">
            <h2 id="friends-title" className="font-semibold">
              Friends
            </h2>
            {accepted.length === 0 && <p className="mt-2 text-sm text-muted">No friends yet. Add one with their code.</p>}
            <ul className="mt-3 space-y-2">
              {accepted.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveId(f.id);
                      setMessages([]);
                      setShare(null);
                    }}
                    className={`block w-full rounded-[var(--radius-ui)] border p-3 text-left text-sm ${f.id === activeId ? "border-accent" : "border-line hover:border-ink"}`}
                  >
                    <span className="block font-medium">{nameOf(f)}</span>
                    <span className="block truncate text-muted">{f.lastText || "Say hello"}</span>
                  </button>
                </li>
              ))}
            </ul>
            {outgoing.length > 0 && (
              <p className="mt-3 text-xs text-muted">Waiting for {outgoing.map(nameOf).join(", ")} to accept.</p>
            )}
          </section>
        </aside>

        <section className="tone-card flex min-h-[32rem] flex-col p-5" aria-label="Messages">
          {!active ? (
            <div className="m-auto max-w-sm text-center text-muted">
              <ChatsCircle aria-hidden="true" size={40} className="mx-auto" />
              <p className="mt-2">Pick a friend to see your messages.</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between gap-3 border-b border-line pb-3">
                <h2 className="font-semibold">{nameOf(active)}</h2>
                <button
                  type="button"
                  className="btn"
                  disabled={busy}
                  onClick={() =>
                    act(async () => {
                      await removeFriend(active.id);
                      setActiveId(null);
                    })
                  }
                >
                  <UserMinus aria-hidden="true" size={16} /> Remove friend
                </button>
              </div>
              <div ref={threadRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto py-4" aria-live="polite">
                {messages.length === 0 && <p className="text-sm text-muted">No messages yet.</p>}
                {messages.map((m) => {
                  const mine = m.by === user.id;
                  return (
                    <div key={m.id} className={mine ? "ml-auto max-w-[85%]" : "max-w-[85%]"}>
                      <p className="mb-1 text-xs text-muted">
                        {mine ? "You" : m.byName}, {when(m.at)}
                      </p>
                      {m.text && (
                        <p className={`whitespace-pre-wrap rounded-[var(--radius-ui)] border p-3 text-sm ${mine ? "border-transparent bg-accent text-accent-ink" : "border-line bg-background"}`}>{m.text}</p>
                      )}
                      {m.card && <CardView card={m.card} />}
                    </div>
                  );
                })}
              </div>

              {share && (
                <div className="mb-3 max-h-56 overflow-y-auto rounded-[var(--radius-ui)] border border-line p-3 text-sm">
                  <p className="font-medium">
                    {share === "session" ? "Share a practice session" : share === "report" ? "Share a report" : "Share research"}
                  </p>
                  <ul className="mt-2 space-y-1.5">
                    {share === "research"
                      ? (research ?? []).map((r) => (
                          <li key={r.id}>
                            <button type="button" className="w-full rounded px-2 py-1 text-left hover:bg-sunk" disabled={busy} onClick={() => sendCard({ kind: "research", id: r.id, title: `${r.country}: ${r.topic}`, committee: r.committee })}>
                              {r.country}: {r.topic}
                            </button>
                          </li>
                        ))
                      : (share === "report" ? reported : practice).map((s) => (
                          <li key={s.id}>
                            <button type="button" className="w-full rounded px-2 py-1 text-left hover:bg-sunk" disabled={busy} onClick={() => sendCard(share === "report" ? reportCard(s) : sessionCard(s))}>
                              {sessionTitle(s)} <span className="text-muted">· {new Date(s.updatedAt).toLocaleDateString()}</span>
                            </button>
                          </li>
                        ))}
                  </ul>
                  {share === "research" && research?.length === 0 && <p className="mt-1 text-muted">No saved research yet.</p>}
                  {share === "report" && reported.length === 0 && <p className="mt-1 text-muted">No reports yet. Finish a practice session first.</p>}
                  {share === "session" && practice.length === 0 && <p className="mt-1 text-muted">No saved sessions yet.</p>}
                </div>
              )}

              <form
                className="border-t border-line pt-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  const t = text.trim();
                  if (t) act(async () => { await sendDirect(active.id, t); setText(""); });
                }}
              >
                <div className="flex gap-2">
                  <label htmlFor="dm" className="sr-only">
                    Message
                  </label>
                  <input id="dm" className="field flex-1" maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} placeholder={`Message ${nameOf(active)}…`} autoComplete="off" />
                  <button type="submit" className="btn btn-primary" disabled={busy || !text.trim()}>
                    <ArrowUp aria-hidden="true" size={16} weight="bold" /> Send
                  </button>
                </div>
                <div className="mt-2 flex flex-wrap gap-2 text-sm">
                  <span className="self-center text-muted">Share:</span>
                  {(
                    [
                      ["session", "Practice session"],
                      ["report", "Report"],
                      ["research", "Research"],
                    ] as const
                  ).map(([k, label]) => (
                    <button key={k} type="button" aria-pressed={share === k} className={`btn ${share === k ? "border-accent" : ""}`} onClick={() => setShare(share === k ? null : k)}>
                      {label}
                    </button>
                  ))}
                </div>
              </form>
            </>
          )}
        </section>
      </div>
    </main>
  );
}
