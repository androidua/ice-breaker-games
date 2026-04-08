const COMPOSE_DURATION = 45;
const REVEAL_DURATION = 6;

const PROMPTS_RAW = [
  // Movies
  { text: "Jurassic Park", category: "Movie" },
  { text: "Star Wars", category: "Movie" },
  { text: "Titanic", category: "Movie" },
  { text: "The Lion King", category: "Movie" },
  { text: "Finding Nemo", category: "Movie" },
  { text: "Frozen", category: "Movie" },
  { text: "The Matrix", category: "Movie" },
  { text: "Toy Story", category: "Movie" },
  { text: "Jaws", category: "Movie" },
  { text: "Harry Potter", category: "Movie" },
  { text: "Spider-Man", category: "Movie" },
  { text: "Up", category: "Movie" },
  { text: "Ghostbusters", category: "Movie" },
  { text: "Home Alone", category: "Movie" },
  { text: "Back to the Future", category: "Movie" },
  { text: "The Avengers", category: "Movie" },
  { text: "The Godfather", category: "Movie" },
  { text: "Pirates of the Caribbean", category: "Movie" },
  { text: "Beauty and the Beast", category: "Movie" },
  { text: "Shrek", category: "Movie" },
  { text: "Moana", category: "Movie" },
  { text: "Ice Age", category: "Movie" },
  { text: "Kung Fu Panda", category: "Movie" },
  { text: "Aladdin", category: "Movie" },
  { text: "Cinderella", category: "Movie" },
  { text: "Zootopia", category: "Movie" },
  { text: "The Incredibles", category: "Movie" },
  { text: "Monsters Inc", category: "Movie" },
  { text: "Ratatouille", category: "Movie" },
  { text: "WALL-E", category: "Movie" },
  { text: "Coco", category: "Movie" },
  { text: "Interstellar", category: "Movie" },
  { text: "The Jungle Book", category: "Movie" },
  { text: "Forrest Gump", category: "Movie" },
  { text: "The Dark Knight", category: "Movie" },
  { text: "Gladiator", category: "Movie" },
  { text: "ET", category: "Movie" },
  { text: "The Wizard of Oz", category: "Movie" },
  { text: "Top Gun", category: "Movie" },
  { text: "Men in Black", category: "Movie" },
  { text: "The Truman Show", category: "Movie" },
  { text: "Soul", category: "Movie" },
  { text: "Black Panther", category: "Movie" },
  { text: "Encanto", category: "Movie" },
  { text: "Brave", category: "Movie" },
  { text: "Minions", category: "Movie" },
  { text: "The Little Mermaid", category: "Movie" },
  { text: "Inside Out", category: "Movie" },
  // TV Shows
  { text: "Breaking Bad", category: "TV Show" },
  { text: "The Office", category: "TV Show" },
  { text: "Friends", category: "TV Show" },
  { text: "Squid Game", category: "TV Show" },
  { text: "Stranger Things", category: "TV Show" },
  { text: "Game of Thrones", category: "TV Show" },
  { text: "The Simpsons", category: "TV Show" },
  { text: "Seinfeld", category: "TV Show" },
  { text: "South Park", category: "TV Show" },
  { text: "Black Mirror", category: "TV Show" },
  { text: "Sherlock", category: "TV Show" },
  { text: "Succession", category: "TV Show" },
  { text: "Ted Lasso", category: "TV Show" },
  { text: "The Mandalorian", category: "TV Show" },
  { text: "Rick and Morty", category: "TV Show" },
  { text: "Brooklyn Nine-Nine", category: "TV Show" },
  { text: "Parks and Recreation", category: "TV Show" },
  { text: "Peaky Blinders", category: "TV Show" },
  { text: "Avatar The Last Airbender", category: "TV Show" },
  { text: "The Crown", category: "TV Show" },
  // Events
  { text: "Moon Landing", category: "Event" },
  { text: "Olympic Games", category: "Event" },
  { text: "World Cup Final", category: "Event" },
  { text: "New Years Eve", category: "Event" },
  { text: "Wedding Day", category: "Event" },
  { text: "Graduation Day", category: "Event" },
  { text: "Rock Concert", category: "Event" },
  { text: "Halloween Night", category: "Event" },
  { text: "Super Bowl", category: "Event" },
  { text: "Solar Eclipse", category: "Event" },
  { text: "Music Festival", category: "Event" },
  { text: "Award Ceremony", category: "Event" },
  { text: "Talent Show", category: "Event" },
  { text: "April Fools Day", category: "Event" },
  { text: "Easter Egg Hunt", category: "Event" },
  { text: "Bonfire Night", category: "Event" },
  { text: "Grand Prix", category: "Event" },
  { text: "Street Parade", category: "Event" },
  // Phrases & Activities
  { text: "Birthday Party", category: "Phrase" },
  { text: "Road Trip", category: "Phrase" },
  { text: "Broken Heart", category: "Phrase" },
  { text: "Under the Weather", category: "Phrase" },
  { text: "Piece of Cake", category: "Phrase" },
  { text: "Night Owl", category: "Phrase" },
  { text: "Brain Freeze", category: "Phrase" },
  { text: "Cold Feet", category: "Phrase" },
  { text: "Roller Coaster", category: "Phrase" },
  { text: "Treasure Hunt", category: "Phrase" },
  { text: "Camping Trip", category: "Phrase" },
  { text: "Hot Dog", category: "Phrase" },
  { text: "Cat Nap", category: "Phrase" },
  { text: "Couch Potato", category: "Phrase" },
  { text: "Movie Night", category: "Phrase" },
  { text: "Beach Volleyball", category: "Phrase" },
  { text: "Time Travel", category: "Phrase" },
  { text: "Ghost Story", category: "Phrase" },
  { text: "Wild West", category: "Phrase" },
  { text: "Space Station", category: "Phrase" },
  { text: "Fire Drill", category: "Phrase" },
  { text: "Black Friday", category: "Phrase" },
  { text: "Coffee Break", category: "Phrase" },
  { text: "Ice Cream Truck", category: "Phrase" },
  { text: "Thunderstorm", category: "Phrase" },
  { text: "Treasure Island", category: "Phrase" },
  { text: "Fast Food", category: "Phrase" },
  { text: "Game Night", category: "Phrase" },
  { text: "Spring Cleaning", category: "Phrase" },
  { text: "Power Outage", category: "Phrase" },
  { text: "Sunday Brunch", category: "Phrase" },
  { text: "Sweet Dreams", category: "Phrase" },
  { text: "Love at First Sight", category: "Phrase" },
  { text: "Early Bird", category: "Phrase" },
  { text: "Monkey Business", category: "Phrase" },
  { text: "Shark Attack", category: "Phrase" },
  { text: "Rocket Launch", category: "Phrase" },
  { text: "Magic Trick", category: "Phrase" },
  { text: "Snowball Fight", category: "Phrase" },
  { text: "Paper Plane", category: "Phrase" },
  { text: "Wedding Cake", category: "Phrase" },
  { text: "Hot Air Balloon", category: "Phrase" },
  { text: "Junk Food", category: "Phrase" },
  { text: "Star Gazing", category: "Phrase" },
  { text: "Deep Sea", category: "Phrase" },
  { text: "Dragon Slayer", category: "Phrase" },
  { text: "Belly Flop", category: "Phrase" },
  { text: "Silver Lining", category: "Phrase" },
  { text: "Bite the Bullet", category: "Phrase" },
  { text: "Burning Midnight Oil", category: "Phrase" },
  { text: "Catch of the Day", category: "Phrase" },
  { text: "Double Trouble", category: "Phrase" },
  { text: "Full Moon", category: "Phrase" },
  { text: "Happy Hour", category: "Phrase" },
  { text: "Island Getaway", category: "Phrase" },
  { text: "Jet Lag", category: "Phrase" },
  { text: "Money Talks", category: "Phrase" },
  { text: "Pit Stop", category: "Phrase" },
  { text: "Quicksand", category: "Phrase" },
  { text: "Rain Dance", category: "Phrase" },
  { text: "Thunder and Lightning", category: "Phrase" },
  { text: "Underwater World", category: "Phrase" },
  { text: "Yellow Brick Road", category: "Phrase" },
  { text: "Zombie Apocalypse", category: "Phrase" },
  { text: "Cabin Fever", category: "Phrase" },
  { text: "Dead End", category: "Phrase" },
  { text: "Flash Mob", category: "Phrase" },
  { text: "Golden Ticket", category: "Phrase" },
  { text: "Haunted House", category: "Phrase" },
  { text: "Ice Fishing", category: "Phrase" },
  { text: "Jungle Gym", category: "Phrase" },
  { text: "Rush Hour", category: "Phrase" },
  { text: "Speed Bump", category: "Phrase" },
  { text: "Traffic Jam", category: "Phrase" },
  { text: "Urban Jungle", category: "Phrase" },
  { text: "Vending Machine", category: "Phrase" },
  { text: "X Marks the Spot", category: "Phrase" },
];

