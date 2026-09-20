// Huddle Play Room — QA bot harness.
//
// Drives the real WebSocket protocol exactly as a browser does. Every message in
// and out is timestamped and kept, so an anomaly comes with a transcript instead
// of a hunch. Nothing here knows about any specific game: per-game strategy lives
// in games/<game>.js and only ever calls Bot.act()/Bot.waitFor().
import WebSocket from "ws";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export const GAMES = [
  "snake", "truths", "emoji", "sketch", "trivia",
  "typeracer", "wordchain", "bomber", "hottake",
];

const QA_PORT = process.env.QA_PORT || "3000";
const DEFAULT_URL = process.env.QA_URL || `ws://127.0.0.1:${QA_PORT}`;
const DEFAULT_ORIGIN = process.env.QA_ORIGIN || `http://localhost:${QA_PORT}`;

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The server rate-limits each socket to 60 msg/sec in a fixed 1s window. Bots
// stay well under it: tripping the limit would be our bug, not the server's.
const MSG_BUDGET_PER_SEC = 25;

let seq = 0;
const now = () => Date.now();

export class Bot {
  constructor(name, opts = {}) {
    this.name = name;
    this.url = opts.url || DEFAULT_URL;
    this.origin = opts.origin || DEFAULT_ORIGIN;
    this.session = opts.session || null;
    this.id = null;
    this.resumeToken = null;
    this.ws = null;
    this.transcript = [];      // {t, dir:'in'|'out', msg}
    this.errors = [];          // server {type:'error'} payloads
    this.state = null;         // latest game state
    this.room = null;          // latest room payload
    this.voting = null;        // latest vote_state
    this.stateCount = 0;
    this.lastStateAt = 0;
    this.closed = null;        // {code, reason} once closed
    this.sketchStrokes = [];
    this._waiters = [];
    this._sentTimes = [];
    this._tag = `bot${++seq}`;
  }

  _record(dir, msg) {
    this.transcript.push({ t: now(), dir, msg });
    // Keep memory bounded on long Snake/Bomber runs; the tail is what matters.
    if (this.transcript.length > 4000) this.transcript.splice(0, 1000);
  }

  connect() {
    return new Promise((resolve, reject) => {
      this.ws = new WebSocket(this.url, { origin: this.origin });
      const to = setTimeout(() => reject(new Error(`${this.name}: connect timeout`)), 15000);

      this.ws.on("open", () => { /* wait for welcome */ });

      this.ws.on("message", (raw) => {
        let msg;
        try { msg = JSON.parse(raw.toString()); }
        catch { this._anomaly("unparseable_server_message", { raw: raw.toString().slice(0, 300) }); return; }
        this._record("in", msg);

        if (msg.type === "welcome") {
          this.id = msg.id;
          this.resumeToken = msg.resumeToken;
          clearTimeout(to);
          resolve(this);
        } else if (msg.type === "state") {
          this.state = msg.state;
          this.stateCount++;
          this.lastStateAt = now();
        } else if (msg.type === "room") {
          this.room = msg.room;
        } else if (msg.type === "vote_state") {
          this.voting = msg;
        } else if (msg.type === "error") {
          this.errors.push({ t: now(), ...msg });
        } else if (msg.type === "sketch_stroke") {
          this.sketchStrokes.push(msg.stroke);
        } else if (msg.type === "sketch_clear") {
          this.sketchStrokes = [];
        }

        this._waiters = this._waiters.filter((w) => {
          try {
            if (w.pred(this, msg)) { w.resolve(msg); return false; }
          } catch (e) { w.reject(e); return false; }
          return true;
        });
      });

      this.ws.on("close", (code, reason) => {
        this.closed = { code, reason: reason?.toString() || "", t: now() };
        this._waiters.forEach((w) => w.reject(new Error(
          `${this.name}: socket closed (code ${code}) while waiting for ${w.label}`)));
        this._waiters = [];
      });

      this.ws.on("error", (err) => { clearTimeout(to); reject(err); });
    });
  }

