// Sentry tunnel helpers (Plan E2). Browser errors are posted to our own
// /api/sentry and forwarded from the server, so one global daily cap protects
// the Sentry quota (per-key rate limits need a paid plan). These pure helpers
// decide what is forwarded: only our own DSN, only error events.

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseDsn, inspectEnvelope, createDailyCap } from "../../server/sentry-tunnel.js";

const DSN = "https://abc123@o1.ingest.us.sentry.io/42";

function envelope(header, items) {
  const parts = [JSON.stringify(header)];
  for (const { type, payload, withLength } of items) {
    const body = JSON.stringify(payload);
    const itemHeader = withLength ? { type, length: Buffer.byteLength(body) } : { type };
    parts.push(JSON.stringify(itemHeader), body);
  }
  return Buffer.from(parts.join("\n"));
}

test("parseDsn extracts protocol, host, project id and public key", () => {
  assert.deepEqual(parseDsn(DSN), {
    protocol: "https:", host: "o1.ingest.us.sentry.io", projectId: "42", publicKey: "abc123",
  });
  assert.deepEqual(parseDsn("http://k@localhost:9903/7"), {
    protocol: "http:", host: "localhost:9903", projectId: "7", publicKey: "k",
  });
});

test("parseDsn rejects anything that is not a DSN", () => {
  for (const bad of ["", "not a url", "https://o1.ingest.sentry.io/42", "https://k@host/", "https://k@host/abc", 42, null, undefined]) {
    assert.equal(parseDsn(bad), null, `accepted ${JSON.stringify(bad)}`);
  }
});

test("inspectEnvelope reads the DSN and every item type, with or without item lengths", () => {
  const buf = envelope({ event_id: "e1", dsn: DSN }, [
    { type: "event", payload: { message: "line one\nline two" }, withLength: true },
    { type: "attachment", payload: { a: 1 } },
  ]);
  assert.deepEqual(inspectEnvelope(buf), { dsn: DSN, types: ["event", "attachment"] });
});

test("inspectEnvelope handles multi-byte payloads with explicit byte lengths", () => {
  const buf = envelope({ dsn: DSN }, [
    { type: "event", payload: { message: "🐍 snake ✓" }, withLength: true },
    { type: "session", payload: { s: 1 }, withLength: true },
  ]);
  assert.deepEqual(inspectEnvelope(buf).types, ["event", "session"]);
});

test("inspectEnvelope returns null for malformed input instead of throwing", () => {
  for (const bad of ["", "{not json", "[1,2]", "null", '{"dsn":"x"}\n{broken']) {
    assert.equal(inspectEnvelope(Buffer.from(bad)), null, `accepted ${JSON.stringify(bad)}`);
  }
});

test("createDailyCap allows max takes per window, then reports the wait", () => {
  let clock = 1000;
  const cap = createDailyCap({ max: 2, windowMs: 10_000, now: () => clock });
  assert.equal(cap.take(), true);
  assert.equal(cap.take(), true);
  assert.equal(cap.take(), false);
  clock = 6000;
  assert.equal(cap.retryAfterSec(), 5, "seconds until the window resets");
  clock = 11_000;
  assert.equal(cap.take(), true, "a new window starts after windowMs");
});
