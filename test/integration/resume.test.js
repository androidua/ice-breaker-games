// Plan D · Grace-period session resume (docs/plan-D-reconnect-resume.md §3).
//
// A player whose connection drops keeps their seat for RESUME_GRACE_MS: same
// player id, host role, colour, scores and place in the running game. A new
// socket proves it owns the seat with the secret resumeToken from the welcome
// it got when it first connected. When the grace runs out, the existing
// disconnect path (handleDisconnect → reconcileDisconnect) runs, just later.
//
// This server runs with a 600ms grace. Every other suite runs with 0 (the
// harness default), which is the old instant removal.

import { test, before, after, afterEach } from "node:test";
import assert from "node:assert/strict";
import { startServer, createClient, setupGameRoom, sleep } from "../helpers/ws-client.js";

const PORT = 9908;
const WS = `ws://localhost:${PORT}`;
const GRACE_MS = 600;
let server;

before(async () => { server = await startServer(PORT, { RESUME_GRACE_MS: String(GRACE_MS), DEBUG_INTERNALS: "1" }); });
after(async () => { await server.stop(); });

// Close every socket a test opened, even when it fails part-way, so a failed
// test can't leave rooms behind for the next one (test 9 counts rooms).
const opened = [];
afterEach(() => {
  for (const c of opened.splice(0)) c.ws.terminate();
});

async function open(name) {
  const c = await createClient(WS, name);
  opened.push(c);
  return c;
}

async function connect(name) {
  const c = await open(name);
  const welcome = await c.waitFor("welcome");
  c.id = welcome.id;
  c.token = welcome.resumeToken;
  return c;
}

// The same person on a new socket: it gets its own fresh welcome first, then
// asks for its old seat back.
async function resumeAs(old) {
  const c = await open(old.name);
  await c.waitFor("welcome");
  c.send({ type: "resume", token: old.token });
  return c;
}

async function resumed(c) {
  const welcome = await c.waitForMatch("welcome", (m) => m.resumed === true, 3000);
  c.id = welcome.id;
  c.token = welcome.resumeToken;
  return welcome;
}

// A dropped connection (no close frame): the server sees close code 1006.
function drop(c) {
  c.ws.terminate();
}

// The harness buffers unconsumed messages and waitForMatch searches that buffer
// first; forget the old ones so a later match can only be a newer message.
function forget(...clients) {
  for (const c of clients) c.messages.length = 0;
}

async function hostAndJoin(host, guest) {
  host.send({ type: "host", name: host.name });
  const code = (await host.waitFor("room")).room.code;
  guest.send({ type: "join", code, name: guest.name });
  const { room } = await guest.waitForMatch("room", (m) => m.room.players.some((p) => p.id === guest.id));
  return { code, room };
}

const away = (room, id) => room.players.find((p) => p.id === id)?.connected === false;

function logEvents() {
  return server.stdout().split("\n").filter((l) => l.startsWith("{")).map((l) => JSON.parse(l));
}

async function health() {
  return (await fetch(`http://localhost:${PORT}/health`)).json();
}

// Server-side bookkeeping that no client message reveals: the maps a seat lives
// in, the grace timers, and the live game loops. DEBUG_INTERNALS=1 exposes it.
async function internals() {
  return (await fetch(`http://localhost:${PORT}/__internals`)).json();
}

async function until(check, timeoutMs = 3000, what = "condition") {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await check()) return;
    await sleep(25);
  }
  assert.fail(`timed out waiting for ${what}`);
}

test("1. resume within grace keeps identity: same id, listed once, same colour", async () => {
  const host = await connect("host");
  const guest = await connect("guest");
  assert.equal(typeof guest.token, "string", "welcome carries a resumeToken");
  const { room } = await hostAndJoin(host, guest);
  const colour = room.players.find((p) => p.id === guest.id).color;

  forget(host);
  drop(guest);
  // Others see the seat held, flagged as away, rather than removed.
  const held = await host.waitForMatch("room", (m) => away(m.room, guest.id));
  assert.equal(held.room.players.length, 2);

  const back = await resumeAs(guest);
  const welcome = await resumed(back);
  assert.equal(welcome.id, guest.id);

  const after = (await back.waitFor("room")).room;
  const mine = after.players.filter((p) => p.id === guest.id);
  assert.equal(mine.length, 1);
  assert.equal(mine[0].color, colour);
  assert.equal(after.players.length, 2);
  await host.waitForMatch("room", (m) => m.room.players.length === 2 && !away(m.room, guest.id));
  host.close(); back.close();
});

