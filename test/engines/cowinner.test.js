// Tied round winners must ALL be credited, not just the first one found.
//
// Hot Take, Two Truths and Type Racer each picked a single round winner by
// scanning a Map with a strict `>` (or by taking element [0]), so a tie went to
// whichever player iteration order reached first — in practice whoever acted
// first. That id feeds awardRoundWin, which drives room.roundWins and therefore
// the End Game "game win" via topWinners(). The players' visible scores said
// they tied; the tally that decides the session did not.
//
// Trivia and Bomber already expose a plural `roundWinnerIds` that index.js
// loops over; these tests pin the same contract onto the other three engines.
// The singular `roundWinnerId` stays for the frontend's single-winner display.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHotTakeState, handleHotTakeAction, revealHotTake } from "../../server/hottake-engine.js";
import { createTruthsState, handleTruthsAction, revealTruths } from "../../server/truths-engine.js";
import { createTyperacerState, revealTyperacer } from "../../server/typeracer-engine.js";
import { identityRng } from "../helpers/rng.js";

test("Hot Take credits every player in the winning majority", () => {
  const players = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  let s = createHotTakeState({ players, rng: identityRng });
  for (const id of ["a", "b", "c"]) s = handleHotTakeAction(s, id, { kind: "hotTakeVote", vote: "agree" });
  s = handleHotTakeAction(s, "d", { kind: "hotTakeVote", vote: "disagree" });
  s = revealHotTake(s);

  assert.deepEqual(
    [...s.roundWinnerIds].sort(),
    ["a", "b", "c"],
    "all three majority voters scored +1, so all three must be round winners"
  );
  assert.equal(s.roundWinnerId, s.roundWinnerIds[0], "the singular field stays for the frontend");
});

test("Hot Take awards nobody on an exact split", () => {
  let s = createHotTakeState({ players: [{ id: "a" }, { id: "b" }], rng: identityRng });
  s = handleHotTakeAction(s, "a", { kind: "hotTakeVote", vote: "agree" });
  s = handleHotTakeAction(s, "b", { kind: "hotTakeVote", vote: "disagree" });
  s = revealHotTake(s);

  assert.deepEqual(s.roundWinnerIds, [], "a tie must award nobody, not everybody");
  assert.equal(s.roundWinnerId, null);
});

test("Two Truths credits every voter tied on the top gain", () => {
  const players = [{ id: "a" }, { id: "b" }, { id: "c" }, { id: "d" }];
  let s = createTruthsState({ players, rng: identityRng });
  const presenter = s.presenterId;
  s = handleTruthsAction(s, presenter, {
    kind: "submitStatements",
    statements: ["one", "two", "three"],
    lieIndex: 1,
  });
  const voters = players.map((p) => p.id).filter((id) => id !== presenter);
  for (const id of voters) s = handleTruthsAction(s, id, { kind: "vote", index: 1 });
  s = revealTruths(s);

  assert.deepEqual(
    [...s.roundWinnerIds].sort(),
    [...voters].sort(),
    "every voter who spotted the lie gained 1, so every one of them is a round winner"
  );
  assert.ok(!s.roundWinnerIds.includes(presenter), "the fooled presenter gained nothing and must not win");
});

test("Two Truths awards nobody when no one gains", () => {
  // Nobody votes: the reveal runs with an empty vote map, so every gain is 0.
  const players = [{ id: "a" }, { id: "b" }, { id: "c" }];
  let s = createTruthsState({ players, rng: identityRng });
  s = handleTruthsAction(s, s.presenterId, {
    kind: "submitStatements",
    statements: ["one", "two", "three"],
    lieIndex: 0,
  });
  s = revealTruths(s);

  assert.deepEqual(s.roundWinnerIds, [], "a round nobody gained from must award nobody");
  assert.equal(s.roundWinnerId, null);
});

test("Type Racer credits every racer tied on the top score", () => {
  const players = [{ id: "a" }, { id: "b" }, { id: "c" }];
  const s = createTyperacerState({ players, rng: identityRng });
  // Two racers finish identically; the third never types. Identical finish
  // times and zero mistakes mean identical points — a genuine tie.
  const finishTime = s.raceStartTime + 30000;
  s.progress.set("a", { typed: s.paragraph, finished: true, finishTime, mistakes: 0, wpm: 60 });
  s.progress.set("b", { typed: s.paragraph, finished: true, finishTime, mistakes: 0, wpm: 60 });

  const out = revealTyperacer(s);
  assert.deepEqual(
    [...out.roundWinnerIds].sort(),
    ["a", "b"],
    "two racers on identical points must both be round winners"
  );
  assert.ok(!out.roundWinnerIds.includes("c"), "the racer who never typed must not win");
});
