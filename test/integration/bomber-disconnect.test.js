// T-05 · Bomber: a disconnected player stays alive, so the round can never
// reach last-man-standing (audit findings #7, #11; fix A1).
//
// handleDisconnect only marked the Snake player dead — Bomber's player entry
// stayed alive:true, so checkRoundEnd kept counting a phantom and the round
// only ended when the 120s timer expired (crediting the absent ghost as a
// co-winner). The fix marks the leaver dead so the running loop resolves to
// the real last player, and the ghost is never credited a round win.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, createClient, setupGameRoom } from "../helpers/ws-client.js";

const PORT = 9886;
const WS = `ws://localhost:${PORT}`;
let server;

before(async () => { server = await startServer(PORT); });
after(async () => { await server.stop(); });

async function connect(name) {
  const c = await createClient(WS, name);
  c.id = (await c.waitFor("welcome")).id;
  return c;
}

test("a mid-round disconnect ends the round and never credits the ghost", async () => {
  const host = await connect("host");
  const p2 = await connect("p2");
  await setupGameRoom([host, p2], "bomber");
  const p2Id = p2.id;

  p2.close();

  // GREEN: the round resolves to last-man-standing fast (a roundWins entry
  // appears) — not after the 120s timer. RED: no round end within the window.
  const room = await host.waitForMatch(
    "room",
    (m) => m.room.roundWins && Object.keys(m.room.roundWins).length > 0,
    4000
  );
  assert.equal(room.room.roundWins[p2Id] || 0, 0, "the departed player must not be credited a round win");
  assert.equal(room.room.roundWins[host.id], 1, "the remaining player wins the round");
  host.close();
});
