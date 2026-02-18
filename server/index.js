import { createServer } from "http";
import { readFileSync, existsSync } from "fs";
import { join, extname } from "path";
import { fileURLToPath } from "url";
import { WebSocketServer } from "ws";
import { createGameState, setSnakeDirection, stepGame } from "./engine.js";
import { createVotingState, submitVote, tickVoting, allVotesIn, resolveVoting, serializeVoting } from "./voting-engine.js";
import { createTruthsState, handleTruthsAction, allTruthsVotesIn, revealTruths, nextTruthsRound, tickTruths, serializeTruths } from "./truths-engine.js";
import { createEmojiState, handleEmojiAction, allEmojiGuessersCorrect, tickEmoji, revealEmoji, nextEmojiRound, serializeEmoji } from "./emoji-engine.js";
import { createSketchState, handleSketchAction, allSketchGuessersCorrect, tickSketch, revealSketch, nextSketchRound, serializeSketch } from "./sketch-engine.js";
import { createTriviaState, handleTriviaAction, allAnswered, revealTrivia, nextTriviaQuestion, nextTriviaRound, tickTrivia, serializeTrivia } from "./trivia-engine.js";

const PORT = Number(process.env.PORT || process.env.SNAKE_WS_PORT || 3000);
const SNAKE_TICK_MS = 120;
const ROWS = 20;
const COLS = 20;
const MAX_PLAYERS = 6;
const COLORS = ["#2a2a2a", "#3d5a80", "#8d5a3a", "#5a7d3a", "#7a3d80", "#3a7d7d"];

// ── Static file server ───────────────────────────────────────────

const __dirname = fileURLToPath(new URL(".", import.meta.url));
const DIST_DIR = join(__dirname, "..", "dist");
const HAS_DIST = existsSync(join(DIST_DIR, "index.html"));

const MIME_TYPES = {
  ".html": "text/html", ".js": "application/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg",
  ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".woff": "font/woff", ".woff2": "font/woff2",
};

const httpServer = createServer((req, res) => {
  if (!HAS_DIST) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<html><body><h2>Game server is running.</h2><p>Run <code>npm run build</code> first, or use <code>npm run dev</code> for development.</p></body></html>");
    return;
  }
  let filePath = join(DIST_DIR, req.url === "/" ? "index.html" : req.url);
  const ext = extname(filePath);
  try {
    const data = readFileSync(filePath);
    res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
    res.end(data);
  } catch {
    try {
      const html = readFileSync(join(DIST_DIR, "index.html"));
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(html);
    } catch {
      res.writeHead(404);
      res.end("Not found");
    }
  }
});

const rooms = new Map();
let nextClientId = 1;

const wss = new WebSocketServer({ server: httpServer });

wss.on("connection", (ws) => {
  const clientId = `p${nextClientId++}`;
  ws.send(JSON.stringify({ type: "welcome", id: clientId }));

  ws.on("message", (raw) => {
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "Invalid JSON." }));
      return;
    }
    handleMessage(ws, clientId, message);
  });

  ws.on("close", () => handleDisconnect(clientId));
});

// ── Message routing ──────────────────────────────────────────────

function handleMessage(ws, clientId, message) {
  switch (message.type) {
    case "host":       handleHost(ws, clientId, message.name); break;
    case "join":       handleJoin(ws, clientId, message.code, message.name); break;
    case "start":      handleStart(clientId); break;
    case "restart":    handleRestart(clientId); break;
    case "endGame":    handleEndGame(clientId); break;
    case "skipPhase":  handleSkipPhase(clientId); break;
    case "input":      handleInput(clientId, message.dir); break;
    case "vote":       handleVote(clientId, message.game); break;
    case "gameAction": handleGameAction(ws, clientId, message.action); break;
    default:
      ws.send(JSON.stringify({ type: "error", message: "Unknown message type." }));
  }
}

// ── Room lifecycle ───────────────────────────────────────────────

