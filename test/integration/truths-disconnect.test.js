// Deferred A1 follow-up: presenter role reassignment on a mid-submit drop.
//
// Two Truths runs a 60s submitting phase where the presenter enters their three
// statements. reconcileDisconnect only handled the "voting" phase, so a presenter
// leaving mid-submit idled the full 60s (then an empty round) with the departed
// player still listed as presenter. The fix advances to the next presenter at
// once — same as the submit-timeout / host-skip path.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, createClient, setupGameRoom } from "../helpers/ws-client.js";

const PORT = 9890;
const WS = `ws://localhost:${PORT}`;
let server;

before(async () => { server = await startServer(PORT); });
after(async () => { await server.stop(); });

async function connect(name) {
  const c = await createClient(WS, name);
  c.id = (await c.waitFor("welcome")).id;
  return c;
}

async function toSubmitting() {
  const host = await connect("host");
  const p2 = await connect("p2");
  await setupGameRoom([host, p2], "truths");
  const byId = { [host.id]: host, [p2.id]: p2 };
  const st = await host.waitForMatch(
    "state",
    (m) => m.state.gameType === "truths" && m.state.status === "submitting"
  );
  return { host, p2, byId, presenterId: st.state.presenterId };
}

test("presenter dropping during submitting reassigns the role (no 60s stall)", async () => {
  const { host, p2, byId, presenterId } = await toSubmitting();
  const presenter = byId[presenterId];
  const survivor = [host, p2].find((c) => c.id !== presenterId);

  presenter.close();

  // RED: presenterId stays the departed player until the 60s timer; GREEN: the
  // survivor is reassigned as presenter and a fresh submit starts immediately.
  const st = await survivor.waitForMatch(
    "state",
    (m) => m.state.status === "submitting" && m.state.presenterId === survivor.id,
    3000
  );
  assert.equal(st.state.presenterId, survivor.id);
  survivor.close();
});
