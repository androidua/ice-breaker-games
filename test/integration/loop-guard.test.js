// Two things that only show up when the server is under strain, and that no
// happy-path test can see: a room timer that throws, and a socket that stops
// draining. Both used to be unbounded — a throwing tick repeated its error
// every tick forever (Node reschedules the interval), and ws queued frames for
// a stuck socket in memory with no limit.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, createClient, setupGameRoom, sleep } from "../helpers/ws-client.js";

const PORT = 9914;
const SLOW_PORT = 9915;
const WS = `ws://localhost:${PORT}`;
let server;
let slowServer;

before(async () => {
  server = await startServer(PORT, { DEBUG_INTERNALS: "1" });
  // Nothing can ever be "fast enough" for this one: every send is judged
  // backed-up, which proves broadcasts really go through the guard.
  slowServer = await startServer(SLOW_PORT, { SLOW_SOCKET_SKIP_BYTES: "-1" });
});
after(async () => { await server.stop(); await slowServer.stop(); });

const internals = async () => (await fetch(`http://localhost:${PORT}/__internals`)).json();

test("a tick that throws stops that game instead of repeating forever", async () => {
  const a = await createClient(WS, "a"); a.id = (await a.waitFor("welcome")).id;
  const b = await createClient(WS, "b"); b.id = (await b.waitFor("welcome")).id;
  await setupGameRoom([a, b], "hottake");
  await a.waitForMatch("state", (m) => m.state.status === "voting");

  a.send({ type: "gameAction", action: { kind: "__throwOnTick" } });

  // The room is handed back to the game vote, and says so.
  const failed = await a.waitFor("error", 3000);
  assert.match(failed.message, /stopped/);
  await a.waitForMatch("room", (m) => m.room.status === "voting", 3000);

  const logs = server.stdout().split("\n").filter((l) => l.includes('"game_loop_error"'));
  assert.equal(logs.length, 1, `the loop error was logged ${logs.length} times`);
  assert.equal(JSON.parse(logs[0]).game, "hottake");

  // One loop for the vote screen, and the room is still playable.
  await sleep(1200);
  assert.equal((await internals()).loops, 1);
  assert.equal(JSON.parse(logs[0]).level, "error");
  a.send({ type: "vote", game: "hottake" });
  b.send({ type: "vote", game: "hottake" });
  await a.waitForMatch("room", (m) => m.room.status === "playing", 3000);
  a.close(); b.close();
});

test("a socket that cannot keep up is skipped, not queued without limit", async () => {
  const slow = `ws://localhost:${SLOW_PORT}`;
  const a = await createClient(slow, "a"); a.id = (await a.waitFor("welcome")).id;
  a.send({ type: "host", name: "a" });
  // The welcome is written directly, but every broadcast goes through the guard.
  const room = await a.waitFor("room", 1500).catch(() => null);
  assert.equal(room, null, "a backed-up socket was still sent a broadcast");
  a.close();
});
