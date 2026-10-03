"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthShell from "@/components/AuthShell";
import { useAuth } from "@/lib/auth";
import { supabase } from "@/lib/supabase";

/* The link in the reset email brings people here already signed in for a short while.
   From there they can choose a new password. */
export default function ResetPasswordPage() {
  const router = useRouter();
  const { user, ready } = useAuth();
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mismatch = again !== "" && password !== again;
  const valid = password.length >= 8 && password === again;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase().auth.updateUser({ password });
    if (error) {
      setError(error.message);
      setBusy(false);
      return;
    }
    router.push("/");
  }

  if (!ready) {
    return (
      <AuthShell title="Choose a new password" text="One moment.">
        <div className="h-48 animate-pulse rounded-[var(--radius-ui)] bg-sunk" aria-label="Loading" />
      </AuthShell>
    );
  }

  if (!user) {
    return (
      <AuthShell title="This link has expired" text="Reset links only work once, and only for a short time.">
        <Link href="/forgot-password" className="btn btn-primary">
          Send a new link
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Choose a new password" text="Pick something you have not used before. At least 8 characters.">
      <form onSubmit={submit} className="tone-card p-5 sm:p-7">
        <div className="grid gap-4">
          <div>
            <label htmlFor="new-password" className="label">
              New password
            </label>
            <input
              id="new-password"
              type="password"
              autoComplete="new-password"
              className="field"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          <div>
            <label htmlFor="again" className="label">
              Type it again
            </label>
            <input
              id="again"
              type="password"
              autoComplete="new-password"
              className="field"
              value={again}
              onChange={(e) => setAgain(e.target.value)}
            />
            {mismatch && <p className="helper text-danger">The two passwords do not match.</p>}
          </div>
        </div>
        {error && (
          <p role="alert" className="mt-4 text-sm text-danger">
            {error}
          </p>
        )}
        <button type="submit" disabled={!valid || busy} className="btn btn-primary mt-5 w-full">
          {busy ? "Saving…" : "Save new password"}
        </button>
      </form>
    </AuthShell>
  );
}
