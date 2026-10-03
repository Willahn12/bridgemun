"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, EyeSlash } from "@phosphor-icons/react";
import { useRouter } from "next/navigation";
import {
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
} from "firebase/auth";
import { doc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { useAuth } from "@/lib/auth";
import AuthShell from "@/components/AuthShell";

function friendly(code: string): string {
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) {
    return "That email and password do not match.";
  }
  if (code.includes("email-already-in-use")) return "An account with this email already exists. Sign in instead.";
  if (code.includes("too-many-requests")) return "Too many attempts. Wait a minute and try again.";
  if (code.includes("weak-password")) return "Choose a stronger password, at least 8 characters.";
  if (code.includes("network-request-failed")) return "Could not reach the server. Check your connection.";
  return code.replace("auth/", "").replace(/-/g, " ") || "Something went wrong";
}

export default function AuthForm({ mode, created }: { mode: "signin" | "signup"; created?: "1" | "confirm" }) {
  const router = useRouter();
  const { user, ready } = useAuth();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const signup = mode === "signup";
  const valid = email.trim() !== "" && password.length >= 8 && (!signup || name.trim() !== "");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (signup) {
        const cred = await createUserWithEmailAndPassword(auth(), email.trim(), password);
        await updateProfile(cred.user, { displayName: name.trim() });
        await setDoc(doc(db(), "users", cred.user.uid), { displayName: name.trim(), createdAt: serverTimestamp() });
        sendEmailVerification(cred.user).catch(() => {});
        await firebaseSignOut(auth());
        router.push("/login?created=1");
        return;
      }
      await signInWithEmailAndPassword(auth(), email.trim(), password);
      router.push("/");
    } catch (err) {
      setError(friendly(err instanceof Error ? err.message : "Something went wrong"));
      setBusy(false);
    }
  }

  if (ready && user && !busy) {
    return (
      <AuthShell title="You are signed in" text={`Signed in as ${user.email}.`}>
        <Link href="/" className="btn btn-primary">
          Go to home
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={signup ? "Create your account" : "Welcome back"}
      text={
        signup
          ? "Accounts keep your sessions and reports, and let you join a class."
          : "Sign in to save your sessions and see them on any device."
      }
    >
      {created && !signup && (
        <p role="status" className="tone-card mb-6 p-3 text-sm leading-relaxed">
          Your account was created. Sign in below.
        </p>
      )}

      <form onSubmit={submit} className="tone-card p-5 sm:p-7">
        <div className="grid gap-4">
          {signup && (
            <div>
              <label htmlFor="name" className="label">Your name</label>
              <input id="name" name="name" className="field" autoComplete="name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
            </div>
          )}
          <div>
            <label htmlFor="email" className="label">Email</label>
            <input id="email" name="email" type="email" spellCheck={false} className="field" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div>
            <label htmlFor="password" className="label">Password</label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={showPassword ? "text" : "password"}
                className="field pr-11"
                autoComplete={signup ? "new-password" : "current-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded p-2 text-muted transition-colors hover:text-ink"
              >
                {showPassword ? <EyeSlash aria-hidden="true" size={18} /> : <Eye aria-hidden="true" size={18} />}
              </button>
            </div>
            {signup ? (
              <p className="helper">At least 8 characters.</p>
            ) : (
              <p className="helper">
                <Link href="/forgot-password" className="font-medium text-accent hover:underline">
                  Forgot your password?
                </Link>
              </p>
            )}
          </div>
        </div>

        {error && (
          <p role="alert" className="mt-4 text-sm text-danger">
            {error}
          </p>
        )}

        <button type="submit" disabled={!valid || busy} className="btn btn-primary mt-5 w-full">
          {busy ? "Please wait…" : signup ? "Create account" : "Sign in"}
        </button>
      </form>

      <p className="mt-5 text-sm text-muted">
        {signup ? "Already have an account? " : "New to BridgeMUN? "}
        <Link href={signup ? "/login" : "/signup"} className="font-medium text-accent hover:underline">
          {signup ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </AuthShell>
  );
}
