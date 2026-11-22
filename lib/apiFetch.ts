"use client";

import { auth } from "@/lib/firebase";

/* fetch() for our own /api routes: adds the signed-in user's ID token so the server can apply their
   account's limits (see lib/apiGuard.ts). Works the same when nobody is signed in. */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await auth().currentUser?.getIdToken().catch(() => undefined);
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  return fetch(path, { ...init, headers });
}
