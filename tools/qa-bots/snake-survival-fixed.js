// Snake survival test — CORRECTED for the uppercase direction contract.
//
// setSnakeDirection() validates dir against DIRECTION_KEYS (["UP","DOWN",
// "LEFT","RIGHT"]) and handleInput does not normalise case, so lowercase input
// is silently discarded. Earlier runs sent lowercase, which means they measured
// snakes that never turned: 8 snakes spawn in four head-on pairs and wipe each
// other out around tick 13. This version steers properly and verifies the
// mechanics that only a surviving snake can exercise: growth, scoring, food
// respawn, and tick health with long snakes.
import { Session, sleep } from "./harness.js";

const log = (m) => console.log(m);
const DIRS = { UP: [0, -1], DOWN: [0, 1], LEFT: [-1, 0], RIGHT: [1, 0] };
const OPP = { UP: "DOWN", DOWN: "UP", LEFT: "RIGHT", RIGHT: "LEFT" };

// Proof that the case contract is what it looks like: same game, lowercase vs
// uppercase, compare how long the round survives.
async function caseProbe(dirCase) {
  const s = new Session("snake", { players: 8, log: () => {} });
  const t0 = Date.now();
  try {
    await s.open(Array.from({ length: 8 }, (_, i) => `${dirCase}${i + 1}`));
    await s.startGame("snake");
    const cast = (d) => (dirCase === "lc" ? d.toLowerCase() : d);
    // Steer everyone hard away from the centre line they spawn facing.
    const turn = ["UP", "DOWN", "UP", "DOWN", "LEFT", "RIGHT", "UP", "DOWN"];
    for (let i = 0; i < 20; i++) {
      for (let b = 0; b < s.bots.length; b++) await s.bots[b].input(cast(turn[b]));
      await sleep(200);
      if (s.host.state?.status === "gameover") break;
    }
    const alive = (s.host.state?.snakes || []).filter((x) => x.alive).length;
    return { case: dirCase, ms: Date.now() - t0, status: s.host.state?.status, alive,
             ticks: s.host.stateCount };
  } finally { s.finish(); }
}

// --- survival run with real steering ---------------------------------------
function chooseDir(state, me) {
  const { rows, cols, food } = state;
  const blocked = new Set();
  for (const sn of state.snakes) for (const [x, y] of sn.body) blocked.add(`${x},${y}`);
  const [hx, hy] = me.body[0];
  const [nx, ny] = me.body[1] || [hx, hy];
  // Current heading, inferred from the first two segments.
  const cur = Object.keys(DIRS).find((d) => DIRS[d][0] === hx - nx && DIRS[d][1] === hy - ny) || "RIGHT";
  const fx = food ? food[0] : hx, fy = food ? food[1] : hy;

  const options = Object.keys(DIRS)
    .filter((d) => d !== OPP[cur])
    .map((d) => {
      const x = hx + DIRS[d][0], y = hy + DIRS[d][1];
      const oob = x < 0 || y < 0 || x >= cols || y >= rows;
      const hit = blocked.has(`${x},${y}`);
      // Count free neighbours of the target cell: avoids walking into pockets.
      let room = 0;
      for (const [dx, dy] of Object.values(DIRS)) {
        const ax = x + dx, ay = y + dy;
        if (ax >= 0 && ay >= 0 && ax < cols && ay < rows && !blocked.has(`${ax},${ay}`)) room++;
      }
      return { d, fatal: oob || hit, room, dist: Math.abs(x - fx) + Math.abs(y - fy) };
    })
    .filter((o) => !o.fatal)
    .sort((a, b) => (b.room - a.room) || (a.dist - b.dist));

  return { dir: options[0]?.d || cur, cur, safeCount: options.length };
}

