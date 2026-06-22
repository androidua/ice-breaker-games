// T-02 · Disconnect during a vote/answer phase must re-check completion
// (audit findings #1, #3, #20; fix A1).
//
// The "all votes/answers in" early-advance checks only run inside a player's
// own action handler. handleDisconnect removes the player from room.players but
// never re-evaluates completion against the now-smaller roster, so the phase
// stalls until its timer expires. Each test below drives a game to its
// vote/answer phase, has the outstanding player drop, and asserts the round
// reveals fast (well before the phase timer would have bailed it out).
//
// The waitForMatch timeout (3s) is deliberately shorter than every phase timer
// (hottake 15s, truths 30s, trivia 15s) so RED fails by timing out.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { startServer, createClient, setupGameRoom } from "../helpers/ws-client.js";

const PORT = 9883;
const WS = `ws://localhost:${PORT}`;
let server;

before(async () => { server = await startServer(PORT); });
after(async () => { await server.stop(); });

async function connect(name) {
  const c = await createClient(WS, name);
  c.id = (await c.waitFor("welcome")).id;
  return c;
}

test("Hot Take: last outstanding voter dropping triggers reveal", async () => {
  const host = await connect("host");
  const p2 = await connect("p2");
  await setupGameRoom([host, p2], "hottake");

  // p2 votes; host (the only remaining non-voter) disconnects.
  p2.send({ type: "gameAction", action: { kind: "hotTakeVote", vote: "agree" } });
  host.close();

  const st = await p2.waitForMatch("state", (m) => m.state.status === "reveal", 3000);
  assert.equal(st.state.status, "reveal");
  p2.close();
});

test("Truths: a non-voting voter dropping triggers reveal", async () => {
  const host = await connect("host");
  const p2 = await connect("p2");
  const p3 = await connect("p3");
  await setupGameRoom([host, p2, p3], "truths");
  const byId = { [host.id]: host, [p2.id]: p2, [p3.id]: p3 };

  // Find the presenter and submit statements to enter the voting phase.
  const sub = await host.waitForMatch("state", (m) => m.state.status === "submitting");
  const presenter = byId[sub.state.presenterId];
  const voters = [host, p2, p3].filter((c) => c.id !== sub.state.presenterId);

  presenter.send({
    type: "gameAction",
    action: { kind: "submitStatements", statements: ["alpha", "bravo", "charlie"], lieIndex: 0 },
  });
  await voters[0].waitForMatch("state", (m) => m.state.status === "voting");

  // One voter votes; the other voter drops without voting.
  voters[0].send({ type: "gameAction", action: { kind: "vote", index: 1 } });
  voters[1].close();

  const st = await voters[0].waitForMatch("state", (m) => m.state.status === "reveal", 3000);
  assert.equal(st.state.status, "reveal");
  host.close(); p2.close(); p3.close();
});

test("Trivia: a non-answering player dropping triggers reveal", async () => {
  const host = await connect("host");
  const p2 = await connect("p2");
  await setupGameRoom([host, p2], "trivia");

  // host answers; p2 (the only remaining non-answerer) disconnects.
  host.send({ type: "gameAction", action: { kind: "answer", index: 0 } });
  p2.close();

  const st = await host.waitForMatch("state", (m) => m.state.status === "reveal", 3000);
  assert.equal(st.state.status, "reveal");
  host.close();
});
