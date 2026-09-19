// Browser-side Sentry quota guard (Plan E2). A bug that throws on every render
// or every Snake frame must not send hundreds of events from one page: each page
// load sends at most a handful, and an identical error is sent only once.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createEventGate } from "../../src/sentry-gate.js";

const error = (type, value) => ({ exception: { values: [{ type, value }] } });

test("an identical error is sent once per page load", () => {
  const allow = createEventGate({ max: 10 });
  assert.equal(allow(error("TypeError", "x is undefined")), true);
  assert.equal(allow(error("TypeError", "x is undefined")), false);
  assert.equal(allow(error("TypeError", "y is undefined")), true, "a different error still goes through");
});

test("at most `max` distinct errors are sent per page load", () => {
  const allow = createEventGate({ max: 3 });
  const results = Array.from({ length: 6 }, (_, i) => allow(error("Error", `boom ${i}`)));
  assert.deepEqual(results, [true, true, true, false, false, false]);
});

test("message-only events are deduplicated by their message", () => {
  const allow = createEventGate({ max: 10 });
  assert.equal(allow({ message: "manual report" }), true);
  assert.equal(allow({ message: "manual report" }), false);
});
