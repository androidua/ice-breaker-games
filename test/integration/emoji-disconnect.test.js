// T-03 · Emoji guessing phase hangs on a disconnect (audit findings #2, #6, #15;
// fix A1 — disconnect reconciliation).
//
// The guessing phase runs with NO interval; it only ends when every guesser is
// correct or exhausted, evaluated over the FROZEN playerIds. handleDisconnect
// never prunes the engine roster, so a dropped guesser is forever neither
// correct nor exhausted → the round hangs indefinitely (the one truly permanent
// stall in the app). The fix prunes the leaver and re-checks completion,
// revealing when nobody is left to guess.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, createClient, setupGameRoom } from "../helpers/ws-client.js";

const PORT = 9884;
const WS = `ws://localhost:${PORT}`;
let server;

before(async () => { server = await startServer(PORT); });
after(async () => { await server.stop(); });

async function connect(name) {
  const c = await createClient(WS, name);
  c.id = (await c.waitFor("welcome")).id;
  return c;
}

async function toGuessingPhase() {
  const host = await connect("host");
  const p2 = await connect("p2");
  await setupGameRoom([host, p2], "emoji");
  const byId = { [host.id]: host, [p2.id]: p2 };

  const compose = await host.waitForMatch("state", (m) => m.state.status === "composing");
  const storyteller = byId[compose.state.storytellerId];
  const guesser = [host, p2].find((c) => c.id !== compose.state.storytellerId);

  storyteller.send({ type: "gameAction", action: { kind: "submitEmojis", emojis: "🎬🦖🌴" } });
  await storyteller.waitForMatch("state", (m) => m.state.status === "guessing");
  return { storyteller, guesser };
}

test("guesser dropping during guessing reveals (no one left to guess)", async () => {
  const { storyteller, guesser } = await toGuessingPhase();

  guesser.close();

  const st = await storyteller.waitForMatch("state", (m) => m.state.status === "reveal", 3000);
  assert.equal(st.state.status, "reveal");
  storyteller.close();
});

test("storyteller dropping during guessing reveals the round", async () => {
  const { storyteller, guesser } = await toGuessingPhase();

  storyteller.close();

  const st = await guesser.waitForMatch("state", (m) => m.state.status === "reveal", 3000);
  assert.equal(st.state.status, "reveal");
  guesser.close();
});
