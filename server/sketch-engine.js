const DRAW_DURATION = 45;
const REVEAL_DURATION = 6;

const WORDS = [
  // Animals
  "cat", "dog", "fish", "penguin", "dragon", "dinosaur", "butterfly",
  "elephant", "giraffe", "octopus", "shark", "whale", "spider", "turtle",
  "parrot", "jellyfish", "flamingo", "kangaroo", "gorilla", "snail",
  "crocodile", "eagle", "owl", "fox", "wolf", "bear", "panda", "koala",
  "dolphin", "seal", "crab", "lobster", "squid", "frog", "chameleon",
  "peacock", "toucan", "hummingbird", "sloth", "platypus", "armadillo",
  "hedgehog", "zebra", "hippo", "rhino", "camel", "llama", "alpaca",
  "raccoon", "skunk", "otter", "walrus", "narwhal", "axolotl",
  // Food & Drink
  "pizza", "hamburger", "ice cream", "sushi", "taco", "popcorn",
  "birthday cake", "donut", "pancake", "watermelon", "banana", "cupcake",
  "hot dog", "cookie", "lollipop", "coffee",
  "french fries", "burrito", "ramen", "waffle", "croissant", "pretzel",
  "cotton candy", "macaroni", "spaghetti", "dumpling", "sushi roll",
  "milkshake", "smoothie", "boba tea", "cocktail", "lemon", "pineapple",
  "avocado", "broccoli", "carrot", "mushroom", "corn on the cob",
  "grilled cheese", "nachos", "spring roll", "kebab", "fried egg",
  // Nature & Weather
  "tree", "flower", "mountain", "volcano", "waterfall", "cactus",
  "rainbow", "tornado", "lightning", "sunrise", "snowflake", "island",
  "campfire", "mushroom", "palm tree", "coral reef",
  "glacier", "desert", "cave", "swamp", "cliff", "hot spring",
  "tsunami", "avalanche", "blizzard", "hailstorm", "fog", "aurora",
  "tidal wave", "sand dune", "mangrove", "geyser", "oasis", "crater",
  "bamboo", "fern", "bonsai", "seaweed", "tumbleweed", "vine",
  // Transport & Machines
  "car", "airplane", "bicycle", "submarine", "rocket", "helicopter",
  "train", "sailboat", "skateboard", "hot air balloon", "tractor",
  "spaceship", "motorcycle", "fire truck",
  "tank", "canoe", "kayak", "gondola", "blimp", "jet ski",
  "bulldozer", "crane", "forklift", "ambulance", "police car",
  "hovercraft", "monorail", "cable car", "food truck", "rickshaw",
  // Buildings & Places
  "house", "castle", "lighthouse", "igloo", "pyramid", "skyscraper",
  "bridge", "windmill", "tent", "treehouse", "church", "stadium",
  "library", "museum", "aquarium", "zoo", "carnival", "harbour",
  "airport", "train station", "shopping mall", "hospital", "school",
  "prison", "barn", "cabin", "bunker", "spaceship hangar",
  "colosseum", "eiffel tower", "great wall", "taj mahal",
  // Objects
  "guitar", "robot", "umbrella", "camera", "telescope", "anchor",
  "treasure chest", "key", "clock", "crown", "sword", "diamond",
  "microphone", "backpack", "laptop", "candle", "ladder", "magnifying glass",
  "drum", "trophy",
  "compass", "lantern", "hourglass", "binoculars", "walkie talkie",
  "yo-yo", "kite", "boomerang", "catapult", "crystal ball",
  "safe", "zipline", "jackhammer", "periscope", "megaphone",
  "parachute", "slingshot", "grappling hook", "lock and chain",
  "fire extinguisher", "toolbox", "globe", "dartboard",
  "magic wand", "spell book", "potion", "shield",
  // People & Characters
  "astronaut", "pirate", "wizard", "ninja", "mermaid", "clown",
  "cowboy", "superhero", "ghost", "scarecrow", "angel",
  "vampire", "zombie", "fairy", "knight", "samurai", "viking",
  "detective", "chef", "firefighter", "surgeon", "scientist",
  "ballerina", "boxer", "surfer", "skier", "marathon runner",
  "circus performer", "street artist", "lifeguard",
  // Activities & Scenes
  "fireworks", "snowman", "fishing", "surfing", "roller coaster",
  "parachute", "bowling", "diving", "trampoline", "wrestling",
  "rock climbing", "bungee jumping", "kayaking", "ice skating",
  "water skiing", "hang gliding", "archery", "fencing", "gymnastics",
  "tug of war", "pillow fight", "treasure hunt", "campfire stories",
  "sand castle", "kite flying", "stargazing", "mud run",
  // Sports & Games
  "tennis", "football", "basketball", "baseball", "golf",
  "volleyball", "cricket", "rugby", "polo", "fencing",
  "chess", "poker", "darts", "ping pong", "billiards",
  "arm wrestling", "limbo", "tug of war", "relay race", "marathon",
  // Emotions & Abstract
  "surprise", "boredom", "excitement", "jealousy", "confusion",
  "daydream", "panic", "laughter", "loneliness", "pride",
  "friendship", "courage", "patience", "curiosity",
  // Pop Culture & Modern
  "selfie", "podcast", "streaming", "unboxing", "food truck",
  "influencer", "meme", "viral video", "drive-through",
  "flash mob", "escape room", "virtual reality",
  "photo bomb", "live stream", "crowdfunding",
];

