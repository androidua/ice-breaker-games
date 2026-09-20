// Room-layer QA — the code every game shares and no per-game agent tests.
// Targets index.js: host migration, resume grace, capacity, join rules,
// voting resolution, leaderboard tiers. Run against a local dev server (npm run server).
import { Bot, Session, sleep } from "./harness.js";

const QA_PORT = process.env.QA_PORT || "3000";
const URL = process.env.QA_URL || `ws://127.0.0.1:${QA_PORT}`;
const ORIGIN = process.env.QA_ORIGIN || `http://localhost:${QA_PORT}`;
const HEALTH_URL = `http://127.0.0.1:${QA_PORT}/health`;
const findings = [];
const ok = [];

const mk = (name, session) => new Bot(name, { url: URL, origin: ORIGIN, session });
const finding = (id, severity, summary, evidence) => {
  findings.push({ id, severity, summary, evidence });
  console.log(`  !! ${severity.toUpperCase()} ${id}: ${summary}`);
};
const pass = (id, detail) => { ok.push({ id, detail }); console.log(`  ok ${id}: ${detail}`); };

// A bare session object just to satisfy Bot's anomaly hook.
const sink = { anomaly: (k, d) => console.log(`  (bot anomaly ${k}: ${JSON.stringify(d).slice(0, 200)})`) };

async function openRoom(n, prefix) {
  const bots = [];
  for (let i = 0; i < n; i++) {
    const b = mk(`${prefix}${i + 1}`, sink);
    await b.connect();
    bots.push(b);
  }
  await bots[0].send({ type: "host", name: bots[0].name });
  await bots[0].waitFor((b) => !!b.room?.code, { label: "room code" });
  const code = bots[0].room.code;
  for (const b of bots.slice(1)) {
    await b.send({ type: "join", code, name: b.name });
    await b.waitFor((x) => !!x.room?.code, { label: `${b.name} joined` });
  }
  for (const b of bots) {
    await b.waitFor((x) => x.room?.players?.length === n, { label: `${b.name} full roster` });
  }
  return { bots, code };
}

// ---------------------------------------------------------------- 1. capacity
async function testCapacity() {
  console.log("\n[1] room capacity (max 8)");
  const { bots, code } = await openRoom(8, "cap");
  const ninth = mk("cap9", sink);
  await ninth.connect();
  await ninth.send({ type: "join", code, name: "cap9" });
  await sleep(800);
  if (ninth.room?.code === code) {
    finding("CAP-1", "major", "9th player admitted to a room capped at 8",
      { roster: ninth.room.players.length, code });
  } else if (ninth.errors.length) {
    pass("CAP-1", `9th player refused: "${ninth.errors[0].message}"`);
  } else {
    finding("CAP-2", "minor", "9th player silently ignored — no room, no error message",
      { errors: ninth.errors, room: ninth.room });
  }
  // Roster must still be exactly 8 for everyone.
  await sleep(300);
  const sizes = bots.map((b) => b.room?.players?.length);
  if (sizes.some((s) => s !== 8)) {
    finding("CAP-3", "major", "roster size diverged after a refused join", { sizes });
  } else pass("CAP-3", "all 8 players still see exactly 8");
  [...bots, ninth].forEach((b) => b.close());
}

