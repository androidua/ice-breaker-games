// A room timer that throws used to repeat its error every tick forever, because
// Node reschedules an interval whose callback threw. guardedTick is what lets
// index.js stop that one room instead of letting it spin.

import { test } from "node:test";
import assert from "node:assert/strict";
import { guardedTick } from "../../server/room-loop.js";

test("a throw is handed to the error callback, not the caller", () => {
  const seen = [];
  const tick = guardedTick(() => { throw new Error("boom"); }, (err) => seen.push(err));
  assert.doesNotThrow(() => tick());
  assert.equal(seen.length, 1);
  assert.equal(seen[0].message, "boom");
});

test("a healthy tick passes its arguments and result straight through", () => {
  const tick = guardedTick((a, b) => a + b, () => assert.fail("must not be called"));
  assert.equal(tick(2, 3), 5);
});

test("each throw is reported, so a repeating failure is still visible", () => {
  let count = 0;
  const tick = guardedTick(() => { throw new Error("again"); }, () => { count++; });
  tick(); tick(); tick();
  assert.equal(count, 3);
});