  _anomaly(kind, detail) {
    this.session?.anomaly(kind, { bot: this.name, ...detail });
  }

  async send(obj) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this._anomaly("send_on_dead_socket", { intended: obj, closed: this.closed });
      return false;
    }
    // Self-throttle so we never trip the server's 60/s limit.
    const cutoff = now() - 1000;
    this._sentTimes = this._sentTimes.filter((t) => t > cutoff);
    if (this._sentTimes.length >= MSG_BUDGET_PER_SEC) {
      await sleep(1000 - (now() - this._sentTimes[0]) + 10);
      this._sentTimes = this._sentTimes.filter((t) => t > now() - 1000);
    }
    this._sentTimes.push(now());
    this._record("out", obj);
    this.ws.send(JSON.stringify(obj));
    return true;
  }

  act(action) { return this.send({ type: "gameAction", action }); }
  vote(game) { return this.send({ type: "vote", game }); }
  input(dir) { return this.send({ type: "input", dir }); }

  // Resolve when pred(bot, msg) is true. Also checked immediately against
  // current state, so a condition already met does not hang.
  waitFor(pred, { timeout = 20000, label = "condition" } = {}) {
    if (pred(this, null)) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
      const w = { pred, label, resolve: null, reject: null };
      const timer = setTimeout(() => {
        this._waiters = this._waiters.filter((x) => x !== w);
        reject(new Error(`${this.name}: timeout after ${timeout}ms waiting for ${label}` +
          ` (status=${this.state?.status ?? "n/a"}, states=${this.stateCount})`));
      }, timeout);
      w.resolve = (m) => { clearTimeout(timer); resolve(m); };
      w.reject = (e) => { clearTimeout(timer); reject(e); };
      this._waiters.push(w);
    });
  }

  waitForStatus(status, opts = {}) {
    const want = Array.isArray(status) ? status : [status];
    return this.waitFor((b) => want.includes(b.state?.status),
      { label: `game status ${want.join("|")}`, ...opts });
  }

  close() { try { this.ws?.close(1000); } catch { /* already gone */ } }
}

export class Session {
  constructor(game, { players = 4, url, origin, log = () => {} } = {}) {
    this.game = game;
    this.playerCount = players;
    this.url = url || DEFAULT_URL;
    this.origin = origin || DEFAULT_ORIGIN;
    this.bots = [];
    this.code = null;
    this.anomalies = [];
    this.notes = [];
    this.startedAt = now();
    this.log = log;
  }

  get host() { return this.bots[0]; }
  get guests() { return this.bots.slice(1); }

  anomaly(kind, detail = {}) {
    const a = { t: now(), sinceStartMs: now() - this.startedAt, kind, ...detail };
    this.anomalies.push(a);
    this.log(`  ANOMALY ${kind}: ${JSON.stringify(detail).slice(0, 400)}`);
    return a;
  }

  note(msg) { this.notes.push({ t: now(), msg }); this.log(`  note: ${msg}`); }

  // Host a room and join everyone else. Returns once every bot sees the full
  // roster, so no test starts against a half-built room.
  async open(names) {
    const list = names || Array.from({ length: this.playerCount },
      (_, i) => `${this.game.slice(0, 4)}P${i + 1}`);
    for (const n of list) {
      const bot = new Bot(n, { url: this.url, origin: this.origin, session: this });
      await bot.connect();
      this.bots.push(bot);
    }
    await this.host.send({ type: "host", name: this.host.name });
    await this.host.waitFor((b) => !!b.room?.code, { label: "room code" });
    this.code = this.host.room.code;
    this.log(`  room ${this.code} (${list.length} players)`);

    for (const bot of this.guests) {
      await bot.send({ type: "join", code: this.code, name: bot.name });
      await bot.waitFor((b) => !!b.room?.code, { label: `${bot.name} joined` });
    }
    const n = this.bots.length;
    for (const bot of this.bots) {
      await bot.waitFor((b) => b.room?.players?.length === n,
        { label: `${bot.name} sees ${n} players` });
    }
    return this;
  }

