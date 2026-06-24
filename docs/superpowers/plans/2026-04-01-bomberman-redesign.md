# Bomber Arena Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flickering CSS-grid Bomber Arena with a canvas renderer, continuous directional movement, free-for-all scoring, and proper keyboard + mobile controls.

**Architecture:** The engine (`bomber-engine.js`) is a pure rewrite: teams/idle removed, `dir`/`moving` per-player replaces `pendingDir`, elimination groups drive survival-order scoring. The server (`index.js`) gets a single new `stopInput` message type. The component (`BomberGame.jsx`) switches from a 225-div React tree to a single `<canvas>` drawn imperatively on every game prop change. CSS cleans up the old grid classes.

**Tech Stack:** Node.js (server engine), React 18 + Canvas 2D API (frontend), plain CSS

---

## File Map

| File | Action | What changes |
|---|---|---|
| `server/bomber-engine.js` | Rewrite | Remove teams/idle; add `dir`/`moving`; group elimination scoring |
| `server/index.js` | Modify lines 119-120, 716-722 | Add `stopInput` case; fix round-end to use `roundWinnerIds` |
| `src/games/BomberGame.jsx` | Rewrite | Canvas renderer + keyboard/pointer/swipe controls |
| `src/index.css` | Modify lines 746-951 | Remove team/grid/cell CSS; add `.bomber-canvas` + `.bomber-scoreboard` |

---

## Task 1: Rewrite `server/bomber-engine.js`

**Files:**
- Modify: `server/bomber-engine.js` (full rewrite)

- [ ] **Step 1: Replace the entire file with the new engine**