// ------------------------------------------------------------- 2. join rules
async function testJoinRules() {
  console.log("\n[2] join rules");
  const bad = mk("badjoin", sink);
  await bad.connect();
  await bad.send({ type: "join", code: "ZZZZ", name: "badjoin" });
  await sleep(600);
  if (bad.room) finding("JOIN-1", "major", "join succeeded with a nonexistent room code", { room: bad.room });
  else pass("JOIN-1", `bad code refused: "${bad.errors[0]?.message ?? "(no message)"}"`);

  // Host twice on one socket — index.js enforces one room per socket.
  const dbl = mk("dbl", sink);
  await dbl.connect();
  await dbl.send({ type: "host", name: "dbl" });
  await dbl.waitFor((b) => !!b.room?.code, { label: "first room" });
  const first = dbl.room.code;
  const before = dbl.errors.length;
  await dbl.send({ type: "host", name: "dbl" });
  await sleep(600);
  if (dbl.room.code !== first) {
    finding("JOIN-2", "major", "one socket hosted a second room, abandoning the first",
      { first, second: dbl.room.code });
  } else pass("JOIN-2", `second host refused, still in ${first}` +
    (dbl.errors.length > before ? ` ("${dbl.errors.at(-1).message}")` : ""));

  // Name clamping to 16 chars.
  const longName = "X".repeat(64);
  const ln = mk("longname", sink);
  await ln.connect();
  await ln.send({ type: "join", code: first, name: longName });
  await ln.waitFor((b) => !!b.room?.code, { label: "long-name join" }).catch(() => {});
  await sleep(400);
  const seated = dbl.room.players.find((p) => p.name.startsWith("X"));
  if (!seated) finding("JOIN-3", "minor", "long-named player did not appear in roster", {});
  else if (seated.name.length > 16) {
    finding("JOIN-3", "major", `name not clamped: ${seated.name.length} chars survived`, { name: seated.name });
  } else pass("JOIN-3", `name clamped to ${seated.name.length} chars`);

  // Mid-game join must be rejected (every engine freezes its roster at start).
  await dbl.send({ type: "start" });
  await dbl.waitFor((b) => b.room?.status === "voting", { label: "voting" });
  await dbl.vote("hottake"); await ln.vote("hottake");
  await dbl.waitFor((b) => b.room?.status === "playing", { label: "playing", timeout: 40000 });
  const late = mk("latejoin", sink);
  await late.connect();
  await late.send({ type: "join", code: first, name: "latejoin" });
  await sleep(800);
  if (late.room?.code === first) {
    finding("JOIN-4", "critical", "player joined a room that is mid-game (engines freeze rosters at start)",
      { code: first, roster: late.room.players.length });
  } else pass("JOIN-4", `mid-game join refused: "${late.errors[0]?.message ?? "(silent)"}"`);
  [bad, dbl, ln, late].forEach((b) => b.close());
}

