"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { confirmPasswordReset, verifyPasswordResetCode } from "firebase/auth";
import AuthShell from "@/components/AuthShell";
import { auth } from "@/lib/firebase";

/* The link in the reset email brings people here with a one-time code in the URL
   (?oobCode=...). From there they can choose a new password. */
export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<AuthShell title="Choose a new password" text="One moment."><div className="h-48 animate-pulse rounded-[var(--radius-ui)] bg-sunk" aria-label="Loading" /></AuthShell>}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const oobCode = searchParams.get("oobCode");
  const [checking, setChecking] = useState(true);
  const [validCode, setValidCode] = useState(false);
  const [password, setPassword] = useState("");
  const [again, setAgain] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!oobCode) {
      setChecking(false);
      return;
    }
    verifyPasswordResetCode(auth(), oobCode)
      .then(() => setValidCode(true))
      .catch(() => setValidCode(false))
      .finally(() => setChecking(false));
  }, [oobCode]);

  const mismatch = again !== "" && password !== again;
  const valid = password.length >= 8 && password === again;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!oobCode) return;
    setBusy(true);
    setError(null);
    try {
      await confirmPasswordReset(auth(), oobCode, password);
      router.push("/login?created=1");
    } catch (err) {
      setError(err instanceof Error ? err.message.replace("auth/", "").replace(/-/g, " ") : "Something went wrong");
      setBusy(false);
    }
  }

  if (checking) {
    return (
      <AuthShell title="Choose a new password" text="One moment.">
        <div className="h-48 animate-pulse rounded-[var(--radius-ui)] bg-sunk" aria-label="Loading" />
      </AuthShell>
    );
  }

  if (!oobCode || !validCode) {
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
