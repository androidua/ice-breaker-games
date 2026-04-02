const AVAILABLE_GAMES = ["snake", "truths", "emoji", "sketch", "trivia", "typeracer", "wordchain", "bomber"];
const VOTING_DURATION = 30;

const GAME_LABELS = {
  snake: "Snake Arena",
  truths: "Two Truths & a Lie",
  emoji: "Emoji Storytelling",
  sketch: "Sketch & Guess",
  trivia: "Speed Trivia",
  typeracer: "Type Racer",
  wordchain: "Word Chain",
  bomber: "Bomber Arena",
};

export function createVotingState() {
  return {
    votes: new Map(),
    timer: VOTING_DURATION,
    availableGames: AVAILABLE_GAMES,
  };
}

export function submitVote(state, playerId, game) {
  if (!AVAILABLE_GAMES.includes(game)) return state;
  const votes = new Map(state.votes);
  votes.set(playerId, game);
  return { ...state, votes };
}

export function tickVoting(state) {
  if (state.timer <= 0) return state;
  return { ...state, timer: state.timer - 1 };
}

export function allVotesIn(state, playerCount) {
  return state.votes.size >= playerCount;
}

export function resolveVoting(state, rng) {
  const tallies = {};
  AVAILABLE_GAMES.forEach((g) => (tallies[g] = 0));
  state.votes.forEach((game) => {
    tallies[game] = (tallies[game] || 0) + 1;
  });

  const maxVotes = Math.max(...Object.values(tallies));
  const winners = Object.keys(tallies).filter((g) => tallies[g] === maxVotes);
  return winners[Math.floor(rng() * winners.length)];
}

export function serializeVoting(state) {
  const tallies = {};
  state.availableGames.forEach((g) => (tallies[g] = 0));
  state.votes.forEach((game) => {
    tallies[game] = (tallies[game] || 0) + 1;
  });
  return {
    timer: state.timer,
    availableGames: state.availableGames,
    gameLabels: GAME_LABELS,
    tallies,
    totalVotes: state.votes.size,
  };
}
