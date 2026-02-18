const DRAW_DURATION = 45;
const REVEAL_DURATION = 6;

const WORDS = [
  "cat", "house", "tree", "sun", "car", "flower", "fish", "mountain",
  "guitar", "robot", "pizza", "umbrella", "rocket", "rainbow", "dinosaur",
  "castle", "snowman", "airplane", "bicycle", "butterfly", "telescope",
  "volcano", "anchor", "camera", "lighthouse", "pirate", "penguin",
  "astronaut", "dragon", "hamburger", "tornado", "waterfall", "fireworks",
  "cactus", "submarine",
];

export function createSketchState({ players, rng }) {
  const playerIds = players.map((p) => p.id);
  const scores = new Map();
  playerIds.forEach((id) => scores.set(id, 0));

  const shuffled = [...WORDS].sort(() => rng() - 0.5);

  return {
    gameType: "sketch",
    status: "drawing",
    playerIds,
    drawerId: playerIds[0],
    word: shuffled[0],
    strokes: [],
    guesses: [],
    correctGuessers: [],
    scores,
    round: 1,
    timer: DRAW_DURATION,
    wordPool: shuffled,
    roundWinnerId: null,
  };
}

export function handleSketchAction(state, playerId, action) {
  switch (action.kind) {
    case "draw":
      return addStroke(state, playerId, action.points, action.color);
    case "clear":
      return clearCanvas(state, playerId);
    case "guess":
      return submitSketchGuess(state, playerId, action.text);
    default:
      return state;
  }
}

function addStroke(state, playerId, points, color) {
  if (state.status !== "drawing") return state;
  if (playerId !== state.drawerId) return state;
  if (!Array.isArray(points) || points.length === 0) return state;

  const stroke = { points: points.slice(0, 500), color: color || "#2a2a2a" };
  return { ...state, strokes: [...state.strokes, stroke] };
}

function clearCanvas(state, playerId) {
  if (state.status !== "drawing") return state;
  if (playerId !== state.drawerId) return state;
  return { ...state, strokes: [] };
}

function submitSketchGuess(state, playerId, text) {
  if (state.status !== "drawing") return state;
  if (playerId === state.drawerId) return state;
  if (state.correctGuessers.includes(playerId)) return state;

  const guess = String(text).trim().slice(0, 200);
  if (guess.length === 0) return state;

  const correct = guess.toLowerCase() === state.word.toLowerCase();

  const guesses = [...state.guesses, { playerId, text: guess, correct }];
  const correctGuessers = correct
    ? [...state.correctGuessers, playerId]
    : state.correctGuessers;

  let scores = state.scores;
  if (correct) {
    scores = new Map(state.scores);
    const points = Math.max(1, 4 - correctGuessers.length);
    scores.set(playerId, (scores.get(playerId) || 0) + points);
    scores.set(state.drawerId, (scores.get(state.drawerId) || 0) + 1);
  }

  return { ...state, guesses, correctGuessers, scores };
}

export function allSketchGuessersCorrect(state) {
  const guessers = state.playerIds.filter((id) => id !== state.drawerId);
  return guessers.length > 0 && guessers.every((id) => state.correctGuessers.includes(id));
}

export function tickSketch(state) {
  if (state.timer == null || state.timer <= 0) return state;
  return { ...state, timer: state.timer - 1 };
}

export function revealSketch(state) {
  const roundWinnerId = state.correctGuessers.length > 0 ? state.correctGuessers[0] : null;
  return { ...state, status: "reveal", timer: REVEAL_DURATION, roundWinnerId };
}

export function nextSketchRound(state) {
  const nextIndex = state.round % state.playerIds.length;
  const word = state.wordPool[state.round % state.wordPool.length];

  return {
    ...state,
    status: "drawing",
    drawerId: state.playerIds[nextIndex],
    word,
    strokes: [],
    guesses: [],
    correctGuessers: [],
    round: state.round + 1,
    timer: DRAW_DURATION,
    roundWinnerId: null,
  };
}

export function serializeSketch(state, forPlayerId) {
  const result = {
    gameType: "sketch",
    status: state.status,
    drawerId: state.drawerId,
    strokes: state.strokes,
    guesses: state.guesses,
    round: state.round,
    timer: state.timer,
    scores: Object.fromEntries(state.scores),
    wordLength: state.word.length,
    roundWinnerId: state.roundWinnerId,
  };

  if (forPlayerId === state.drawerId) {
    result.word = state.word;
  }

  if (state.status === "reveal") {
    result.word = state.word;
  }

  return result;
}
