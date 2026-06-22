// A4 (server layer) · The Emoji guessing phase must run a countdown so an idle
// (non-disconnecting) guesser can't hang the round forever. We don't wait out
// the whole window; we assert the broadcast guessing state now carries a live
// timer that ticks down — RED has timer:null and no interval at all.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, createClient, setupGameRoom, sleep } from "../helpers/ws-client.js";

const PORT = 9887;
const WS = `ws://localhost:${PORT}`;
let server;

before(async () => { server = await startServer(PORT); });
after(async () => { await server.stop(); });

async function connect(name) {
  const c = await createClient(WS, name);
  c.id = (await c.waitFor("welcome")).id;
  return c;
}

test("guessing phase exposes a countdown that ticks down", async () => {
  const host = await connect("host");
  const p2 = await connect("p2");
  await setupGameRoom([host, p2], "emoji");
  const byId = { [host.id]: host, [p2.id]: p2 };

  const compose = await host.waitForMatch("state", (m) => m.state.status === "composing");
  const storyteller = byId[compose.state.storytellerId];
  const guesser = [host, p2].find((c) => c.id !== compose.state.storytellerId);

  storyteller.send({ type: "gameAction", action: { kind: "submitEmojis", emojis: "🎬🦖🌴" } });

  const g1 = await guesser.waitForMatch("state", (m) => m.state.status === "guessing");
  assert.equal(typeof g1.state.timer, "number", "RED: guessing timer is null");
  assert.ok(g1.state.timer > 0, "guessing countdown starts positive");

  await sleep(2200);
  const g2 = await guesser.waitForMatch(
    "state",
    (m) => m.state.status === "guessing" && m.state.timer < g1.state.timer,
    3000
  );
  assert.ok(g2.state.timer < g1.state.timer, "the guessing countdown ticks down");

  host.close(); p2.close();
});
