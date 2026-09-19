// Plan D holds a seat — and so the whole room — for the resume grace. That made
// "host a room, drop the socket" a way to pin every room slot with no socket
// left open, so real hosts got "Server is at capacity". At the cap the oldest
// room nobody is connected to now gives way; a room with anyone in it doesn't.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, createClient, sleep } from "../helpers/ws-client.js";

const PORT = 9911;
const WS = `ws://localhost:${PORT}`;
let server;

before(async () => {
  server = await startServer(PORT, { MAX_ROOMS: "2", RESUME_GRACE_MS: "45000" });
});
after(async () => { await server.stop(); });

async function connect(name) {
  const c = await createClient(WS, name);
  const welcome = await c.waitFor("welcome");
  c.id = welcome.id;
  c.token = welcome.resumeToken;
  return c;
}

async function hostThenDrop(name) {
  const c = await connect(name);
  c.send({ type: "host", name });
  const code = (await c.waitFor("room")).room.code;
  c.ws.terminate();
  return { code, token: c.token };
}

const health = async () => (await fetch(`http://localhost:${PORT}/health`)).json();

test("an away-only room gives way to a real host at the cap, a live room does not", async () => {
  // Room 1 keeps a connected player; room 2 is held only by a grace timer.
  const keeper = await connect("keeper");
  keeper.send({ type: "host", name: "keeper" });
  const keptCode = (await keeper.waitFor("room")).room.code;
  const dropped = await hostThenDrop("ghost");
  await sleep(100);
  assert.equal((await health()).rooms, 2, "the cap should be full");

  const fresh = await connect("fresh");
  fresh.send({ type: "host", name: "fresh" });
  const got = await fresh.waitFor("room", 3000);
  assert.notEqual(got.room.code, keptCode);
  assert.notEqual(got.room.code, dropped.code);
  assert.equal((await health()).rooms, 2);

  // The reclaimed room is gone for good: its seat can no longer be resumed.
  const late = await connect("late");
  late.send({ type: "resume", token: dropped.token });
  await late.waitFor("resume_failed", 3000);
  late.send({ type: "join", code: dropped.code, name: "late" });
  assert.equal((await late.waitFor("error")).message, "Room not found.");

  // The room with someone in it was untouched and still works.
  keeper.send({ type: "start" });
  const voting = await keeper.waitForMatch("room", (m) => m.room.status === "voting", 3000);
  assert.equal(voting.room.code, keptCode);

  keeper.close(); fresh.close(); late.close();
});

test("with every room in use, a new host is still told the server is full", async () => {
  // The rooms left over from the first test are away-only, so these two hosts
  // reclaim them; both then stay connected, which fills the cap for real.
  const live = [];
  for (const name of ["live1", "live2"]) {
    const c = await connect(name);
    c.send({ type: "host", name });
    await c.waitFor("room", 3000);
    live.push(c);
  }
  assert.equal((await health()).rooms, 2);

  const blocked = await connect("blocked");
  blocked.send({ type: "host", name: "blocked" });
  const reply = await Promise.race([
    blocked.waitFor("error", 2000).then((m) => m.message),
    blocked.waitFor("room", 2000).then(() => "hosted"),
  ]);
  assert.match(reply, /capacity/);
  live.forEach((c) => c.close());
  blocked.close();
});
