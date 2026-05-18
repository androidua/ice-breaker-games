const SUBMIT_DURATION = 60;
const VOTE_DURATION = 30;
const REVEAL_DURATION = 8;

// Shuffle playerIds and return the first player plus the remaining queue.
// When the queue runs out, a new shuffled cycle begins automatically.
function buildTurnQueue(playerIds, rng) {
  const shuffled = [...playerIds].sort(() => rng() - 0.5);
  return { firstId: shuffled[0], queue: shuffled.slice(1) };
}

export function createTruthsState({ players, rng }) {
  const playerIds = players.map((p) => p.id);
  const scores = new Map();
  playerIds.forEach((id) => scores.set(id, 0));

  const { firstId, queue } = buildTurnQueue(playerIds, rng);

  return {
    gameType: "truths",
    status: "submitting",
    playerIds,
    presenterId: firstId,
    turnQueue: queue,
    statements: null,
    lieIndex: null,
    votes: new Map(),
    scores,
    round: 1,
    timer: SUBMIT_DURATION,
    roundWinnerId: null,
  };
}

export function handleTruthsAction(state, playerId, action) {
  switch (action.kind) {
    case "submitStatements":
      return submitStatements(state, playerId, action.statements, action.lieIndex);
    case "vote":
      return submitTruthsVote(state, playerId, action.index);
    default:
      return state;
  }
}

function submitStatements(state, playerId, statements, lieIndex) {
  if (state.status !== "submitting") return state;
  if (playerId !== state.presenterId) return state;
  if (!Array.isArray(statements) || statements.length !== 3) return state;
  if (typeof lieIndex !== "number" || lieIndex < 0 || lieIndex > 2) return state;

  const cleaned = statements.map((s) => String(s).trim().slice(0, 200));
  if (cleaned.some((s) => s.length === 0)) return state;

  return {
    ...state,
    status: "voting",
    statements: cleaned,
    lieIndex,
    votes: new Map(),
    timer: VOTE_DURATION,
  };
}

function submitTruthsVote(state, playerId, index) {
  if (state.status !== "voting") return state;
  if (playerId === state.presenterId) return state;
  if (typeof index !== "number" || index < 0 || index > 2) return state;
  if (state.votes.has(playerId)) return state;

  const votes = new Map(state.votes);
  votes.set(playerId, index);
  return { ...state, votes };
}

export function allTruthsVotesIn(state) {
  const voterCount = state.playerIds.filter((id) => id !== state.presenterId).length;
  return voterCount > 0 && state.votes.size >= voterCount;
}

export function revealTruths(state) {
  const scores = new Map(state.scores);
  const gains = new Map();
  state.playerIds.forEach((id) => gains.set(id, 0));

  state.votes.forEach((votedIndex, playerId) => {
    if (votedIndex === state.lieIndex) {
      scores.set(playerId, (scores.get(playerId) || 0) + 1);
      gains.set(playerId, (gains.get(playerId) || 0) + 1);
    } else {
      scores.set(state.presenterId, (scores.get(state.presenterId) || 0) + 1);
      gains.set(state.presenterId, (gains.get(state.presenterId) || 0) + 1);
    }
  });

  let maxGain = 0;
  let roundWinnerId = null;
  gains.forEach((gain, id) => {
    if (gain > maxGain) {
      maxGain = gain;
      roundWinnerId = id;
    }
  });

  return { ...state, status: "reveal", scores, timer: REVEAL_DURATION, roundWinnerId };
}

export function nextTruthsRound(state, rng) {
  // Advance through the shuffled queue; reshuffle when it empties.
  let queue = state.turnQueue || [];
  let nextId;
  if (queue.length > 0) {
    [nextId, ...queue] = queue;
  } else {
    const shuffled = [...state.playerIds].sort(() => rng() - 0.5);
    [nextId, ...queue] = shuffled;
  }

  return {
    ...state,
    status: "submitting",
    presenterId: nextId,
    turnQueue: queue,
    statements: null,
    lieIndex: null,
    votes: new Map(),
    round: state.round + 1,
    timer: SUBMIT_DURATION,
    roundWinnerId: null,
  };
}

export function tickTruths(state) {
  if (state.timer == null || state.timer <= 0) return state;
  return { ...state, timer: state.timer - 1 };
}

export function serializeTruths(state) {
  const result = {
    gameType: "truths",
    status: state.status,
    presenterId: state.presenterId,
    statements: state.statements,
    round: state.round,
    timer: state.timer,
    scores: Object.fromEntries(state.scores),
    voteCount: state.votes.size,
    voterCount: state.playerIds.filter((id) => id !== state.presenterId).length,
    roundWinnerId: state.roundWinnerId,
  };

  if (state.status === "reveal") {
    result.lieIndex = state.lieIndex;
    result.votes = Object.fromEntries(state.votes);
  }

  return result;
}