```js
// ── Bomberman Arena Engine ────────────────────────────────────────
// Server-authoritative, 150ms tick. 15x15 grid. Free-for-all.

const ROWS = 15;
const COLS = 15;
const ROUND_DURATION = 120;
const ROUND_END_DURATION = 4;
const BOMB_TIMER_MS = 3000;
const FLAME_DURATION_MS = 600;
const TICK_MS = 150;

const EMPTY = 0;
const WALL = 1;
const BREAKABLE = 2;
const POWERUP_BOMB = 3;
const POWERUP_RANGE = 4;

const SPAWN_POSITIONS = [
  { x: 1, y: 1 }, { x: 13, y: 1 }, { x: 1, y: 13 }, { x: 13, y: 13 },
  { x: 7, y: 1 }, { x: 1, y: 7 }, { x: 13, y: 7 }, { x: 7, y: 13 },
];

function key(x, y) { return `${x},${y}`; }

function buildGrid(rng) {
  const grid = [];
  for (let y = 0; y < ROWS; y++) {
    const row = [];
    for (let x = 0; x < COLS; x++) {
      if (x === 0 || x === COLS - 1 || y === 0 || y === ROWS - 1) {
        row.push(WALL);
      } else if (x % 2 === 0 && y % 2 === 0) {
        row.push(WALL);
      } else {
        row.push(EMPTY);
      }
    }
    grid.push(row);
  }

  const clearCells = new Set();
  SPAWN_POSITIONS.forEach(({ x, y }) => {
    [{ x, y }, { x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 },
     { x: x + 2, y }, { x: x - 2, y }, { x, y: y + 2 }, { x, y: y - 2 }]
      .forEach((p) => clearCells.add(key(p.x, p.y)));
  });

  for (let y = 1; y < ROWS - 1; y++) {
    for (let x = 1; x < COLS - 1; x++) {
      if (grid[y][x] === EMPTY && !clearCells.has(key(x, y)) && rng() < 0.3) {
        grid[y][x] = BREAKABLE;
      }
    }
  }
  return grid;
}

export function createBomberState({ players, rng }) {
  const grid = buildGrid(rng);
  const playerMap = new Map();

  players.forEach((p, i) => {
    const spawn = SPAWN_POSITIONS[i % SPAWN_POSITIONS.length];
    playerMap.set(p.id, {
      id: p.id, name: p.name, color: p.color,
      x: spawn.x, y: spawn.y,
      alive: true,
      dir: null,
      moving: false,
      maxBombs: 1,
      activeBombs: 0,
      flameRange: 2,
    });
  });

  const scores = new Map();
  players.forEach((p) => scores.set(p.id, 0));

  return {
    gameType: "bomber",
    status: "playing",
    rows: ROWS, cols: COLS,
    grid,
    players: playerMap,
    bombs: [],
    flames: [],
    round: 1,
    timer: ROUND_DURATION,
    scores,
    eliminationOrder: [],
    roundWinnerIds: [],
  };
}

export function handleBomberAction(state, playerId, action) {
  if (!state.players.has(playerId)) return state;
  const player = state.players.get(playerId);
  if (state.status !== "playing") return state;

  if (action.kind === "move") {
    if (!player.alive) return state;
    const VALID_DIRS = ["up", "down", "left", "right"];
    const d = action.dir?.toLowerCase();
    if (!VALID_DIRS.includes(d)) return state;
    const players = new Map(state.players);
    players.set(playerId, { ...player, dir: d, moving: true });
    return { ...state, players };
  }

  if (action.kind === "stop") {
    const players = new Map(state.players);
    players.set(playerId, { ...player, moving: false });
    return { ...state, players };
  }

  if (action.kind === "bomb") {
    if (!player.alive) return state;
    return placeBomb(state, playerId);
  }

  return state;
}

function placeBomb(state, playerId) {
  const player = state.players.get(playerId);
  if (player.activeBombs >= player.maxBombs) return state;
  if (state.bombs.some((b) => b.x === player.x && b.y === player.y)) return state;

  const players = new Map(state.players);
  players.set(playerId, { ...player, activeBombs: player.activeBombs + 1 });
  const bombs = [...state.bombs, {
    x: player.x, y: player.y,
    ownerId: playerId,
    timerMs: BOMB_TIMER_MS,
    range: player.flameRange,
  }];
  return { ...state, players, bombs };
}

// ── Main game tick ───────────────────────────────────────────────

export function stepBomber(state, rng) {
  if (state.status !== "playing") return state;
  let s = movePlayers(state);
  s = tickBombs(s, rng);
  s = tickFlames(s);
  s = killPlayersInFlames(s);
  s = collectPowerUps(s);
  s = checkRoundEnd(s);
  return s;
}

function movePlayers(state) {
  const players = new Map(state.players);
  players.forEach((p, id) => {
    if (!p.alive || !p.moving || !p.dir) return;
    let nx = p.x, ny = p.y;
    if (p.dir === "up")    ny--;
    if (p.dir === "down")  ny++;
    if (p.dir === "left")  nx--;
    if (p.dir === "right") nx++;
    if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) return;
    const tile = state.grid[ny][nx];
    if (tile === WALL || tile === BREAKABLE) return;
    const bombHere = state.bombs.find((b) => b.x === nx && b.y === ny);
    if (bombHere && bombHere.ownerId !== id) return;
    players.set(id, { ...p, x: nx, y: ny });
  });
  return { ...state, players };
}

function tickBombs(state, rng) {
  const tickAmount = TICK_MS;
  let bombs = state.bombs.map((b) => ({ ...b, timerMs: b.timerMs - tickAmount }));
  let grid = state.grid.map((row) => [...row]);
  let flames = [...state.flames];
  let players = new Map(state.players);

  const toDetonate = bombs.filter((b) => b.timerMs <= 0);
  const remaining = bombs.filter((b) => b.timerMs > 0);
  const detonateQueue = [...toDetonate];

  while (detonateQueue.length > 0) {
    const bomb = detonateQueue.shift();
    if (players.has(bomb.ownerId)) {
      const owner = players.get(bomb.ownerId);
      players.set(bomb.ownerId, { ...owner, activeBombs: Math.max(0, owner.activeBombs - 1) });
    }

    const cells = [{ x: bomb.x, y: bomb.y }];
    const DIRS = [[0, -1], [0, 1], [-1, 0], [1, 0]];
    DIRS.forEach(([dx, dy]) => {
      for (let i = 1; i <= bomb.range; i++) {
        const fx = bomb.x + dx * i;
        const fy = bomb.y + dy * i;
        if (fx < 0 || fx >= COLS || fy < 0 || fy >= ROWS) break;
        const tile = grid[fy][fx];
        if (tile === WALL) break;
        cells.push({ x: fx, y: fy });
        if (tile === BREAKABLE) {
          const powerup = rng() < 0.2 ? (rng() < 0.5 ? POWERUP_BOMB : POWERUP_RANGE) : EMPTY;
          grid[fy][fx] = powerup;
          break;
        }
        const chainIdx = remaining.findIndex((b) => b.x === fx && b.y === fy);
        if (chainIdx !== -1) detonateQueue.push(remaining.splice(chainIdx, 1)[0]);
      }
    });

    cells.forEach(({ x, y }) => {
      if (!flames.some((f) => f.x === x && f.y === y)) {
        flames.push({ x, y, timerMs: FLAME_DURATION_MS });
      }
    });
  }

  return { ...state, bombs: remaining, flames, grid, players };
}

function tickFlames(state) {
  const flames = state.flames
    .map((f) => ({ ...f, timerMs: f.timerMs - TICK_MS }))
    .filter((f) => f.timerMs > 0);
  return { ...state, flames };
}

function killPlayersInFlames(state) {
  if (state.flames.length === 0) return state;
  const flameSet = new Set(state.flames.map((f) => key(f.x, f.y)));
  const players = new Map(state.players);
  const newlyKilled = [];

  players.forEach((p, id) => {
    if (p.alive && flameSet.has(key(p.x, p.y))) {
      players.set(id, { ...p, alive: false });
      newlyKilled.push(id);
    }
  });

  if (newlyKilled.length === 0) return state;
  const eliminationOrder = [...state.eliminationOrder, newlyKilled];
  return { ...state, players, eliminationOrder };
}

function collectPowerUps(state) {
  const players = new Map(state.players);
  let grid = state.grid;
  let changed = false;

  players.forEach((p, id) => {
    if (!p.alive) return;
    const tile = grid[p.y]?.[p.x];
    if (tile === POWERUP_BOMB || tile === POWERUP_RANGE) {
      if (!changed) { grid = state.grid.map((row) => [...row]); changed = true; }
      grid[p.y][p.x] = EMPTY;
      const updated = tile === POWERUP_BOMB
        ? { ...p, maxBombs: Math.min(p.maxBombs + 1, 5) }
        : { ...p, flameRange: Math.min(p.flameRange + 1, 7) };
      players.set(id, updated);
    }
  });

  return changed ? { ...state, players, grid } : state;
}

// ── Scoring helpers ──────────────────────────────────────────────

// Each group in eliminationOrder is players who died in the same tick.
// Points = cumulative index of the last player in that group (0-indexed from first dead).
// Example: [[A],[B],[C,D]] with 4 players → A=0, B=1, C=3, D=3
function computeRoundScores(eliminationOrder) {
  const points = {};
  let cumulative = 0;
  eliminationOrder.forEach((group) => {
    cumulative += group.length;
    const pts = cumulative - 1;
    group.forEach((id) => { points[id] = pts; });
  });
  return points;
}

function applyRoundScores(state, eliminationOrder) {
  const roundPoints = computeRoundScores(eliminationOrder);
  const newScores = new Map(state.scores);
  eliminationOrder.flat().forEach((id) => {
    newScores.set(id, (newScores.get(id) || 0) + (roundPoints[id] || 0));
  });
  const roundWinnerIds = eliminationOrder.length > 0
    ? eliminationOrder[eliminationOrder.length - 1]
    : [];
  return { newScores, roundWinnerIds };
}

function checkRoundEnd(state) {
  const alivePlayers = [...state.players.values()].filter((p) => p.alive);
  if (alivePlayers.length > 1) return state;

  let eliminationOrder = state.eliminationOrder;
  if (alivePlayers.length === 1) {
    eliminationOrder = [...eliminationOrder, [alivePlayers[0].id]];
  }

  const { newScores, roundWinnerIds } = applyRoundScores(state, eliminationOrder);
  return {
    ...state,
    eliminationOrder,
    roundWinnerIds,
    scores: newScores,
    status: "round_end",
    timer: ROUND_END_DURATION,
  };
}

export function tickBomberTimer(state) {
  if (state.status === "playing") {
    const newTimer = state.timer - 1;
    if (newTimer <= 0) {
      // Time ran out — all alive players are co-winners
      const aliveIds = [...state.players.values()].filter((p) => p.alive).map((p) => p.id);
      let eliminationOrder = state.eliminationOrder;
      if (aliveIds.length > 0) eliminationOrder = [...eliminationOrder, aliveIds];

      const { newScores, roundWinnerIds } = applyRoundScores(state, eliminationOrder);
      return {
        ...state,
        timer: ROUND_END_DURATION,
        eliminationOrder,
        roundWinnerIds,
        scores: newScores,
        status: "round_end",
      };
    }
    return { ...state, timer: newTimer };
  }
  if (state.status === "round_end") {
    const newTimer = state.timer - 1;
    if (newTimer <= 0) return state;
    return { ...state, timer: newTimer };
  }
  return state;
}

export function nextBomberRound(state, rng) {
  const grid = buildGrid(rng);
  const players = new Map(state.players);
  let spawnIndex = 0;
  players.forEach((p, id) => {
    const spawn = SPAWN_POSITIONS[spawnIndex++ % SPAWN_POSITIONS.length];
    players.set(id, {
      ...p,
      x: spawn.x, y: spawn.y,
      alive: true,
      activeBombs: 0,
      maxBombs: 1,
      flameRange: 2,
      dir: null,
      moving: false,
    });
  });

  return {
    ...state,
    status: "playing",
    grid,
    players,
    bombs: [],
    flames: [],
    round: state.round + 1,
    timer: ROUND_DURATION,
    eliminationOrder: [],
    roundWinnerIds: [],
  };
}

export function serializeBomber(state) {
  const playersObj = {};
  state.players.forEach((p, id) => {
    playersObj[id] = {
      id: p.id, name: p.name, color: p.color,
      x: p.x, y: p.y, alive: p.alive,
      maxBombs: p.maxBombs, activeBombs: p.activeBombs, flameRange: p.flameRange,
    };
  });

  return {
    gameType: "bomber",
    status: state.status,
    rows: state.rows, cols: state.cols,
    grid: state.grid,
    players: playersObj,
    bombs: state.bombs.map((b) => ({ x: b.x, y: b.y, ownerId: b.ownerId, timerMs: b.timerMs })),
    flames: state.flames.map((f) => ({ x: f.x, y: f.y })),
    timer: state.timer,
    round: state.round,
    scores: Object.fromEntries(state.scores),
    roundWinnerIds: state.roundWinnerIds,
    eliminationOrder: state.eliminationOrder,
  };
}

export { TICK_MS };
```

