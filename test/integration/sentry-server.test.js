// Server errors reach Sentry (Plan E2 part 2). The server SDK is errors-only
// and sends solely through explicit captures in the existing error paths. A
// feedback 5xx is the one error path a test can trigger from outside (the WS
// handlers can no longer be made to throw), so it drives this test: Linear is
// pointed at a closed port, and a stub stands in for Sentry's ingest.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { startServer, sleep } from "../helpers/ws-client.js";

const PORT = 9906;
const STUB_PORT = 9907;
const envelopes = [];
let server;
let stub;

before(async () => {
  stub = createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      envelopes.push({ url: req.url, body: Buffer.concat(chunks).toString() });
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end("{}");
    });
  });
  await new Promise((r) => stub.listen(STUB_PORT, r));
  server = await startServer(PORT, {
    SENTRY_DSN: `http://srvkey@localhost:${STUB_PORT}/43`,
    LINEAR_API_KEY: "test-key",
    LINEAR_API_URL: "http://127.0.0.1:1/graphql", // nothing listens: every issue creation fails
  });
});
after(async () => {
  await server.stop();
  await new Promise((r) => stub.close(r));
});

const feedback = (ip, subject = "S") => fetch(`http://localhost:${PORT}/api/feedback`, {
  method: "POST",
  headers: { "Content-Type": "application/json", "cf-connecting-ip": ip },
  body: JSON.stringify({
    type: "bug", name: "Secret-Reporter", subject, description: "D",
    email: "secret@example.com", openedAt: Date.now() - 10_000,
  }),
});

async function envelopesUntil(count, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline && envelopes.length < count) await sleep(50);
  return envelopes;
}

test("a server error is captured and sent to the server project, without personal data", async () => {
  assert.equal((await feedback("192.0.2.10")).status, 500);
  const [first] = await envelopesUntil(1);
  assert.ok(first, "no envelope reached the Sentry stub");
  assert.equal(first.url.split("?")[0], "/api/43/envelope/"); // the SDK adds its auth as a query string
  assert.match(first.body, /"type":"event"/);
  assert.match(first.body, /fetch failed/);
  assert.match(first.body, /huddle-play-room@\d+\.\d+\.\d+/, "release is tagged");
  assert.match(first.body, /"server_name":"huddle-play-room-server"/, "no machine hostname");
  for (const secret of ["Secret-Reporter", "secret@example.com", "192.0.2.10"]) {
    assert.ok(!first.body.includes(secret), `${secret} leaked to Sentry`);
  }
});

test("the same server error is not sent again within the dedupe window", async () => {
  const before = envelopes.length;
  assert.equal((await feedback("192.0.2.11")).status, 500);
  await sleep(1000);
  assert.equal(envelopes.length, before, "duplicate error was sent");
});

// Garbage from a client is the client's error, not ours: it must be a 4xx and
// never reach Sentry, or anyone could spend the shared error budget with curl.
test("an invalid JSON body is a 400 and is not reported to Sentry", async () => {
  const before = envelopes.length;
  const res = await fetch(`http://localhost:${PORT}/api/feedback`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "cf-connecting-ip": "192.0.2.12" },
    body: "{not json",
  });
  assert.equal(res.status, 400);
  await sleep(1000);
  assert.equal(envelopes.length, before, "a client mistake was reported as a server error");
});
