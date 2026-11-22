import { NextResponse } from "next/server";
import { idTokenOf, verifyUser } from "@/lib/serverAuth";

/* Abuse guard for the routes that spend money (OpenAI, ElevenLabs). Signed-in users are limited per
   account; visitors who are not signed in (practise without saving) get a smaller limit per IP address.
   A token that is present but invalid is refused, so nobody can dodge their account limit with junk. */

const WINDOW_MS = 60_000;
const MAX_BODY = 300_000; // bytes; a full 200-line transcript is well under this
// shortcut: counts live in this server process's memory, so each instance has its own limit and a
// restart resets it. Fine for one small server; move to Firestore/Redis if you run several instances.
const hits = new Map<string, number[]>();

function ipOf(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
}

function overLimit(key: string, perMinute: number): boolean {
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= perMinute) {
    hits.set(key, recent);
    return true;
  }
  recent.push(now);
  hits.set(key, recent);
  if (hits.size > 10_000) for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k);
  return false;
}

/** Returns an error response to send back, or null when the request may go ahead. */
export async function guard(req: Request, route: string, perMinute: number): Promise<NextResponse | null> {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_BODY) {
    return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  }
  let key: string;
  let limit = perMinute;
  if (idTokenOf(req)) {
    const uid = await verifyUser(req);
    if (!uid) return NextResponse.json({ error: "Your sign-in has expired. Please sign in again." }, { status: 401 });
    key = `${route}:u:${uid}`;
  } else {
    key = `${route}:ip:${ipOf(req)}`;
    limit = Math.max(2, Math.floor(perMinute / 2));
  }
  if (overLimit(key, limit)) {
    return NextResponse.json({ error: "Too many requests. Wait a minute and try again." }, { status: 429, headers: { "Retry-After": "60" } });
  }
  return null;
}
