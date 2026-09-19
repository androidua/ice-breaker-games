// Structured logging helper (Plan E1). One JSON object per line on stdout, in the
// shape Railway's Log Explorer parses: `message` becomes the line text, `level`
// its severity, and every other field a filterable @attribute.

import { test } from "node:test";
import assert from "node:assert/strict";
import { log, formatLog, errorFields, createLimitedLog } from "../../server/log.js";

test("formatLog emits single-line JSON with message, level and the given fields", () => {
  const line = formatLog("room_created", { room: "SW5R", players: 1 });
  assert.ok(!line.includes("\n"), "one line per event");
  assert.deepEqual(JSON.parse(line), { message: "room_created", level: "info", room: "SW5R", players: 1 });
});

test("formatLog honours an explicit level and fields cannot override message or level", () => {
  const entry = JSON.parse(formatLog("message_error", { message: "spoof", level: "debug", err: "x" }, "error"));
  assert.equal(entry.message, "message_error");
  assert.equal(entry.level, "error");
  assert.equal(entry.err, "x");
});

test("formatLog never throws on fields JSON cannot serialise", () => {
  const circular = {};
  circular.self = circular;
  const entry = JSON.parse(formatLog("uncaught_exception", { circular, big: 1n }, "error"));
  assert.equal(entry.message, "uncaught_exception");
  assert.equal(entry.level, "error");
});

test("log writes exactly one newline-terminated line to stdout", () => {
  const writes = [];
  const original = process.stdout.write;
  process.stdout.write = (chunk) => { writes.push(String(chunk)); return true; };
  try {
    log("room_closed", { room: "AB12", lifetimeSec: 5 });
  } finally {
    process.stdout.write = original;
  }
  assert.equal(writes.length, 1);
  assert.ok(writes[0].endsWith("\n"));
  assert.equal(writes[0].split("\n").length, 2, "no embedded newlines");
  assert.equal(JSON.parse(writes[0]).room, "AB12");
});

test("errorFields keeps the message and stack of an Error and stringifies anything else", () => {
  const fields = errorFields(new TypeError("boom"));
  assert.equal(fields.err, "boom");
  assert.match(fields.stack, /TypeError: boom/);

  assert.deepEqual(errorFields("plain reason"), { err: "plain reason" });
  assert.deepEqual(errorFields(undefined), { err: "undefined" });
});

// Error and abuse events can fire in a loop (a feedback flood, a bug inside a
// timer). Past 500 lines/s Railway drops lines, including the ones that matter,
// so these events are capped per minute and report what they dropped.
test("createLimitedLog caps each event per window and reports the suppressed count", () => {
  const emitted = [];
  let clock = 0;
  const limited = createLimitedLog((ev, fields, level) => emitted.push({ ev, fields, level }), {
    max: 3, windowMs: 60_000, now: () => clock,
  });

  for (let i = 0; i < 10; i++) limited("feedback_spam", { reason: "honeypot" });
  limited("message_error", { player: "p1" }, "error");
  assert.equal(emitted.filter((e) => e.ev === "feedback_spam").length, 3, "capped at max per window");
  assert.equal(emitted.filter((e) => e.ev === "message_error").length, 1, "each event has its own budget");
  assert.equal(emitted.at(-1).level, "error", "level passes through");

  clock = 60_000; // next window
  limited("feedback_spam", { reason: "too_fast" });
  const next = emitted.at(-1);
  assert.equal(next.ev, "feedback_spam");
  assert.equal(next.fields.suppressed, 7, "first line of the new window carries the dropped count");
  assert.equal(next.fields.reason, "too_fast");

  limited("feedback_spam", {});
  assert.equal(emitted.at(-1).fields.suppressed, undefined, "the count is reported once");
});

// Node's fetch reports every network failure as "TypeError: fetch failed"; the
// reason (DNS, refused, unreachable, per-address happy-eyeballs attempts) is
// only on err.cause. Without it a production failure can't be diagnosed.
test("errorFields includes the cause chain, including per-address connect errors", () => {
  const unreachable = Object.assign(new Error("connect ENETUNREACH 2600:1901::1:443"), {
    code: "ENETUNREACH", address: "2600:1901::1", port: 443,
  });
  const single = errorFields(new TypeError("fetch failed", { cause: unreachable }));
  assert.equal(single.err, "fetch failed");
  assert.match(single.cause, /ENETUNREACH/);

  const refused = Object.assign(new Error("connect ECONNREFUSED 34.160.81.0:443"), {
    code: "ECONNREFUSED", address: "34.160.81.0", port: 443,
  });
  const aggregate = Object.assign(new AggregateError([unreachable, refused], "all attempts failed"), { code: "ETIMEDOUT" });
  const multi = errorFields(new TypeError("fetch failed", { cause: aggregate }));
  assert.match(multi.cause, /ETIMEDOUT/);
  assert.match(multi.cause, /ENETUNREACH 2600:1901::1:443/);
  assert.match(multi.cause, /ECONNREFUSED 34\.160\.81\.0:443/);

  assert.equal(errorFields(new Error("plain")).cause, undefined, "no cause field when there is none");
});
