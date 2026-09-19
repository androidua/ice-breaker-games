// Malformed client messages must not wedge the sender's socket (Sept 2026 review #3).
//
// Only handleGameAction had a try/catch. A throw anywhere else in handleMessage
// (a `null` payload, a non-string name, a non-string Bomber dir via "input")
// escaped into the ws receiver, which then stopped parsing that socket's frames
// — including pongs — so the heartbeat silently kicked the player ~30s later.
// Each test sends one bad payload and then proves the same socket still gets
// answers (an unknown type always yields an "error" reply).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, createClient, setupGameRoom } from "../helpers/ws-client.js";

const PORT = 9895;
const WS = `ws://localhost:${PORT}`;
let server;

before(async () => { server = await startServer(PORT); });
after(async () => { await server.stop(); });

async function connect(name) {
  const c = await createClient(WS, name);
  c.id = (await c.waitFor("welcome")).id;
  return c;
}

// The socket is alive if an unknown message type still gets its error reply.
async function assertStillResponsive(client) {
  client.send({ type: "__probe__" });
  // Match the probe's own reply; the bad payload may have earned its own error.
  const err = await client.waitForMatch("error", (m) => /unknown message type/i.test(m.message), 2000);
  assert.ok(err);
}

const RAW_PAYLOADS = [
  ["JSON null", "null"],
  ["JSON number", "42"],
  ["JSON array", "[]"],
];

for (const [label, raw] of RAW_PAYLOADS) {
  test(`${label} payload does not wedge the socket`, async () => {
    const c = await connect(label);
    c.ws.send(raw);
    await assertStillResponsive(c);
    c.close();
  });
}

test("non-string host name falls back to a default name and keeps the socket alive", async () => {
  const c = await connect("numeric-name");
  c.send({ type: "host", name: 123 });
  const { room } = await c.waitFor("room", 2000);
  const me = room.players.find((p) => p.id === c.id);
  assert.equal(typeof me.name, "string");
  assert.ok(me.name.length > 0);
  await assertStillResponsive(c);
  c.close();
});

test("non-string join name and code are handled without wedging the socket", async () => {
  const host = await connect("host");
  host.send({ type: "host", name: "host" });
  const { room } = await host.waitFor("room");

  const bad = await connect("object-name");
  bad.send({ type: "join", code: room.code, name: { evil: true } });
  const joined = await bad.waitForMatch("room", (m) => m.room.players.some((p) => p.id === bad.id), 2000);
  assert.equal(typeof joined.room.players.find((p) => p.id === bad.id).name, "string");

  const bad2 = await connect("object-code");
  bad2.send({ type: "join", code: { x: 1 }, name: "x" });
  const err = await bad2.waitFor("error", 2000);
  assert.match(err.message, /room not found/i);
  await assertStillResponsive(bad2);

  host.close(); bad.close(); bad2.close();
});

test("non-string Bomber input direction does not wedge the socket", async () => {
  const a = await connect("bomber-a");
  const b = await connect("bomber-b");
  await setupGameRoom([a, b], "bomber");

  a.send({ type: "input", dir: 5 });
  a.send({ type: "input", dir: { up: true } });
  await assertStillResponsive(a);

  // The game loop is unaffected for everyone else.
  b.messages.length = 0;
  const s = await b.waitForMatch("state", (m) => m.state?.gameType === "bomber" || !!m.state, 2000);
  assert.ok(s.state);

  a.close(); b.close();
});
