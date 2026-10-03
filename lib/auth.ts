"use client";

import { useSyncExternalStore } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

export interface AuthState {
  user: User | null;
  /** False until the first check of the stored login has finished. */
  ready: boolean;
}

const LOADING: AuthState = { user: null, ready: false };
let state: AuthState = LOADING;
let started = false;
const listeners = new Set<() => void>();

function set(next: AuthState) {
  state = next;
  listeners.forEach((l) => l());
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  const sb = supabase();
  sb.auth.getSession().then(({ data }) => set({ user: data.session?.user ?? null, ready: true }));
  sb.auth.onAuthStateChange((_event, session) => set({ user: session?.user ?? null, ready: true }));
}

export function useAuth(): AuthState {
  return useSyncExternalStore(
    (cb) => {
      start();
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => LOADING,
  );
}

export function currentUser(): User | null {
  return state.user;
}

export function subscribeAuth(cb: () => void): () => void {
  start();
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function displayName(user: User): string {
  const meta = user.user_metadata as { full_name?: string } | undefined;
  return meta?.full_name?.trim() || user.email?.split("@")[0] || "Account";
}

export async function signOut() {
  await supabase().auth.signOut();
}
