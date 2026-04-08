const VOTE_DURATION = 15;
const REVEAL_DURATION = 5;
const TARGET_PROMPT_COUNT = 300;

function normalizePrompt(prompt) {
  return String(prompt).trim().toLowerCase().replace(/[.!?]+$/g, "");
}

function buildPromptBank() {
  const prompts = [];
  const seen = new Set();

  const add = (text) => {
    const prompt = String(text).trim();
    if (!prompt) return;
    const key = normalizePrompt(prompt);
    if (seen.has(key)) return;
    seen.add(key);
    prompts.push(prompt.endsWith(".") ? prompt : `${prompt}.`);
  };

  const pairs = [
    ["Coffee", "tea"],
    ["Texting", "calling"],
    ["Beach vacations", "mountain vacations"],
    ["Movies", "TV shows"],
    ["Books", "movies"],
    ["Cats", "dogs"],
    ["Summer", "winter"],
    ["Morning workouts", "evening workouts"],
    ["Board games", "video games"],
    ["Sweet snacks", "salty snacks"],
    ["City life", "small-town life"],
    ["Staying in", "going out"],
    ["Podcasts", "music"],
    ["Android", "iPhone"],
    ["Window seats", "aisle seats"],
    ["Road trips", "flights"],
    ["Early mornings", "late nights"],
    ["Sushi", "pizza"],
    ["Pancakes", "waffles"],
    ["Dogs at parks", "dogs at cafes"],
    ["Working from home", "working in an office"],
    ["Learning by doing", "learning by reading"],
    ["Group projects", "solo projects"],
    ["Fantasy books", "sci-fi books"],
    ["Horror movies", "comedy movies"],
    ["Museums", "theme parks"],
    ["Live concerts", "studio recordings"],
    ["Rainy days", "sunny days"],
    ["Paper books", "e-books"],
    ["Shopping online", "shopping in-store"],
    ["Cooking at home", "ordering takeout"],
    ["Spicy food", "mild food"],
    ["Digital calendars", "paper planners"],
    ["Voice notes", "typed messages"],
    ["Documentaries", "reality shows"],
    ["Short-form videos", "long-form videos"],
    ["Minimalist design", "maximalist design"],
    ["Public transport", "driving"],
    ["Walking meetings", "desk meetings"],
    ["Tea at night", "coffee at night"],
  ];

  const topics = [
    "People should always arrive 10 minutes early",
    "Breakfast is the best meal of the day",
    "Pineapple belongs on pizza",
    "Ketchup belongs in the fridge",
    "The best fries are always thin fries",
    "Brunch is overrated",
    "Spoilers can make a story better",
    "Music sounds better on headphones",
    "Every friend group needs a planner",
    "Everyone should know basic first aid",
    "Everyone should learn to cook 5 meals",
    "Long weekends are better than short holidays",
    "Calling someone without texting first is rude",
    "You should never skip warmups before workouts",
    "Everyone should keep a handwritten journal",
    "Every home needs at least one plant",
    "A clean desk improves focus",
    "A little background noise helps concentration",
    "Multitasking hurts productivity",
    "Night mode should be default on phones",
    "Airplane mode is underrated for focus",
    "People should take more micro-breaks",
    "Most meetings could have been emails",
    "People should read terms before accepting them",
    "Notifications should be off by default",
    "Most apps have too many features",
    "Simple apps are better than feature-heavy apps",
    "People should carry cash just in case",
    "Online reviews are less trustworthy than before",
    "You can tell a lot by someone's playlist",
    "Everyone should try solo travel once",
    "Window shopping is a good use of time",
    "Good shoes are worth spending extra on",
    "Capsule wardrobes make life easier",
    "People should rent more and buy less",
    "A short walk can solve most creative blocks",
    "Weather affects mood more than people admit",
    "People are too hard on beginners",
    "It is okay to quit hobbies you do not enjoy",
    "Progress matters more than perfection",
    "Routine is more important than motivation",
    "Luck matters more than people admit",
    "Talent matters less than consistency",
    "Reading comments is usually a bad idea",
    "Group chats are overwhelming",
    "Memes are a legitimate communication style",
    "Voice assistants are underused",
    "Smart homes are not worth the setup",
    "People buy too many kitchen gadgets",
    "Second-hand shopping is underrated",
    "Meal prep saves more money than people think",
    "Most people overpack for trips",
    "Traveling light makes trips better",
    "One carry-on should be enough for most trips",
    "Jet lag is easier to handle than people think",
    "Airport security lines are mostly about timing",
    "It is better to arrive too early than too late",
    "You should always bring snacks when traveling",
    "Hostels are better than hotels for meeting people",
    "Tiny cafes beat big chains",
    "Street food is often better than restaurants",
    "Dessert should be shared",
    "Soup is an all-season food",
    "Breakfast for dinner is always a good idea",
    "Leftovers taste better the next day",
    "Sandwiches are underrated meals",
    "A great sauce can save any dish",
    "No-cook meals deserve more respect",
    "Tea is better when served plain",
    "Coffee should never be sweet",
    "Iced coffee is better than hot coffee",
    "Sparkling water is an acquired taste",
    "People should drink more water at work",
    "Paper to-do lists are better than app lists",
    "A whiteboard improves teamwork",
    "Standing desks are overrated",
    "Open offices reduce productivity",
    "Quiet hours should exist in every office",
    "Team lunches improve morale",
    "Casual dress codes improve work quality",
    "Four-day workweeks should be standard",
    "Remote work should stay the default",
    "Mentorship matters more than formal training",
    "Feedback should be immediate",
    "People should ask more follow-up questions",
    "Listening is an underrated skill",
    "Small talk is an important social skill",
    "First impressions are often wrong",
    "People should apologize more directly",
    "Boundaries make friendships stronger",
    "You should not answer work messages after hours",
    "People should mute non-urgent chats",
    "It is okay to leave messages unread for a while",
    "Everyone should learn basic budgeting",
    "Saving automatically is better than manual saving",
    "Experiences are better purchases than things",
    "Subscriptions are harder to manage than expected",
    "People should cancel more subscriptions",
    "Most people need fewer apps",
    "A good notebook can replace many productivity apps",
    "Bad sleep ruins more than bad diet",
    "Stretching should be part of every day",
    "Walking is the best underrated exercise",
    "Home workouts are enough for most people",
    "Cold showers are overrated",
    "Rest days are as important as workout days",
    "Weekend schedules should include downtime",
    "A tidy room helps mental clarity",
    "Decluttering improves focus",
    "People keep too many unread emails",
    "Inbox zero is unrealistic for most people",
    "Keyboard shortcuts save serious time",
    "Dark mode is easier on the eyes",
    "Phone batteries should last at least two days",
    "People replace phones too often",
    "Repairing devices should be easier",
    "Password managers should be mandatory",
    "Two-factor authentication should be turned on everywhere",
    "People should back up photos more often",
    "Cloud storage is worth paying for",
    "The best camera is the one you actually carry",
    "Phone cameras are good enough for most needs",
    "Printed photos are still valuable",
    "Travel photos should be curated, not dumped",
    "People take too many photos at concerts",
    "Watching through your phone ruins live events",
    "Movie theaters are still worth it",
    "Intermissions should return to long movies",
    "Subtitles improve most viewing experiences",
    "Dubbing is underrated",
    "Rewatching comfort shows is healthy",
    "Binge-watching is overrated",
    "Watching one episode per day is better pacing",
    "Most series are one season too long",
    "Mini-series are better than multi-season shows",
    "The ending matters more than the beginning",
    "Plot twists are often overused",
    "Character development matters more than plot",
    "Good villains make better stories",
    "Animated movies are for all ages",
    "Nostalgia is a powerful marketing tool",
    "Remakes are too common",
    "Original soundtracks make scenes unforgettable",
    "Silence is underused in modern movies",
    "Book-to-screen adaptations should be looser",
    "The best games are easy to learn quickly",
    "Party games should favor short rounds",
    "Simple rules make better social games",
    "Game tutorials should be skippable",
    "Co-op games are more fun than competitive games",
    "Friendly rivalry makes games better",
    "Randomness keeps games fresh",
    "Too much randomness feels unfair",
    "Games should prioritize fun over realism",
    "Aesthetics matter as much as mechanics",
    "Sound effects dramatically improve game feel",
    "Good UI can make any game more fun",
    "People underestimate how important loading speed is",
    "Fast feedback makes games more satisfying",
    "Round timers improve pacing in party games",
    "Leaderboards should reset often",
    "Small wins keep players engaged",
    "Comeback mechanics make games more exciting",
    "Hidden information makes social games more interesting",
    "Too much hidden information can feel frustrating",
    "Game balance matters more than content volume",
    "People prefer polished games over complex games",
    "Players remember moments more than scores",
    "Best-of-three is often better than single-round matches",
    "Warm-up rounds should exist in multiplayer games",
    "Players should be able to spectate without spoilers",
    "Quick rematches should be one tap",
    "Team games work best with clear roles",
    "Random team assignment is better for fairness",
    "Voice chat is not necessary for great multiplayer",
    "Text chat should include quick presets",
    "Emotes can improve social game vibes",
    "Victory screens should be short",
    "Everyone loves a dramatic reveal",
    "Late-game tension is what players remember most",
  ];

  for (const [left, right] of pairs) {
    add(`${left} is better than ${right}`);
    add(`${right} is better than ${left}`);
    add(`${left} is more overrated than ${right}`);
    add(`${left} is more relaxing than ${right}`);
  }

  for (const topic of topics) {
    add(topic);
    add(`${topic} for most people`);
  }

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