async function survival(seconds = 45) {
  console.log(`\n=== survival run, 8 players, ${seconds}s, UPPERCASE input ===`);
  const s = new Session("snake", { players: 8, log });
  const gaps = [];
  const growth = [];      // {t, id, len, score}
  let foodRespawns = 0, lastFood = null, integrityFails = 0, foodInSnake = 0;
  try {
    await s.open(Array.from({ length: 8 }, (_, i) => `svP${i + 1}`));
    await s.startGame("snake");
    s.startStallWatch({ maxGapMs: 5000 });

    const lastSent = new Map();
    let lastT = Date.now(), lastCount = s.host.stateCount;
    const until = Date.now() + seconds * 1000;

    while (Date.now() < until && s.host.state?.status === "running") {
      const st = s.host.state;

      // tick gap sampling
      const dc = s.host.stateCount - lastCount;
      if (dc > 0) { gaps.push((Date.now() - lastT) / dc); lastCount = s.host.stateCount; lastT = Date.now(); }

      // food respawn tracking + "never inside a snake" invariant
      if (st.food) {
        const key = st.food.join(",");
        if (lastFood !== null && key !== lastFood) foodRespawns++;
        lastFood = key;
        const occupied = new Set();
        for (const sn of st.snakes) for (const [x, y] of sn.body) occupied.add(`${x},${y}`);
        if (occupied.has(key)) {
          foodInSnake++;
          s.anomaly("food_spawned_inside_snake", { food: st.food });
        }
      }

      for (const sn of st.snakes) {
        // body integrity: consecutive segments always Manhattan-distance 1
        for (let i = 1; i < sn.body.length; i++) {
          const [ax, ay] = sn.body[i - 1], [bx, by] = sn.body[i];
          if (Math.abs(ax - bx) + Math.abs(ay - by) !== 1) {
            integrityFails++;
            s.anomaly("body_segments_not_adjacent", { id: sn.id, i, a: [ax, ay], b: [bx, by] });
          }
        }
        growth.push({ t: Date.now(), id: sn.id, len: sn.body.length, score: sn.score, alive: sn.alive });
      }

      // steer each living bot; only send when the direction actually changes
      for (const bot of s.bots) {
        const me = st.snakes.find((x) => x.id === bot.id);
        if (!me || !me.alive) continue;
        const { dir } = chooseDir(st, me);
        if (lastSent.get(bot.id) !== dir) { await bot.input(dir); lastSent.set(bot.id, dir); }
      }
      await sleep(130);
    }

    const final = s.host.state;
    const aliveNow = (final?.snakes || []).filter((x) => x.alive);
    const maxLen = Math.max(...growth.map((g) => g.len));
    const maxScore = Math.max(...growth.map((g) => g.score));
    const sorted = [...gaps].sort((a, b) => a - b);
    const pct = (p) => sorted.length ? Math.round(sorted[Math.floor(sorted.length * p)]) : null;

    // winner correctness: if exactly one survivor, winnerId must be them
    let winnerVerdict = "n/a (game still running or multiple alive)";
    if (final?.status === "gameover") {
      if (aliveNow.length === 1) {
        winnerVerdict = final.winnerId === aliveNow[0].id
          ? `OK — winnerId is the sole survivor (${aliveNow[0].name})`
          : `BUG — sole survivor ${aliveNow[0].id} but winnerId=${final.winnerId}`;
        if (final.winnerId !== aliveNow[0].id) {
          s.anomaly("winner_not_sole_survivor", { winnerId: final.winnerId, survivor: aliveNow[0].id });
        }
      } else if (aliveNow.length === 0) {
        winnerVerdict = `all died simultaneously; winnerId=${final.winnerId}`;
      }
    }

    const result = {
      durationS: seconds,
      finalStatus: final?.status,
      aliveAtEnd: aliveNow.length,
      stateTicks: s.host.stateCount,
      tickGapMs: { p50: pct(0.5), p95: pct(0.95), p99: pct(0.99), max: sorted.length ? Math.round(sorted.at(-1)) : null },
      maxBodyLength: maxLen,
      maxScore,
      growthObserved: maxLen > 3,
      scoringObserved: maxScore > 0,
      foodRespawns,
      foodSpawnedInsideSnake: foodInSnake,
      bodyIntegrityFailures: integrityFails,
      winnerVerdict,
      roundWins: s.host.room?.roundWins,
      anomalies: s.anomalies,
    };
    console.log(JSON.stringify(result, null, 2));
    return result;
  } finally { s.finish(); }
}

console.log("=== case-contract probe (lowercase vs uppercase input) ===");
const lc = await caseProbe("lc");
console.log(`  lowercase: survived ${lc.ms}ms, ${lc.ticks} ticks, status=${lc.status}, alive=${lc.alive}`);
const uc = await caseProbe("uc");
console.log(`  UPPERCASE: survived ${uc.ms}ms, ${uc.ticks} ticks, status=${uc.status}, alive=${uc.alive}`);
console.log(`  => ${uc.ms > lc.ms * 1.5
  ? "CONFIRMED: lowercase input is silently discarded (identical steering, very different survival)"
  : "inconclusive — rerun"}`);

const sv = await survival(45);
console.log("\n=== SNAKE SURVIVAL (corrected) ===");
console.log(JSON.stringify({ caseProbe: { lowercase: lc, uppercase: uc }, survival: sv }, null, 2));
process.exit(0);
