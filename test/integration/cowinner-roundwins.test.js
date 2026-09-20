// Co-winners must ALL be credited in room.roundWins, not just one of them.
//
// The engines now expose a plural roundWinnerIds (see engines/cowinner.test.js);
// this pins the other half — index.js must loop over it at the award site.
// room.roundWins is what the leaderboard shows AND what topWinners() reads on
// End Game, so dropping ties here silently decides the session.
//
// Confirmed live on production at v1.22.2 before the fix: four Hot Take voters
// each scored +1 and exactly one of them was credited a round win.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, createClient, setupGameRoom } from "../helpers/ws-client.js";

const PORT = 9916;
const WS = `ws://localhost:${PORT}`;
let server;

before(async () => { server = await startServer(PORT); });
after(async () => { await server.stop(); });

async function connect(name) {
  const c = await createClient(WS, name);
  c.id = (await c.waitFor("welcome")).id;
  return c;
}

test("every Hot Take majority voter is credited a round win", async () => {
  const host = await connect("host");
  const p2 = await connect("p2");
  const p3 = await connect("p3");
  const p4 = await connect("p4");
  const all = [host, p2, p3, p4];
  await setupGameRoom(all, "hottake");

  await host.waitForMatch("state", (m) => m.state.status === "voting", 8000);

  // 3 agree vs 1 disagree — an unambiguous majority, all three gain +1.
  const majority = [host, p2, p3];
  for (const c of majority) c.send({ type: "gameAction", action: { kind: "hotTakeVote", vote: "agree" } });
  p4.send({ type: "gameAction", action: { kind: "hotTakeVote", vote: "disagree" } });

  const reveal = await host.waitForMatch("state", (m) => m.state.status === "reveal", 8000);
  assert.equal(reveal.state.roundResult.awardedPlayerIds.length, 3, "the engine awards all three");

  // The round win lands in room.roundWins only when the reveal timer expires.
  const room = await host.waitForMatch(
    "room",
    (m) => Object.values(m.room.roundWins || {}).reduce((a, b) => a + b, 0) > 0,
    15000
  );

  for (const c of majority) {
    assert.equal(
      room.room.roundWins[c.id],
      1,
      `${c.name} scored +1 in the majority and must hold a round win (roundWins=${JSON.stringify(room.room.roundWins)})`
    );
  }
  assert.equal(room.room.roundWins[p4.id] || 0, 0, "the minority voter must not be credited");

  all.forEach((c) => c.close());
});

test("a Hot Take tie credits nobody a round win", async () => {
  const host = await connect("tieHost");
  const p2 = await connect("tieP2");
  const all = [host, p2];
  await setupGameRoom(all, "hottake");

  await host.waitForMatch("state", (m) => m.state.status === "voting", 8000);
  host.send({ type: "gameAction", action: { kind: "hotTakeVote", vote: "agree" } });
  p2.send({ type: "gameAction", action: { kind: "hotTakeVote", vote: "disagree" } });

  const reveal = await host.waitForMatch("state", (m) => m.state.status === "reveal", 8000);
  assert.equal(reveal.state.roundResult.majority, "tie");

  // Let the reveal expire and the next round begin, then assert nothing was
  // credited — a tie must award nobody, not "everybody" and not "the first one".
  await host.waitForMatch("state", (m) => m.state.status === "voting" && m.state.round === 2, 15000);
  const latestRoom = host.messages.filter((m) => m.type === "room").pop();
  const wins = latestRoom ? latestRoom.room.roundWins : {};
  const total = Object.values(wins || {}).reduce((a, b) => a + b, 0);
  assert.equal(total, 0, `a tied round must credit nobody (roundWins=${JSON.stringify(wins)})`);

  all.forEach((c) => c.close());
});
