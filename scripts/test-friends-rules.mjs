/* Checks the friendships and room requests rules in firestore.rules against the emulators (npm run emulators). */
import fs from "node:fs";
import { initializeApp, deleteApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import { addDoc, collection, connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocs, getFirestore, query, setDoc, Timestamp, updateDoc, where } from "firebase/firestore";

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
  return { app, db, uid: cred.user.uid };
}

let failed = 0;
async function expect(name, shouldPass, fn) {
  let ok = true;
  try { await fn(); } catch { ok = false; }
  const pass = ok === shouldPass;
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}${pass ? "" : ` (expected ${shouldPass ? "allowed" : "denied"})`}`);
  if (!pass) failed++;
}

const a = await as("a", env.TEST_HOST_EMAIL, env.TEST_HOST_PASSWORD);
const b = await as("b", env.TEST_DELEGATE_EMAIL, env.TEST_DELEGATE_PASSWORD);
const x = await as("x", "outsider@bridgemun.test", "Outsider-123456");
const users = [a.uid, b.uid].sort();
const fid = `${users[0]}_${users[1]}`;
const base = { users, names: { [a.uid]: "A", [b.uid]: "B" }, status: "pending", requestedBy: a.uid, lastText: "", lastAt: Timestamp.now() };

await deleteDoc(doc(a.db, "friendships", fid)).catch(() => {});
await expect("cannot request on someone else's behalf", false, () => setDoc(doc(x.db, "friendships", fid), base));
await expect("cannot create with a wrong id", false, () => setDoc(doc(a.db, "friendships", `${users[1]}_${users[0]}`), base));
await expect("cannot create already accepted", false, () => setDoc(doc(a.db, "friendships", fid), { ...base, status: "accepted" }));
await expect("A sends a friend request", true, () => setDoc(doc(a.db, "friendships", fid), base));
await expect("an outsider cannot read it", false, () => getDoc(doc(x.db, "friendships", fid)));
await expect("B sees it in their list", true, () => getDocs(query(collection(b.db, "friendships"), where("users", "array-contains", b.uid))));
await expect("A cannot accept their own request", false, () => updateDoc(doc(a.db, "friendships", fid), { status: "accepted" }));
await expect("no messages before it is accepted", false, () => addDoc(collection(a.db, "friendships", fid, "messages"), { by: a.uid, text: "hi", at: Timestamp.now() }));
await expect("B accepts", true, () => updateDoc(doc(b.db, "friendships", fid), { status: "accepted", lastAt: Timestamp.now() }));
await expect("A messages B", true, () => addDoc(collection(a.db, "friendships", fid, "messages"), { by: a.uid, text: "hi", card: null, at: Timestamp.now() }));
await expect("A cannot send as B", false, () => addDoc(collection(a.db, "friendships", fid, "messages"), { by: b.uid, text: "fake", at: Timestamp.now() }));
await expect("B reads the thread", true, () => getDocs(collection(b.db, "friendships", fid, "messages")));
await expect("an outsider cannot read the thread", false, () => getDocs(collection(x.db, "friendships", fid, "messages")));
await expect("an outsider cannot post in the thread", false, () => addDoc(collection(x.db, "friendships", fid, "messages"), { by: x.uid, text: "hi", at: Timestamp.now() }));
await expect("cannot swap who is in the friendship", false, () => updateDoc(doc(a.db, "friendships", fid), { users: [a.uid, x.uid].sort() }));
await expect("B updates the last message preview", true, () => updateDoc(doc(b.db, "friendships", fid), { lastText: "hello", lastAt: Timestamp.now() }));
await expect("either friend can remove the friendship", true, () => deleteDoc(doc(b.db, "friendships", fid)));

// Room requests: members raise them only in a live forum; only the host changes them.
const roomRef = doc(collection(a.db, "rooms"));
await setDoc(roomRef, { host_id: a.uid, status: "live", code: "TESTRQ", visibility: "private" });
await setDoc(doc(a.db, "rooms", roomRef.id, "members", a.uid), { user_id: a.uid, country: "", name: "A", moderator: true });
await setDoc(doc(b.db, "rooms", roomRef.id, "members", b.uid), { user_id: b.uid, country: "France", name: "B" });
const req = { user_id: b.uid, from: "France", kind: "point", type: "order", text: "Over time", to: null, title: null, clauses: [], status: "pending", at: Timestamp.now() };
let rid = "";
await expect("a member raises a point", true, async () => { rid = (await addDoc(collection(b.db, "rooms", roomRef.id, "requests"), req)).id; });
await expect("a non-member cannot raise one", false, () => addDoc(collection(x.db, "rooms", roomRef.id, "requests"), { ...req, user_id: x.uid }));
await expect("cannot raise one as someone else", false, () => addDoc(collection(b.db, "rooms", roomRef.id, "requests"), { ...req, user_id: a.uid }));
await expect("cannot raise one already marked done", false, () => addDoc(collection(b.db, "rooms", roomRef.id, "requests"), { ...req, status: "done" }));
await expect("a member cannot mark it done", false, () => updateDoc(doc(b.db, "rooms", roomRef.id, "requests", rid), { status: "done" }));
await expect("the host marks it done", true, () => updateDoc(doc(a.db, "rooms", roomRef.id, "requests", rid), { status: "done" }));
await expect("the host posts a point line", true, () => addDoc(collection(a.db, "rooms", roomRef.id, "lines"), { user_id: null, speaker: "France", kind: "point", text: "Point of order: Over time", created_at: Timestamp.now() }));
await expect("a member cannot post a point line", false, () => addDoc(collection(b.db, "rooms", roomRef.id, "lines"), { user_id: b.uid, speaker: "France", kind: "point", text: "x", created_at: Timestamp.now() }));
await updateDoc(roomRef, { status: "ended" });
await expect("no requests once the forum has ended", false, () => addDoc(collection(b.db, "rooms", roomRef.id, "requests"), req));

await Promise.all([a, b, x].map((u) => deleteApp(u.app)));
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