// ------------------------------------------- 3. host migration + resume grace
async function testHostMigrationAndResume() {
  console.log("\n[3] host migration and resume");
  const { bots, code } = await openRoom(4, "host");
  const [h, g1] = bots;
  const hostToken = h.resumeToken;
  const hostId = h.id;
  if (bots[0].room.hostId !== hostId) {
    finding("HOST-0", "major", "hostId is not the player who hosted", { hostId: bots[0].room.hostId, expected: hostId });
  }

  // Host drops: the star must move to a connected player AT ONCE (v1.22.0),
  // not after the 45s grace — lobby Start has no timer to bound it.
  const t0 = Date.now();
  h.ws.close();
  let moved = null;
  try {
    await g1.waitFor((b) => b.room && b.room.hostId !== hostId, { label: "host star moves", timeout: 10000 });
    moved = Date.now() - t0;
    pass("HOST-1", `host star moved in ${moved}ms to ${g1.room.hostId}`);
  } catch {
    finding("HOST-1", "critical",
      "host star did NOT move within 10s of the host dropping — lobby Start is unreachable until the grace expires",
      { hostId, roomStatus: g1.room?.status });
  }
  // The away host must still hold a seat (grace), marked disconnected.
  const awaySeat = g1.room?.players?.find((p) => p.id === hostId);
  if (!awaySeat) {
    finding("HOST-2", "major", "away host's seat vanished immediately instead of being held for the grace", {});
  } else if (awaySeat.connected !== false) {
    finding("HOST-2", "minor", "away host not marked connected:false in the room payload", { seat: awaySeat });
  } else pass("HOST-2", "away host seat held and marked connected:false");

  // The new host must actually be able to act.
  const newHost = bots.find((b) => b.id === g1.room.hostId);
  if (newHost) {
    await newHost.send({ type: "start" });
    try {
      await newHost.waitFor((b) => b.room?.status === "voting", { label: "new host can start", timeout: 8000 });
      pass("HOST-3", "the promoted host can actually start the room");
    } catch {
      finding("HOST-3", "critical", "promoted host holds the star but cannot start the room",
        { hostId: g1.room.hostId, status: newHost.room?.status });
    }
  }

  // Original host resumes inside the grace: seat, id and host role come back.
  const back = mk("hostback", sink);
  await back.connect();
  await back.send({ type: "resume", token: hostToken });
  try {
    await back.waitFor((b, m) => m?.type === "welcome" && m.resumed === true,
      { label: "resume welcome", timeout: 8000 });
    if (back.id !== hostId) {
      finding("RES-1", "major", "resume returned a different player id", { got: back.id, expected: hostId });
    } else pass("RES-1", "resume restored the original player id");
    await sleep(600);
    if (back.room?.hostId === hostId) pass("RES-2", "host role returned to the original host (hostReturnsTo)");
    else finding("RES-2", "minor",
      "host role did not return to the original host after resuming inside the grace",
      { hostId: back.room?.hostId, expected: hostId });
  } catch (e) {
    finding("RES-1", "critical", `resume with a valid token inside the grace failed: ${e.message}`, {});
  }

  // A bogus token must be refused, not honoured.
  const fake = mk("faketoken", sink);
  await fake.connect();
  await fake.send({ type: "resume", token: "not-a-real-token-000" });
  await sleep(700);
  const gotFail = fake.transcript.some((e) => e.dir === "in" && e.msg.type === "resume_failed");
  if (fake.room) finding("RES-3", "critical", "a bogus resume token was accepted into a room", { room: fake.room });
  else if (gotFail) pass("RES-3", "bogus resume token rejected with resume_failed");
  else finding("RES-3", "minor", "bogus resume token silently ignored (no resume_failed)", {});

  [...bots, back, fake].forEach((b) => b.close());
  return { code };
}

// --------------------------------------------------- 4. voting + leaderboard
async function testVotingAndLeaderboard() {
  console.log("\n[4] voting and leaderboard tiers");
  const { bots } = await openRoom(4, "vote");
  const [h] = bots;
  await h.send({ type: "start" });
  await h.waitFor((b) => b.room?.status === "voting", { label: "voting" });

  // A non-host must not be able to start/skip/end.
  const guest = bots[1];
  await guest.send({ type: "endGame" });
  await guest.send({ type: "skipPhase" });
  await sleep(500);
  if (h.room?.status !== "voting") {
    finding("AUTH-1", "critical", "a non-host changed room status with endGame/skipPhase",
      { status: h.room?.status });
  } else pass("AUTH-1", "non-host endGame/skipPhase ignored during voting");

  // Split vote: 2 for hottake, 2 for snake -> resolveVoting picks a tied winner
  // at random, but it must pick one of the two and must start it.
  await bots[0].vote("hottake"); await bots[1].vote("hottake");
  await bots[2].vote("snake");   await bots[3].vote("snake");
  await h.waitFor((b) => b.room?.status === "playing", { label: "tie resolved", timeout: 40000 });
  const chosen = h.room.currentGame;
  if (!["hottake", "snake"].includes(chosen)) {
    finding("VOTE-1", "major", "a tied vote resolved to a game nobody voted for", { chosen });
  } else pass("VOTE-1", `2-2 tie resolved to "${chosen}" (one of the tied games)`);

  // Leaderboard: play hottake rounds, then End Game and check the two tiers.
  if (chosen === "hottake") {
    for (let r = 0; r < 3; r++) {
      await h.waitFor((b) => b.state?.status === "voting", { label: "hottake voting", timeout: 25000 });
      // Force a known majority: first 3 agree, last disagrees.
      for (let i = 0; i < bots.length; i++) {
        await bots[i].act({ kind: "hotTakeVote", vote: i < 3 ? "agree" : "disagree" });
      }
      await h.waitFor((b) => b.state?.status === "reveal", { label: "hottake reveal", timeout: 25000 });
      await sleep(400);
    }
    const roundWins = h.room?.roundWins || {};
    const total = Object.values(roundWins).reduce((a, b) => a + b, 0);
    if (total === 0) {
      finding("LB-1", "major", "3 decided rounds produced zero roundWins", { roundWins });
    } else pass("LB-1", `roundWins recorded: ${JSON.stringify(roundWins)}`);

    const leader = Object.entries(roundWins).sort((a, b) => b[1] - a[1])[0]?.[0];
    await h.send({ type: "endGame" });
    await h.waitFor((b) => b.room?.status === "voting", { label: "back to voting", timeout: 15000 });
    await sleep(400);
    const gameWins = h.room?.gameWins || {};
    if (leader && !gameWins[leader]) {
      finding("LB-2", "major", "End Game did not award a game win to the round-win leader",
        { leader, roundWins, gameWins });
    } else pass("LB-2", `gameWins awarded to leader: ${JSON.stringify(gameWins)}`);
    if (Object.keys(h.room?.roundWins || {}).length !== 0) {
      finding("LB-3", "minor", "roundWins not reset after End Game", { roundWins: h.room.roundWins });
    } else pass("LB-3", "roundWins reset after End Game");
  } else {
    console.log("  (tie resolved to snake — leaderboard tiers checked in the hottake agent's run)");
  }
  bots.forEach((b) => b.close());
}

