// B5 · Game-select vote tie → random among tied (resolved decision #1:
// "selections are random"). The engine already picks randomly via the injected
// rng; this pins it so a future change can't silently make it order-dependent.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createVotingState, submitVote, resolveVoting } from "../../server/voting-engine.js";
import { seqRng } from "../helpers/rng.js";

test("a vote tie is broken randomly among the tied games", () => {
  let s = createVotingState();
  s = submitVote(s, "a", "snake");
  s = submitVote(s, "b", "bomber"); // 1–1 tie; tied set in availableGames order is [snake, bomber]

  assert.equal(resolveVoting(s, seqRng([0])), "snake", "rng→0 picks the first tied game");
  assert.equal(resolveVoting(s, seqRng([0.99])), "bomber", "rng→~1 picks the second tied game");
});

test("a clear vote winner is chosen regardless of rng", () => {
  let s = createVotingState();
  s = submitVote(s, "a", "snake");
  s = submitVote(s, "b", "snake");
  s = submitVote(s, "c", "bomber");

  assert.equal(resolveVoting(s, () => 0.5), "snake");
});