function handleHost(ws, clientId, name = "Player") {
  const code = generateRoomCode();
  const player = { id: clientId, name: name.slice(0, 16), ws, color: COLORS[0] };
  const room = {
    code,
    hostId: clientId,
    players: new Map([[clientId, player]]),
    game: null,
    interval: null,
    status: "lobby",
    currentGame: null,
    votingState: null,
    roundWins: new Map(),
    gameWins: new Map(),
  };
  rooms.set(code, room);
  sendRoomUpdate(room);
}

function handleJoin(ws, clientId, code, name = "Player") {
  const room = rooms.get(String(code).toUpperCase());
  if (!room) {
    ws.send(JSON.stringify({ type: "error", message: "Room not found." }));
    return;
  }
  if (room.players.size >= MAX_PLAYERS) {
    ws.send(JSON.stringify({ type: "error", message: "Room is full." }));
    return;
  }
  if (room.status !== "lobby") {
    ws.send(JSON.stringify({ type: "error", message: "Game already in progress." }));
    return;
  }

  const color = COLORS[room.players.size % COLORS.length];
  room.players.set(clientId, { id: clientId, name: name.slice(0, 16), ws, color });
  room.gameWins.set(clientId, 0);
  sendRoomUpdate(room);
}

function handleStart(clientId) {
  const room = findRoomByPlayer(clientId);
  if (!room || room.hostId !== clientId) return;
  if (room.status !== "lobby") return;
  startVoting(room);
}

function handleRestart(clientId) {
  const room = findRoomByPlayer(clientId);
  if (!room || room.hostId !== clientId) return;

  if (room.status === "playing" && room.currentGame === "snake") {
    const players = Array.from(room.players.values());
    startSnake(room, players);
  }
}

function handleEndGame(clientId) {
  const room = findRoomByPlayer(clientId);
  if (!room || room.hostId !== clientId) return;
  if (room.status !== "playing") return;

  let maxWins = 0;
  let gameWinnerId = null;
  room.roundWins.forEach((wins, id) => {
    if (wins > maxWins) {
      maxWins = wins;
      gameWinnerId = id;
    }
  });

  if (gameWinnerId && maxWins > 0) {
    room.gameWins.set(gameWinnerId, (room.gameWins.get(gameWinnerId) || 0) + 1);
  }

  room.roundWins = new Map();
  startVoting(room);
}

// Host skips the current phase (for games without timers)
function handleSkipPhase(clientId) {
  const room = findRoomByPlayer(clientId);
  if (!room || room.hostId !== clientId) return;
  if (room.status !== "playing") return;

  switch (room.currentGame) {
    case "truths":
      if (room.game.status === "submitting") {
        room.game = nextTruthsRound(room.game);
        broadcastGameState(room);
      } else if (room.game.status === "voting") {
        triggerTruthsReveal(room);
      }
      break;
    case "emoji":
      if (room.game.status === "composing") {
        room.game = nextEmojiRound(room.game, Math.random);
        broadcastGameState(room);
      } else if (room.game.status === "guessing") {
        triggerEmojiReveal(room);
      }
      break;
    case "sketch":
      if (room.game.status === "drawing") {
        triggerSketchReveal(room);
      }
      break;
  }
}

function handleDisconnect(clientId) {
  const room = findRoomByPlayer(clientId);
  if (!room) return;

  room.players.delete(clientId);

  if (room.players.size === 0) {
    stopLoop(room);
    rooms.delete(room.code);
    return;
  }

  if (room.hostId === clientId) {
    room.hostId = room.players.keys().next().value;
  }

  if (room.currentGame === "snake" && room.game?.snakes?.has(clientId)) {
    const snake = room.game.snakes.get(clientId);
    room.game.snakes.set(clientId, { ...snake, alive: false });
  }

  sendRoomUpdate(room);
  if (room.status === "playing") {
    broadcastGameState(room);
  }
}

// ── Round & game win tracking ────────────────────────────────────

