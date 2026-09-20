// Railway's edge answers requests that never went through Cloudflare (it routes
// on the Host header), and there cf-connecting-ip is just a header the client
// typed — so rotating it sidestepped every per-IP limit. With
// TRUSTED_PROXY_SECRET set, forwarded-IP headers only count when the request
// carries the secret the Cloudflare edge adds; otherwise the socket is the
// identity. Unset, the old behaviour stands.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer } from "../helpers/ws-client.js";

const PORT = 9912;
const OPEN_PORT = 9913;
const SECRET = "edge-secret-123";
let guarded;
let open;

// Passes the honeypot/time-trap checks but fails validation, so nothing is ever
// sent to Linear: the rate limiter is the only thing under test.
const body = JSON.stringify({ type: "not-a-type", openedAt: 1, name: "x", subject: "y", description: "z" });

function post(port, headers) {
  return fetch(`http://127.0.0.1:${port}/api/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  }).then((r) => r.status);
}

before(async () => {
  guarded = await startServer(PORT, { LINEAR_API_KEY: "dummy", TRUSTED_PROXY_SECRET: SECRET });
  open = await startServer(OPEN_PORT, { LINEAR_API_KEY: "dummy" });
});
after(async () => { await guarded.stop(); await open.stop(); });

test("without the edge secret, a rotating cf-connecting-ip counts as one client", async () => {
  const seen = [];
  for (let i = 0; i < 5; i++) seen.push(await post(PORT, { "cf-connecting-ip": `10.0.0.${i}` }));
  assert.deepEqual(seen.slice(0, 3), [400, 400, 400], "the first three should be judged on their content");
  assert.ok(seen.includes(429), `rotating the header bypassed the limit: ${seen.join(",")}`);
});

test("with the edge secret, each forwarded IP gets its own budget", async () => {
  const headers = (ip) => ({ "cf-connecting-ip": ip, "x-origin-secret": SECRET });
  const seen = [];
  for (let i = 0; i < 5; i++) seen.push(await post(PORT, headers(`10.1.1.${i}`)));
  assert.deepEqual(seen, [400, 400, 400, 400, 400], `a distinct IP was rate limited: ${seen.join(",")}`);
  // ...and one IP still runs out.
  const repeat = [];
  for (let i = 0; i < 5; i++) repeat.push(await post(PORT, headers("10.2.2.2")));
  assert.ok(repeat.includes(429), "a single forwarded IP was never limited");
});

test("an oversized body is refused before it is read", async () => {
  const status = await fetch(`http://127.0.0.1:${OPEN_PORT}/api/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Content-Length": String(8 * 1024 * 1024) },
    body: "x".repeat(8 * 1024 * 1024),
  }).then((r) => r.status).catch(() => "refused");
  assert.equal(status, 413);
});

test("with no secret configured, forwarded IPs are trusted as before", async () => {
  const seen = [];
  for (let i = 0; i < 5; i++) seen.push(await post(OPEN_PORT, { "cf-connecting-ip": `10.3.3.${i}` }));
  assert.deepEqual(seen, [400, 400, 400, 400, 400]);
});

// Railway hands each request to the container from its own internal address, so
// the socket is no identity at all: keyed on it, every request got its own
// budget and the limit never fired in production. Two loopback stacks stand in
// for two proxy addresses here — 127.0.0.1 and ::1 reach the same server with
// different remoteAddress values.
test("/health says whether this request reached the origin through the trusted proxy", async () => {
  const health = (port, headers) => fetch(`http://127.0.0.1:${port}/health`, { headers }).then((r) => r.json());

  const off = await health(OPEN_PORT, {});
  assert.equal(off.proxied, null, "with no secret configured the flag is not a claim either way");

  const missing = await health(PORT, {});
  assert.equal(missing.proxied, false, "a request without the edge secret is not trusted");

  const present = await health(PORT, { "x-origin-secret": SECRET });
  assert.equal(present.proxied, true, "a request carrying the edge secret is trusted");

  // The existing gauges are untouched.
  assert.equal(present.ok, true);
  assert.equal(typeof present.version, "string");
  assert.equal(typeof present.uptime, "number");
});
