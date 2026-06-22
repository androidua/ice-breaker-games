// T-04 · Untracked round-end setTimeouts double-fire on host-skip
// (audit findings #5, #14, #16; fix A3).
//
// The round-end auto-advance setTimeouts in Word Chain and Bomber are created
// with bare setTimeout and never stored, so stopLoop can't cancel them. When a
// host skips during the round-end window, the manual advance runs AND the
// orphaned timer fires seconds later — skipping an extra round. Word Chain
// additionally double-awards the round win (the round-end skip branch re-credits
// a winner already credited on entry). The fix stores the handle in
// room.pendingAdvance, clears it in stopLoop, and stops the redundant award.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, createClient, setupGameRoom, sleep } from "../helpers/ws-client.js";

const PORT = 9885;
const WS = `ws://localhost:${PORT}`;
let server;

before(async () => { server = await startServer(PORT); });
after(async () => { await server.stop(); });

async function connect(name) {
  const c = await createClient(WS, name);
  c.id = (await c.waitFor("welcome")).id;
  return c;
}

test("Word Chain: skipping during round-end advances once and awards once", async () => {
  const host = await connect("host");
  const p2 = await connect("p2");
  await setupGameRoom([host, p2], "wordchain");

  // Skip during play → eliminate the current player → round_end (someone wins).
  host.send({ type: "skipPhase" });
  const reveal = await host.waitForMatch("state", (m) => m.state.status === "round_end");
  const winnerId = reveal.state.roundWinnerId;
  assert.ok(winnerId, "a round winner is set on round_end");

  // Skip AGAIN during the round-end reveal, then let any orphaned timer fire.
  host.send({ type: "skipPhase" });
  await host.waitForMatch("state", (m) => m.state.status === "playing" && m.state.round === 2);
  await sleep(3700); // the skip-path orphan is a 3s setTimeout

  const winsSeen = host.messages
    .filter((m) => m.type === "room")
    .map((m) => m.room.roundWins?.[winnerId] || 0);
  const maxWins = winsSeen.length ? Math.max(...winsSeen) : 0;
  const roundsSeen = host.messages
    .filter((m) => m.type === "state")
    .map((m) => m.state.round);
  const maxRound = roundsSeen.length ? Math.max(...roundsSeen) : 1;

  host.close(); p2.close();
  assert.equal(maxWins, 1, `RED: double-award credits 2; GREEN: exactly 1 (saw ${maxWins})`);
  assert.equal(maxRound, 2, `RED: orphan timer skips to round 3; GREEN: advanced once → 2 (saw ${maxRound})`);
});

test("Bomber: skipping during round-end does not skip an extra round", async () => {
  const host = await connect("host");
  const p2 = await connect("p2");
  await setupGameRoom([host, p2], "bomber");

  // Reach round_end fast via a disconnect (A1 marks the leaver dead → last-man-standing).
  p2.close();
  await host.waitForMatch("state", (m) => m.state.status === "round_end", 4000);

  // Skip during round_end → advance to round 2, then let any orphan timer fire.
  host.send({ type: "skipPhase" });
  await host.waitForMatch("state", (m) => m.state.status === "playing" && m.state.round === 2);
  host.messages.length = 0;
  await sleep(4500); // the bomber orphan is a ~4s (ROUND_END_DURATION) setTimeout

  const advancedAgain = host.messages.some((m) => m.type === "state" && m.state.round >= 3);
  host.close();
  assert.ok(!advancedAgain, "RED: orphan timer advances to round 3; GREEN: stays on round 2");
});