function awardRoundWin(room, winnerId) {
  if (!winnerId) return;
  room.roundWins.set(winnerId, (room.roundWins.get(winnerId) || 0) + 1);
  sendRoomUpdate(room);
}

function getSnakeRoundWinner(game) {
  if (!game?.snakes) return null;
  const snakes = Array.from(game.snakes.values());
  const alive = snakes.filter((s) => s.alive);
  if (alive.length === 1) return alive[0].id;
  const sorted = [...snakes].sort((a, b) => b.score - a.score);
  return sorted[0]?.id || null;
}

// ── Voting phase ─────────────────────────────────────────────────

function handleVote(clientId, game) {
  const room = findRoomByPlayer(clientId);
  if (!room || room.status !== "voting") return;
  room.votingState = submitVote(room.votingState, clientId, game);
  broadcastVotingState(room);

  if (allVotesIn(room.votingState, room.players.size)) {
    finishVoting(room);
  }
}

function startVoting(room) {
  stopLoop(room);
  room.status = "voting";
  room.currentGame = null;
  room.game = null;
  room.votingState = createVotingState();
  sendRoomUpdate(room);
  broadcastVotingState(room);

  room.interval = setInterval(() => {
    room.votingState = tickVoting(room.votingState);
    broadcastVotingState(room);
    if (room.votingState.timer <= 0) finishVoting(room);
  }, 1000);
}

function finishVoting(room) {
  stopLoop(room);
  const winner = resolveVoting(room.votingState, Math.random);
  room.votingState = null;
  startSelectedGame(room, winner);
}

// ── Game dispatcher ──────────────────────────────────────────────

function startSelectedGame(room, gameName) {
  stopLoop(room);
  room.status = "playing";
  room.currentGame = gameName;
  room.roundWins = new Map();
  const players = Array.from(room.players.values());

  switch (gameName) {
    case "snake":  startSnake(room, players); break;
    case "truths": startTruths(room, players); break;
    case "emoji":  startEmojiGame(room, players); break;
    case "sketch": startSketchGame(room, players); break;
    case "trivia": startTriviaGame(room, players); break;
  }

  sendRoomUpdate(room);
}

function handleGameAction(ws, clientId, action) {
  const room = findRoomByPlayer(clientId);
  if (!room || room.status !== "playing" || !action) return;

  switch (room.currentGame) {
    case "truths":
      room.game = handleTruthsAction(room.game, clientId, action);
      if (room.game.status === "voting" && allTruthsVotesIn(room.game)) {
        triggerTruthsReveal(room);
      } else {
        broadcastGameState(room);
      }
      break;
    case "emoji":
      room.game = handleEmojiAction(room.game, clientId, action);
      if (room.game.status === "guessing" && allEmojiGuessersCorrect(room.game)) {
        triggerEmojiReveal(room);
      } else {
        broadcastGameState(room);
      }
      break;
    case "sketch":
      room.game = handleSketchAction(room.game, clientId, action);
      if (room.game.status === "drawing" && allSketchGuessersCorrect(room.game)) {
        triggerSketchReveal(room);
      } else {
        broadcastGameState(room);
      }
      break;
    case "trivia":
      room.game = handleTriviaAction(room.game, clientId, action);
      if (allAnswered(room.game)) {
        handleTriviaReveal(room);
      } else {
        broadcastGameState(room);
      }
      break;
  }
}

function handleInput(clientId, dir) {
  const room = findRoomByPlayer(clientId);
  if (!room || room.status !== "playing" || room.currentGame !== "snake") return;
  room.game = setSnakeDirection(room.game, clientId, dir);
}

// ── Snake ────────────────────────────────────────────────────────

function startSnake(room, players) {
  room.game = createGameState({ rows: ROWS, cols: COLS, players, rng: Math.random });
  broadcastGameState(room);

  room.interval = setInterval(() => {
    room.game = stepGame(room.game, Math.random);
    broadcastGameState(room);

    if (room.game.status !== "running") {
      stopLoop(room);
      awardRoundWin(room, getSnakeRoundWinner(room.game));
      sendRoomUpdate(room);
    }
  }, SNAKE_TICK_MS);
}

