const VOTE_DURATION = 15;
const REVEAL_DURATION = 5;
const TARGET_PROMPT_COUNT = 700;

function normalizePrompt(prompt) {
  return String(prompt).trim().toLowerCase().replace(/[.!?]+$/g, "");
}

function isValidPrompt(prompt) {
  if (!prompt) return false;
  const trimmed = prompt.trim();
  if (trimmed.length < 12 || trimmed.length > 140) return false;
  if (!/[a-zA-Z]/.test(trimmed)) return false;
  if (!/[.!?]$/.test(trimmed)) return false;
  if (/\b(undefined|null|n\/a|todo)\b/i.test(trimmed)) return false;
  return true;
}

function buildPromptBank() {
  const prompts = [];
  const seen = new Set();

  const add = (text) => {
    const raw = String(text || "").trim();
    if (!raw) return;
    const prompt = /[.!?]$/.test(raw) ? raw : `${raw}.`;
    if (!isValidPrompt(prompt)) return;
    const key = normalizePrompt(prompt);
    if (seen.has(key)) return;
    seen.add(key);
    prompts.push(prompt);
  };

  const comparisonBuckets = [
    ["Coffee", "Tea", "Hot chocolate", "Iced coffee", "Sparkling water", "Smoothies", "Fresh juice", "Milkshakes"],
    ["Pancakes", "Waffles", "French toast", "Bagels", "Breakfast burritos", "Omelets", "Breakfast sandwiches", "Granola bowls"],
    ["Pizza", "Burgers", "Tacos", "Sushi", "Pasta", "Ramen", "Fried chicken", "Burritos"],
    ["Fries", "Onion rings", "Mozzarella sticks", "Nachos", "Garlic bread", "Loaded potato wedges", "Dumplings", "Spring rolls"],
    ["Chocolate", "Vanilla", "Strawberry", "Caramel", "Mint chip", "Cookies and cream", "Salted caramel", "Coffee ice cream"],
    ["Cats", "Dogs", "Rabbits", "Hamsters", "Parrots", "Fish", "Turtles", "Geckos"],
    ["Mountains", "Beaches", "Lakes", "Forests", "Big cities", "Small towns", "Countryside", "Islands"],
    ["Road trips", "Train travel", "Flights", "Cruises", "Camping trips", "City breaks", "Resort vacations", "Backpacking"],
    ["Morning workouts", "Evening workouts", "Home workouts", "Gym workouts", "Team sports", "Running", "Cycling", "Swimming"],
    ["Books", "Movies", "TV shows", "Podcasts", "YouTube videos", "Audiobooks", "Newsletters", "Documentaries"],
    ["Board games", "Video games", "Card games", "Party games", "Puzzle games", "Co-op games", "Strategy games", "Word games"],
    ["Texting", "Calling", "Voice notes", "Emails", "In-person chats", "Group chats", "DMs", "Video calls"],
    ["Android", "iPhone", "Windows laptops", "MacBooks", "Tablets", "Desktop PCs", "Smartwatches", "E-readers"],
    ["Dark mode", "Light mode", "Paper planners", "Digital calendars", "To-do apps", "Sticky notes", "Whiteboards", "Notebooks"],
    ["Minimalist style", "Maximalist style", "Streetwear", "Business casual", "Athleisure", "Vintage style", "Monochrome outfits", "Colorful outfits"],
    ["Sneakers", "Boots", "Sandals", "Loafers", "Running shoes", "Slides", "High tops", "Slip-ons"],
    ["Rainy days", "Sunny days", "Snowy days", "Windy days", "Stormy nights", "Foggy mornings", "Cool autumn days", "Warm spring days"],
    ["Museums", "Concerts", "Theme parks", "Comedy shows", "Sports events", "Festivals", "Escape rooms", "Arcades"],
    ["Window seat", "Aisle seat", "Middle seat", "Front row", "Back row", "Balcony seats", "Standing area", "VIP seats"],
    ["Remote work", "Office work", "Hybrid work", "Freelancing", "Shift work", "Night shifts", "Four-day weeks", "Flexible hours"],
    ["Group projects", "Solo projects", "Pair work", "Brainstorm sessions", "Written plans", "Whiteboard planning", "Async collaboration", "Live workshops"],
    ["Early mornings", "Late nights", "Fixed routines", "Spontaneous days", "Busy schedules", "Slow weekends", "Daily planning", "Going with the flow"],
  ];

  for (const bucket of comparisonBuckets) {
    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        add(`People should pick ${bucket[i]} over ${bucket[j]}`);
      }
    }
  }

  const statements = [
    "Pineapple belongs on pizza",
    "Ketchup belongs in the fridge",
    "Brunch is overrated",
    "Breakfast is the best meal of the day",
    "Dessert should always be shared",
    "Soup is an all-season food",
    "Breakfast for dinner is always a good idea",
    "Leftovers taste better the next day",
    "Street food is often better than restaurant food",
    "The best fries are thin fries",
    "Spicy food is worth the pain",
    "Mild food is underrated",
    "People should learn five meals they can cook well",
    "Meal prep saves more money than people think",
    "Cooking at home should be the default",
    "Snacking after 10 p.m. should be normal",
    "Coffee after dinner is a good idea",
    "Tea should never be sweetened",
    "Iced coffee is better than hot coffee",
    "Sparkling water tastes better over time",
    "People should drink more water during work",
    "Everyone should carry emergency snacks",
    "People should arrive ten minutes early",
    "Calling without texting first is rude",
    "Notifications should be off by default",
    "Most meetings should be shorter",
    "Most meetings could be an email",
    "Airplane mode is underrated for focus",
    "Multitasking hurts productivity",
    "A clean desk improves focus",
    "Background noise helps concentration",
    "Paper notes are better for memory",
    "Keyboard shortcuts save serious time",
    "Inbox zero is unrealistic",
    "People should mute non-urgent chats",
    "Work messages after hours should be avoided",
    "Boundaries make teams healthier",
    "Four-day workweeks should be standard",
    "Flexible schedules improve productivity",
    "Mentorship matters more than formal training",
    "Feedback should be specific and immediate",
    "Small talk is an important social skill",
    "Listening is more important than speaking",
    "First impressions are often wrong",
    "People should apologize more directly",
    "Group chats are overwhelming",
    "Voice assistants are underused",
    "Smart homes are not worth the setup",
    "People replace phones too often",
    "Phone batteries should last two full days",
    "Two-factor authentication should be mandatory",
    "Password managers should be standard",
    "People should back up photos monthly",
    "Cloud storage is worth paying for",
    "Printed photos still matter",
    "People take too many photos at concerts",
    "Watching through your phone ruins live events",
    "Subtitles improve most viewing experiences",
    "Dubbing is underrated",
    "Movie theaters are still worth it",
    "Intermissions should return to long movies",
    "Mini-series are better than long series",
    "Most series are one season too long",
    "Rewatching comfort shows is healthy",
    "Binge-watching is overrated",
    "Character development matters more than plot",
    "Good villains make better stories",
    "Plot twists are often overused",
    "Book adaptations should be looser",
    "Animated movies are for all ages",
    "Remakes are too common",
    "Original soundtracks matter more than people admit",
    "Silence is underused in movies",
    "Nostalgia is too powerful in entertainment",
    "Co-op games are more fun than competitive games",
    "Simple game rules are better than complex rules",
    "Party games should have short rounds",
    "Game tutorials should be skippable",
    "Randomness keeps games fresh",
    "Too much randomness feels unfair",
    "Comeback mechanics make games more exciting",
    "Leaderboards should reset more often",
    "Small wins keep players engaged",
    "Players remember moments more than scores",
    "Aesthetics matter as much as mechanics",
    "Sound effects dramatically improve game feel",
    "Fast loading matters more than visual detail",
    "Game UIs should prioritize clarity over style",
    "Warm-up rounds improve multiplayer games",
    "Quick rematches should be one tap",
    "Team games need clear roles",
    "Random teams are fairer than chosen teams",
    "Text chat presets improve multiplayer pacing",
    "Victory screens should be short",
    "A dramatic reveal makes games memorable",
    "Hidden information makes social games better",
    "Too much hidden information feels frustrating",
    "People should try solo travel once",
    "Traveling light always improves trips",
    "One carry-on is enough for most trips",
    "People overpack for vacations",
    "Hostels are better than hotels for social travel",
    "Road trips are better with no strict itinerary",
    "Jet lag is easier than people think",
    "Airport arrival stress is mostly avoidable",
    "Window shopping is a good use of time",
    "Second-hand shopping is underrated",
    "Good shoes are worth the price",
    "Capsule wardrobes make life easier",
    "People should buy less and use items longer",
    "A short walk solves many creative blocks",
    "Weather affects mood more than people admit",
    "People are too hard on beginners",
    "Progress matters more than perfection",
    "Routine matters more than motivation",
    "Talent matters less than consistency",
    "Luck matters more than people admit",
    "It is okay to quit hobbies you do not enjoy",
    "Everyone should have one no-screen hobby",
    "Everyone should do basic strength training",
    "Walking is the most underrated exercise",
    "Rest days are as important as workout days",
    "Stretching should be part of every day",
    "Home workouts are enough for most people",
    "Cold showers are overrated",
    "Sleep quality matters more than sleep duration",
    "A tidy room improves mental clarity",
    "Decluttering improves focus",
    "People keep too many unread emails",
    "People need fewer apps than they think",
    "A notebook can replace many productivity tools",
    "Reading comments is usually a bad idea",
    "Memes are a legitimate communication format",
    "Online reviews are less trustworthy than before",
    "People should check sources before sharing links",
    "Daily planning reduces stress",
    "Unscheduled time is essential every week",
    "Weekend plans should include real downtime",
    "People should protect mornings for deep work",
    "People should protect evenings from work",
    "Everyone should learn basic budgeting",
    "Automatic saving is better than manual saving",
    "Experiences are better purchases than things",
    "Most people should cancel unused subscriptions",
    "Cash is still useful in 2026",
    "People should learn basic home repairs",
    "Everyone should know basic first aid",
    "People should rotate chores more fairly",
    "A shared household calendar prevents conflicts",
    "Long weekends are better than long vacations",
    "People should take more micro-breaks",
    "Quiet hours should exist in every office",
    "Casual dress codes improve work quality",
    "Team lunches are underrated for morale",
    "Whiteboards improve team alignment",
    "Standing desks are overrated",
    "Open offices reduce productivity",
    "Hybrid teams need clearer communication norms",
    "Async collaboration is underestimated",
    "People should ask more follow-up questions",
    "Curiosity is more valuable than confidence",
    "Kindness in feedback improves outcomes",
    "Honest communication beats polite vagueness",
    "People should say no more often",
    "Boundaries improve friendships too",
    "People should spend less time doomscrolling",
    "Apps should default to fewer notifications",
    "Dark mode should be the default in most apps",
    "Most apps are over-designed",
    "Simple interfaces are better than feature-heavy ones",
    "Autoplay should be off by default",
    "People should revisit old hobbies more often",
    "Trying new food is a social skill",
    "Every city needs more public benches",
    "Public transit deserves more support",
    "Cycling infrastructure should be a priority",
    "Libraries are underrated community spaces",
    "Museums should have more late-night hours",
    "Parks are the best free entertainment",
    "Rainy days are perfect for creativity",
    "Sunny days are overrated for productivity",
  ];

  statements.forEach(add);

  if (prompts.length < TARGET_PROMPT_COUNT) {
    throw new Error(`Hot Take prompt bank too small: ${prompts.length}`);
  }

  return prompts.slice(0, TARGET_PROMPT_COUNT);
}

