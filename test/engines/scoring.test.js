// B5 · End-Game game-win on a round-win tie (audit finding #29; resolved
// decision #2). "Rewards are shared": on a tie for the most round wins, every
// tied leader becomes a co-champion, instead of crediting only the first in
// Map-iteration order. Pure helper so it's unit-testable away from index.js.

import { test } from "node:test";
import assert from "node:assert/strict";
import { topWinners } from "../../server/scoring.js";

test("nobody is a champion when no round was won", () => {
  assert.deepEqual(topWinners(new Map([["a", 0], ["b", 0]])), []);
});

test("a clear leader is the sole champion", () => {
  assert.deepEqual(topWinners(new Map([["a", 3], ["b", 1], ["c", 0]])), ["a"]);
});

test("a tie for the most round wins yields co-champions", () => {
  assert.deepEqual(
    topWinners(new Map([["a", 2], ["b", 2], ["c", 1]])).sort(),
    ["a", "b"]
  );
});