function serializeSnake(game) {
  if (!game) return null;
  return {
    gameType: "snake",
    rows: game.rows, cols: game.cols, food: game.food,
    status: game.status, winnerId: game.winnerId,
    snakes: Array.from(game.snakes.values()).map((snake) => ({
      id: snake.id, name: snake.name, color: snake.color,
      alive: snake.alive, score: snake.score, body: snake.body,
    })),
  };
}

// ── Two Truths & a Lie ───────────────────────────────────────────
// No interval during submitting/voting — phases advance on player action or host skip.
// Only the reveal phase uses a timed interval.

function startTruths(room, players) {
  room.game = createTruthsState({ players });
  broadcastGameState(room);
}

function triggerTruthsReveal(room) {
  stopLoop(room);
  room.game = revealTruths(room.game);
  broadcastGameState(room);
  startTruthsRevealTimer(room);
}

function startTruthsRevealTimer(room) {
  stopLoop(room);
  room.interval = setInterval(() => {
    room.game = tickTruths(room.game);
    broadcastGameState(room);
    if (room.game.timer <= 0) {
      stopLoop(room);
      awardRoundWin(room, room.game.roundWinnerId);
      room.game = nextTruthsRound(room.game);
      broadcastGameState(room);
    }
  }, 1000);
}

// ── Emoji Storytelling ───────────────────────────────────────────
// No interval during composing/guessing. Only reveal uses a timer.

function startEmojiGame(room, players) {
  room.game = createEmojiState({ players, rng: Math.random });
  broadcastGameState(room);
}

function triggerEmojiReveal(room) {
  stopLoop(room);
  room.game = revealEmoji(room.game);
  broadcastGameState(room);
  startEmojiRevealTimer(room);
}

function startEmojiRevealTimer(room) {
  stopLoop(room);
  room.interval = setInterval(() => {
    room.game = tickEmoji(room.game);
    broadcastGameState(room);
    if (room.game.timer <= 0) {
      stopLoop(room);
      awardRoundWin(room, room.game.roundWinnerId);
      room.game = nextEmojiRound(room.game, Math.random);
      broadcastGameState(room);
    }
  }, 1000);
}

// ── Sketch & Guess ───────────────────────────────────────────────
// No interval during drawing. Only reveal uses a timer.

function startSketchGame(room, players) {
  room.game = createSketchState({ players, rng: Math.random });
  broadcastGameState(room);
  startSketchDrawTimer(room);
}

function startSketchDrawTimer(room) {
  stopLoop(room);
  room.interval = setInterval(() => {
    room.game = tickSketch(room.game);
    broadcastGameState(room);
    if (room.game.timer <= 0) triggerSketchReveal(room);
  }, 1000);
}

function triggerSketchReveal(room) {
  stopLoop(room);
  room.game = revealSketch(room.game);
  broadcastGameState(room);
  startSketchRevealTimer(room);
}

function startSketchRevealTimer(room) {
  stopLoop(room);
  room.interval = setInterval(() => {
    room.game = tickSketch(room.game);
    broadcastGameState(room);
    if (room.game.timer <= 0) {
      stopLoop(room);
      awardRoundWin(room, room.game.roundWinnerId);
      room.game = nextSketchRound(room.game);
      broadcastGameState(room);
      startSketchDrawTimer(room);
    }
  }, 1000);
}

// ── Speed Trivia ─────────────────────────────────────────────────
// Trivia keeps its per-question timer (speed is the core mechanic).

function startTriviaGame(room, players) {
  room.game = createTriviaState({ players, rng: Math.random });
  broadcastGameState(room);

  room.interval = setInterval(() => {
    room.game = tickTrivia(room.game);
    broadcastGameState(room);
    if (room.game.timer <= 0) handleTriviaTimerEnd(room);
  }, 1000);
}