- [ ] **Step 2: Commit**

```bash
git add server/bomber-engine.js
git commit -m "feat(bomber): rewrite engine — free-for-all, continuous movement, group survival scoring"
```

---

## Task 2: Update `server/index.js`

**Files:**
- Modify: `server/index.js` (2 edits)

- [ ] **Step 1: Add `stopInput` to the message router (line ~120)**

Find this block:
```js
    case "input":      handleInput(clientId, message.dir); break;
    case "vote":       handleVote(clientId, message.game); break;
```

Replace with:
```js
    case "input":      handleInput(clientId, message.dir); break;
    case "stopInput":  handleStopInput(clientId); break;
    case "vote":       handleVote(clientId, message.game); break;
```

- [ ] **Step 2: Add the `handleStopInput` function near `handleInput` (~line 433)**

Find:
```js
function handleInput(clientId, dir) {
  const room = findRoomByPlayer(clientId);
  if (!room || room.status !== "playing") return;
  if (room.currentGame === "bomber") {
    room.game = handleBomberAction(room.game, clientId, { kind: "move", dir });
    return;
  }
```

Add this new function directly after the closing `}` of `handleInput`:
```js
function handleStopInput(clientId) {
  const room = findRoomByPlayer(clientId);
  if (!room || room.status !== "playing") return;
  if (room.currentGame === "bomber") {
    room.game = handleBomberAction(room.game, clientId, { kind: "stop" });
  }
}
```

