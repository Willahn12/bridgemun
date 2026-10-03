"use client";

import { useState } from "react";
import Link from "next/link";
import { sendPasswordResetEmail } from "firebase/auth";
import AuthShell from "@/components/AuthShell";
import { auth } from "@/lib/firebase";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await sendPasswordResetEmail(auth(), email.trim(), {
        url: `${window.location.origin}/reset-password`,
        handleCodeInApp: true,
      });
      setSent(true);
    } catch (err) {
      const code = err instanceof Error ? err.message : "";
      // Firebase refuses to confirm whether the address exists, so most failures still show the "check your email" state.
      if (code.includes("too-many-requests")) {
        setError("Too many attempts. Wait a minute and try again.");
      } else {
        setSent(true);
      }
    }
    setBusy(false);
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