test("2. resume after grace fails, and the room no longer lists the player", async () => {
  const host = await connect("host");
  const guest = await connect("guest");
  await hostAndJoin(host, guest);

  drop(guest);
  await sleep(GRACE_MS + 400);
  const back = await resumeAs(guest);
  await back.waitFor("resume_failed", 3000);

  const gone = await host.waitForMatch("room", (m) => !m.room.players.some((p) => p.id === guest.id));
  assert.equal(gone.room.players.length, 1);
  host.close(); back.close();
});

test("3. the host role is lent out while the host is away, and handed back on resume", async () => {
  const host = await connect("host");
  const guest = await connect("guest");
  await hostAndJoin(host, guest);

  forget(guest);
  drop(host);
  // Nothing the host alone can do (Start here, Skip or End Game mid-game, or
  // Trivia's "next set") may wait out the grace, so a connected player holds
  // the role meanwhile.
  const lent = await guest.waitForMatch("room", (m) => away(m.room, host.id));
  assert.equal(lent.room.hostId, guest.id, "the host role was not lent to the connected player");
  guest.send({ type: "start" });
  await guest.waitForMatch("room", (m) => m.room.status === "voting");

  const back = await resumeAs(host);
  assert.equal((await resumed(back)).id, host.id);
  const returned = await back.waitForMatch("room", (m) => m.room.hostId === host.id, 3000);
  assert.equal(returned.room.status, "voting");
  await guest.waitForMatch("room", (m) => m.room.hostId === host.id);

  // Host-only actions route to the resumed seat, not the stand-in.
  back.send({ type: "vote", game: "hottake" });
  guest.send({ type: "vote", game: "hottake" });
  await back.waitForMatch("room", (m) => m.room.status === "playing");
  guest.send({ type: "endGame" }); // no longer the host: ignored
  await sleep(200);
  back.send({ type: "endGame" });
  await back.waitForMatch("room", (m) => m.room.status === "voting", 3000);
  back.close(); guest.close();
});

test("3b. a lent host role stays put when the away host never comes back", async () => {
  const host = await connect("host");
  const guest = await connect("guest");
  await hostAndJoin(host, guest);

  forget(guest);
  drop(host);
  await guest.waitForMatch("room", (m) => m.room.hostId === guest.id);
  const gone = await guest.waitForMatch("room", (m) => !m.room.players.some((p) => p.id === host.id), GRACE_MS + 2000);
  assert.equal(gone.room.hostId, guest.id);
  guest.send({ type: "start" });
  await guest.waitForMatch("room", (m) => m.room.status === "voting");
  guest.close();
});

test("4. round wins survive a drop and resume", async () => {
  const host = await connect("host");
  const guest = await connect("guest");
  await setupGameRoom([host, guest], "wordchain");

  // A host skip during play eliminates the current player; with two players
  // the other one wins the round on the spot.
  host.send({ type: "skipPhase" });
  const won = await host.waitForMatch("room", (m) => Object.values(m.room.roundWins).includes(1));
  const winnerId = Object.keys(won.room.roundWins).find((id) => won.room.roundWins[id] === 1);
  const winner = winnerId === host.id ? host : guest;
  const other = winner === host ? guest : host;

  forget(other);
  drop(winner);
  await other.waitForMatch("room", (m) => away(m.room, winnerId));
  const back = await resumeAs(winner);
  assert.equal((await resumed(back)).id, winnerId);
  const after = (await back.waitFor("room")).room;
  assert.equal(after.roundWins[winnerId], 1);
  const seen = await other.waitForMatch("room", (m) => !away(m.room, winnerId));
  assert.equal(seen.room.roundWins[winnerId], 1);
  back.close(); other.close();
});

