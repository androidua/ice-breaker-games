// B5 · Hot Take tie = "Split!" (audit finding #12; resolved decision #1).
// An exact split is a valid no-score outcome: nobody is awarded, roundWinnerId
// is null, and the round still advances to reveal (it must never stall). This
// pins the resolved decision (the engine already behaves this way).

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHotTakeState, handleHotTakeAction, revealHotTake } from "../../server/hottake-engine.js";
import { identityRng } from "../helpers/rng.js";

test("an exact split awards nobody but still advances to reveal", () => {
  let s = createHotTakeState({ players: [{ id: "a" }, { id: "b" }], rng: identityRng });
  s = handleHotTakeAction(s, "a", { kind: "hotTakeVote", vote: "agree" });
  s = handleHotTakeAction(s, "b", { kind: "hotTakeVote", vote: "disagree" });
  s = revealHotTake(s);

  assert.equal(s.roundResult.majority, "tie");
  assert.deepEqual(s.roundResult.awardedPlayerIds, [], "a split awards nobody");
  assert.equal(s.roundWinnerId, null);
  assert.equal(s.status, "reveal", "a split must still advance, never stall");
});

test("a clear majority awards every player on that side", () => {
  let s = createHotTakeState({ players: [{ id: "a" }, { id: "b" }, { id: "c" }], rng: identityRng });
  s = handleHotTakeAction(s, "a", { kind: "hotTakeVote", vote: "agree" });
  s = handleHotTakeAction(s, "b", { kind: "hotTakeVote", vote: "agree" });
  s = handleHotTakeAction(s, "c", { kind: "hotTakeVote", vote: "disagree" });
  s = revealHotTake(s);

  assert.equal(s.roundResult.majority, "agree");
  assert.deepEqual([...s.roundResult.awardedPlayerIds].sort(), ["a", "b"]);
});
