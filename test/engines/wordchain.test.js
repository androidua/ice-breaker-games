// B4 · Word Chain turn order after a wrap-around elimination (audit finding #9).
//
// eliminateCurrentPlayer reused the stale numeric currentIndex against the newly
// shrunk active list. Once the turn pointer has wrapped (current player is last,
// currentIndex stays high) a subsequent timeout-elimination indexes the wrong
// player — skipping one and later doubling back. The fix derives the next player
// from the eliminated player's position in the active list instead.

import { test } from "node:test";
import assert from "node:assert/strict";
import { eliminateCurrentPlayer } from "../../server/wordchain-engine.js";

function makeState(ids, currentIndex) {
  return {
    status: "playing",
    playerIds: [...ids],
    turnOrder: [...ids],
    eliminated: new Set(),
    currentIndex,
    currentPlayerId: ids[currentIndex],
    currentWord: null,
    usedWords: new Set(),
    timer: 0,
    round: 1,
    roundWinnerId: null,
    lastEliminatedId: null,
    scores: new Map(ids.map((id) => [id, 0])),
  };
}

test("eliminating after a wrap-around picks the correct next player (no skip)", () => {
  let s = makeState(["a", "b", "c", "d", "e"], 4); // current is 'e' — the last in order

  s = eliminateCurrentPlayer(s); // 'e' times out → wraps to 'a'
  assert.equal(s.currentPlayerId, "a", "after the last player is eliminated the turn wraps to the first");

  s = eliminateCurrentPlayer(s); // 'a' times out → next active player is 'b'
  assert.equal(s.currentPlayerId, "b", "RED: stale index picks 'c', skipping 'b'; GREEN: correct next is 'b'");
});

test("a full timeout sweep visits players in correct forward order", () => {
  let s = makeState(["a", "b", "c", "d", "e"], 4);
  const visited = [];
  let guard = 0;
  while (s.status === "playing" && guard++ < 20) {
    visited.push(s.currentPlayerId);
    s = eliminateCurrentPlayer(s);
  }
  assert.deepEqual(visited, ["e", "a", "b", "c"], "forward order with no skip or repeat");
  assert.equal(s.roundWinnerId, "d", "the last player standing wins the round");
});
