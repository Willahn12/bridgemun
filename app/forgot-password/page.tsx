"use client";

import { useState } from "react";
import Link from "next/link";
import AuthShell from "@/components/AuthShell";
import { supabase } from "@/lib/supabase";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabase().auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setBusy(false);
    if (error) {
      setError(error.message.toLowerCase().includes("rate limit") ? "Too many attempts. Wait a minute and try again." : error.message);
    } else {
      setSent(true);
    }
  }

  return (
    <AuthShell title="Reset your password" text="Enter your email and we will send you a link to choose a new password.">
      {sent ? (
        <div role="status" className="tone-card p-5 sm:p-7">
          <p className="font-display text-xl font-bold">Check your email</p>
          <p className="mt-2 leading-relaxed text-muted">
            If there is an account for {email.trim()}, a link is on its way. Open it on this device to choose a new
            password. Check your spam folder if it does not arrive in a few minutes.
          </p>
          <Link href="/login" className="btn mt-5">
            Back to sign in
          </Link>
        </div>
      ) : (
        <form onSubmit={submit} className="tone-card p-5 sm:p-7">
          <label htmlFor="email" className="label">
            Email
          </label>
          <input
            id="email"
            name="email"
            type="email"
            spellCheck={false}
            autoComplete="email"
            className="field"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          {error && (
            <p role="alert" className="mt-4 text-sm text-danger">
              {error}
            </p>
          )}
          <button type="submit" disabled={!email.trim() || busy} className="btn btn-primary mt-5 w-full">
            {busy ? "Sending…" : "Send reset link"}
          </button>
          <p className="mt-4 text-sm text-muted">
            <Link href="/login" className="font-medium text-accent hover:underline">
              Back to sign in
            </Link>
          </p>
        </form>
      )}
    </AuthShell>
  );
}