test("5. mid-game resume restores private state: the Emoji storyteller keeps the prompt", async () => {
  const host = await connect("host");
  const guest = await connect("guest");
  await setupGameRoom([host, guest], "emoji");
  const compose = await host.waitForMatch("state", (m) => m.state.status === "composing");
  const teller = compose.state.storytellerId === host.id ? host : guest;
  const guesser = teller === host ? guest : host;

  drop(teller);
  await sleep(100);
  const back = await resumeAs(teller);
  await resumed(back);

  const mine = await back.waitForMatch("state", (m) => m.state.status === "composing");
  assert.equal(mine.state.storytellerId, teller.id, "the storyteller role was reassigned");
  assert.equal(typeof mine.state.prompt?.text, "string", "the storyteller lost the secret prompt");
  const theirs = await guesser.waitForMatch("state", (m) => m.state.status === "composing");
  assert.equal(theirs.state.prompt, undefined, "a guesser can see the secret prompt");

  // The resumed storyteller can still play its turn.
  back.send({ type: "gameAction", action: { kind: "submitEmojis", emojis: "🎬🦖🌴" } });
  await guesser.waitForMatch("state", (m) => m.state.status === "guessing");
  back.close(); guesser.close();
});

test("6. grace expiry runs the existing disconnect reconciliation exactly once", async () => {
  const host = await connect("host");
  const guest = await connect("guest");
  await setupGameRoom([host, guest], "hottake");
  const statuses = [];
  host.ws.on("message", (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.type === "state") statuses.push(m.state.status);
  });

  // The guest is the last voter left; while in grace their seat still counts.
  host.send({ type: "gameAction", action: { kind: "hotTakeVote", vote: "agree" } });
  drop(guest);
  await sleep(GRACE_MS / 2);
  assert.ok(!statuses.includes("reveal"), "revealed before the grace period ended");

  // Well inside the 15s vote timer, so only the reconciliation can reveal.
  await host.waitForMatch("state", (m) => m.state.status === "reveal", 3000);
  const byGuest = (name) => logEvents().filter((e) => e.message === name && e.player === guest.id);
  await until(() => byGuest("player_left").length > 0, 2000, "player_left log");
  await sleep(300);
  assert.equal(byGuest("grace_expired").length, 1);
  const left = byGuest("player_left");
  assert.equal(left.length, 1);
  assert.equal(left[0].code, 1006);
  const reveals = statuses.filter((s, i) => s === "reveal" && statuses[i - 1] !== "reveal");
  assert.equal(reveals.length, 1);
  host.close();
});

test("7. last connection wins: a second socket takes the seat, the first is closed with 4000", async () => {
  const host = await connect("host");
  const guest = await connect("guest");
  await hostAndJoin(host, guest);
  const firstClosed = new Promise((res) => guest.ws.once("close", (code) => res(code)));

  const second = await resumeAs(guest); // the first socket is still open
  assert.equal((await resumed(second)).id, guest.id);
  assert.equal(await firstClosed, 4000);
  const room = (await second.waitFor("room")).room;
  assert.equal(room.players.filter((p) => p.id === guest.id).length, 1);
  assert.equal(room.players.length, 2);

  // Closing the replaced socket must not start a grace timer on the live seat.
  await sleep(GRACE_MS + 300);
  assert.equal(logEvents().filter((e) => e.message === "player_left" && e.player === guest.id).length, 0);
  host.close(); second.close();
});

test("8. resume tokens never reach other players or the logs", async () => {
  const host = await connect("host");
  const raw = [];
  host.ws.on("message", (data) => raw.push(data.toString()));
  const guest = await connect("guest");
  assert.equal(typeof host.token, "string");
  assert.equal(typeof guest.token, "string");
  assert.notEqual(host.token, guest.token);

  // Emoji: room, vote_state and per-player state all reach the host.
  await setupGameRoom([host, guest], "emoji");
  await host.waitForMatch("state", (m) => m.state.status === "composing");
  drop(guest);
  await sleep(100);
  const back = await resumeAs(guest);
  await resumed(back);
  await host.waitForMatch("room", (m) => m.room.players.length === 2 && !away(m.room, guest.id));
  await sleep(1100); // at least one more timer broadcast

  const types = new Set(raw.map((r) => JSON.parse(r).type));
  for (const t of ["room", "vote_state", "state"]) assert.ok(types.has(t), `host saw no ${t} message`);
  for (const r of raw) {
    assert.ok(!r.includes(guest.token), "the guest's token reached the host");
    assert.ok(!r.includes(host.token), `the host's token was in a ${JSON.parse(r).type} broadcast`);
  }
  const logs = server.stdout();
  assert.ok(!logs.includes(guest.token) && !logs.includes(host.token), "a resume token reached the logs");
  host.close(); back.close();
});

