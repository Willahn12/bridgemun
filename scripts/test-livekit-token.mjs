/* Checks /api/livekit/token against the local emulators (npm run emulators + npm run dev:emu):
   only the member whose turn it is may publish; other members only subscribe; outsiders and
   non-live forums are refused. Also checks the LiveKit keys work against LiveKit Cloud. */
import fs from "node:fs";
import { RoomServiceClient } from "livekit-server-sdk";

const env = Object.fromEntries(
  fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);
const AUTH = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";
const FS = "http://127.0.0.1:8080/v1/projects/demo-bridgemun/databases/(default)/documents";
const APP = "http://localhost:3000";

async function signIn(email, password) {
  const r = await fetch(`${AUTH}/accounts:signInWithPassword?key=demo-key`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const b = await r.json();
  if (!r.ok) throw new Error(`sign in ${email}: ${JSON.stringify(b)}`);
  return { uid: b.localId, token: b.idToken };
}
async function signUp(email, password) {
  const r = await fetch(`${AUTH}/accounts:signUp?key=demo-key`, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  return r.ok ? signIn(email, password) : signIn(email, password);
}
const str = (v) => ({ stringValue: v });
async function put(path, fields) {
  // "Bearer owner" bypasses security rules in the emulator, to set up the fixture.
  const r = await fetch(`${FS}/${path}`, {
    method: "PATCH", headers: { "Content-Type": "application/json", Authorization: "Bearer owner" },
    body: JSON.stringify({ fields }),
  });
  if (!r.ok) throw new Error(`write ${path}: ${await r.text()}`);
}
async function ticket(roomId, token) {
  const r = await fetch(`${APP}/api/livekit/token`, {
    method: "POST", headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ roomId }),
  });
  return { status: r.status, body: await r.json().catch(() => ({})) };
}
const grants = (jwt) => JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString()).video;

let failed = 0;
const check = (name, ok, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  (${extra})` : ""}`);
  if (!ok) failed++;
};

const host = await signIn(env.TEST_HOST_EMAIL, env.TEST_HOST_PASSWORD);
const del = await signIn(env.TEST_DELEGATE_EMAIL, env.TEST_DELEGATE_PASSWORD);
const outsider = await signUp("outsider@bridgemun.test", "Outsider-123456");

const roomId = `lktest${Date.now()}`;
await put(`rooms/${roomId}`, { host_id: str(host.uid), status: str("live"), turn_user: str(del.uid), topic: str("LiveKit test") });
await put(`rooms/${roomId}/members/${host.uid}`, { user_id: str(host.uid), name: str("Host Tester"), country: str("France") });
await put(`rooms/${roomId}/members/${del.uid}`, { user_id: str(del.uid), name: str("Delegate Tester"), country: str("Philippines") });

const cfg = await (await fetch(`${APP}/api/livekit/token`)).json();
check("LiveKit reported as configured", cfg.configured === true);

const d = await ticket(roomId, del.token);
check("speaker gets a ticket", d.status === 200, `status ${d.status} ${d.body.error ?? ""}`);
if (d.body.token) {
  const g = grants(d.body.token);
  check("speaker may publish mic + camera", d.body.speaker === true && g.canPublish === true && g.canPublishSources?.length === 2, JSON.stringify(g.canPublishSources));
  check("ticket is for this forum's room", g.room === `forum-${roomId}`, g.room);
}
const h = await ticket(roomId, host.token);
check("listener gets a ticket", h.status === 200, `status ${h.status} ${h.body.error ?? ""}`);
if (h.body.token) {
  const g = grants(h.body.token);
  check("listener may NOT publish", h.body.speaker === false && !g.canPublish, JSON.stringify({ canPublish: g.canPublish }));
  check("listener may subscribe", g.canSubscribe === true);
}
const o = await ticket(roomId, outsider.token);
check("non-member refused", o.status === 403, `status ${o.status}`);
const n = await ticket(roomId, null);
check("signed-out refused", n.status === 401, `status ${n.status}`);
check("bad room id refused", (await ticket("x", del.token)).status === 400);

await put(`rooms/${roomId}`, { host_id: str(host.uid), status: str("lobby"), turn_user: str(del.uid), topic: str("LiveKit test") });
check("lobby forum refused", (await ticket(roomId, del.token)).status === 409);

try {
  const svc = new RoomServiceClient(env.LIVEKIT_URL.replace(/^wss:/, "https:"), env.LIVEKIT_API_KEY, env.LIVEKIT_API_SECRET);
  const rooms = await svc.listRooms();
  check("LiveKit Cloud accepts the keys", Array.isArray(rooms), `${rooms.length} active rooms`);
} catch (e) {
  check("LiveKit Cloud accepts the keys", false, e.message);
}

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
