// Live gauges on /health (Plan E1). Before a deploy (which wipes every in-memory
// room) the operator checks rooms/players; eventLoopLagMs is the server-side
// cause of tick jitter. The original fields (ok, version, region, uptime) must
// stay unchanged: Railway's healthcheck and the region proof depend on them.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, createClient, sleep } from "../helpers/ws-client.js";

const PORT = 9900;
const WS = `ws://localhost:${PORT}`;
let server;

before(async () => { server = await startServer(PORT); });
after(async () => { await server.stop(); });

async function health() {
  const res = await fetch(`http://localhost:${PORT}/health`);
  assert.equal(res.status, 200);
  return res.json();
}

// Server-side cleanup after a close is asynchronous, so poll briefly.
async function healthUntil(predicate, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  let body;
  while (Date.now() < deadline) {
    body = await health();
    if (predicate(body)) return body;
    await sleep(50);
  }
  assert.fail(`/health never matched; last body: ${JSON.stringify(body)}`);
}

async function connect(name) {
  const c = await createClient(WS, name);
  c.id = (await c.waitFor("welcome")).id;
  return c;
}

test("/health keeps its original fields and adds numeric gauges", async () => {
  const body = await health();
  assert.equal(body.ok, true);
  assert.equal(typeof body.version, "string");
  assert.equal(body.region, null);
  assert.equal(typeof body.uptime, "number");

  assert.equal(body.rooms, 0);
  assert.equal(body.players, 0);
  assert.equal(body.sockets, 0);
  assert.equal(typeof body.rssMB, "number");
  assert.ok(body.rssMB > 0, "rssMB is the process resident set size");

  const lag = body.eventLoopLagMs;
  assert.equal(typeof lag, "object");
  for (const key of ["p50", "p99"]) {
    assert.equal(typeof lag[key], "number", `eventLoopLagMs.${key} is a number`);
    assert.ok(Number.isFinite(lag[key]) && lag[key] >= 0, `eventLoopLagMs.${key} is finite and >= 0`);
  }
  assert.ok(lag.p99 < 1000, "an idle server's loop lag is far below a second");
});

test("rooms, players and sockets track hosting, joining and leaving", async () => {
  const host = await connect("host");
  await healthUntil((b) => b.sockets === 1 && b.rooms === 0 && b.players === 0);

  host.send({ type: "host", name: "host" });
  const { room } = await host.waitFor("room");
  await healthUntil((b) => b.rooms === 1 && b.players === 1);

  const guest = await connect("guest");
  guest.send({ type: "join", code: room.code, name: "guest" });
  await guest.waitForMatch("room", (m) => m.room.players.some((p) => p.id === guest.id));
  await healthUntil((b) => b.rooms === 1 && b.players === 2 && b.sockets === 2);

  guest.close();
  await healthUntil((b) => b.rooms === 1 && b.players === 1 && b.sockets === 1);

  host.close();
  await healthUntil((b) => b.rooms === 0 && b.players === 0 && b.sockets === 0);
});
