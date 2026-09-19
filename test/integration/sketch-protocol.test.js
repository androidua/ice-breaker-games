// Sketch on the wire. The canvas used to be re-serialised for every player on
// every draw action *and* every tick, with no validation of what a stroke held:
// one drawer sending 15.5 KB strokes at the rate limit exhausted the server's
// heap in ~15s and took every room down with it. Now a stroke is sent once, as
// itself, and the per-second state leaves the canvas out.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, createClient, setupGameRoom, sleep } from "../helpers/ws-client.js";

const PORT = 9909;
const WS = `ws://localhost:${PORT}`;
let server;

before(async () => { server = await startServer(PORT); });
after(async () => { await server.stop(); });

async function sketchRoom() {
  const a = await createClient(WS, "a"); a.id = (await a.waitFor("welcome")).id;
  const b = await createClient(WS, "b"); b.id = (await b.waitFor("welcome")).id;
  await setupGameRoom([a, b], "sketch");
  const start = await a.waitForMatch("state", (m) => m.state.status === "drawing");
  const drawer = start.state.drawerId === a.id ? a : b;
  const guesser = drawer === a ? b : a;
  return { drawer, guesser, clients: [a, b] };
}

// Resolves to null when nothing of that type arrives in time.
const nothing = (client, type, ms = 600) =>
  client.waitFor(type, ms).catch(() => null);

test("a drawn stroke is sent once, as a stroke, not as a new copy of the canvas", async () => {
  const { drawer, guesser, clients } = await sketchRoom();
  drawer.send({ type: "gameAction", action: { kind: "draw", points: [{ x: 10, y: 10 }, { x: 20, y: 20 }], color: "#3d5a80" } });

  const msg = await guesser.waitFor("sketch_stroke");
  assert.deepEqual(msg.stroke.points, [{ x: 10, y: 10 }, { x: 20, y: 20 }]);
  assert.equal(msg.stroke.color, "#3d5a80");

  // The per-second timer broadcast carries the countdown, not the canvas.
  // (The full state from the start of the round is already buffered; forget it.)
  guesser.messages.length = 0;
  const tick = await guesser.waitForMatch("state", (m) => m.state.status === "drawing", 2000);
  assert.equal(tick.state.strokes, undefined, "the tick re-sent the whole canvas");
  assert.equal(typeof tick.state.timer, "number");
  clients.forEach((c) => c.close());
});

test("junk points are refused silently: no stroke, no state, no error", async () => {
  const { drawer, guesser, clients } = await sketchRoom();
  const junk = Array(500).fill("x".repeat(28)); // 15.5 KB of nothing, under maxPayload
  drawer.send({ type: "gameAction", action: { kind: "draw", points: junk, color: "#000" } });

  assert.equal(await nothing(guesser, "sketch_stroke"), null, "junk was broadcast as a stroke");
  assert.equal(await nothing(drawer, "error"), null, "a refused stroke must not error the drawer");

  // The drawer can still draw for real afterwards.
  drawer.send({ type: "gameAction", action: { kind: "draw", points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] } });
  await guesser.waitFor("sketch_stroke");
  clients.forEach((c) => c.close());
});

test("clear is its own message, and a guess updates the feed without the canvas", async () => {
  const { drawer, guesser, clients } = await sketchRoom();
  drawer.send({ type: "gameAction", action: { kind: "draw", points: [{ x: 1, y: 1 }, { x: 2, y: 2 }] } });
  await guesser.waitFor("sketch_stroke");

  drawer.send({ type: "gameAction", action: { kind: "clear" } });
  await guesser.waitFor("sketch_clear");

  guesser.send({ type: "gameAction", action: { kind: "guess", text: "definitely-wrong" } });
  const fed = await guesser.waitForMatch("state", (m) => m.state.guesses?.some((g) => g.text === "definitely-wrong"));
  assert.equal(fed.state.strokes, undefined, "a guess re-sent the canvas");
  clients.forEach((c) => c.close());
});

test("a player who runs out of guesses stops costing the room broadcasts", async () => {
  const { guesser, drawer, clients } = await sketchRoom();
  for (let i = 0; i < 20; i++) {
    guesser.send({ type: "gameAction", action: { kind: "guess", text: `nope ${i}` } });
  }
  await guesser.waitForMatch("state", (m) => m.state.guesses?.some((g) => g.text === "nope 19"), 3000);

  drawer.messages.length = 0;
  guesser.send({ type: "gameAction", action: { kind: "guess", text: "over-the-limit" } });
  await sleep(300);
  const leaked = drawer.messages.some((m) => JSON.stringify(m).includes("over-the-limit"));
  assert.equal(leaked, false, "a guess past the cap was still broadcast");
  clients.forEach((c) => c.close());
});
