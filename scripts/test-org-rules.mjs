/* Checks the organization, invite and chat rules in firestore.rules against the emulators (npm run emulators). */
import fs from "node:fs";
import { initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { collection, connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocs, getFirestore, query, serverTimestamp, setDoc, where } from "firebase/firestore";

const env = Object.fromEntries(
  fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8").split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()]),
);

async function as(name, email, password) {
  const app = initializeApp({ apiKey: "demo-key", projectId: "demo-bridgemun" }, name);
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
  const db = getFirestore(app);
  connectFirestoreEmulator(db, "127.0.0.1", 8080);
  const cred = await signInWithEmailAndPassword(auth, email, password).catch(() => createUserWithEmailAndPassword(auth, email, password));
  return { db, uid: cred.user.uid };
}

let failed = 0;
async function expect(name, shouldPass, fn) {
  let ok = true;
  try { await fn(); } catch { ok = false; }
  const pass = ok === shouldPass;
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${pass ? "" : ` (expected ${shouldPass ? "allowed" : "denied"})`}`);
  if (!pass) failed++;
}

const t = await as("t", env.TEST_HOST_EMAIL, env.TEST_HOST_PASSWORD);
const s = await as("s", env.TEST_DELEGATE_EMAIL, env.TEST_DELEGATE_PASSWORD);
const x = await as("x", "outsider@bridgemun.test", "Outsider-123456");

const orgId = `rulestest${Date.now()}`;
const code = `T${Date.now().toString(36).toUpperCase()}`.slice(0, 10);

await expect("teacher creates an organization", true, () => setDoc(doc(t.db, "organizations", orgId), { name: "Rules test", inviteCode: code, createdBy: t.uid, createdAt: serverTimestamp() }));
await expect("teacher becomes its admin", true, () => setDoc(doc(t.db, "memberships", `${orgId}_${t.uid}`), { orgId, userId: t.uid, role: "admin", name: "T", joinedAt: serverTimestamp() }));
await expect("someone else can't publish a wrong invite for it", false, () => setDoc(doc(x.db, "invites", code), { orgId }));
await expect("admin publishes the invite", true, () => setDoc(doc(t.db, "invites", code), { orgId, createdAt: serverTimestamp() }));
await expect("an outsider can't read the organization (invite code)", false, () => getDoc(doc(x.db, "organizations", orgId)));
await expect("an outsider can't search organizations by code", false, () => getDocs(query(collection(x.db, "organizations"), where("inviteCode", "==", code))));
await expect("an outsider can't list invites", false, () => getDocs(collection(x.db, "invites")));
await expect("joining without the code is refused", false, () => setDoc(doc(x.db, "memberships", `${orgId}_${x.uid}`), { orgId, userId: x.uid, role: "student", name: "X", joinedAt: serverTimestamp() }));
await expect("joining with a wrong code is refused", false, () => setDoc(doc(x.db, "memberships", `${orgId}_${x.uid}`), { orgId, userId: x.uid, role: "student", name: "X", inviteCode: "NOPE1234", joinedAt: serverTimestamp() }));
await expect("joining as a teacher is refused", false, () => setDoc(doc(s.db, "memberships", `${orgId}_${s.uid}`), { orgId, userId: s.uid, role: "teacher", name: "S", inviteCode: code, joinedAt: serverTimestamp() }));
await expect("a student looks the code up", true, async () => { const d = await getDoc(doc(s.db, "invites", code)); if (d.data()?.orgId !== orgId) throw new Error("wrong org"); });
await expect("a student joins with the code", true, () => setDoc(doc(s.db, "memberships", `${orgId}_${s.uid}`), { orgId, userId: s.uid, role: "student", name: "S", inviteCode: code, joinedAt: serverTimestamp() }));
await expect("a member can read the organization", true, () => getDoc(doc(s.db, "organizations", orgId)));
await expect("staff makes the general channel", true, () => setDoc(doc(t.db, "channels", `${orgId}_general`), { orgId, name: "general", createdAt: serverTimestamp() }));
await expect("a second general channel write is refused", false, () => setDoc(doc(t.db, "channels", `${orgId}_general`), { orgId, name: "general", createdAt: serverTimestamp() }));
await expect("a 2000-character message is allowed", true, () => setDoc(doc(s.db, "messages", `${orgId}_m1`), { channelId: `${orgId}_general`, userId: s.uid, body: "a".repeat(2000), createdAt: serverTimestamp() }));
await expect("a huge message is refused", false, () => setDoc(doc(s.db, "messages", `${orgId}_m2`), { channelId: `${orgId}_general`, userId: s.uid, body: "a".repeat(5000), createdAt: serverTimestamp() }));

// clean up
await deleteDoc(doc(s.db, "messages", `${orgId}_m1`)).catch(() => {});
await deleteDoc(doc(t.db, "invites", code)).catch(() => {});
await deleteDoc(doc(s.db, "memberships", `${orgId}_${s.uid}`)).catch(() => {});
await deleteDoc(doc(t.db, "organizations", orgId)).catch(() => {});

console.log(failed ? `\n${failed} check(s) failed` : "\nAll checks passed");
process.exit(failed ? 1 : 0);
