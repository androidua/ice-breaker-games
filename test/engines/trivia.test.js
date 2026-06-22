// B5 · Trivia round-winner ties (audit findings #38; resolved decision #1).
// "Rewards are shared": when several players tie for the top score gain in a
// set, ALL of them co-win the round (each credited), instead of silently
// crediting only the first player in Map-iteration order.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createTriviaState, nextTriviaQuestion } from "../../server/trivia-engine.js";
import { identityRng } from "../helpers/rng.js";

// Build a trivia state parked on the last question of the set, with a chosen
// per-player gain since the set started, then advance to round_complete.
function atLastQuestion(gains) {
  const ids = Object.keys(gains);
  const s = createTriviaState({ players: ids.map((id) => ({ id })), rng: identityRng });
  return {
    ...s,
    questionIndex: s.questions.length - 1,
    roundStartScores: new Map(ids.map((id) => [id, 0])),
    scores: new Map(ids.map((id) => [id, gains[id]])),
  };
}

test("a top-score tie makes every tied player a round co-winner", () => {
  const s = nextTriviaQuestion(atLastQuestion({ a: 10, b: 10, c: 5 }));

  assert.equal(s.status, "round_complete");
  assert.ok(Array.isArray(s.roundWinnerIds), "engine exposes roundWinnerIds for awarding");
  assert.deepEqual([...s.roundWinnerIds].sort(), ["a", "b"], "both top scorers co-win");
});

test("a clear winner is the sole round winner", () => {
  const s = nextTriviaQuestion(atLastQuestion({ a: 20, b: 10, c: 5 }));

  assert.deepEqual(s.roundWinnerIds, ["a"]);
  assert.equal(s.roundWinnerId, "a", "singular field kept for the frontend display");
});

test("nobody co-wins when no one scored in the set", () => {
  const s = nextTriviaQuestion(atLastQuestion({ a: 0, b: 0 }));
  assert.deepEqual(s.roundWinnerIds, []);
  assert.equal(s.roundWinnerId, null);
});