const PROMPTS = buildPromptBank();

function shuffle(list, rng) {
  const next = [...list];
  for (let i = next.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

export function createHotTakeState({ players, rng }) {
  const playerIds = players.map((p) => p.id);
  const scores = new Map();
  playerIds.forEach((id) => scores.set(id, 0));

  const promptPool = shuffle(PROMPTS, rng);

  return {
    gameType: "hottake",
    status: "voting",
    round: 1,
    timer: VOTE_DURATION,
    playerIds,
    promptPool,
    promptIndex: 0,
    prompt: promptPool[0],
    votes: new Map(),
    scores,
    roundResult: null,
    roundWinnerId: null,
  };
}

export function handleHotTakeAction(state, playerId, action) {
  if (!action || action.kind !== "hotTakeVote") return state;
  if (state.status !== "voting") return state;
  if (!state.playerIds.includes(playerId)) return state;
  if (state.votes.has(playerId)) return state;
  if (action.vote !== "agree" && action.vote !== "disagree") return state;

  const votes = new Map(state.votes);
  votes.set(playerId, action.vote);
  return { ...state, votes };
}

export function allHotTakeVotesIn(state) {
  return state.votes.size >= state.playerIds.length;
}

export function revealHotTake(state) {
  const agreeVoters = [];
  const disagreeVoters = [];
  state.votes.forEach((vote, playerId) => {
    if (vote === "agree") agreeVoters.push(playerId);
    if (vote === "disagree") disagreeVoters.push(playerId);
  });

  const agreeCount = agreeVoters.length;
  const disagreeCount = disagreeVoters.length;
  const isTie = agreeCount === disagreeCount;
  const majority = isTie ? "tie" : agreeCount > disagreeCount ? "agree" : "disagree";
  const awardedPlayerIds = majority === "agree" ? agreeVoters : majority === "disagree" ? disagreeVoters : [];

  const scores = new Map(state.scores);
  awardedPlayerIds.forEach((playerId) => {
    scores.set(playerId, (scores.get(playerId) || 0) + 1);
  });

  return {
    ...state,
    status: "reveal",
    timer: REVEAL_DURATION,
    scores,
    roundResult: {
      majority,
      agreeCount,
      disagreeCount,
      awardedPlayerIds,
    },
    roundWinnerId: awardedPlayerIds[0] || null,
  };
}

export function nextHotTakeRound(state, rng) {
  let promptPool = state.promptPool;
  let promptIndex = state.promptIndex + 1;

  if (promptIndex >= promptPool.length) {
    promptPool = shuffle(PROMPTS, rng);
    promptIndex = 0;
  }

  return {
    ...state,
    status: "voting",
    round: state.round + 1,
    timer: VOTE_DURATION,
    promptPool,
    promptIndex,
    prompt: promptPool[promptIndex],
    votes: new Map(),
    roundResult: null,
    roundWinnerId: null,
  };
}

export function tickHotTake(state) {
  if (state.timer == null || state.timer <= 0) return state;
  return { ...state, timer: state.timer - 1 };
}

export function serializeHotTake(state) {
  const votes = {};
  state.votes.forEach((vote, playerId) => {
    votes[playerId] = vote;
  });

  return {
    gameType: "hottake",
    status: state.status,
    round: state.round,
    timer: state.timer,
    prompt: state.prompt,
    playerCount: state.playerIds.length,
    voteCount: state.votes.size,
    votes,
    scores: Object.fromEntries(state.scores),
    roundResult: state.roundResult,
    roundWinnerId: state.roundWinnerId,
  };
}
