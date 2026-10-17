"use client";

import { auth } from "@/lib/firebase";

/* Browser side of the Zoom routes in app/api/zoom. Every call carries the user's Firebase ID token. */

async function authed(path: string, body: unknown) {
  const token = await auth().currentUser?.getIdToken();
  if (!token) throw new Error("Sign in first.");
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  const got = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(got.error ?? "Video is not available right now.");
  return got;
}

let configured: Promise<boolean> | null = null;

/** Whether the server has Zoom keys. Asked once per page load. */
export function zoomAvailable(): Promise<boolean> {
  configured ??= fetch("/api/zoom/meeting")
    .then((r) => r.json())
    .then((b: { configured?: boolean }) => b.configured === true)
    .catch(() => false);
  return configured;
}

export const createForumMeeting = (topic: string, minutes: number): Promise<{ meetingNumber: string; password: string }> =>
  authed("/api/zoom/meeting", { topic, minutes });

export const joinToken = (meetingNumber: string): Promise<{ signature: string; sdkKey: string }> =>
  authed("/api/zoom/signature", { meetingNumber });
