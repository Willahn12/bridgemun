/* Server-side checks against Firebase, without the Admin SDK: the caller's ID token is verified with
   Firebase Auth's REST API, and documents are read through Firestore's REST API *as that user*, so the
   same security rules apply as in the browser. */

const env = (k: string) => process.env[k]?.trim() || "";

/* With `npm run dev:emu` the same REST calls go to the local emulators (see lib/firebase.ts). */
const EMU = env("NEXT_PUBLIC_USE_EMULATORS") === "1";
const AUTH_BASE = EMU ? "http://127.0.0.1:9099/identitytoolkit.googleapis.com" : "https://identitytoolkit.googleapis.com";
const FIRESTORE_BASE = EMU ? "http://127.0.0.1:8080" : "https://firestore.googleapis.com";

export function idTokenOf(req: Request): string | null {
  return req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || null;
}

/** The signed-in user's id, or null if the token is missing or invalid. */
export async function verifyUser(req: Request): Promise<string | null> {
  const token = idTokenOf(req);
  const key = EMU ? "demo-key" : env("NEXT_PUBLIC_FIREBASE_API_KEY");
  if (!token || !key) return null;
  const res = await fetch(`${AUTH_BASE}/v1/accounts:lookup?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: token }),
  }).catch(() => null);
  if (!res?.ok) return null;
  const body = (await res.json()) as { users?: { localId?: string }[] };
  return body.users?.[0]?.localId ?? null;
}

type Value = { stringValue?: string; booleanValue?: boolean; nullValue?: null; integerValue?: string };

/** Reads one Firestore document as the caller. Null if it does not exist or they may not read it. */
export async function readDoc(path: string, idToken: string): Promise<Record<string, Value> | null> {
  const project = EMU ? "demo-bridgemun" : env("NEXT_PUBLIC_FIREBASE_PROJECT_ID");
  const res = await fetch(`${FIRESTORE_BASE}/v1/projects/${project}/databases/(default)/documents/${path}`, {
    headers: { Authorization: `Bearer ${idToken}` },
    cache: "no-store",
  }).catch(() => null);
  if (!res?.ok) return null;
  const body = (await res.json()) as { fields?: Record<string, Value> };
  return body.fields ?? {};
}
