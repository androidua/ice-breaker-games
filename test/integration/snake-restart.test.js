// T-01 · Snake restart spawns a second game loop (audit finding #4, fix A2)
//
// startSnake is the only start* helper that does NOT call stopLoop(room) first.
// A restart while a loop is live overwrites room.interval, orphaning the old
// 120ms interval — two loops then broadcast at once (double-speed snake + leak).
//
// We distinguish one 120ms loop from two by counting `state` frames in a fixed
// window: one loop emits ~6 frames in 720ms, two loops emit ~12+.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, createClient, setupGameRoom, sleep } from "../helpers/ws-client.js";

const PORT = 9882;
const WS = `ws://localhost:${PORT}`;
let server;

before(async () => { server = await startServer(PORT); });
after(async () => { await server.stop(); });

test("restart does not spawn a second concurrent snake loop", async () => {
  const host = await createClient(WS, "host");
  host.id = (await host.waitFor("welcome")).id;

  await setupGameRoom([host], "snake");
  // Confirm the snake loop is live (first authoritative frame arrives).
  await host.waitFor("state");

  // Count frames over a fixed window after a restart.
  host.messages.length = 0;
  host.send({ type: "restart" }); // re-enters startSnake while a loop is live
  await sleep(720); // ~6 ticks @120ms

  const frames = host.messages.filter((m) => m.type === "state").length;
  host.close();

  assert.ok(
    frames <= 8,
    `RED: a double loop emits ~12+ frames in 720ms; got ${frames}. GREEN: one loop ~6-7 (<=8)`
  );
});