const EXTRA_PROMPTS = [
  // Movies
  { text: "Inception", category: "Movie" },
  { text: "The Prestige", category: "Movie" },
  { text: "The Social Network", category: "Movie" },
  { text: "Mad Max Fury Road", category: "Movie" },
  { text: "The Grand Budapest Hotel", category: "Movie" },
  { text: "Whiplash", category: "Movie" },
  { text: "La La Land", category: "Movie" },
  { text: "Blade Runner", category: "Movie" },
  { text: "Avatar", category: "Movie" },
  { text: "The Martian", category: "Movie" },
  { text: "Mission Impossible", category: "Movie" },
  { text: "The Lego Movie", category: "Movie" },
  { text: "How to Train Your Dragon", category: "Movie" },
  { text: "Kung Fu Hustle", category: "Movie" },
  { text: "The Princess Bride", category: "Movie" },
  { text: "The Nightmare Before Christmas", category: "Movie" },

  // TV Shows
  { text: "The Last of Us", category: "TV Show" },
  { text: "Wednesday", category: "TV Show" },
  { text: "The Bear", category: "TV Show" },
  { text: "The Boys", category: "TV Show" },
  { text: "House of the Dragon", category: "TV Show" },
  { text: "Only Murders in the Building", category: "TV Show" },
  { text: "The Queen's Gambit", category: "TV Show" },
  { text: "The Witcher", category: "TV Show" },
  { text: "Westworld", category: "TV Show" },
  { text: "The Big Bang Theory", category: "TV Show" },
  { text: "How I Met Your Mother", category: "TV Show" },
  { text: "The X-Files", category: "TV Show" },

  // Events
  { text: "Science Fair", category: "Event" },
  { text: "Book Launch", category: "Event" },
  { text: "Hackathon", category: "Event" },
  { text: "Charity Run", category: "Event" },
  { text: "Talent Competition", category: "Event" },
  { text: "School Reunion", category: "Event" },
  { text: "Camping Weekend", category: "Event" },
  { text: "Beach Cleanup", category: "Event" },
  { text: "Food Festival", category: "Event" },
  { text: "Art Exhibition", category: "Event" },
  { text: "Movie Premiere", category: "Event" },
  { text: "Garden Party", category: "Event" },

  // Phrases
  { text: "Midnight Snack", category: "Phrase" },
  { text: "Pocket Rocket", category: "Phrase" },
  { text: "Lucky Charm", category: "Phrase" },
  { text: "Brainstorm", category: "Phrase" },
  { text: "Happy Camper", category: "Phrase" },
  { text: "Cloud Nine", category: "Phrase" },
  { text: "Secret Mission", category: "Phrase" },
  { text: "Fast Lane", category: "Phrase" },
  { text: "Frozen Lake", category: "Phrase" },
  { text: "Treasure Map", category: "Phrase" },
  { text: "Rocket Science", category: "Phrase" },
  { text: "Magic Carpet", category: "Phrase" },
  { text: "Lost and Found", category: "Phrase" },
  { text: "Midday Nap", category: "Phrase" },
  { text: "Open Secret", category: "Phrase" },
  { text: "Dream Team", category: "Phrase" },
  { text: "Roadside Diner", category: "Phrase" },
  { text: "Moonlight Walk", category: "Phrase" },
  { text: "Snow Day", category: "Phrase" },
  { text: "Fire and Ice", category: "Phrase" },
  { text: "Treasure Chest", category: "Phrase" },
  { text: "Golden Hour", category: "Phrase" },
  { text: "Late Checkout", category: "Phrase" },
  { text: "Sunset Cruise", category: "Phrase" },
  { text: "Pop Quiz", category: "Phrase" },
  { text: "Top Secret", category: "Phrase" },
  { text: "Picture Perfect", category: "Phrase" },
  { text: "Weekend Getaway", category: "Phrase" },
  { text: "Night Shift", category: "Phrase" },
  { text: "Rain Check", category: "Phrase" },
  { text: "Power Nap", category: "Phrase" },
  { text: "Sweet Tooth", category: "Phrase" },
  { text: "Wild Card", category: "Phrase" },
  { text: "Lucky Break", category: "Phrase" },
  { text: "Quiet Storm", category: "Phrase" },
  { text: "Open Road", category: "Phrase" },
  { text: "Final Countdown", category: "Phrase" },
  { text: "Slam Dunk", category: "Phrase" },
  { text: "Green Light", category: "Phrase" },
  { text: "Blue Moon", category: "Phrase" },
  { text: "Cold Start", category: "Phrase" },
  { text: "Heat Wave", category: "Phrase" },
  { text: "Double Shift", category: "Phrase" },
  { text: "Fast Track", category: "Phrase" },
  { text: "Merry Go Round", category: "Phrase" },
  { text: "Light Bulb Moment", category: "Phrase" },
  { text: "Mountain Trail", category: "Phrase" },
  { text: "Summer Camp", category: "Phrase" },
  { text: "Early Checkout", category: "Phrase" },
  { text: "Treasure Dive", category: "Phrase" },
  { text: "Ocean Breeze", category: "Phrase" },
  { text: "Backstage Pass", category: "Phrase" },
  { text: "Screen Time", category: "Phrase" },
  { text: "Moon Mission", category: "Phrase" },
  { text: "Fountain Pen", category: "Phrase" },
  { text: "Busy Bee", category: "Phrase" },
  { text: "Fresh Start", category: "Phrase" },
  { text: "Night Market", category: "Phrase" },
  { text: "Party Animal", category: "Phrase" },
];