test("9. everyone dropping at once keeps the room through grace, then deletes it", async () => {
  await until(async () => (await health()).rooms === 0, 5000, "earlier rooms to expire");
  const host = await connect("host");
  const guest = await connect("guest");
  const { code } = await hostAndJoin(host, guest);
  assert.equal((await health()).rooms, 1);

  drop(host);
  drop(guest);
  await sleep(GRACE_MS / 2);
  const mid = await health();
  assert.equal(mid.rooms, 1, "room deleted while its players were still in grace");
  assert.equal(mid.players, 2);

  await until(async () => (await health()).rooms === 0, 3000, "the room to close after grace");
  const late = await connect("late");
  late.send({ type: "join", code, name: "late" });
  assert.equal((await late.waitFor("error")).message, "Room not found.");
  assert.equal(logEvents().filter((e) => e.message === "room_closed" && e.room === code).length, 1);
  late.close();
});

test("10. a client that never joined a room is cleaned up at once; its token is no seat", async () => {
  const before = await health();
  const lone = await connect("lone");
  assert.equal(typeof lone.token, "string");
  lone.close();
  await until(async () => (await health()).sockets <= before.sockets, 2000, "the socket to close");
  assert.equal((await health()).players, before.players);

  const other = await open("other");
  await other.waitFor("welcome");
  other.send({ type: "resume", token: lone.token });
  await other.waitFor("resume_failed", 3000);
  other.close();
});

// ── §2.5 per-game behaviour during grace (decided 2026-09-19: the same grace
// for everyone, including the storyteller/drawer/presenter; the phase timers
// bound a stalled turn and the host can Skip) ──────────────────────────────

test("11. Sketch: the drawer resumes mid-drawing as the drawer, word and strokes intact", async () => {
  const host = await connect("host");
  const guest = await connect("guest");
  await setupGameRoom([host, guest], "sketch");
  const start = await host.waitForMatch("state", (m) => m.state.status === "drawing");
  const drawer = start.state.drawerId === host.id ? host : guest;
  const guesser = drawer === host ? guest : host;
  const word = (await drawer.waitForMatch("state", (m) => typeof m.state.word === "string")).state.word;

  drawer.send({ type: "gameAction", action: { kind: "draw", points: [{ x: 1, y: 1 }, { x: 5, y: 5 }], color: "#2a2a2a" } });
  await guesser.waitFor("sketch_stroke");
  drop(drawer);
  await sleep(100);
  const back = await resumeAs(drawer);
  await resumed(back);

  // A resume has to rebuild the canvas, so that state carries the strokes.
  const mine = await back.waitForMatch("state", (m) => m.state.status === "drawing" && m.state.strokes !== undefined);
  assert.equal(mine.state.drawerId, drawer.id);
  assert.equal(mine.state.word, word, "the drawer lost the secret word");
  assert.equal(mine.state.strokes.length, 1);
  assert.deepEqual(mine.state.strokes[0].points, [{ x: 1, y: 1 }, { x: 5, y: 5 }]);
  forget(guesser);
  back.send({ type: "gameAction", action: { kind: "draw", points: [{ x: 5, y: 5 }, { x: 9, y: 9 }], color: "#2a2a2a" } });
  const theirs = await guesser.waitFor("sketch_stroke");
  assert.deepEqual(theirs.stroke.points, [{ x: 5, y: 5 }, { x: 9, y: 9 }]);
  const guesserState = await guesser.waitForMatch("state", (m) => m.state.status === "drawing");
  assert.equal(guesserState.state.word, undefined, "a guesser can see the secret word");
});

