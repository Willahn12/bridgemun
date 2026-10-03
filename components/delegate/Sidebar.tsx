"use client";

import { useState } from "react";
import Link from "next/link";
import { Plus, Trash } from "@phosphor-icons/react";
import { useAuth } from "@/lib/auth";
import { MODE_LABEL, deleteSession, sessionTitle, useSavedSessions, useSaveError, type Session } from "@/lib/sessions";

export default function Sidebar({
  activeId,
  onOpen,
  onNew,
}: {
  activeId: string | null;
  onOpen: (s: Session) => void;
  onNew: () => void;
}) {
  const sessions = useSavedSessions();
  const { user, ready } = useAuth();
  const saveError = useSaveError();
  const [confirmId, setConfirmId] = useState<string | null>(null);

  return (
    <aside aria-label="Saved sessions" className="lg:sticky lg:top-20 lg:self-start">
      <button type="button" className="btn btn-primary w-full" onClick={onNew}>
        <Plus aria-hidden="true" size={18} /> New session
      </button>

      <div className="mb-2 mt-6 flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-semibold">Saved sessions</h2>
        <Link href="/history" className="text-xs font-medium text-accent hover:underline">
          Past chats
        </Link>
      </div>
      {saveError && (
        <p role="alert" className="mb-2 text-sm text-danger">
          {saveError}
        </p>
      )}
      {ready && !user ? (
        <p className="text-sm leading-relaxed text-muted">
          <Link href="/login" className="font-medium text-accent hover:underline">
            Sign in
          </Link>{" "}
          to save your sessions and reports. Without an account, sessions are deleted when you leave.
        </p>
      ) : sessions.length === 0 ? (
        <p className="text-sm leading-relaxed text-muted">
          Nothing saved yet. Sessions you choose to save will be listed here.
        </p>
      ) : (
        <ul className="max-h-[50dvh] space-y-1 overflow-y-auto pr-1 lg:max-h-[calc(100dvh-14rem)]">
          {sessions.map((s) => (
            <li key={s.id} className="group relative">
              <button
                type="button"
                onClick={() => onOpen(s)}
                aria-current={s.id === activeId ? "true" : undefined}
                className={`w-full rounded-[var(--radius-ui)] px-3 py-2.5 pr-10 text-left transition-colors ${
                  s.id === activeId ? "bg-sunk" : "hover:bg-sunk"
                }`}
              >
                <span className="block truncate text-sm font-medium">{sessionTitle(s)}</span>
                <span className="block truncate text-xs text-muted">
                  {MODE_LABEL[s.mode]}, {new Date(s.updatedAt).toLocaleDateString()}
                  {s.report ? ", report ready" : ""}
                </span>
              </button>
              <button
                type="button"
                aria-label={confirmId === s.id ? `Confirm deleting session ${sessionTitle(s)}` : `Delete session ${sessionTitle(s)}`}
                onClick={() => {
                  if (confirmId !== s.id) return setConfirmId(s.id);
                  setConfirmId(null);
                  deleteSession(s.id);
                }}
                onBlur={() => setConfirmId(null)}
                className={`absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-1.5 text-xs transition-opacity focus-visible:opacity-100 ${
                  confirmId === s.id ? "bg-sunk font-medium text-danger opacity-100" : "text-muted opacity-0 hover:text-danger group-hover:opacity-100"
                }`}
              >
                {confirmId === s.id ? "Delete?" : <Trash aria-hidden="true" size={16} />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
