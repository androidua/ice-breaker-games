// Room-leak DoS guards (security audit: unlimited rooms per socket).
//
// handleHost/handleJoin never checked whether the client was already in a
// room, so one socket could create unlimited rooms. On disconnect only the
// first room found by findRoomByPlayer is cleaned; the rest keep a dead-socket
// player forever and never hit the players.size === 0 deletion path — a
// permanent memory leak. These tests assert both entry points now refuse a
// client that is already in a room, and that a global room cap (MAX_ROOMS,
// env-overridable for tests) rejects hosting once reached.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, createClient } from "../helpers/ws-client.js";

const PORT = 9892;
const CAP_PORT = 9893;
const WS = `ws://localhost:${PORT}`;
let server;

before(async () => { server = await startServer(PORT); });
after(async () => { await server.stop(); });

async function connect(url, name) {
  const c = await createClient(url, name);
  c.id = (await c.waitFor("welcome")).id;
  return c;
}

test("second host message from the same client is rejected", async () => {
  const host = await connect(WS, "host");
  host.send({ type: "host", name: "host" });
  const first = await host.waitFor("room");

  host.send({ type: "host", name: "host" });
  const err = await host.waitFor("error", 3000);
  assert.match(err.message, /already in a room/i);

  // The original room is intact: another client can still join it.
  const p2 = await connect(WS, "p2");
  p2.send({ type: "join", code: first.room.code, name: "p2" });
  await p2.waitForMatch("room", (m) => m.room.players.some((p) => p.id === p2.id));

  host.close();
  p2.close();
});

test("a client already hosting one room cannot join another", async () => {
  const a = await connect(WS, "a");
  const b = await connect(WS, "b");

  a.send({ type: "host", name: "a" });
  await a.waitFor("room");
  b.send({ type: "host", name: "b" });
  const bCode = (await b.waitFor("room")).room.code;

  a.send({ type: "join", code: bCode, name: "a" });
  const err = await a.waitFor("error", 3000);
  assert.match(err.message, /already in a room/i);

  a.close();
  b.close();
});

test("hosting is rejected once the global room cap is reached", async () => {
  const capServer = await startServer(CAP_PORT, { MAX_ROOMS: "1" });
  try {
    const capWs = `ws://localhost:${CAP_PORT}`;
    const a = await connect(capWs, "a");
    a.send({ type: "host", name: "a" });
    await a.waitFor("room");

    const b = await connect(capWs, "b");
    b.send({ type: "host", name: "b" });
    const err = await b.waitFor("error", 3000);
    assert.match(err.message, /capacity/i);

    a.close();
    b.close();
  } finally {
    await capServer.stop();
  }
});
