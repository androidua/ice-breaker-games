// Trivia completion is a property of the *question* phase. Without that check,
// any action once everyone had answered re-ran the reveal: it paid the
// question's points out again and restarted the reveal timer, so a single
// player could farm score and hold the room on one question indefinitely.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, createClient, setupGameRoom, sleep } from "../helpers/ws-client.js";

const PORT = 9910;
const WS = `ws://localhost:${PORT}`;
let server;

before(async () => { server = await startServer(PORT); });
after(async () => { await server.stop(); });

test("actions during the reveal neither re-score nor restart the timer", async () => {
  const a = await createClient(WS, "a"); a.id = (await a.waitFor("welcome")).id;
  const b = await createClient(WS, "b"); b.id = (await b.waitFor("welcome")).id;
  await setupGameRoom([a, b], "trivia");

  // Answer every option between the two of them until a question is scored,
  // so there is a score that a repeated reveal would visibly inflate.
  let reveal = null;
  for (let q = 0; q < 10 && !reveal; q++) {
    await a.waitForMatch("state", (m) => m.state.status === "question" && m.state.questionIndex === q, 20000);
    a.send({ type: "gameAction", action: { kind: "answer", index: 0 } });
    b.send({ type: "gameAction", action: { kind: "answer", index: 1 } });
    const shown = await a.waitForMatch("state", (m) => m.state.status === "reveal" && m.state.questionIndex === q);
    if (Object.values(shown.state.scores).some((n) => n > 0)) reveal = shown;
  }
  assert.ok(reveal, "no question was scored in 10 tries");
  const scores = { ...reveal.state.scores };

  await sleep(1100); // let the reveal timer tick down at least once
  a.messages.length = 0;
  for (let i = 0; i < 3; i++) {
    b.send({ type: "gameAction", action: { kind: "answer", index: 3 } });
    await sleep(120);
  }
  const after = await a.waitForMatch("state", (m) => m.state.status === "reveal");
  assert.deepEqual(after.state.scores, scores, "an ignored answer re-paid the question");
  assert.ok(after.state.timer < reveal.state.timer, "the reveal timer was restarted");

  // The question still advances on its own.
  await a.waitForMatch("state", (m) => m.state.questionIndex === reveal.state.questionIndex + 1, 8000);
  a.close(); b.close();
});
