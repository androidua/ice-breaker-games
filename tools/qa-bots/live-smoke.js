// Production smoke pass against huddleplayroom.com.
//
// Deliberately small: 3 players, a couple of short games. The point is not to
// find logic bugs (the local fleet does that against identical code) but to
// prove the live path — Cloudflare, WebSocket upgrade, real RTT, the deployed
// bundle — behaves the same as local, and to give us a place to confirm any
// local finding actually reproduces in production.
import { Session, sleep } from "./harness.js";

const URL = process.env.QA_URL || "wss://huddleplayroom.com";
const ORIGIN = "https://huddleplayroom.com";
const log = (m) => console.log(m);

const health = async () => {
  const r = await fetch("https://huddleplayroom.com/health");
  return r.json();
};

const before = await health();
console.log("health before:", JSON.stringify(before));
if (before.rooms > 0) {
  console.log(`!! ${before.rooms} room(s) live with ${before.players} player(s) — real people may be playing.`);
  console.log("!! Aborting: will not add load to an occupied production server.");
  process.exit(2);
}

const results = [];

async function run(game, players, play) {
  const s = new Session(game, { players, url: URL, origin: ORIGIN, log });
  const t0 = Date.now();
  let error = null;
  try {
    await s.open();
    const connectMs = Date.now() - t0;
    await s.startGame(game);
    s.startStallWatch({ maxGapMs: 15000 });
    await play(s);
    await s.endGame();
    s.note(`connect+join took ${connectMs}ms`);
  } catch (e) {
    error = e.message;
    s.anomaly("harness_exception", { message: e.message });
  } finally {
    s.finish();
  }
  results.push({ game, players, error, anomalies: s.anomalies, notes: s.notes,
    roomCode: s.code, durationMs: Date.now() - t0,
    states: Object.fromEntries(s.bots.map((b) => [b.name, b.stateCount])) });
  console.log(`${game}: ${s.anomalies.length} anomalies${error ? `, error: ${error}` : ""}`);
  return s;
}

// Round-trip latency measured with a REAL action: the time from one bot casting
// its vote to that bot seeing the resulting broadcast. No junk traffic to prod.
async function voteRtt(bot, vote) {
  const t = Date.now();
  const seen = bot.waitFor((b, m) => m?.type === "state", { label: "state after vote", timeout: 10000 });
  await bot.act({ kind: "hotTakeVote", vote });
  try { await seen; return Date.now() - t; } catch { return null; }
}

await run("hottake", 3, async (s) => {
  const rtts = [];
  for (let round = 0; round < 3; round++) {
    await s.host.waitForStatus("voting", { timeout: 30000 });
    // First bot's vote is timed; the rest just complete the round.
    const ms = await voteRtt(s.bots[0], Math.random() < 0.5 ? "agree" : "disagree");
    if (ms !== null) rtts.push(ms);
    for (const b of s.guests) await b.act({ kind: "hotTakeVote", vote: Math.random() < 0.5 ? "agree" : "disagree" });
    await s.host.waitForStatus("reveal", { timeout: 25000 });
    s.bots.forEach((b) => s.scanState(b));
    await s.checkConsensus(["status", "timer"]);
    s.trackScores();
  }
  if (rtts.length) s.note(`action->broadcast round-trip ms: ${rtts.join(",")}`);
});

await run("snake", 3, async (s) => {
  const dirs = ["up", "down", "left", "right"];
  const until = Date.now() + 15000;
  const gaps = [];
  let last = Date.now();
  const tick = setInterval(() => { const n = Date.now(); gaps.push(n - last); last = n; }, 0);
  clearInterval(tick);
  let prevCount = s.host.stateCount, prevT = Date.now();
  while (Date.now() < until && s.host.state?.status !== "gameover") {
    for (const b of s.bots) await b.input(dirs[Math.floor(Math.random() * 4)]);
    await sleep(700);
    s.bots.forEach((b) => s.scanState(b));
    const dc = s.host.stateCount - prevCount, dt = Date.now() - prevT;
    if (dc > 0) gaps.push(Math.round(dt / dc));
    prevCount = s.host.stateCount; prevT = Date.now();
  }
  s.note(`snake avg tick gap observed (ms, target 120): ${gaps.join(",")}`);
  s.note(`final status: ${s.host.state?.status}`);
});

const after = await health();
console.log("health after:", JSON.stringify(after));

console.log("\n=== LIVE SMOKE RESULT ===");
console.log(JSON.stringify({ before, after, results }, null, 2));
process.exit(0);