  // Lobby -> voting -> the chosen game. Every bot votes the same game, so
  // resolveVoting is deterministic and we always land on the game under test.
  async startGame(game = this.game) {
    await this.host.send({ type: "start" });
    for (const bot of this.bots) {
      await bot.waitFor((b) => b.room?.status === "voting" || !!b.voting,
        { label: `${bot.name} in voting` });
    }
    for (const bot of this.bots) await bot.vote(game);
    for (const bot of this.bots) {
      await bot.waitFor((b) => b.room?.status === "playing" && !!b.state,
        { label: `${bot.name} playing ${game}`, timeout: 40000 });
    }
    const actual = this.host.room.currentGame;
    if (actual !== game) {
      this.anomaly("wrong_game_started", { wanted: game, got: actual });
    }
    this.log(`  started ${actual}`);
    return actual;
  }

  async endGame() {
    await this.host.send({ type: "endGame" });
    await this.host.waitFor((b) => b.room?.status === "voting",
      { label: "back to voting", timeout: 20000 });
  }

  // ---- generic invariants, run continuously and at the end ----------------

  // Fields that are legitimately null until the game decides them. A null here
  // is "not yet", not a broken computation. Extend per game via scanState's
  // second argument when a game has its own pending fields.
  static NULLABLE = [
    "winnerId", "roundWinnerId", "roundResult", "currentWord", "invalidReason",
    "revealIn", "result", "lastResult", "correctGuesserId", "eliminatedId",
  ];

  // JSON.stringify turns NaN/Infinity into null, so a null where a number
  // belongs is the on-the-wire signature of a broken computation. Report the
  // path once per (path,status) pair — a 120ms Snake tick would otherwise
  // report the same field 80 times.
  scanState(bot, allowNull = []) {
    const s = bot.state;
    if (!s) return;
    const allowed = [...Session.NULLABLE, ...allowNull];
    const isAllowed = (path) => allowed.some((p) => {
      const leaf = path.split(".").pop().replace(/\[\d+\]$/, "");
      return leaf === p || path === p || path.startsWith(`${p}.`);
    });
    const walk = (node, path) => {
      if (node === null) return isAllowed(path) ? [] : [path];
      if (typeof node === "number" && !Number.isFinite(node)) return [path];
      if (Array.isArray(node)) return node.flatMap((v, i) => walk(v, `${path}[${i}]`));
      if (typeof node === "object") {
        return Object.entries(node).flatMap(([k, v]) => walk(v, path ? `${path}.${k}` : k));
      }
      return [];
    };
    this._seenNulls = this._seenNulls || new Set();
    const fresh = walk(s, "").filter((p) => {
      const key = `${p}@${s.status}`;
      if (this._seenNulls.has(key)) return false;
      this._seenNulls.add(key);
      return true;
    });
    if (fresh.length) {
      this.anomaly("null_or_nan_in_state", { bot: bot.name, paths: fresh.slice(0, 12), status: s.status });
    }
  }

  // Let every socket drain the broadcast that is already in flight. Without
  // this, a consistency check run straight after the host's waiter fires
  // compares the host's new state against the guests' not-yet-processed old
  // one and reports a divergence that does not exist.
  async settle(ms = 250) { await sleep(ms); }

  checkTimer(bot) {
    const t = bot.state?.timer;
    if (t === undefined || t === null) return;
    if (typeof t !== "number" || !Number.isFinite(t)) {
      this.anomaly("timer_not_finite", { bot: bot.name, timer: t, status: bot.state.status });
    } else if (t < 0) {
      this.anomaly("negative_timer", { bot: bot.name, timer: t, status: bot.state.status });
    }
  }

