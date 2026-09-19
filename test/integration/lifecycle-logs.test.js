// Structured lifecycle logs (Plan E1). Room/player/game events are written as
// one JSON line each, so Railway's Log Explorer can filter them; the close code
// on player_left separates a normal leave (1000) from a dropped socket (1006).
// Two hard rules are pinned here: player names never reach the logs, and the
// Snake (120ms) and Bomber (100ms) tick loops never log.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, createClient, sleep } from "../helpers/ws-client.js";

const PORT = 9901;
const WS = `ws://localhost:${PORT}`;
let server;

before(async () => { server = await startServer(PORT); });
after(async () => { await server.stop(); });

function outputLines() {
  return server.stdout().split("\n").filter((line) => line.trim() !== "");
}

function events() {
  return outputLines().filter((line) => line.startsWith("{")).map((line) => JSON.parse(line));
}

async function eventUntil(predicate, timeoutMs = 3000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const hit = events().find(predicate);
    if (hit) return hit;
    await sleep(25);
  }
  assert.fail(`no matching log event; saw: ${events().map((e) => e.message).join(", ")}`);
}

async function connect(name) {
  const c = await createClient(WS, name);
  c.id = (await c.waitFor("welcome")).id;
  return c;
}

async function playGame(clients, gameName) {
  for (const c of clients) c.send({ type: "vote", game: gameName });
  for (const c of clients) {
    await c.waitForMatch("room", (m) => m.room.status === "playing" && m.room.currentGame === gameName);
  }
}

test("server_started is logged once at boot with the app version", async () => {
  const started = await eventUntil((e) => e.message === "server_started");
  assert.equal(started.level, "info");
  assert.equal(typeof started.version, "string");
});

test("room, player and game lifecycle is logged without names or tick-loop noise", async () => {
  const HOST_NAME = "Zelda-Secret";
  const GUEST_NAME = "Quux-Private";
  const host = await connect(HOST_NAME);
  const guest = await connect(GUEST_NAME);

  host.send({ type: "host", name: HOST_NAME });
  const code = (await host.waitFor("room")).room.code;
  const created = await eventUntil((e) => e.message === "room_created" && e.room === code);
  assert.equal(created.player, host.id);

  guest.send({ type: "join", code, name: GUEST_NAME });
  const joined = await eventUntil((e) => e.message === "player_joined" && e.player === guest.id);
  assert.equal(joined.room, code);
  assert.equal(joined.players, 2);
  assert.equal(joined.status, "lobby");

  // Snake: once the game is running, its 120ms loop must add no log lines.
  host.send({ type: "start" });
  for (const c of [host, guest]) await c.waitForMatch("room", (m) => m.room.status === "voting");
  await playGame([host, guest], "snake");
  const snakeStarted = await eventUntil((e) => e.message === "game_started" && e.game === "snake");
  assert.equal(snakeStarted.room, code);
  assert.equal(snakeStarted.players, 2);
  let linesBefore = outputLines().length;
  await sleep(1500); // ~12 Snake ticks, plus the round ending
  assert.equal(outputLines().length, linesBefore, "the Snake tick loop logged something");

  host.send({ type: "endGame" });
  const ended = await eventUntil((e) => e.message === "game_ended" && e.game === "snake");
  assert.equal(ended.room, code);
  assert.equal(typeof ended.durationSec, "number");

  // Bomber: the 100ms loop must stay silent too.
  for (const c of [host, guest]) await c.waitForMatch("room", (m) => m.room.status === "voting");
  await playGame([host, guest], "bomber");
  await eventUntil((e) => e.message === "game_started" && e.game === "bomber");
  linesBefore = outputLines().length;
  await sleep(1200); // ~12 Bomber ticks
  assert.equal(outputLines().length, linesBefore, "the Bomber tick loop logged something");

  // A clean close and a dropped socket are told apart by the close code.
  guest.ws.close(1000);
  const guestLeft = await eventUntil((e) => e.message === "player_left" && e.player === guest.id);
  assert.equal(guestLeft.room, code);
  assert.equal(guestLeft.code, 1000);
  assert.equal(guestLeft.players, 1);
  assert.equal(guestLeft.game, "bomber");

  host.ws.terminate();
  const hostLeft = await eventUntil((e) => e.message === "player_left" && e.player === host.id);
  assert.equal(hostLeft.code, 1006);
  assert.equal(hostLeft.players, 0);

  const closed = await eventUntil((e) => e.message === "room_closed" && e.room === code);
  assert.equal(closed.peakPlayers, 2);
  assert.equal(closed.gamesPlayed, 2);
  assert.equal(typeof closed.lifetimeSec, "number");

  const all = server.stdout();
  assert.ok(!all.includes(HOST_NAME) && !all.includes(GUEST_NAME), "a player name reached the logs");

  for (const e of events()) {
    assert.equal(typeof e.message, "string");
    assert.ok(["info", "warn", "error"].includes(e.level), `bad level on ${e.message}`);
  }
});