function handleTriviaReveal(room) {
  stopLoop(room);
  room.game = revealTrivia(room.game);
  broadcastGameState(room);
  startTriviaTick(room);
}

function handleTriviaTimerEnd(room) {
  stopLoop(room);

  if (room.game.status === "question") {
    room.game = revealTrivia(room.game);
    broadcastGameState(room);
    startTriviaTick(room);
  } else if (room.game.status === "reveal") {
    room.game = nextTriviaQuestion(room.game);
    if (room.game.status === "round_complete") {
      awardRoundWin(room, room.game.roundWinnerId);
      broadcastGameState(room);
      startTriviaTick(room);
    } else {
      broadcastGameState(room);
      startTriviaTick(room);
    }
  } else if (room.game.status === "round_complete") {
    room.game = nextTriviaRound(room.game, Math.random);
    broadcastGameState(room);
    startTriviaTick(room);
  }
}

function startTriviaTick(room) {
  stopLoop(room);
  room.interval = setInterval(() => {
    room.game = tickTrivia(room.game);
    broadcastGameState(room);
    if (room.game.timer <= 0) handleTriviaTimerEnd(room);
  }, 1000);
}

// ── Shared helpers ───────────────────────────────────────────────

function stopLoop(room) {
  if (room.interval) {
    clearInterval(room.interval);
    clearTimeout(room.interval);
    room.interval = null;
  }
}

function broadcastGameState(room) {
  if (!room.game) return;

  switch (room.currentGame) {
    case "snake":
      broadcast(room, { type: "state", state: serializeSnake(room.game) });
      break;
    case "truths":
      broadcast(room, { type: "state", state: serializeTruths(room.game) });
      break;
    case "emoji":
      room.players.forEach((player) => {
        sendTo(player, { type: "state", state: serializeEmoji(room.game, player.id) });
      });
      break;
    case "sketch":
      room.players.forEach((player) => {
        sendTo(player, { type: "state", state: serializeSketch(room.game, player.id) });
      });
      break;
    case "trivia":
      broadcast(room, { type: "state", state: serializeTrivia(room.game) });
      break;
  }
}

function broadcastVotingState(room) {
  if (!room.votingState) return;
  broadcast(room, { type: "vote_state", voting: serializeVoting(room.votingState) });
}

function sendRoomUpdate(room) {
  broadcast(room, {
    type: "room",
    room: {
      code: room.code,
      hostId: room.hostId,
      status: room.status,
      currentGame: room.currentGame,
      players: Array.from(room.players.values()).map((p) => ({
        id: p.id, name: p.name, color: p.color,
      })),
      roundWins: Object.fromEntries(room.roundWins),
      gameWins: Object.fromEntries(room.gameWins),
    },
  });
}

function broadcast(room, payload) {
  const message = JSON.stringify(payload);
  room.players.forEach((player) => {
    if (player.ws.readyState === player.ws.OPEN) player.ws.send(message);
  });
}

function sendTo(player, payload) {
  if (player.ws.readyState === player.ws.OPEN) {
    player.ws.send(JSON.stringify(payload));
  }
}

function findRoomByPlayer(playerId) {
  for (const room of rooms.values()) {
    if (room.players.has(playerId)) return room;
  }
  return null;
}

function generateRoomCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = Array.from({ length: 4 })
      .map(() => alphabet[Math.floor(Math.random() * alphabet.length)])
      .join("");
  } while (rooms.has(code));
  return code;
}

httpServer.listen(PORT, () => {
  console.log(`Game server running on http://localhost:${PORT}`);
  if (HAS_DIST) {
    console.log(`Open http://localhost:${PORT} in your browser to play.`);
  } else {
    console.log("No dist/ folder found — run 'npm run build' to enable the built-in web server.");
    console.log("For development, use 'npm run dev' in a separate terminal.");
  }
});
