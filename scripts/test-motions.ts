/* Rule checks for lib/motions.ts. Run: node --experimental-strip-types scripts/test-motions.ts */
import { byPriority, checkMotion, aiMayMove, caucusSpeeches, newProcedure, type Motion } from "../lib/motions.ts";

let failed = 0;
const check = (name: string, ok: boolean, extra = "") => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  (${extra})` : ""}`);
  if (!ok) failed++;
};
let n = 0;
const m = (p: Partial<Motion>): Motion => ({ id: `m${++n}`, type: "unmod", by: "Philippines", mover: "human", seconded: true, at: n, ...p });
const ctx = (spoken = 3, floor: Motion[] = [], proc = newProcedure()) => ({ spoken, floor, procedure: proc });

check("close: human after 2 speeches ok", checkMotion(m({ type: "close" }), ctx(2)) === null);
check("close: refused before 2 speeches", checkMotion(m({ type: "close" }), ctx(1)) !== null);
check("close: AI may never move it", checkMotion(m({ type: "close", mover: "ai", by: "India" }), ctx(5)) !== null);
check("unmod: 1-10 minutes ok", checkMotion(m({ minutes: 5 }), ctx()) === null);
check("unmod: 0 and 11 refused", checkMotion(m({ minutes: 0 }), ctx()) !== null && checkMotion(m({ minutes: 11 }), ctx()) !== null);
check("mod: valid", checkMotion(m({ type: "mod", topic: "Funding", minutes: 4, speakingTime: 60 }), ctx()) === null);
check("mod: needs topic", checkMotion(m({ type: "mod", topic: " ", minutes: 4, speakingTime: 60 }), ctx()) !== null);
check("mod: speaking time 30-120", checkMotion(m({ type: "mod", topic: "x", minutes: 4, speakingTime: 20 }), ctx()) !== null);
check("mod: must allow 2 speeches", caucusSpeeches(m({ type: "mod", minutes: 2, speakingTime: 120 })) === 1
  && checkMotion(m({ type: "mod", topic: "x", minutes: 2, speakingTime: 120 }), ctx()) !== null);
const busy = { ...newProcedure(), caucus: { topic: "x", speakingTime: 60, left: 2 } };
check("mod: not during another caucus", checkMotion(m({ type: "mod", topic: "y", minutes: 4, speakingTime: 60 }), ctx(3, [], busy)) !== null);
check("extend: refused with >3 speeches left", checkMotion(m({ type: "extend", extra: 2 }), ctx(3)) !== null);
check("extend: ok with 3 left", checkMotion(m({ type: "extend", extra: 2 }), ctx(5)) === null);
check("extend: max twice", checkMotion(m({ type: "extend", extra: 2 }), ctx(5, [], { ...newProcedure(), extensions: 2 })) !== null);
check("one motion per delegation on the floor", checkMotion(m({ minutes: 3 }), ctx(3, [m({ minutes: 2 })])) !== null);

const ai = { ...newProcedure(), rounds: 3, aiLastRound: 2 };
check("AI sits out the round after moving", aiMayMove(ai) !== null);
check("AI may move two rounds later", aiMayMove({ ...ai, rounds: 4 }) === null);
check("AI max 3 suggestions", aiMayMove({ ...newProcedure(), aiSuggestions: 3 }) !== null);

const order = [
  m({ type: "extend", extra: 1, at: 1 }),
  m({ type: "mod", topic: "a", minutes: 4, speakingTime: 60, at: 2 }),
  m({ type: "unmod", minutes: 3, mover: "ai", by: "India", at: 3 }),
  m({ type: "unmod", minutes: 3, at: 4 }),
  m({ type: "unmod", minutes: 6, mover: "ai", by: "Japan", at: 5 }),
  m({ type: "close", at: 6 }),
].sort(byPriority).map((x) => `${x.type}:${x.minutes ?? ""}:${x.mover}`);
check("vote order: close, longer unmod, human before AI, mod, extend",
  order.join(",") === "close::human,unmod:6:ai,unmod:3:human,unmod:3:ai,mod:4:human,extend::human", order.join(","));

console.log(failed ? `\n${failed} failed` : "\nall passed");
process.exit(failed ? 1 : 0);
