// ── Bomberman Arena Engine ────────────────────────────────────────
// Server-authoritative, 150ms tick. 15x15 grid. Free-for-all.

const ROWS = 30;
const COLS = 30;
const ROUND_DURATION = 120;
const ROUND_END_DURATION = 4;
const BOMB_TIMER_MS = 3000;
const FLAME_DURATION_MS = 600;
const TICK_MS = 100;

const EMPTY = 0;
const WALL = 1;
const BREAKABLE = 2;
const POWERUP_BOMB = 3;
const POWERUP_RANGE = 4;

const SPAWN_POSITIONS = [
  { x: 1, y: 1 }, { x: 27, y: 1 }, { x: 1, y: 27 }, { x: 27, y: 27 },
  { x: 13, y: 1 }, { x: 1, y: 13 }, { x: 27, y: 13 }, { x: 13, y: 27 },
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
      movingSetAt: 0,
      moveStartX: spawn.x,
      moveStartY: spawn.y,
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
    players.set(playerId, { ...player, dir: d, moving: true, movingSetAt: Date.now(), moveStartX: player.x, moveStartY: player.y });
    return { ...state, players };
  }

  if (action.kind === "stop") {
    const players = new Map(state.players);
    // Only apply a tap-step if the player hasn't moved at all since the key was pressed.
    // If the tick already moved them (position changed), skip — avoids double-move.
    const elapsed = Date.now() - (player.movingSetAt || 0);
    const hasMoved = player.x !== player.moveStartX || player.y !== player.moveStartY;
    let updated = { ...player, moving: false };
    if (elapsed < TICK_MS && !hasMoved && player.alive) {
      const pos = computeMove(state, player, playerId);
      if (pos) updated = { ...updated, ...pos };
    }
    players.set(playerId, updated);
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

// Returns {x, y} if the player can move one step, null if blocked.
function computeMove(state, p, playerId) {
  if (!p.alive || !p.moving || !p.dir) return null;
  let nx = p.x, ny = p.y;
  if (p.dir === "up")    ny--;
  if (p.dir === "down")  ny++;
  if (p.dir === "left")  nx--;
  if (p.dir === "right") nx++;
  if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) return null;
  const tile = state.grid[ny][nx];
  if (tile === WALL || tile === BREAKABLE) return null;
  const bombHere = state.bombs.find((b) => b.x === nx && b.y === ny);
  if (bombHere && bombHere.ownerId !== playerId) return null;
  return { x: nx, y: ny };
}

function movePlayers(state) {
  const players = new Map(state.players);
  players.forEach((p, id) => {
    const pos = computeMove(state, p, id);
    if (pos) players.set(id, { ...p, ...pos });
  });
  return { ...state, players };
}

// Move a single player immediately (called on input receipt, before the next tick).
export function applyImmediateMove(state, playerId) {
  const p = state.players.get(playerId);
  if (!p) return state;
  const pos = computeMove(state, p, playerId);
  if (!pos) return state;
  const players = new Map(state.players);
  players.set(playerId, { ...p, ...pos });
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
  // Single-player game: only end when the player dies (0 alive); while alive, let the timer run.
  if (alivePlayers.length === 1 && state.players.size === 1) return state;

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
      movingSetAt: 0,
      moveStartX: spawn.x,
      moveStartY: spawn.y,
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
