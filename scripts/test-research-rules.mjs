/* Checks the `research` rules in firestore.rules against the emulators (npm run emulators):
   share-by-link get, private lists, join/leave, what collaborators and outsiders may change. */
import fs from "node:fs";
import { initializeApp, deleteApp } from "firebase/app";
import { connectAuthEmulator, getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword } from "firebase/auth";
import {
  arrayRemove, arrayUnion, collection, connectFirestoreEmulator, deleteDoc, doc, getDoc, getDocs,
  getFirestore, query, setDoc, Timestamp, updateDoc, where,
} from "firebase/firestore";

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

const owner = await as("o", env.TEST_HOST_EMAIL, env.TEST_HOST_PASSWORD);
const friend = await as("f", env.TEST_DELEGATE_EMAIL, env.TEST_DELEGATE_PASSWORD);
const outsider = await as("x", "outsider@bridgemun.test", "Outsider-123456");

const ref = doc(collection(owner.db, "research"));
const base = {
  ownerId: owner.uid, ownerName: "Host Tester", country: "Philippines", committee: "UNEA", topic: "Plastics",
  brief: "## The issue in brief\n- test", sources: [], followups: [], notes: [], collaborators: [], collaboratorNames: {},
  createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
};
await expect("owner creates a briefing", true, () => setDoc(ref, base));
await expect("cannot create one owned by someone else", false, () => setDoc(doc(collection(friend.db, "research")), { ...base }));
await expect("cannot create with collaborators pre-filled", false, () => setDoc(doc(collection(friend.db, "research")), { ...base, ownerId: friend.uid, collaborators: [owner.uid] }));
await expect("owner lists own briefings", true, () => getDocs(query(collection(owner.db, "research"), where("ownerId", "==", owner.uid))));
await expect("anyone signed in opens it by link (get)", true, () => getDoc(doc(outsider.db, "research", ref.id)));
await expect("others cannot list someone else's briefings", false, () => getDocs(query(collection(outsider.db, "research"), where("ownerId", "==", owner.uid))));
await expect("outsider cannot add a note without joining", false, () =>
  updateDoc(doc(outsider.db, "research", ref.id), { notes: arrayUnion({ id: "n0", text: "hi" }), updatedAt: Timestamp.now() }));
await expect("friend joins by link (adds only themselves)", true, () =>
  updateDoc(doc(friend.db, "research", ref.id), { collaborators: arrayUnion(friend.uid), [`collaboratorNames.${friend.uid}`]: "Delegate Tester", updatedAt: Timestamp.now() }));
await expect("cannot add someone else as a collaborator", false, () =>
  updateDoc(doc(outsider.db, "research", ref.id), { collaborators: arrayUnion("someone-else"), updatedAt: Timestamp.now() }));
await expect("collaborator lists shared briefings", true, () =>
  getDocs(query(collection(friend.db, "research"), where("collaborators", "array-contains", friend.uid))));
await expect("collaborator adds a note", true, () =>
  updateDoc(doc(friend.db, "research", ref.id), { notes: arrayUnion({ id: "n1", text: "Check the Nice declaration" }), updatedAt: Timestamp.now() }));
await expect("collaborator adds a follow-up", true, () =>
  updateDoc(doc(friend.db, "research", ref.id), { followups: arrayUnion({ id: "f1", question: "q", answer: "a" }), updatedAt: Timestamp.now() }));
await expect("collaborator cannot rewrite the brief", false, () => updateDoc(doc(friend.db, "research", ref.id), { brief: "hacked" }));
await expect("collaborator cannot take ownership", false, () => updateDoc(doc(friend.db, "research", ref.id), { ownerId: friend.uid }));
await expect("collaborator cannot delete it", false, () => deleteDoc(doc(friend.db, "research", ref.id)));
await expect("collaborator leaves (removes only themselves)", true, () =>
  updateDoc(doc(friend.db, "research", ref.id), { collaborators: arrayRemove(friend.uid), updatedAt: Timestamp.now() }));
await expect("owner edits the brief", true, () => updateDoc(doc(owner.db, "research", ref.id), { brief: "## Updated", updatedAt: Timestamp.now() }));
await expect("owner deletes it", true, () => deleteDoc(doc(owner.db, "research", ref.id)));

await Promise.all([owner, friend, outsider].map((u) => deleteApp(u.app)));
console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