  // Everyone in the same room must agree on the phase. Games that serialize
  // per-player (emoji, sketch) still share `status` and `timer`.
  // ALWAYS `await` this: it settles first, so in-flight broadcasts are not
  // mistaken for real divergence.
  async checkConsensus(fields = ["status"]) {
    await this.settle();
    const ref = this.bots.find((b) => b.state);
    if (!ref) return;
    for (const bot of this.bots) {
      if (!bot.state || bot === ref) continue;
      for (const f of fields) {
        if (JSON.stringify(bot.state[f]) !== JSON.stringify(ref.state[f])) {
          this.anomaly("state_divergence", {
            field: f, [ref.name]: ref.state[f], [bot.name]: bot.state[f],
          });
        }
      }
    }
  }

  checkSockets() {
    for (const bot of this.bots) {
      // 4000 = seat resumed on a newer socket (expected in resume tests only).
      if (bot.closed && ![1000, 1001].includes(bot.closed.code)) {
        this.anomaly("unexpected_socket_close", {
          bot: bot.name, code: bot.closed.code, reason: bot.closed.reason,
        });
      }
    }
  }

  checkErrors(expected = []) {
    for (const bot of this.bots) {
      for (const e of bot.errors) {
        if (!expected.some((x) => (e.message || "").includes(x))) {
          this.anomaly("server_error_message", { bot: bot.name, error: e });
        }
      }
    }
  }

  // Scores must never run backwards inside one game.
  trackScores(label = "scores") {
    this._prevScores = this._prevScores || {};
    for (const bot of this.bots) {
      const sc = bot.state?.scores;
      if (!sc || typeof sc !== "object") continue;
      const prev = this._prevScores[bot.name] || {};
      for (const [pid, v] of Object.entries(sc)) {
        if (typeof prev[pid] === "number" && typeof v === "number" && v < prev[pid]) {
          this.anomaly("score_decreased", { bot: bot.name, player: pid, from: prev[pid], to: v, label });
        }
      }
      this._prevScores[bot.name] = { ...sc };
    }
  }

  // Watchdog: a phase that should be ticking but sends no state is a stall.
  startStallWatch({ maxGapMs = 12000, statuses = null } = {}) {
    this._stall = setInterval(() => {
      for (const bot of this.bots) {
        if (!bot.state || bot.closed) continue;
        if (statuses && !statuses.includes(bot.state.status)) continue;
        const gap = now() - bot.lastStateAt;
        if (gap > maxGapMs) {
          this.anomaly("state_stall", {
            bot: bot.name, gapMs: gap, status: bot.state.status,
          });
          bot.lastStateAt = now(); // report once per stall, not every tick
        }
      }
    }, 2000);
    return this;
  }

  stopStallWatch() { if (this._stall) clearInterval(this._stall); this._stall = null; }

  finish() {
    this.stopStallWatch();
    this.checkSockets();
    this.checkErrors();
    for (const bot of this.bots) bot.close();
  }

  report(extra = {}) {
    return {
      game: this.game,
      players: this.bots.length,
      roomCode: this.code,
      url: this.url,
      durationMs: now() - this.startedAt,
      statesReceived: Object.fromEntries(this.bots.map((b) => [b.name, b.stateCount])),
      finalRoom: this.host.room,
      finalState: this.host.state,
      anomalyCount: this.anomalies.length,
      anomalies: this.anomalies,
      notes: this.notes,
      ...extra,
    };
  }

  // Full transcripts are the evidence for anything reported.
  save(path, extra = {}) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, JSON.stringify({
      ...this.report(extra),
      transcripts: Object.fromEntries(this.bots.map((b) => [b.name, b.transcript.slice(-600)])),
    }, null, 2));
    this.log(`  report -> ${path}`);
    return path;
  }
}

// Convenience runner: sets up, runs fn(session), always tears down and reports.
export async function runSession(game, players, fn, opts = {}) {
  const log = opts.log || ((m) => console.log(m));
  const session = new Session(game, { players, log, ...opts });
  let error = null;
  try {
    await session.open(opts.names);
    await session.startGame(game);
    await fn(session);
  } catch (e) {
    error = e;
    session.anomaly("harness_exception", { message: e.message, stack: e.stack?.split("\n").slice(0, 6) });
  } finally {
    session.finish();
  }
  return { session, error };
}
