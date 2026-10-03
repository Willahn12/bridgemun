"use client";

import { useSyncExternalStore } from "react";
import { onAuthStateChanged, signOut as firebaseSignOut } from "firebase/auth";
import { auth } from "@/lib/firebase";

export interface AppUser {
  id: string;
  email: string | null;
  name: string;
}

export interface AuthState {
  user: AppUser | null;
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

function toAppUser(u: { uid: string; email: string | null; displayName: string | null }): AppUser {
  return { id: u.uid, email: u.email, name: u.displayName?.trim() || u.email?.split("@")[0] || "Account" };
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  onAuthStateChanged(auth(), (u) => set({ user: u ? toAppUser(u) : null, ready: true }));
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

export function currentUser(): AppUser | null {
  return state.user;
}

export function subscribeAuth(cb: () => void): () => void {
  start();
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function displayName(user: AppUser): string {
  return user.name;
}

export async function signOut() {
  await firebaseSignOut(auth());
}