test("12. Sketch: a drawer who never returns keeps the turn through grace, then the round reveals", async () => {
  const host = await connect("host");
  const guest = await connect("guest");
  await setupGameRoom([host, guest], "sketch");
  const start = await host.waitForMatch("state", (m) => m.state.status === "drawing");
  const drawer = start.state.drawerId === host.id ? host : guest;
  const guesser = drawer === host ? guest : host;
  const statuses = [];
  guesser.ws.on("message", (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.type === "state") statuses.push(m.state.status);
  });

  drop(drawer);
  await sleep(GRACE_MS / 2);
  assert.ok(!statuses.includes("reveal"), "the drawer's turn ended before the grace period did");
  // Far inside the 45s draw timer: only the existing reconciliation reveals.
  await guesser.waitForMatch("state", (m) => m.state.status === "reveal", 3000);
});

test("13. Trivia: an away player still counts for 'everyone answered'; scores survive a resume", async () => {
  const players = [await connect("a"), await connect("b"), await connect("c"), await connect("d")];
  await setupGameRoom(players, "trivia");
  const [a, b, c, d] = players;
  await a.waitForMatch("state", (m) => m.state.status === "question");
  const statuses = [];
  a.ws.on("message", (raw) => {
    const m = JSON.parse(raw.toString());
    if (m.type === "state") statuses.push(m.state.status);
  });

  // d drops before answering: while in grace their seat still counts, so the
  // question waits instead of revealing on the three answers it has.
  a.send({ type: "gameAction", action: { kind: "answer", index: 0 } });
  b.send({ type: "gameAction", action: { kind: "answer", index: 1 } });
  c.send({ type: "gameAction", action: { kind: "answer", index: 2 } });
  await a.waitForMatch("state", (m) => m.state.answerCount === 3);
  drop(d);
  await sleep(GRACE_MS / 2);
  assert.ok(!statuses.includes("reveal"), "revealed without the away player");

  // d comes back and answers; the four answers cover every option, so exactly
  // one player scores.
  const dBack = await resumeAs(d);
  await resumed(dBack);
  dBack.send({ type: "gameAction", action: { kind: "answer", index: 3 } });
  const reveal = await a.waitForMatch("state", (m) => m.state.status === "reveal", 3000);
  const scorerId = Object.keys(reveal.state.answers).find((id) => reveal.state.answers[id] === reveal.state.correctIndex);
  const points = reveal.state.scores[scorerId];
  assert.ok(points > 0);

  const clients = { [a.id]: a, [b.id]: b, [c.id]: c, [d.id]: dBack };
  const scorer = clients[scorerId];
  drop(scorer);
  await sleep(100);
  const back = await resumeAs(scorer);
  await resumed(back);
  const after = await back.waitFor("state");
  assert.equal(after.state.scores[scorerId], points);
});

test("14. Snake: an away player's snake keeps its last heading through grace, then dies", async () => {
  const host = await connect("host");
  const guest = await connect("guest");
  await setupGameRoom([host, guest], "snake");
  const snakeOf = (m) => m.state.snakes.find((s) => s.id === guest.id);
  const before = snakeOf(await host.waitForMatch("state", (m) => m.state.status === "running"));

  forget(host);
  drop(guest);
  await sleep(250); // about two ticks
  const during = snakeOf(await host.waitForMatch("state", (m) => m.state.status === "running"));
  assert.equal(during.alive, true, "the snake died as soon as its player dropped");
  assert.notDeepEqual(during.body[0], before.body[0], "the snake stopped moving");

  const dead = await host.waitForMatch("state", (m) => snakeOf(m)?.alive === false, 3000);
  assert.equal(snakeOf(dead).alive, false);
});

test("15. Game vote: an away player's vote still counts, and they resume into the chosen game", async () => {
  const host = await connect("host");
  const guest = await connect("guest");
  const { code } = await hostAndJoin(host, guest);
  host.send({ type: "start" });
  for (const c of [host, guest]) await c.waitForMatch("room", (m) => m.room.status === "voting");

  guest.send({ type: "vote", game: "hottake" });
  await host.waitForMatch("vote_state", (m) => m.voting.totalVotes === 1);
  drop(guest);
  await host.waitForMatch("room", (m) => away(m.room, guest.id));
  host.send({ type: "vote", game: "hottake" });
  await host.waitForMatch("room", (m) => m.room.code === code && m.room.status === "playing");

  const back = await resumeAs(guest);
  await resumed(back);
  const room = (await back.waitFor("room")).room;
  assert.equal(room.currentGame, "hottake");
  await back.waitForMatch("state", (m) => m.state.status === "voting");
  // They're in the game's frozen roster: their vote is what completes the phase.
  host.send({ type: "gameAction", action: { kind: "hotTakeVote", vote: "disagree" } });
  back.send({ type: "gameAction", action: { kind: "hotTakeVote", vote: "agree" } });
  await host.waitForMatch("state", (m) => m.state.status === "reveal", 3000);
});

