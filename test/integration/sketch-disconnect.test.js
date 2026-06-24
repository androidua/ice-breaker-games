// A1 · Sketch & Guess disconnect reconciliation (deferred from Phase A).
//
// The drawing phase runs on a 45s timer, so a disconnect doesn't hang forever —
// but reconcileDisconnect had no "sketch" branch, so two drops would idle out the
// full timer: the DRAWER leaving (no one can add strokes) or the LAST GUESSER
// leaving (no one can guess the word). The fix mirrors the emoji branch — prune
// the leaver and reveal the round at once when no draw or no guess is possible.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, createClient, setupGameRoom } from "../helpers/ws-client.js";

const PORT = 9888;
const WS = `ws://localhost:${PORT}`;
let server;

before(async () => { server = await startServer(PORT); });
after(async () => { await server.stop(); });

async function connect(name) {
  const c = await createClient(WS, name);
  c.id = (await c.waitFor("welcome")).id;
  return c;
}

async function toDrawing() {
  const host = await connect("host");
  const p2 = await connect("p2");
  await setupGameRoom([host, p2], "sketch");
  const byId = { [host.id]: host, [p2.id]: p2 };
  const st = await host.waitForMatch(
    "state",
    (m) => m.state.gameType === "sketch" && m.state.status === "drawing"
  );
  const drawer = byId[st.state.drawerId];
  const guesser = [host, p2].find((c) => c.id !== st.state.drawerId);
  return { drawer, guesser };
}

test("the drawer dropping during drawing reveals the round (no one can draw)", async () => {
  const { drawer, guesser } = await toDrawing();

  drawer.close();

  // RED: stays "drawing" for the 45s timer; GREEN: reveal almost immediately.
  const st = await guesser.waitForMatch("state", (m) => m.state.status === "reveal", 3000);
  assert.equal(st.state.status, "reveal");
  guesser.close();
});

test("the last guesser dropping during drawing reveals the round (no one can win)", async () => {
  const { drawer, guesser } = await toDrawing();

  guesser.close();

  const st = await drawer.waitForMatch("state", (m) => m.state.status === "reveal", 3000);
  assert.equal(st.state.status, "reveal");
  drawer.close();
});