function normalizePrompt(text) {
  return String(text).trim().toLowerCase().replace(/\s+/g, " ");
}

function isValidPrompt(prompt) {
  if (!prompt || typeof prompt.text !== "string" || typeof prompt.category !== "string") return false;
  const text = prompt.text.trim();
  const category = prompt.category.trim();
  if (!text || text.length < 3 || text.length > 60) return false;
  if (!category || category.length > 24) return false;
  return true;
}

function buildPromptBank() {
  const bank = [];
  const seen = new Set();

  const add = (prompt) => {
    if (!isValidPrompt(prompt)) return;
    const clean = { text: prompt.text.trim(), category: prompt.category.trim() };
    const key = normalizePrompt(clean.text);
    if (seen.has(key)) return;
    seen.add(key);
    bank.push(clean);
  };

  PROMPTS_RAW.forEach(add);
  EXTRA_PROMPTS.forEach(add);
  return bank;
}

const PROMPTS = buildPromptBank();

function getGuessLimit(playerCount) {
  return playerCount === 2 ? 5 : 3;
}

function initGuessAttempts(playerIds, storytellerId) {
  const map = new Map();
  playerIds.forEach((id) => { if (id !== storytellerId) map.set(id, 0); });
  return map;
}

export function createEmojiState({ players, rng }) {
  const playerIds = players.map((p) => p.id);
  const scores = new Map();
  playerIds.forEach((id) => scores.set(id, 0));

  const shuffledPrompts = [...PROMPTS].sort(() => rng() - 0.5);

  // Shuffle player order so the first storyteller is random.
  const shuffledPlayers = [...playerIds].sort(() => rng() - 0.5);
  const firstStoryteller = shuffledPlayers[0];
  const turnQueue = shuffledPlayers.slice(1);

  return {
    gameType: "emoji",
    status: "composing",
    playerIds,
    storytellerId: firstStoryteller,
    turnQueue,
    prompt: shuffledPrompts[0],
    emojis: null,
    guesses: [],
    correctGuessers: [],
    guessAttempts: initGuessAttempts(playerIds, firstStoryteller),
    scores,
    round: 1,
    timer: COMPOSE_DURATION,
    promptPool: shuffledPrompts,
    promptIndex: 0,
    roundWinnerId: null,
  };
}

