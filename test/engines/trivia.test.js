// B5 · Trivia round-winner ties (audit findings #38; resolved decision #1).
// "Rewards are shared": when several players tie for the top score gain in a
// set, ALL of them co-win the round (each credited), instead of silently
// crediting only the first player in Map-iteration order.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createTriviaState, nextTriviaQuestion, handleTriviaAction, allAnswered, revealTrivia } from "../../server/trivia-engine.js";
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

test("answers stay on the state after a set completes, so completion must be checked with the phase", () => {
  // allAnswered() is a count, not a phase. The dispatcher in server/index.js
  // must pair it with status === "question": the answers of the last question
  // are still there in `reveal` and `round_complete`, and re-running the
  // reveal there pays the question out a second time.
  let state = createTriviaState({ players: [{ id: "p1" }, { id: "p2" }], rng: identityRng });
  for (let guard = 0; guard < 50 && state.status !== "round_complete"; guard++) {
    if (state.status === "question") {
      const correct = state.questions[state.questionIndex].c;
      state = handleTriviaAction(state, "p1", { kind: "answer", index: correct });
      state = handleTriviaAction(state, "p2", { kind: "answer", index: (correct + 1) % 4 });
      assert.equal(allAnswered(state), true);
      state = revealTrivia(state);
    } else {
      state = nextTriviaQuestion(state);
    }
  }
  assert.equal(state.status, "round_complete");
  assert.equal(allAnswered(state), true, "answers are cleared, so this test no longer pins anything");

  const scored = state.scores.get("p1");
  assert.ok(scored > 0);
  assert.ok(revealTrivia(state).scores.get("p1") > scored, "a second reveal would pay the same question twice");
});
