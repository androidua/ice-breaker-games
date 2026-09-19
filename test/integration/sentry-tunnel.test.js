// Sentry tunnel endpoint (Plan E2). The browser SDK posts error envelopes to
// POST /api/sentry; the server forwards them to Sentry. The free Sentry plan has
// no per-key rate limits and its 5k errors/month is shared with another
// project, so this endpoint is the quota guard: only our own DSN, only error
// events, a size cap, a per-IP limit and one global daily cap. The client's IP
// is never passed on. A local stub stands in for Sentry's ingest.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { startServer } from "../helpers/ws-client.js";

const PORT = 9902;
const STUB_PORT = 9903;
const CAP_PORT = 9904;
const UNSET_PORT = 9905;
const DSN = `http://abc123@localhost:${STUB_PORT}/42`;

let server;
let stub;
const forwarded = []; // { url, headers, body }

before(async () => {
  stub = createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      forwarded.push({ url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString() });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end('{"id":"ok"}');
    });
  });
  await new Promise((r) => stub.listen(STUB_PORT, r));
  server = await startServer(PORT, { VITE_SENTRY_DSN: DSN, SENTRY_TUNNEL_DAILY_MAX: "20" });
});
after(async () => {
  await server.stop();
  await new Promise((r) => stub.close(r));
});

function envelope(types, dsn = DSN) {
  const lines = [JSON.stringify({ event_id: "a".repeat(32), dsn, sent_at: new Date().toISOString() })];
  for (const type of types) lines.push(JSON.stringify({ type }), JSON.stringify({ message: `a ${type}` }));
  return lines.join("\n");
}

function post(port, body, ip = "198.51.100.1") {
  return fetch(`http://localhost:${port}/api/sentry`, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=UTF-8", "cf-connecting-ip": ip },
    body,
  });
}

test("an error envelope for our DSN is forwarded unchanged, without the client IP", async () => {
  const before = forwarded.length;
  const body = envelope(["event"]);
  const res = await post(PORT, body, "203.0.113.77");
  assert.equal(res.status, 200);
  assert.equal(forwarded.length, before + 1);
  const hit = forwarded.at(-1);
  assert.equal(hit.url, "/api/42/envelope/");
  assert.equal(hit.body, body);
  assert.ok(!JSON.stringify(hit.headers).includes("203.0.113.77"), "client IP leaked to Sentry");
});

test("envelopes for any other DSN are rejected and not forwarded", async () => {
  const before = forwarded.length;
  const res = await post(PORT, envelope(["event"], "http://other@localhost:9903/99"), "198.51.100.2");
  assert.equal(res.status, 400);
  assert.equal(forwarded.length, before);
});

test("non-error envelopes (sessions, client reports, traces) are dropped", async () => {
  const before = forwarded.length;
  for (const types of [["session"], ["client_report"], ["transaction"], ["event", "replay_event"]]) {
    const res = await post(PORT, envelope(types), "198.51.100.3");
    assert.equal(res.status, 200, `${types} should be accepted silently`);
  }
  assert.equal(forwarded.length, before, "nothing but error events reaches Sentry");
});

test("malformed and oversized bodies are rejected", async () => {
  const before = forwarded.length;
  assert.equal((await post(PORT, "{not json", "198.51.100.4")).status, 400);
  assert.equal((await post(PORT, envelope(["event"]) + "x".repeat(300 * 1024), "198.51.100.4")).status, 413);
  assert.equal(forwarded.length, before);
});

test("one IP cannot use up the shared daily budget", async () => {
  const statuses = [];
  for (let i = 0; i < 12; i++) statuses.push((await post(PORT, "{bad", "198.51.100.9")).status);
  assert.deepEqual(statuses.slice(0, 10), Array(10).fill(400));
  assert.equal(statuses[10], 429, "11th request in the window is rate limited");
});

test("the global daily cap stops forwarding and tells the SDK when to retry", async () => {
  const capServer = await startServer(CAP_PORT, { VITE_SENTRY_DSN: DSN, SENTRY_TUNNEL_DAILY_MAX: "1" });
  try {
    const before = forwarded.length;
    assert.equal((await post(CAP_PORT, envelope(["event"]), "192.0.2.1")).status, 200);
    const capped = await post(CAP_PORT, envelope(["event"]), "192.0.2.2");
    assert.equal(capped.status, 429);
    assert.ok(Number(capped.headers.get("retry-after")) > 0, "Retry-After tells the SDK to back off");
    assert.equal(forwarded.length, before + 1, "only the first event was forwarded");
  } finally {
    await capServer.stop();
  }
});

test("the tunnel is off when no DSN is configured", async () => {
  const unset = await startServer(UNSET_PORT, { VITE_SENTRY_DSN: "" });
  try {
    assert.equal((await post(UNSET_PORT, envelope(["event"]))).status, 404);
  } finally {
    await unset.stop();
  }
});
