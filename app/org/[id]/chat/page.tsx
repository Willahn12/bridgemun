"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUp, Hash, Trash } from "@phosphor-icons/react";
import { useOrgContext } from "@/components/org/OrgProvider";
import {
  createChannel,
  deleteMessage,
  listChannels,
  listMessages,
  sendMessage,
  watchMessages,
  type Channel,
  type Message,
} from "@/lib/classroom";
import { friendlyOrgError } from "@/lib/orgs";

export default function ChatPage() {
  const { org, userId, isStaff, names } = useOrgContext();
  const [channels, setChannels] = useState<Channel[] | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [tick, setTick] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  // Channels. Teachers get a "general" channel automatically the first time.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let list = await listChannels(org.id);
        if (list.length === 0 && isStaff) list = [await createChannel(org.id, "general")];
        if (cancelled) return;
        setChannels(list);
        setActive((cur) => (cur && list.some((c) => c.id === cur) ? cur : (list[0]?.id ?? null)));
      } catch (e) {
        if (!cancelled) setError(friendlyOrgError(e instanceof Error ? e.message : "Could not load chat."));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [org.id, isStaff, tick]);

  // Messages for the open channel, kept live.
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    listMessages(active)
      .then((m) => !cancelled && setMessages(m))
      .catch((e) => !cancelled && setError(friendlyOrgError(e.message)));
    const stop = watchMessages(
      active,
      (m) => setMessages((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, m])),
      (id) => setMessages((cur) => cur.filter((x) => x.id !== id)),
    );
    return () => {
      cancelled = true;
      stop();
    };
  }, [active]);

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages]);

  async function send() {
    const body = input.trim();
    if (!body || !active) return;
    setInput("");
    setError(null);
    try {
      const m = await sendMessage(active, userId, body);
      setMessages((cur) => (cur.some((x) => x.id === m.id) ? cur : [...cur, m]));
    } catch (e) {
      setInput(body);
      setError(friendlyOrgError(e instanceof Error ? e.message : "Could not send."));
    }
  }

  async function addChannel(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const c = await createChannel(org.id, newName);
      setNewName("");
      setActive(c.id);
      setTick((t) => t + 1);
    } catch (err) {
      setError(friendlyOrgError(err instanceof Error ? err.message : "Could not create the channel."));
    }
  }

  const current = channels?.find((c) => c.id === active);

  return (
    <main className="mx-auto max-w-4xl px-4 pb-16 pt-8 sm:px-6">
      {error && (
        <p role="alert" className="mb-4 text-sm text-danger">
          {error}
        </p>
      )}

      {channels === null && !error && <div className="h-64 animate-pulse rounded-[var(--radius-ui)] bg-sunk" aria-label="Loading" />}

      {channels?.length === 0 && (
        <p className="max-w-[52ch] leading-relaxed text-muted">
          No chat channels yet. A teacher needs to open this tab once to set up the first one.
        </p>
      )}

      {channels && channels.length > 0 && (
        <div className="grid gap-6 md:grid-cols-[11rem_minmax(0,1fr)]">
          <div>
            <h2 className="mb-2 text-sm font-semibold">Channels</h2>
            <ul className="flex gap-1 overflow-x-auto md:block md:space-y-1">
              {channels.map((c) => (
                <li key={c.id} className="shrink-0">
                  <button
                    type="button"
                    onClick={() => setActive(c.id)}
                    aria-current={c.id === active ? "true" : undefined}
                    className={`flex w-full items-center gap-1.5 rounded-[var(--radius-ui)] px-3 py-2 text-left text-sm transition-colors ${
                      c.id === active ? "bg-sunk font-medium" : "text-muted hover:bg-sunk hover:text-ink"
                    }`}
                  >
                    <Hash aria-hidden="true" size={14} /> {c.name}
                  </button>
                </li>
              ))}
            </ul>
            {isStaff && (
              <form onSubmit={addChannel} className="mt-3">
                <label htmlFor="new-channel" className="sr-only">
                  New channel name
                </label>
                <input id="new-channel" className="field !py-1.5 text-sm" value={newName} maxLength={40} placeholder="New channel" onChange={(e) => setNewName(e.target.value)} />
                <button type="submit" className="btn mt-2 w-full !py-1.5 text-sm" disabled={newName.trim().length < 2}>
                  Add channel
                </button>
              </form>
            )}
          </div>

          <section aria-label={current ? `Chat in ${current.name}` : "Chat"} className="flex min-w-0 flex-col rounded-[var(--radius-ui)] border border-line bg-surface">
            <div ref={listRef} className="h-[52dvh] space-y-4 overflow-y-auto p-4" aria-live="polite">
              {messages.length === 0 && <p className="text-sm text-muted">No messages yet. Say hello.</p>}
              {messages.map((m) => {
                const mine = m.userId === userId;
                return (
                  <div key={m.id} className="group">
                    <p className="text-xs text-muted">
                      <span className="font-medium text-ink">{names.get(m.userId) ?? "Former member"}</span>{" "}
                      {new Date(m.createdAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}
                      {(mine || isStaff) && (
                        <button
                          type="button"
                          aria-label="Delete message"
                          onClick={() => deleteMessage(m.id).catch((e) => setError(friendlyOrgError(e.message)))}
                          className="ml-2 inline-flex align-middle text-muted opacity-0 transition-opacity hover:text-danger focus-visible:opacity-100 group-hover:opacity-100"
                        >
                          <Trash aria-hidden="true" size={13} />
                        </button>
                      )}
                    </p>
                    <p className="mt-0.5 whitespace-pre-wrap break-words leading-relaxed">{m.body}</p>
                  </div>
                );
              })}
            </div>
            <div className="flex items-end gap-2 border-t border-line p-3">
              <label htmlFor="msg" className="sr-only">
                Message
              </label>
              <textarea
                id="msg"
                rows={1}
                className="field resize-none"
                value={input}
                maxLength={2000}
                placeholder={current ? `Message #${current.name}` : "Message"}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    send();
                  }
                }}
              />
              <button type="button" className="btn btn-primary" onClick={send} disabled={!input.trim()} aria-label="Send message">
                <ArrowUp aria-hidden="true" size={18} weight="bold" />
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
