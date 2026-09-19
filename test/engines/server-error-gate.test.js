// Server-side Sentry quota guard (Plan E2 part 2). A bug inside a timer or the
// Snake loop can throw many times a second; the org's 5k errors/month is shared
// with another project and the free plan has no per-key rate limit. So: one
// event per distinct error per dedupe window, and a hard daily cap.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createErrorGate } from "../../server/sentry.js";

const event = (value, type = "TypeError") => ({ exception: { values: [{ type, value }] } });

test("an identical error is sent once per dedupe window, then again after it", () => {
  let clock = 0;
  const allow = createErrorGate({ maxPerDay: 50, dedupeMs: 10 * 60_000, now: () => clock });
  assert.equal(allow(event("x is undefined")), true);
  clock = 60_000;
  assert.equal(allow(event("x is undefined")), false, "duplicate inside the window");
  assert.equal(allow(event("y is undefined")), true, "a different error is not deduplicated");
  clock = 11 * 60_000;
  assert.equal(allow(event("x is undefined")), true, "the same error is reported again after the window");
});

test("the daily cap holds even for distinct errors, and resets after a day", () => {
  let clock = 0;
  const allow = createErrorGate({ maxPerDay: 3, dedupeMs: 60_000, now: () => clock });
  const sent = Array.from({ length: 5 }, (_, i) => allow(event(`boom ${i}`)));
  assert.deepEqual(sent, [true, true, true, false, false]);
  clock = 24 * 60 * 60_000 + 1;
  assert.equal(allow(event("boom next day")), true);
});

test("the dedupe memory stays bounded under a flood of distinct errors", () => {
  const allow = createErrorGate({ maxPerDay: 1_000_000, dedupeMs: 60_000, now: () => 0, maxTracked: 100 });
  for (let i = 0; i < 10_000; i++) allow(event(`unique ${i}`));
  assert.ok(allow.trackedCount() <= 100, `tracked ${allow.trackedCount()} keys`);
});