// ------------------------------------------------------- 5. protocol abuse
async function testProtocolAbuse() {
  console.log("\n[5] protocol abuse (must never kill the server)");
  const b = mk("abuse", sink);
  await b.connect();
  const junk = [
    { type: "join" },                                   // missing fields
    { type: "join", code: 12345, name: {} },            // wrong types
    { type: "host", name: null },
    { type: "vote", game: "not_a_game" },
    { type: "vote", game: { evil: true } },
    { type: "gameAction" },                             // no action
    { type: "gameAction", action: null },
    { type: "gameAction", action: "string-not-object" },
    { type: "input", dir: "sideways" },
    { type: "input", dir: { x: 1 } },
    { type: "nonexistent_type" },
    { type: "resume" },                                 // no token
    { type: "resume", token: { not: "a string" } },
  ];
  for (const m of junk) { await b.send(m); await sleep(60); }
  // Non-JSON and a non-object JSON payload, straight down the wire.
  b.ws.send("this is not json at all");
  b.ws.send("[1,2,3]");
  b.ws.send("42");
  await sleep(800);

  const alive = await fetch(HEALTH_URL).then((r) => r.json()).catch(() => null);
  if (!alive?.ok) {
    finding("ABUSE-1", "critical", "server stopped answering /health after malformed messages", { alive });
  } else pass("ABUSE-1", `server healthy after ${junk.length + 3} malformed messages (rooms=${alive.rooms})`);
  if (b.closed && b.closed.code !== 1000) {
    pass("ABUSE-2", `abusive socket was closed with code ${b.closed.code} (defensive, acceptable)`);
  } else pass("ABUSE-2", "abusive socket survived; server ignored the junk");
  b.close();
}

console.log("=== ROOM-LAYER QA ===");
for (const [name, fn] of [
  ["capacity", testCapacity],
  ["joinRules", testJoinRules],
  ["hostMigration", testHostMigrationAndResume],
  ["votingLeaderboard", testVotingAndLeaderboard],
  ["protocolAbuse", testProtocolAbuse],
]) {
  try { await fn(); }
  catch (e) { finding(`${name}-EXC`, "info", `harness exception during ${name}: ${e.message}`, { stack: e.stack?.split("\n").slice(0, 4) }); }
}

console.log("\n=== SUMMARY ===");
console.log(JSON.stringify({ findings, passed: ok.length, checks: ok }, null, 2));
process.exit(0);
