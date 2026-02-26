export const DIRECTIONS = {
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 },
};

export const DIRECTION_KEYS = Object.keys(DIRECTIONS);

export function createGameState({ rows, cols, players, rng }) {
  const spawnPoints = [
    { x: 2,            y: 2,                        dir: DIRECTIONS.RIGHT }, // top-left
    { x: cols - 3,     y: 2,                        dir: DIRECTIONS.LEFT  }, // top-right
    { x: 2,            y: rows - 3,                 dir: DIRECTIONS.RIGHT }, // bottom-left
    { x: cols - 3,     y: rows - 3,                 dir: DIRECTIONS.LEFT  }, // bottom-right
    { x: Math.floor(cols / 2), y: 2,                dir: DIRECTIONS.DOWN  }, // top-centre
    { x: Math.floor(cols / 2), y: rows - 3,         dir: DIRECTIONS.UP    }, // bottom-centre
    { x: 2,            y: Math.floor(rows / 2),     dir: DIRECTIONS.RIGHT }, // left-middle  (player 7)
    { x: cols - 3,     y: Math.floor(rows / 2),     dir: DIRECTIONS.LEFT  }, // right-middle (player 8)
  ];

  const snakes = new Map();
  players.forEach((player, index) => {
    const spawn = spawnPoints[index % spawnPoints.length];
    const body = [
      { x: spawn.x, y: spawn.y },
      { x: spawn.x - spawn.dir.x, y: spawn.y - spawn.dir.y },
      { x: spawn.x - spawn.dir.x * 2, y: spawn.y - spawn.dir.y * 2 },
    ];
    snakes.set(player.id, {
      id: player.id,
      name: player.name,
      color: player.color,
      body,
      direction: spawn.dir,
      pendingDirection: null,
      growth: 0,
      alive: true,
      score: 0,
    });
  });

  const food = spawnFood(snakes, rows, cols, rng);

  return {
    rows,
    cols,
    snakes,
    food,
    status: "running",
    winnerId: null,
    playerCount: players.length,
  };
}

export function stepGame(state, rng) {
  if (state.status !== "running") return state;

  const next = new Map();
  const nextHeads = new Map();
  const nextBodies = new Map();
  const ateFood = new Set();

  state.snakes.forEach((snake, id) => {
    if (!snake.alive) {
      next.set(id, { ...snake });
      return;
    }

    const dir = snake.pendingDirection && !isOpposite(snake.direction, snake.pendingDirection)
      ? snake.pendingDirection
      : snake.direction;

    const head = snake.body[0];
    const nextHead = { x: head.x + dir.x, y: head.y + dir.y };
    const willEat = state.food && nextHead.x === state.food.x && nextHead.y === state.food.y;
    const willGrow = willEat || snake.growth > 0;
    const body = [nextHead, ...snake.body];
    const trimmedBody = willGrow ? body : body.slice(0, -1);

    nextHeads.set(id, nextHead);
    nextBodies.set(id, trimmedBody);
    if (willEat) ateFood.add(id);

    next.set(id, {
      ...snake,
      direction: dir,
      pendingDirection: null,
      body: trimmedBody,
      growth: snake.growth,
    });
  });

  const deaths = new Set();

  next.forEach((snake) => {
    if (!snake.alive) return;
    const head = nextHeads.get(snake.id);
    if (hitsWall(head, state.rows, state.cols)) deaths.add(snake.id);
  });

  const headCounts = new Map();
  nextHeads.forEach((head) => {
    const key = keyOf(head);
    headCounts.set(key, (headCounts.get(key) || 0) + 1);
  });
  next.forEach((snake) => {
    if (!snake.alive) return;
    const head = nextHeads.get(snake.id);
    if (headCounts.get(keyOf(head)) > 1) deaths.add(snake.id);
  });

  next.forEach((snake) => {
    if (!snake.alive) return;
    const head = nextHeads.get(snake.id);
    const selfBody = nextBodies.get(snake.id).slice(1);
    if (selfBody.some((segment) => segment.x === head.x && segment.y === head.y)) {
      deaths.add(snake.id);
    }
  });

  next.forEach((snake, id) => {
    if (!snake.alive) return;
    const head = nextHeads.get(id);
    nextBodies.forEach((body, otherId) => {
      if (id === otherId) return;
      if (body.some((segment) => segment.x === head.x && segment.y === head.y)) {
        deaths.add(id);
      }
    });
  });

  next.forEach((snake, id) => {
    if (deaths.has(id)) {
      next.set(id, { ...snake, alive: false });
    }
  });

  // Food fairness: if a snake ate food but died on the same tick, cancel the score.
  for (const id of ateFood) {
    if (!next.get(id).alive) ateFood.delete(id);
  }

  let food = state.food;
  next.forEach((snake, id) => {
    if (!snake.alive) return;
    let growth = snake.growth;
    if (ateFood.has(id)) {
      growth += 1;
      snake.score += 1;
    }
    if (growth > 0) growth -= 1;
    next.set(id, { ...snake, growth });
  });

  if (ateFood.size > 0) {
    food = spawnFood(next, state.rows, state.cols, rng);
  }

  const aliveSnakes = Array.from(next.values()).filter((snake) => snake.alive);
  let status = food ? "running" : "win";
  let winnerId = null;

  // Solo: only end when the snake actually dies (so single-player doesn't freeze).
  // Multiplayer: end when one or zero snakes remain — last one standing wins.
  if (aliveSnakes.length === 0 || (state.playerCount > 1 && aliveSnakes.length === 1)) {
    status = "gameover";
    winnerId = aliveSnakes[0]?.id || null;
  }

  return {
    ...state,
    snakes: next,
    food,
    status,
    winnerId,
  };
}

export function setSnakeDirection(state, playerId, dir) {
  if (!dir || !DIRECTION_KEYS.includes(dir)) return state;
  const snake = state.snakes.get(playerId);
  if (!snake || !snake.alive) return state;
  const nextDir = DIRECTIONS[dir];
  if (isOpposite(snake.direction, nextDir)) return state;
  const updated = { ...snake, pendingDirection: nextDir };
  const snakes = new Map(state.snakes);
  snakes.set(playerId, updated);
  return { ...state, snakes };
}

export function spawnFood(snakes, rows, cols, rng) {
  const occupied = new Set();
  snakes.forEach((snake) => {
    if (!snake.alive) return;
    snake.body.forEach((segment) => occupied.add(keyOf(segment)));
  });

  const emptyCells = [];
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const key = `${x},${y}`;
      if (!occupied.has(key)) emptyCells.push({ x, y });
    }
  }

  if (emptyCells.length === 0) return null;
  const index = Math.floor(rng() * emptyCells.length);
  return emptyCells[index];
}

function hitsWall(position, rows, cols) {
  return position.x < 0 || position.y < 0 || position.x >= cols || position.y >= rows;
}

function isOpposite(a, b) {
  return a.x + b.x === 0 && a.y + b.y === 0;
}

function keyOf(cell) {
  return `${cell.x},${cell.y}`;
}