- [ ] **Step 3: Fix the round-end award in `startBomberLoop` (~line 716)**

Find:
```js
    if (room.game.status === "round_end") {
      stopLoop(room);
      const winTeam = room.game.roundWinnerTeam;
      if (winTeam !== null) {
        // Award round win to each player on the winning team
        room.game.teams[winTeam].forEach((id) => awardRoundWin(room, id));
        sendRoomUpdate(room);
      }
      broadcastGameState(room);
```

Replace with:
```js
    if (room.game.status === "round_end") {
      stopLoop(room);
      room.game.roundWinnerIds.forEach((id) => awardRoundWin(room, id));
      sendRoomUpdate(room);
      broadcastGameState(room);
```

- [ ] **Step 4: Commit**

```bash
git add server/index.js
git commit -m "feat(bomber): add stopInput handler; award round wins to roundWinnerIds"
```

---

## Task 3: Rewrite `src/games/BomberGame.jsx`

**Files:**
- Modify: `src/games/BomberGame.jsx` (full rewrite)

- [ ] **Step 1: Replace the entire file**

```jsx
import { useEffect, useRef } from "react";

const WALL = 1;
const BREAKABLE = 2;
const POWERUP_BOMB = 3;
const POWERUP_RANGE = 4;

function drawBomber(canvas, game) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;
  const { rows, cols, grid, players, bombs, flames } = game;
  const cw = W / cols;
  const ch = H / rows;

  // Background (floor)
  ctx.fillStyle = "#2d2d2d";
  ctx.fillRect(0, 0, W, H);

  // Tiles
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const tile = grid[y][x];
      const px = x * cw;
      const py = y * ch;

      if (tile === WALL) {
        ctx.fillStyle = "#555";
        ctx.fillRect(px, py, cw, ch);
        ctx.fillStyle = "#666";
        ctx.fillRect(px, py, cw, 2);
        ctx.fillRect(px, py, 2, ch);
      } else if (tile === BREAKABLE) {
        ctx.fillStyle = "#8b6914";
        ctx.fillRect(px, py, cw, ch);
        ctx.fillStyle = "#6a5010";
        ctx.fillRect(px, py, cw, 1);
        ctx.fillRect(px, py, 1, ch);
        ctx.fillStyle = "#a07820";
        ctx.fillRect(px + cw * 0.2, py + ch * 0.2, cw * 0.6, ch * 0.6);
      } else if (tile === POWERUP_BOMB || tile === POWERUP_RANGE) {
        // floor already drawn; draw powerup label
        ctx.font = `${Math.min(cw, ch) * 0.65}px serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(tile === POWERUP_BOMB ? "💣" : "🔥", px + cw / 2, py + ch / 2);
      }
    }
  }

  // Flames
  flames.forEach(({ x, y }) => {
    const px = x * cw;
    const py = y * ch;
    ctx.fillStyle = "#e05b00";
    ctx.fillRect(px, py, cw, ch);
    const m = Math.min(cw, ch) * 0.2;
    ctx.fillStyle = "#ff9900";
    ctx.fillRect(px + m, py + m, cw - m * 2, ch - m * 2);
  });

  // Bombs
  bombs.forEach(({ x, y, timerMs }) => {
    const cx = x * cw + cw / 2;
    const cy = y * ch + ch / 2;
    const r = Math.min(cw, ch) * 0.32;

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = "#111";
    ctx.fill();
    ctx.strokeStyle = "#555";
    ctx.lineWidth = 1;
    ctx.stroke();

    // Fuse arc shrinks as timer counts down
    const ratio = Math.max(0, timerMs / 3000);
    const fuseColor = ratio > 0.5 ? "#ffdd00" : ratio > 0.25 ? "#ff8800" : "#ff2200";
    ctx.beginPath();
    ctx.arc(cx, cy, r + 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
    ctx.strokeStyle = fuseColor;
    ctx.lineWidth = 3;
    ctx.stroke();
  });

  // Players
  Object.values(players).forEach((p) => {
    if (!p.alive) return;
    const cx = p.x * cw + cw / 2;
    const cy = p.y * ch + ch / 2;
    const r = Math.min(cw, ch) * 0.38;

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "#fff";
    ctx.font = `bold ${Math.round(r * 1.1)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText((p.name[0] || "?").toUpperCase(), cx, cy);
  });
}

export default function BomberGame({ game, room, me, send }) {
  const canvasRef = useRef(null);
  const heldKeysRef = useRef(new Set());
  const sendRef = useRef(send);
  sendRef.current = send;
  const isHost = room?.hostId === me.id;

  // Size canvas to its CSS dimensions once on mount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const size = canvas.clientWidth;
    canvas.width = size;
    canvas.height = size;
  }, []);

  // Redraw on every game state update
  useEffect(() => {
    if (!game) return;
    const canvas = canvasRef.current;
    if (!canvas || !canvas.width) return;
    drawBomber(canvas, game);
  }, [game]);

  // Keyboard controls (desktop)
  useEffect(() => {
    const KEY_DIR = {
      ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
      w: "up", s: "down", a: "left", d: "right",
    };

    const onKeyDown = (e) => {
      if (e.repeat) return;
      if (e.key === " ") {
        e.preventDefault();
        sendRef.current({ type: "gameAction", action: { kind: "bomb" } });
        return;
      }
      const dir = KEY_DIR[e.key];
      if (!dir) return;
      e.preventDefault();
      heldKeysRef.current.add(e.key);
      sendRef.current({ type: "input", dir });
    };

    const onKeyUp = (e) => {
      heldKeysRef.current.delete(e.key);
      // If another direction is still held, switch to it; otherwise stop
      const remaining = [...heldKeysRef.current]
        .map((k) => KEY_DIR[k])
        .filter(Boolean);
      if (remaining.length > 0) {
        sendRef.current({ type: "input", dir: remaining[remaining.length - 1] });
      } else {
        sendRef.current({ type: "stopInput" });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []); // sendRef.current is always fresh

  // Touch swipe on the canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let touchStart = null;

    const onTouchStart = (e) => {
      e.preventDefault();
      if (e.touches.length !== 1) return;
      touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };
    const onTouchMove = (e) => {
      e.preventDefault();
      if (!touchStart || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - touchStart.x;
      const dy = e.touches[0].clientY - touchStart.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
      const dir = Math.abs(dx) > Math.abs(dy)
        ? (dx > 0 ? "right" : "left")
        : (dy > 0 ? "down" : "up");
      touchStart = null; // consume gesture
      sendRef.current({ type: "input", dir });
    };
    const onTouchEnd = () => { touchStart = null; };

    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd, { passive: false });
    return () => {
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  if (!game) return null;

  const { timer, round, scores, status, roundWinnerIds } = game;
  const myPlayer = game.players?.[me.id];
  const myScore = scores?.[me.id] ?? 0;

  const dpadDir = (dir) => sendRef.current({ type: "input", dir });
  const dpadStop = () => sendRef.current({ type: "stopInput" });

  return (
    <main className="game-stage">
      <div className="game-header">
        <span>Round {round}</span>
        {timer != null && (
          <span className={`voting-timer${timer <= 15 ? " timer-urgent" : ""}`}>{timer}s</span>
        )}
      </div>

      <canvas ref={canvasRef} className="bomber-canvas" />

      <div className="bomber-controls">
        <div className="bomber-dpad">
          <button type="button" className="dpad-btn dpad-up"
            onPointerDown={() => dpadDir("up")} onPointerUp={dpadStop} onPointerCancel={dpadStop}>▲</button>
          <button type="button" className="dpad-btn dpad-left"
            onPointerDown={() => dpadDir("left")} onPointerUp={dpadStop} onPointerCancel={dpadStop}>◀</button>
          <button type="button" className="dpad-btn dpad-right"
            onPointerDown={() => dpadDir("right")} onPointerUp={dpadStop} onPointerCancel={dpadStop}>▶</button>
          <button type="button" className="dpad-btn dpad-down"
            onPointerDown={() => dpadDir("down")} onPointerUp={dpadStop} onPointerCancel={dpadStop}>▼</button>
        </div>
        <button
          type="button"
          className="bomber-bomb-btn"
          onTouchEnd={(e) => { e.preventDefault(); sendRef.current({ type: "gameAction", action: { kind: "bomb" } }); }}
          onClick={() => sendRef.current({ type: "gameAction", action: { kind: "bomb" } })}
        >💣</button>
      </div>

      {myPlayer && (
        <div className="bomber-stats">
          {myPlayer.alive ? (
            <>
              <span>💣 ×{myPlayer.maxBombs}</span>
              <span>🔥 ×{myPlayer.flameRange}</span>
            </>
          ) : (
            <span style={{ opacity: 0.6 }}>You&apos;re out — watching</span>
          )}
          <span>Points: {myScore}</span>
        </div>
      )}

      <div className="bomber-scoreboard">
        {Object.values(game.players || {})
          .sort((a, b) => (scores?.[b.id] ?? 0) - (scores?.[a.id] ?? 0))
          .map((p) => (
            <div key={p.id} className={`bomber-score-row${p.alive ? "" : " dead"}`}>
              <span className="bomber-score-dot" style={{ background: p.color }} />
              <span className="bomber-score-name">{p.name}</span>
              <span className="bomber-score-pts">{scores?.[p.id] ?? 0}</span>
            </div>
          ))}
      </div>

      {status === "round_end" && (
        <div className="panel">
          {roundWinnerIds && roundWinnerIds.length > 0 ? (
            <div className="status round-winner">
              {roundWinnerIds.length === 1
                ? `${game.players[roundWinnerIds[0]]?.name ?? "?"} wins the round!`
                : `${roundWinnerIds.map((id) => game.players[id]?.name ?? "?").join(" & ")} tie!`}
            </div>
          ) : (
            <div className="status">Draw!</div>
          )}
          {isHost && (
            <div className="actions">
              <button type="button" onClick={() => sendRef.current({ type: "skipPhase" })}>
                Next Round
              </button>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/games/BomberGame.jsx
git commit -m "feat(bomber): canvas renderer, keyboard/pointer/swipe controls, survival scoreboard"
```

---

## Task 4: Update `src/index.css`

**Files:**
- Modify: `src/index.css`

- [ ] **Step 1: Remove the old bomber team + grid CSS (lines 746–869)**

Find and delete the entire block from `.bomber-teams {` through the closing `}` of `.bomber-player {` — everything up to (but not including) `/* Mobile controls */`. That is:

```css
.bomber-teams {
  display: flex;
  ...
}
/* ... all the way through ... */
.bomber-player {
  ...
  z-index: 2;
  position: relative;
}
```

Also delete the two keyframe blocks:
```css
@keyframes flame-pulse {
  from { background: #e05b00 !important; }
  to   { background: #ff8800 !important; }
}
```
and
```css
@keyframes bomb-pulse {
  from { transform: scale(0.9); }
  to   { transform: scale(1.1); }
}
```

- [ ] **Step 2: In the space where those blocks were, add the new canvas + scoreboard CSS**

Insert this block just before `/* Mobile controls */`:

```css
/* Bomber Arena canvas */
.bomber-canvas {
  display: block;
  width: min(90vw, 420px);
  aspect-ratio: 1 / 1;
  margin: 0 auto 10px;
  border: 2px solid #444;
  border-radius: 4px;
  touch-action: none;
}

/* Bomber scoreboard */
.bomber-scoreboard {
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: min(90vw, 420px);
  margin: 8px auto 0;
}

.bomber-score-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 14px;
  transition: opacity 0.3s;
}

.bomber-score-row.dead {
  opacity: 0.4;
}

.bomber-score-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}

.bomber-score-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bomber-score-pts {
  font-weight: 700;
  min-width: 30px;
  text-align: right;
}
```

- [ ] **Step 3: Commit**

```bash
git add src/index.css
git commit -m "feat(bomber): replace grid CSS with canvas + scoreboard styles"
```

---

## Task 5: Smoke Test + Manual Verification

**Files:** none

- [ ] **Step 1: Run smoke tests**

```bash
npm test
```

Expected output ends with `✓ All smoke tests passed` and exit code 0. The smoke test creates a room, joins it, starts voting, votes for bomber, and verifies the game starts — which exercises the new `createBomberState` and `serializeBomber` paths.

If you see `TypeError: ... teams is not defined` or similar, check Task 1 (teams were removed from the engine) and Task 2 (round-end block no longer references `.teams`).

- [ ] **Step 2: Start the dev server**

In one terminal:
```bash
npm run server
```

In another:
```bash
npm run dev
```

- [ ] **Step 3: Two-tab manual test**

Open `http://localhost:5173` in **two tabs**.

Tab 1: Host a room, note the code.  
Tab 2: Join with that code.  
Tab 1: Start game, vote for "Bomber Arena".

Verify:
- [ ] Canvas renders — 15×15 grid with grey walls, brown breakable blocks, dark floor
- [ ] Two player circles appear at spawn corners with their first-letter initials
- [ ] Arrow keys / WASD move the player smoothly (one cell per 150ms tick while held)
- [ ] Releasing all keys stops movement
- [ ] Spacebar places a bomb — dark circle with yellow fuse arc appears
- [ ] After ~3s the bomb explodes — orange flames spread in a cross
- [ ] D-pad buttons move player while held (pointer held down = continuous)
- [ ] Round ends when one player is eliminated; winner banner appears
- [ ] Scoreboard updates with the correct survival-order points
- [ ] "Next Round" button (host) starts a new round with fresh grid

- [ ] **Step 4: Final commit if any fixes were needed**

```bash
git add -p   # stage only intentional changes
git commit -m "fix(bomber): post-review corrections"
```
