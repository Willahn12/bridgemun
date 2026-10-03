"use client";

import Link from "next/link";
import { useAuth } from "@/lib/auth";

export default function SaveChoice({ onChoose }: { onChoose: (save: boolean) => void }) {
  const { user, ready } = useAuth();

  if (!ready) {
    return <div className="h-40 animate-pulse rounded-[var(--radius-ui)] bg-sunk" aria-label="Loading" />;
  }

  return (
    <div className="rounded-[var(--radius-ui)] border border-line bg-surface p-5 sm:p-6" role="group" aria-labelledby="save-title">
      {user ? (
        <>
          <h2 id="save-title" className="text-lg font-semibold tracking-tight">
            Save this session to your account?
          </h2>
          <p className="mt-2 max-w-[60ch] leading-relaxed text-muted">
            Saved sessions are kept under Past chats in the top menu, with your report and coaching, on any
            device you sign in from. If you choose not to save, you still get a report, but it disappears
            when you close the tab.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <button type="button" className="btn btn-primary" onClick={() => onChoose(true)}>
              Save to my account
            </button>
            <button type="button" className="btn" onClick={() => onChoose(false)}>
              Do not save
            </button>
          </div>
        </>
      ) : (
        <>
          <h2 id="save-title" className="text-lg font-semibold tracking-tight">
            You are not signed in
          </h2>
          <p className="mt-2 max-w-[60ch] leading-relaxed text-muted">
            Only signed-in users can save sessions. If you continue without signing in, this conversation
            and its report will be deleted as soon as you leave.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <Link href="/login" className="btn btn-primary">
              Sign in to save
            </Link>
            <button type="button" className="btn" onClick={() => onChoose(false)}>
              Continue without saving
            </button>
          </div>
        </>
      )}
    </div>
  );
}
