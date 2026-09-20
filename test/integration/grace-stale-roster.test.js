// A seat inside its resume grace must never be treated as an ACTIVE player.
//
// These suites deliberately run with RESUME_GRACE_MS set, because that is what
// production uses and it is exactly where the existing disconnect tests are
// blind: the shared harness defaults to RESUME_GRACE_MS=0, so every other
// disconnect suite asserts the post-grace world and passes while production
// spends 45 seconds in the pre-grace one.
//
// reconcileDisconnect (index.js) already knows how to do the right thing — its
// own Bomber branch says it exists so checkRoundEnd resolves "to the real
// last-man-standing instead of counting a phantom" — but it only runs from
// handleDisconnect, which the grace defers. Most rounds are shorter than 45s,
// so the protection arrives long after the round it was meant to protect.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, createClient, setupGameRoom, sleep } from "../helpers/ws-client.js";

const PORT = 9917;
const WS = `ws://localhost:${PORT}`;
let server;

// Long enough that nothing here can accidentally outlive it.
before(async () => { server = await startServer(PORT, { RESUME_GRACE_MS: "45000" }); });
after(async () => { await server.stop(); });

async function connect(name) {
  const c = await createClient(WS, name);
  c.id = (await c.waitFor("welcome")).id;
  return c;
}

test("Bomber: a player inside the resume grace cannot win the round", async () => {
  const host = await connect("bHost");
  const p2 = await connect("bP2");
  await setupGameRoom([host, p2], "bomber");
  const ghostId = p2.id;

  p2.close();

  // GREEN: the round resolves to the only player actually present, well inside
  // the 45s grace. RED: the frozen body stays alive:true, checkRoundEnd keeps
  // counting a phantom, and nothing is credited until the round timer expires.
  const room = await host.waitForMatch(
    "room",
    (m) => m.room.roundWins && Object.keys(m.room.roundWins).length > 0,
    8000
  );
  assert.equal(room.room.roundWins[ghostId] || 0, 0, "a player who is gone must never be credited a round win");
  assert.equal(room.room.roundWins[host.id], 1, "the player still present wins the round");
  host.close();
});

test("Sketch: a player inside the resume grace is never made the drawer", async () => {
  const host = await connect("sHost");
  const p2 = await connect("sP2");
  await setupGameRoom([host, p2], "sketch");

  await host.waitForMatch("state", (m) => m.state.status === "drawing", 8000);
  const ghostId = p2.id;
  p2.close();
  await sleep(300);

  // With p2 gone, the host is the only player who can draw. Advance a couple of
  // rounds; the rotation must never hand the pencil to the absent seat.
  for (let round = 0; round < 2; round++) {
    host.send({ type: "skipPhase" });
    const next = await host.waitForMatch(
      "state",
      (m) => m.state.status === "drawing" && m.state.round >= round + 2,
      12000
    );
    assert.notEqual(
      next.state.drawerId,
      ghostId,
      `round ${next.state.round}: the drawer must be someone actually connected, not the seat in its grace`
    );
    assert.equal(next.state.drawerId, host.id, "the only connected player must be the drawer");
  }
  host.close();
});

test("Snake: a player inside the resume grace cannot win the round", async () => {
  const host = await connect("nHost");
  const p2 = await connect("nP2");
  await setupGameRoom([host, p2], "snake");

  await host.waitForMatch("state", (m) => m.state.status === "running", 8000);
  const ghostId = p2.id;
  p2.close();

  // Spawn 1 is (2,2) heading RIGHT, so steering UP walks the host into the top
  // wall within ~3 ticks. The absent player's snake is still drifting toward
  // the far wall, so it is the last one moving. (Directions are uppercase —
  // setSnakeDirection matches DIRECTION_KEYS exactly and silently ignores
  // anything else.)
  host.send({ type: "input", dir: "UP" });
  await host.waitForMatch("state", (m) => m.state.status === "gameover", 12000);

  // Plan D deliberately leaves the away snake on the board so a quick
  // reconnect resumes a living snake (resume.test.js #14), so it may well be
  // the last one alive on screen. What it must not do is bank the round win
  // for a round nobody was there to play.
  // Wait for the award itself to land — matching any "room" payload would
  // match one buffered from setup, long before roundWins was ever touched,
  // and the assertion would pass without testing anything.
  const room = await host.waitForMatch(
    "room",
    (m) => Object.keys(m.room.roundWins || {}).length > 0,
    8000
  );
  assert.equal(
    (room.room.roundWins || {})[ghostId] || 0,
    0,
    `a seat inside its grace must not be credited a Snake round win (roundWins=${JSON.stringify(room.room.roundWins)})`
  );
  host.close();
});
