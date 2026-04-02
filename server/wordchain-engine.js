const TURN_DURATION = 10;
const REVEAL_DURATION = 4;

export function createWordChainState({ players, rng }) {
  const playerIds = players.map((p) => p.id);
  const scores = new Map();
  playerIds.forEach((id) => scores.set(id, 0));

  // Shuffle player order for fair turn assignment
  const order = fisherYates(playerIds, rng);

  return {
    gameType: "wordchain",
    status: "playing",
    playerIds,
    turnOrder: order,
    currentIndex: 0,
    currentPlayerId: order[0],
    currentWord: null,       // The last valid word played
    usedWords: new Set(),
    eliminated: new Set(),
    timer: TURN_DURATION,
    round: 1,
    roundWinnerId: null,
    lastEliminatedId: null,
    scores,
  };
}

function fisherYates(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function handleWordChainAction(state, playerId, action) {
  if (action.kind === "submit") {
    return submitWord(state, playerId, action.word);
  }
  return state;
}

function submitWord(state, playerId, word) {
  if (state.status !== "playing") return state;
  if (playerId !== state.currentPlayerId) return state;

  const w = String(word).trim().toLowerCase().replace(/[^a-z]/g, "");
  if (w.length === 0) return state;

  // Must start with last letter of current word (if there is one)
  if (state.currentWord !== null) {
    const lastLetter = state.currentWord[state.currentWord.length - 1];
    if (w[0] !== lastLetter) return { ...state, status: "invalid", invalidReason: "wrong_letter" };
  }

  // Can't reuse a word
  if (state.usedWords.has(w)) return { ...state, status: "invalid", invalidReason: "already_used" };

  // Valid word — award points, advance turn
  const usedWords = new Set(state.usedWords);
  usedWords.add(w);

  const scores = new Map(state.scores);
  scores.set(playerId, (scores.get(playerId) || 0) + 1);

  const { nextIndex, nextPlayerId } = advanceTurn(state);

  return {
    ...state,
    status: "playing",
    currentWord: w,
    usedWords,
    scores,
    currentIndex: nextIndex,
    currentPlayerId: nextPlayerId,
    timer: TURN_DURATION,
    invalidReason: null,
  };
}

function advanceTurn(state) {
  const active = state.turnOrder.filter((id) => !state.eliminated.has(id));
  const currentPos = active.indexOf(state.currentPlayerId);
  const nextPos = (currentPos + 1) % active.length;
  return { nextIndex: nextPos, nextPlayerId: active[nextPos] };
}

// Called when timer runs out on the current player's turn
export function eliminateCurrentPlayer(state) {
  const eliminated = new Set(state.eliminated);
  eliminated.add(state.currentPlayerId);
  const lastEliminatedId = state.currentPlayerId;

  const active = state.turnOrder.filter((id) => !eliminated.has(id));

  if (active.length <= 1) {
    const winnerId = active.length === 1 ? active[0] : null;
    const scores = new Map(state.scores);
    if (winnerId) scores.set(winnerId, (scores.get(winnerId) || 0) + 3); // bonus for winning
    return {
      ...state,
      status: "round_end",
      eliminated,
      lastEliminatedId,
      roundWinnerId: winnerId,
      scores,
      timer: REVEAL_DURATION,
    };
  }

  const nextPlayerId = active[state.currentIndex % active.length];
  return {
    ...state,
    status: "playing",
    eliminated,
    lastEliminatedId,
    currentPlayerId: nextPlayerId,
    timer: TURN_DURATION,
    invalidReason: null,
  };
}

export function nextWordChainRound(state, rng) {
  const order = fisherYates(state.playerIds, rng);
  const scores = new Map(state.scores);
  return {
    ...state,
    status: "playing",
    turnOrder: order,
    currentIndex: 0,
    currentPlayerId: order[0],
    currentWord: null,
    usedWords: new Set(),
    eliminated: new Set(),
    timer: TURN_DURATION,
    round: state.round + 1,
    roundWinnerId: null,
    lastEliminatedId: null,
    invalidReason: null,
    scores,
  };
}

export function tickWordChain(state) {
  if (state.timer == null || state.timer <= 0) return state;
  return { ...state, timer: state.timer - 1 };
}

export function serializeWordChain(state) {
  return {
    gameType: "wordchain",
    status: state.status,
    currentPlayerId: state.currentPlayerId,
    currentWord: state.currentWord,
    usedWords: [...state.usedWords],
    eliminated: [...state.eliminated],
    timer: state.timer,
    round: state.round,
    roundWinnerId: state.roundWinnerId,
    lastEliminatedId: state.lastEliminatedId,
    invalidReason: state.invalidReason || null,
    scores: Object.fromEntries(state.scores),
  };
}
