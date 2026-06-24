// A1 · Word Chain disconnect reconciliation (deferred from Phase A).
//
// reconcileDisconnect had no "wordchain" branch, so a player leaving mid-game was
// never pruned from the engine. The round only ended once the departed player's
// turn timed out (up to 15s of dead air, and only if it was their turn). The fix
// wires removeWordChainPlayer into reconcileDisconnect: the leaver is removed
// immediately, the turn advances if it was theirs, and a two-player game ends at
// once with the survivor as the round winner — no 15s stall.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, createClient, setupGameRoom } from "../helpers/ws-client.js";

const PORT = 9889;
const WS = `ws://localhost:${PORT}`;
let server;

before(async () => { server = await startServer(PORT); });
after(async () => { await server.stop(); });

async function connect(name) {
  const c = await createClient(WS, name);
  c.id = (await c.waitFor("welcome")).id;
  return c;
}

async function toPlaying() {
  const host = await connect("host");
  const p2 = await connect("p2");
  await setupGameRoom([host, p2], "wordchain");
  const byId = { [host.id]: host, [p2.id]: p2 };
  const st = await host.waitForMatch(
    "state",
    (m) => m.state.gameType === "wordchain" && m.state.status === "playing"
  );
  return { host, p2, byId, currentId: st.state.currentPlayerId };
}

test("the current player dropping ends a two-player round; the survivor wins (no 15s stall)", async () => {
  const { host, p2, byId, currentId } = await toPlaying();
  const current = byId[currentId];
  const survivor = [host, p2].find((c) => c.id !== currentId);

  current.close();

  // RED: stays "playing" until the 15s turn timer; GREEN: round_end almost immediately.
  const end = await survivor.waitForMatch("state", (m) => m.state.status === "round_end", 3000);
  assert.equal(end.state.status, "round_end");
  assert.equal(end.state.roundWinnerId, survivor.id, "the remaining player wins when their opponent drops");
  survivor.close();
});

test("a non-current player dropping still ends a two-player round for the survivor", async () => {
  const { host, p2, byId, currentId } = await toPlaying();
  const survivor = byId[currentId]; // keep the active player
  const leaver = [host, p2].find((c) => c.id !== currentId);

  leaver.close();

  const end = await survivor.waitForMatch("state", (m) => m.state.status === "round_end", 3000);
  assert.equal(end.state.status, "round_end");
  assert.equal(end.state.roundWinnerId, survivor.id, "the survivor wins regardless of whose turn it was");
  survivor.close();
});