export function handleEmojiAction(state, playerId, action) {
  switch (action.kind) {
    case "submitEmojis":
      return submitEmojis(state, playerId, action.emojis);
    case "guess":
      return submitEmojiGuess(state, playerId, action.text);
    default:
      return state;
  }
}

function submitEmojis(state, playerId, emojis) {
  if (state.status !== "composing") return state;
  if (playerId !== state.storytellerId) return state;

  const cleaned = String(emojis).trim().slice(0, 30);
  if (cleaned.length === 0) return state;

  return {
    ...state,
    status: "guessing",
    emojis: cleaned,
    guesses: [],
    correctGuessers: [],
    timer: null,
  };
}

function submitEmojiGuess(state, playerId, text) {
  if (state.status !== "guessing") return state;
  if (playerId === state.storytellerId) return state;
  if (state.correctGuessers.includes(playerId)) return state;

  const limit = getGuessLimit(state.playerIds.length);
  if ((state.guessAttempts.get(playerId) || 0) >= limit) return state;

  const guess = String(text).trim().slice(0, 200);
  if (guess.length === 0) return state;

  const answer = state.prompt.text.toLowerCase();
  const correct = guess.toLowerCase().includes(answer) || answer.includes(guess.toLowerCase());

  const guesses = [...state.guesses, { playerId, text: guess, correct }];
  const correctGuessers = correct
    ? [...state.correctGuessers, playerId]
    : state.correctGuessers;

  const guessAttempts = new Map(state.guessAttempts);
  guessAttempts.set(playerId, (guessAttempts.get(playerId) || 0) + 1);

  let scores = state.scores;
  if (correct) {
    scores = new Map(state.scores);
    const points = Math.max(1, 4 - correctGuessers.length);
    scores.set(playerId, (scores.get(playerId) || 0) + points);
    scores.set(state.storytellerId, (scores.get(state.storytellerId) || 0) + 1);
  }

  return { ...state, guesses, correctGuessers, guessAttempts, scores };
}