// ── invariants that no happy-path assertion covers ────────────────────────

test("16. a resumed seat outlives the deadline its drop had set", async () => {
  // graceTimers counts every room, so start from a quiet server.
  await until(async () => (await health()).rooms === 0, 6000, "earlier rooms to expire");
  const host = await connect("host");
  const guest = await connect("guest");
  await hostAndJoin(host, guest);

  drop(guest);
  await host.waitForMatch("room", (m) => away(m.room, guest.id));
  const back = await resumeAs(guest);
  await resumed(back);
  await back.waitFor("room");

  // The timer the drop armed must have been cancelled, not just outrun: wait
  // past when it would have fired and check the seat is still there.
  const state = await internals();
  assert.equal(state.graceTimers, 0, "the resumed seat still has a grace timer armed");
  await sleep(GRACE_MS + 400);
  assert.equal((await health()).players, 2, "the resumed player was dropped by the old timer");
  const left = logEvents().filter((e) => e.message === "player_left" && e.player === guest.id);
  assert.deepEqual(left, [], "the resumed player was released anyway");

  // ...and it is still a live seat, not just a row in the room list.
  host.send({ type: "start" });
  await back.waitForMatch("room", (m) => m.room.status === "voting", 3000);
  host.send({ type: "vote", game: "hottake" });
  back.send({ type: "vote", game: "hottake" });
  await back.waitForMatch("room", (m) => m.room.status === "playing", 3000);
  host.close(); back.close();
});

test("17. nothing a seat lived in is left behind once the room is gone", async () => {
  await until(async () => (await health()).rooms === 0, 6000, "earlier rooms to expire");
  const base = await internals();

  const host = await connect("host");
  const guest = await connect("guest");
  // Hot Take's loop cycles rounds forever with nobody in the room; Snake's
  // stops itself once every snake is dead, so it could never show an orphan.
  await setupGameRoom([host, guest], "hottake");

  const playing = await internals();
  assert.equal(playing.rooms, 1);
  assert.equal(playing.sessions, 2);
  assert.equal(playing.loops, 1, "the game loop is not running");

  drop(host);
  drop(guest);
  await until(async () => (await internals()).rooms === 0, GRACE_MS + 3000, "the room to close");
  await sleep(200);

  const after = await internals();
  assert.equal(after.sessions, 0, "resume tokens outlived their seats");
  assert.equal(after.socketToPlayer, 0, "resumed-socket mappings outlived their sockets");
  assert.equal(after.rateLimits, 0, "rate-limit entries outlived their sockets");
  assert.equal(after.graceTimers, 0);
  assert.equal(after.loops, 0, "a closed room's game loop is still running");
  assert.ok(after.timers <= base.timers, `timers leaked: ${base.timers} -> ${after.timers}`);
});

test("18. a client cannot flood the log by resuming in a loop", async () => {
  const host = await connect("host");
  host.send({ type: "host", name: "host" });
  await host.waitFor("room");
  const before = logEvents().filter((e) => e.message === "resume_ok").length;

  let token = host.token;
  let current = host;
  for (let i = 0; i < 200; i++) {
    const next = await open("loop");
    await next.waitFor("welcome");
    next.send({ type: "resume", token });
    await next.waitForMatch("welcome", (m) => m.resumed, 3000);
    current.ws.terminate();
    current = next;
  }
  const written = logEvents().filter((e) => e.message === "resume_ok").length - before;
  assert.ok(written < 200, `every resume was logged (${written} lines)`);
  assert.ok(written <= 120, `resume_ok is not capped per minute (${written} lines)`);
  current.close();
});
