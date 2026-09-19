// Feedback API abuse guards (Sept 2026 review #5).
//
// The per-IP limit keyed on the FIRST X-Forwarded-For entry, which the client
// controls (Cloudflare appends the real IP after it), so rotating that header
// bypassed the limit and could flood Linear with issues. The limiter now keys on
// Cloudflare's cf-connecting-ip, a global hourly cap backstops the real Linear
// calls, and CORS only answers the site's own origins instead of "*".
//
// Linear is replaced by a local stub (LINEAR_API_URL) so nothing leaves the box.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { startServer } from "../helpers/ws-client.js";

const PORT = 9897;
const STUB_PORT = 9899;
const BASE = `http://localhost:${PORT}`;
let server;
let stub;
const stubCalls = [];

before(async () => {
  stub = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => { body += c; });
    req.on("end", () => {
      stubCalls.push(body);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ data: { issueCreate: { success: true, issue: { id: "1", identifier: "T-1", url: "x" } } } }));
    });
  });
  await new Promise((r) => stub.listen(STUB_PORT, r));
  server = await startServer(PORT, {
    LINEAR_API_KEY: "test-key",
    LINEAR_API_URL: `http://localhost:${STUB_PORT}/graphql`,
    FEEDBACK_GLOBAL_MAX: "2",
  });
});
after(async () => {
  await server.stop();
  await new Promise((r) => stub.close(r));
});

function post(body, headers = {}) {
  return fetch(`${BASE}/api/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

const honeypot = { website: "http://spam.example" }; // silently accepted, never reaches Linear
const valid = () => ({
  type: "bug", name: "Tester", subject: "Subject", description: "Details",
  openedAt: Date.now() - 10_000,
});

test("rate limit keys on cf-connecting-ip, so rotating X-Forwarded-For cannot bypass it", async () => {
  for (let i = 0; i < 3; i++) {
    const res = await post(honeypot, { "cf-connecting-ip": "203.0.113.1", "x-forwarded-for": `10.0.0.${i}` });
    assert.equal(res.status, 200, `request ${i + 1} should pass`);
  }
  const blocked = await post(honeypot, { "cf-connecting-ip": "203.0.113.1", "x-forwarded-for": "10.9.9.9" });
  assert.equal(blocked.status, 429);
});

test("a different client IP is limited independently", async () => {
  const res = await post(honeypot, { "cf-connecting-ip": "203.0.113.2" });
  assert.equal(res.status, 200);
});

test("a global cap stops Linear issue creation once reached", async () => {
  const before = stubCalls.length;
  assert.equal((await post(valid(), { "cf-connecting-ip": "203.0.113.10" })).status, 200);
  assert.equal((await post(valid(), { "cf-connecting-ip": "203.0.113.11" })).status, 200);
  assert.equal(stubCalls.length - before, 2, "both submissions reached Linear");

  const capped = await post(valid(), { "cf-connecting-ip": "203.0.113.12" });
  assert.equal(capped.status, 429);
  assert.equal(stubCalls.length - before, 2, "the capped submission never reached Linear");
});

test("CORS preflight only allows the site's own origins", async () => {
  const evil = await fetch(`${BASE}/api/feedback`, {
    method: "OPTIONS",
    headers: { Origin: "https://evil.example", "Access-Control-Request-Method": "POST" },
  });
  const evilAcao = evil.headers.get("access-control-allow-origin");
  assert.ok(evilAcao !== "*" && evilAcao !== "https://evil.example", `unexpected ACAO ${evilAcao}`);

  const dev = await fetch(`${BASE}/api/feedback`, {
    method: "OPTIONS",
    headers: { Origin: "http://localhost:5173", "Access-Control-Request-Method": "POST" },
  });
  assert.equal(dev.headers.get("access-control-allow-origin"), "http://localhost:5173");
});

test("POST responses no longer carry a wildcard CORS header", async () => {
  const res = await post(honeypot, { "cf-connecting-ip": "203.0.113.3", Origin: "https://evil.example" });
  assert.notEqual(res.headers.get("access-control-allow-origin"), "*");
});