export function allEmojiGuessersCorrect(state) {
  const guessers = state.playerIds.filter((id) => id !== state.storytellerId);
  return guessers.length > 0 && guessers.every((id) => state.correctGuessers.includes(id));
}

export function allEmojiGuessersExhausted(state) {
  const limit = getGuessLimit(state.playerIds.length);
  const guessers = state.playerIds.filter((id) => id !== state.storytellerId);
  return guessers.length > 0 && guessers.every(
    (id) => state.correctGuessers.includes(id) || (state.guessAttempts.get(id) || 0) >= limit
  );
}

export function tickEmoji(state) {
  if (state.timer == null || state.timer <= 0) return state;
  return { ...state, timer: state.timer - 1 };
}

export function revealEmoji(state) {
  const roundWinnerId = state.correctGuessers.length > 0 ? state.correctGuessers[0] : null;
  return { ...state, status: "reveal", timer: REVEAL_DURATION, roundWinnerId };
}

export function nextEmojiRound(state, rng) {
  // Advance through the shuffled queue; reshuffle when it empties.
  let queue = state.turnQueue || [];
  let nextStoryteller;
  if (queue.length > 0) {
    [nextStoryteller, ...queue] = queue;
  } else {
    const shuffled = [...state.playerIds].sort(() => rng() - 0.5);
    [nextStoryteller, ...queue] = shuffled;
  }

  const promptIndex = state.round % state.promptPool.length;

  return {
    ...state,
    status: "composing",
    storytellerId: nextStoryteller,
    turnQueue: queue,
    prompt: state.promptPool[promptIndex],
    emojis: null,
    guesses: [],
    correctGuessers: [],
    guessAttempts: initGuessAttempts(state.playerIds, nextStoryteller),
    round: state.round + 1,
    timer: COMPOSE_DURATION,
    promptIndex,
    roundWinnerId: null,
  };
}

export function serializeEmoji(state, forPlayerId) {
  const limit = getGuessLimit(state.playerIds.length);
  const result = {
    gameType: "emoji",
    status: state.status,
    storytellerId: state.storytellerId,
    emojis: state.emojis,
    guesses: state.guesses,
    round: state.round,
    timer: state.timer,
    scores: Object.fromEntries(state.scores),
    promptCategory: state.prompt?.category || null,
    roundWinnerId: state.roundWinnerId,
    guessLimit: limit,
    triesLeft: forPlayerId !== state.storytellerId
      ? Math.max(0, limit - (state.guessAttempts.get(forPlayerId) || 0))
      : null,
  };

  if (forPlayerId === state.storytellerId) {
    result.prompt = state.prompt;
  }

  if (state.status === "reveal") {
    result.answer = state.prompt.text;
  }

  // On the last guess, reveal the first letter of each word as a hint
  if (result.triesLeft === 1 && state.prompt?.text) {
    result.hint = state.prompt.text
      .split(" ")
      .map((word) => word[0].toUpperCase() + "_".repeat(word.length - 1))
      .join("  ");
  }

  return result;
}
