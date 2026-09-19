// Joining (and re-joining) during the game-vote screen (Sept 2026 review #2).
//
// A room only ever sat in "lobby" before its first Start, and handleJoin
// rejected every other status — so a player whose phone dropped the connection
// could never get back in, even though the client banner told them to "refresh
// to rejoin". The vote screen is a safe re-entry point: no game engine is
// running and the vote threshold is computed from the live player count.
// Joining mid-game stays rejected (engine rosters are frozen at game start).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, createClient, sleep } from "../helpers/ws-client.js";

const PORT = 9896;
const WS = `ws://localhost:${PORT}`;
let server;

before(async () => { server = await startServer(PORT); });
after(async () => { await server.stop(); });

async function connect(name) {
  const c = await createClient(WS, name);
  c.id = (await c.waitFor("welcome")).id;
  return c;
}

async function roomInVoting(names) {
  const clients = [];
  for (const n of names) clients.push(await connect(n));
  const [host, ...rest] = clients;
  host.send({ type: "host", name: host.name });
  const code = (await host.waitFor("room")).room.code;
  for (const c of rest) {
    c.send({ type: "join", code, name: c.name });
    await c.waitForMatch("room", (m) => m.room.players.some((p) => p.id === c.id));
  }
  host.send({ type: "start" });
  for (const c of clients) await c.waitForMatch("room", (m) => m.room.status === "voting");
  return { code, clients };
}

test("a new player can join while the room is voting and immediately sees the vote", async () => {
  const { code, clients } = await roomInVoting(["host", "p2"]);

  const late = await connect("late");
  late.send({ type: "join", code, name: "late" });
  const joined = await late.waitForMatch("room", (m) => m.room.players.some((p) => p.id === late.id), 2000);
  assert.equal(joined.room.status, "voting");
  assert.equal(joined.room.players.length, 3);

  const vs = await late.waitFor("vote_state", 1500);
  assert.ok(Array.isArray(vs.voting.availableGames));

  [...clients, late].forEach((c) => c.close());
});

test("the vote waits for the late joiner, who is then part of the started game", async () => {
  const { code, clients } = await roomInVoting(["host", "p2"]);
  const [host, p2] = clients;

  const late = await connect("late");
  late.send({ type: "join", code, name: "late" });
  await late.waitForMatch("room", (m) => m.room.players.some((p) => p.id === late.id));

  host.send({ type: "vote", game: "snake" });
  p2.send({ type: "vote", game: "snake" });
  await sleep(300);
  assert.ok(
    !host.messages.some((m) => m.type === "room" && m.room.status === "playing"),
    "the game must not start before the late joiner has voted",
  );

  late.send({ type: "vote", game: "snake" });
  const st = await late.waitForMatch("state", (m) => m.state?.gameType === "snake", 2000);
  assert.ok(st.state.snakes.some((s) => s.id === late.id), "late joiner has a snake");

  [...clients, late].forEach((c) => c.close());
});

test("a dropped player can rejoin the same room at the next vote", async () => {
  const { code, clients } = await roomInVoting(["host", "p2", "p3"]);
  const [host, p2, p3] = clients;
  p3.close();
  await host.waitForMatch("room", (m) => m.room.players.length === 2);

  const back = await connect("p3-again");
  back.send({ type: "join", code, name: "p3" });
  const joined = await back.waitForMatch("room", (m) => m.room.players.some((p) => p.id === back.id), 2000);
  assert.equal(joined.room.players.length, 3);

  host.close(); p2.close(); back.close();
});

test("a re-joining player never gets a colour that is already taken", async () => {
  const { code, clients } = await roomInVoting(["host", "p2", "p3"]);
  const [host, p2, p3] = clients;
  p2.close(); // frees colour #2 while p3 keeps colour #3
  await host.waitForMatch("room", (m) => m.room.players.length === 2);

  const back = await connect("p2-again");
  back.send({ type: "join", code, name: "p2" });
  const joined = await back.waitForMatch("room", (m) => m.room.players.some((p) => p.id === back.id), 2000);
  const colours = joined.room.players.map((p) => p.color);
  assert.equal(new Set(colours).size, colours.length, `duplicate colour in ${colours.join(",")}`);

  host.close(); p3.close(); back.close();
});

test("a departed player's vote stops counting toward 'everyone has voted'", async () => {
  const { clients } = await roomInVoting(["host", "p2", "p3"]);
  const [host, p2, p3] = clients;
  p3.send({ type: "vote", game: "snake" });
  await host.waitForMatch("vote_state", (m) => m.voting.totalVotes === 1);
  p3.close();
  await host.waitForMatch("room", (m) => m.room.players.length === 2);

  host.send({ type: "vote", game: "snake" });
  await sleep(300);
  assert.ok(
    !host.messages.some((m) => m.type === "room" && m.room.status === "playing"),
    "p2 has not voted yet, so the game must not start",
  );

  host.close(); p2.close();
});

test("when the last player who hasn't voted leaves, the vote resolves immediately", async () => {
  const { clients } = await roomInVoting(["host", "p2", "p3"]);
  const [host, p2, p3] = clients;
  host.send({ type: "vote", game: "hottake" });
  p2.send({ type: "vote", game: "hottake" });
  await host.waitForMatch("vote_state", (m) => m.voting.totalVotes === 2);
  p3.close();

  // Well under the 30s vote timer.
  await host.waitForMatch("room", (m) => m.room.status === "playing", 2000);

  host.close(); p2.close();
});

test("joining while a game is being played is still rejected", async () => {
  const { code, clients } = await roomInVoting(["host", "p2"]);
  for (const c of clients) c.send({ type: "vote", game: "hottake" });
  for (const c of clients) await c.waitForMatch("room", (m) => m.room.status === "playing");

  const late = await connect("too-late");
  late.send({ type: "join", code, name: "late" });
  const err = await late.waitFor("error", 2000);
  assert.match(err.message, /in progress/i);

  [...clients, late].forEach((c) => c.close());
});