function fisherYates(arr, rng) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function createSketchState({ players, rng }) {
  const playerIds = players.map((p) => p.id);
  const scores = new Map();
  playerIds.forEach((id) => scores.set(id, 0));

  const shuffledWords = fisherYates(WORDS, rng);

  // Shuffle player order so the first drawer is random.
  const shuffledPlayers = fisherYates(playerIds, rng);
  const firstDrawer = shuffledPlayers[0];
  const turnQueue = shuffledPlayers.slice(1);

  return {
    gameType: "sketch",
    status: "drawing",
    playerIds,
    drawerId: firstDrawer,
    turnQueue,
    word: shuffledWords[0],
    strokes: [],
    guesses: [],
    correctGuessers: [],
    scores,
    round: 1,
    timer: DRAW_DURATION,
    wordPool: shuffledWords,
    poolIndex: 1,
    roundWinnerId: null,
    revealIn: null,
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
  // Round already won — ignore late guesses
  if (state.roundWinnerId !== null) return state;

  const guess = String(text).trim().slice(0, 200);
  if (guess.length === 0) return state;

  const correct = guess.toLowerCase() === state.word.toLowerCase();

  const guesses = [...state.guesses, { playerId, text: guess, correct }];
  const correctGuessers = correct
    ? [...state.correctGuessers, playerId]
    : state.correctGuessers;

  let scores = state.scores;
  let roundWinnerId = state.roundWinnerId;
  let revealIn = state.revealIn;

  if (correct) {
    // First correct guesser wins — award exactly 1 point and start countdown
    scores = new Map(state.scores);
    scores.set(playerId, (scores.get(playerId) || 0) + 1);
    roundWinnerId = playerId;
    revealIn = 3;
  }

  return { ...state, guesses, correctGuessers, scores, roundWinnerId, revealIn };
}

export function allSketchGuessersCorrect(state) {
  const guessers = state.playerIds.filter((id) => id !== state.drawerId);
  return guessers.length > 0 && guessers.every((id) => state.correctGuessers.includes(id));
}

export function tickSketch(state) {
  if (state.timer == null || state.timer <= 0) return state;
  const newTimer = state.timer - 1;
  // If revealIn countdown is active, decrement it too
  const newRevealIn = state.revealIn != null && state.revealIn > 0
    ? state.revealIn - 1
    : state.revealIn;
  return { ...state, timer: newTimer, revealIn: newRevealIn };
}

export function revealSketch(state) {
  // roundWinnerId is already set by submitSketchGuess (first correct guesser).
  // If time ran out with no correct guess, roundWinnerId remains null.
  return { ...state, status: "reveal", timer: REVEAL_DURATION, revealIn: null };
}

export function nextSketchRound(state, rng) {
  // Advance through the shuffled queue; reshuffle when it empties.
  let queue = state.turnQueue || [];
  let nextDrawer;
  if (queue.length > 0) {
    [nextDrawer, ...queue] = queue;
  } else {
    const shuffled = fisherYates(state.playerIds, rng);
    [nextDrawer, ...queue] = shuffled;
  }

  let wordPool = state.wordPool;
  let poolIndex = state.poolIndex ?? 1;
  if (poolIndex >= wordPool.length) {
    wordPool = fisherYates(WORDS, rng);
    poolIndex = 0;
  }
  const word = wordPool[poolIndex];

  return {
    ...state,
    status: "drawing",
    drawerId: nextDrawer,
    turnQueue: queue,
    word,
    wordPool,
    poolIndex: poolIndex + 1,
    strokes: [],
    guesses: [],
    correctGuessers: [],
    round: state.round + 1,
    timer: DRAW_DURATION,
    roundWinnerId: null,
    revealIn: null,
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
    revealIn: state.revealIn,
  };

  if (forPlayerId === state.drawerId) {
    result.word = state.word;
  }

  if (state.status === "reveal") {
    result.word = state.word;
  }

  return result;
}
