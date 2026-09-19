// Sketch & Guess engine: the input a drawer sends is the widest surface any
// game has (arbitrary points, arbitrary colour, hundreds of times a round) and
// the canvas is re-sent to every player. These tests pin the limits that keep
// one drawer from turning that into the server's whole heap.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createSketchState, handleSketchAction, serializeSketch, nextSketchRound } from "../../server/sketch-engine.js";
import { identityRng } from "../helpers/rng.js";

function start() {
  const state = createSketchState({
    players: [{ id: "p1" }, { id: "p2" }, { id: "p3" }],
    rng: identityRng,
  });
  const guesser = state.playerIds.find((id) => id !== state.drawerId);
  return { state, drawer: state.drawerId, guesser };
}

const draw = (state, id, points, color) =>
  handleSketchAction(state, id, { kind: "draw", points, color });

test("a stroke of junk is refused, not stored", () => {
  const { state, drawer } = start();
  const junk = Array(500).fill("x".repeat(28)); // 15.5 KB, under the frame limit
  assert.equal(draw(state, drawer, junk).strokes.length, 0);
  assert.equal(draw(state, drawer, [{ x: "1", y: {} }, null, 5]).strokes.length, 0);
  assert.equal(draw(state, drawer, [{ x: 1, y: NaN }, { x: 2, y: Infinity }]).strokes.length, 0);
  assert.equal(draw(state, drawer, "not-an-array").strokes.length, 0);
  assert.equal(draw(state, drawer, [[1, 1], [2, 2]]).strokes.length, 0, "arrays are not points");
});

test("a single point draws nothing, so it is not a stroke", () => {
  const { state, drawer } = start();
  assert.equal(draw(state, drawer, [{ x: 5, y: 5 }]).strokes.length, 0);
  assert.equal(draw(state, drawer, [{ x: 5, y: 5 }, { x: 6, y: 6 }]).strokes.length, 1);
});

test("points are rounded and clamped to the canvas; the colour is a hex literal", () => {
  const { state, drawer } = start();
  const after = draw(state, drawer, [{ x: -20, y: 1e9 }, { x: 3.6, y: 2.2 }], "'; DROP TABLE");
  assert.deepEqual(after.strokes[0].points, [{ x: 0, y: 400 }, { x: 4, y: 2 }]);
  assert.equal(after.strokes[0].color, "#2a2a2a");
  assert.equal(draw(state, drawer, [{ x: 1, y: 1 }, { x: 2, y: 2 }], "#3d5a80").strokes[0].color, "#3d5a80");
});

test("one stroke cannot exceed the per-stroke point cap", () => {
  const { state, drawer } = start();
  const after = draw(state, drawer, Array(5000).fill({ x: 1, y: 2 }));
  assert.equal(after.strokes[0].points.length, 200);
  assert.equal(after.pointCount, 200);
});

test("the round has a point budget, and clearing does not refund it", () => {
  const { state, drawer } = start();
  let s = state;
  for (let i = 0; i < 200; i++) s = draw(s, drawer, Array(200).fill({ x: i % 400, y: 1 }));
  assert.equal(s.pointCount, 20000);
  assert.equal(s.strokes.length, 100, "the budget, not the stroke count, is the limit");

  const cleared = handleSketchAction(s, drawer, { kind: "clear" });
  assert.equal(cleared.strokes.length, 0);
  assert.equal(cleared.pointCount, 20000);
  assert.equal(draw(cleared, drawer, [{ x: 1, y: 1 }, { x: 2, y: 2 }]).strokes.length, 0);

  // A new round starts with a fresh budget.
  const next = nextSketchRound(s, identityRng);
  assert.equal(next.pointCount, 0);
  assert.equal(draw(next, next.drawerId, [{ x: 1, y: 1 }, { x: 2, y: 2 }]).strokes.length, 1);
});

test("only the drawer draws, and only while drawing", () => {
  const { state, drawer, guesser } = start();
  assert.equal(draw(state, guesser, [{ x: 1, y: 1 }, { x: 2, y: 2 }]).strokes.length, 0);
  const revealing = { ...state, status: "reveal" };
  assert.equal(draw(revealing, drawer, [{ x: 1, y: 1 }, { x: 2, y: 2 }]).strokes.length, 0);
});

test("each player gets a fixed number of guesses per round", () => {
  const { state, guesser } = start();
  let s = state;
  for (let i = 0; i < 40; i++) {
    s = handleSketchAction(s, guesser, { kind: "guess", text: `wrong ${i}` });
  }
  assert.equal(s.guesses.length, 20);
  assert.equal(nextSketchRound(s, identityRng).guessCounts.size, 0, "the budget resets each round");
});

test("the serialised feed is bounded, and the canvas can be left out", () => {
  const { state, drawer, guesser } = start();
  let s = state;
  const others = s.playerIds.filter((id) => id !== drawer);
  for (const id of others) {
    for (let i = 0; i < 20; i++) s = handleSketchAction(s, id, { kind: "guess", text: `no ${i}` });
  }
  s = draw(s, drawer, [{ x: 1, y: 1 }, { x: 2, y: 2 }]);

  const full = serializeSketch(s, guesser);
  assert.equal(s.guesses.length, 40);
  assert.equal(full.guesses.length, 25, "the whole round's guesses go out on every tick");
  assert.equal(full.strokes.length, 1);

  const light = serializeSketch(s, guesser, { withStrokes: false });
  assert.equal(light.strokes, undefined);
  assert.equal(light.status, "drawing");
  assert.equal(light.timer, s.timer);
});

test("the secret word still goes only to the drawer", () => {
  const { state, drawer, guesser } = start();
  assert.equal(serializeSketch(state, drawer).word, state.word);
  assert.equal(serializeSketch(state, guesser).word, undefined);
  assert.equal(serializeSketch(state, guesser, { withStrokes: false }).word, undefined);
});
