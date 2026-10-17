import { createHmac } from "node:crypto";

/* Zoom, server side. Two Zoom Marketplace apps are needed (see ROADMAP.md):
   - a Meeting SDK app (ZOOM_SDK_KEY / ZOOM_SDK_SECRET) that signs the token people join with;
   - a Server-to-Server OAuth app (ZOOM_ACCOUNT_ID / ZOOM_CLIENT_ID / ZOOM_CLIENT_SECRET) that creates
     one meeting per forum on the school's Zoom account.
   Without them every route answers 501 and the forum simply runs without video. */

const env = (k: string) => process.env[k]?.trim() || "";

export const zoomConfigured = () =>
  !!(env("ZOOM_SDK_KEY") && env("ZOOM_SDK_SECRET") && env("ZOOM_ACCOUNT_ID") && env("ZOOM_CLIENT_ID") && env("ZOOM_CLIENT_SECRET"));

/** Checks a Firebase ID token with Firebase's own REST API, so only signed-in BridgeMUN users can use these routes. */
export async function verifyUser(req: Request): Promise<string | null> {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  const key = env("NEXT_PUBLIC_FIREBASE_API_KEY");
  if (!token || !key) return null;
  const res = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: token }),
  }).catch(() => null);
  if (!res?.ok) return null;
  const body = (await res.json()) as { users?: { localId?: string }[] };
  return body.users?.[0]?.localId ?? null;
}

const b64url = (v: string | Buffer) => Buffer.from(v).toString("base64url");

/** The signature the Meeting SDK needs to join one meeting. Everyone joins as an attendee (role 0);
    meetings are created to run without a host, so nobody needs the account owner's sign-in. */
export function sdkSignature(meetingNumber: string): string {
  const iat = Math.floor(Date.now() / 1000) - 30;
  const exp = iat + 60 * 60 * 2;
  const header = b64url(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = b64url(
    JSON.stringify({
      appKey: env("ZOOM_SDK_KEY"),
      sdkKey: env("ZOOM_SDK_KEY"),
      mn: meetingNumber,
      role: 0,
      iat,
      exp,
      tokenExp: exp,
      video_webrtc_mode: 1,
    }),
  );
  const sig = createHmac("sha256", env("ZOOM_SDK_SECRET")).update(`${header}.${payload}`).digest("base64url");
  return `${header}.${payload}.${sig}`;
}

export const sdkKey = () => env("ZOOM_SDK_KEY");

let cached: { token: string; until: number } | null = null;

async function accessToken(): Promise<string> {
  if (cached && cached.until > Date.now() + 60_000) return cached.token;
  const basic = Buffer.from(`${env("ZOOM_CLIENT_ID")}:${env("ZOOM_CLIENT_SECRET")}`).toString("base64");
  const res = await fetch(`https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(env("ZOOM_ACCOUNT_ID"))}`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}` },
  });
  if (!res.ok) throw new Error(`Zoom sign-in failed (${res.status}). Check the Server-to-Server OAuth keys.`);
  const body = (await res.json()) as { access_token: string; expires_in: number };
  cached = { token: body.access_token, until: Date.now() + body.expires_in * 1000 };
  return body.access_token;
}

/** A new meeting for one forum: anyone with the link can join without waiting for a host, muted at first. */
export async function createMeeting(topic: string, minutes: number): Promise<{ meetingNumber: string; password: string }> {
  const res = await fetch("https://api.zoom.us/v2/users/me/meetings", {
    method: "POST",
    headers: { Authorization: `Bearer ${await accessToken()}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      topic: topic.slice(0, 200),
      type: 1, // instant
      duration: Math.min(Math.max(minutes, 15), 300),
      settings: {
        join_before_host: true,
        jbh_time: 0,
        waiting_room: false,
        mute_upon_entry: true,
        host_video: false,
        participant_video: false,
      },
    }),
  });
  if (!res.ok) throw new Error(`Zoom could not create the meeting (${res.status}).`);
  const m = (await res.json()) as { id: number; password?: string };
  return { meetingNumber: String(m.id), password: m.password ?? "" };
}
