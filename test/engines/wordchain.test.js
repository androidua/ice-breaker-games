// B4 · Word Chain turn order after a wrap-around elimination (audit finding #9).
//
// eliminateCurrentPlayer reused the stale numeric currentIndex against the newly
// shrunk active list. Once the turn pointer has wrapped (current player is last,
// currentIndex stays high) a subsequent timeout-elimination indexes the wrong
// player — skipping one and later doubling back. The fix derives the next player
// from the eliminated player's position in the active list instead.

import { test } from "node:test";
import assert from "node:assert/strict";
import { eliminateCurrentPlayer, removeWordChainPlayer } from "../../server/wordchain-engine.js";

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

// A1 · Word Chain disconnect reconciliation (deferred from Phase A). A player can
// leave mid-game; unlike a timeout (always the current player), a disconnect can
// target ANY player. removeWordChainPlayer generalises eliminateCurrentPlayer:
// it drops the leaver, keeps the turn pointer valid, prunes them from the
// persistent roster (so the next round can't resurrect them), and ends the round
// when only one active player remains.

test("removing the current player advances the turn to the next active player", () => {
  let s = makeState(["a", "b", "c", "d"], 1); // current is 'b'
  s = removeWordChainPlayer(s, "b");
  assert.equal(s.status, "playing", "three players remain, the round continues");
  assert.equal(s.currentPlayerId, "c", "the turn passes to the next active player");
  assert.ok(s.eliminated.has("b"), "the leaver is out of play this round");
  assert.deepEqual(s.playerIds, ["a", "c", "d"], "the leaver is pruned from the roster");
});

test("removing a non-current player keeps the current player's turn", () => {
  let s = makeState(["a", "b", "c", "d"], 0); // current is 'a'
  s = removeWordChainPlayer(s, "c"); // 'c' is not the current player
  assert.equal(s.status, "playing");
  assert.equal(s.currentPlayerId, "a", "the active player's turn is untouched");
  assert.ok(s.eliminated.has("c"));
  assert.deepEqual(s.playerIds, ["a", "b", "d"]);
  assert.equal(s.currentIndex, 0, "currentIndex still points at the active player after the list shrank");
});

test("removing the current player when two remain ends the round, the survivor wins +3", () => {
  let s = makeState(["a", "b"], 0); // current is 'a'
  s = removeWordChainPlayer(s, "a");
  assert.equal(s.status, "round_end");
  assert.equal(s.roundWinnerId, "b", "the last player standing wins");
  assert.equal(s.scores.get("b"), 3, "the winner gets the same +3 bonus as a timeout win");
  assert.deepEqual(s.playerIds, ["b"], "the leaver is pruned from the roster");
});

test("removing an already-eliminated player only prunes the roster", () => {
  let s = makeState(["a", "b", "c"], 0); // current is 'a'
  s.eliminated = new Set(["c"]); // 'c' already timed out earlier this round
  s = removeWordChainPlayer(s, "c");
  assert.equal(s.status, "playing", "an already-out player leaving changes nothing in play");
  assert.equal(s.currentPlayerId, "a");
  assert.deepEqual(s.playerIds, ["a", "b"], "still pruned so the next round won't bring them back");
});
