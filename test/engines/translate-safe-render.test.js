// Browser auto-translate (Chrome Translate, Safari's translator) replaces the
// page's text nodes with copies of its own. React keeps writing to the
// originals: removing one threw NotFoundError and killed the game (Sentry
// HUDDLE-PLAY-ROOM-3/-4, 2026-10-01), and updating one changes nothing on
// screen (a translated turn timer froze while the real one counted down).
//
// Text that is the only child of its element is safe: React replaces the
// element's whole content, which overwrites the translator's copy. So outside
// translate="no", no element may hold two text nodes side by side. And some
// text must never be translated at all: names, timers, and the words a game
// checks typed input against.
//
// Every game is rendered in its main phases with react-dom/server, through
// Vite's own loader, so this runs in plain Node without a build or a browser.

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import React from "react";
import { renderToString } from "react-dom/server";
import { adjacentTextOutsideNoTranslate, textNodes } from "../helpers/translation.js";

const MODULES = {
  trivia: "/src/games/TriviaGame.jsx",
  wordchain: "/src/games/WordChainGame.jsx",
  typeracer: "/src/games/TyperacerGame.jsx",
  hottake: "/src/games/HotTakeVotingGame.jsx",
  truths: "/src/games/TruthsGame.jsx",
  sketch: "/src/games/SketchGame.jsx",
  emoji: "/src/games/EmojiGame.jsx",
  snake: "/src/games/SnakeGame.jsx",
  bomber: "/src/games/BomberGame.jsx",
  voting: "/src/VotingPhase.jsx",
};

const PLAYERS = [
  { id: "p1", name: "Ana", color: "#e63946" },
  { id: "p2", name: "Bo", color: "#457b9d" },
  { id: "p3", name: "Zephyrine", color: "#2a9d8f" },
];
const ROOM = { code: "QX7K", hostId: "p1", players: PLAYERS, roundWins: { p1: 1, p3: 2 }, gameWins: { p1: 1 } };
const HOST = { id: "p1" };
const P2 = { id: "p2" };
const P3 = { id: "p3" };
const SCORES = { p1: 300, p2: 150, p3: 0 };

const QUESTION = "Which planet is known as the Red Planet?";
const HOT_TAKE = "Pineapple belongs on pizza.";
const STATEMENTS = ["I have climbed Kilimanjaro", "I can juggle five balls", "I was born on a ship"];
const PARAGRAPH = "The quick brown fox jumps over the lazy dog.";

const trivia = (g) => ({
  status: "question", questionIndex: 2, totalQuestions: 10, triviaRound: 1, timer: 12,
  question: QUESTION, options: ["Venus", "Mars", "Jupiter", "Saturn"],
  answers: {}, answerCount: 1, playerCount: 3, scores: SCORES, ...g,
});
const wordchain = (g) => ({
  status: "playing", round: 2, timer: 9, currentPlayerId: "p1", currentWord: "apple",
  eliminated: [], invalidReason: null, scores: { p1: 2, p2: 1, p3: 0 }, ...g,
});
const typeracer = (g) => ({
  status: "racing", round: 1, timer: 40, closingCountdown: null, paragraph: PARAGRAPH,
  progress: {}, scores: {}, ...g,
});
const hottake = (g) => ({
  status: "voting", round: 3, timer: 8, prompt: HOT_TAKE, votes: {}, voteCount: 1, playerCount: 3, scores: SCORES, ...g,
});
const truths = (g) => ({
  status: "submitting", round: 1, timer: 60, presenterId: "p1", statements: STATEMENTS,
  voteCount: 1, voterCount: 2, scores: SCORES, ...g,
});
const sketch = (g) => ({
  status: "drawing", round: 1, timer: 50, drawerId: "p1", word: "lighthouse", wordLength: 10,
  guesses: [{ playerId: "p2", text: "tower", correct: false }], strokes: [], revealIn: null,
  roundWinnerId: null, scores: SCORES, ...g,
});
const emoji = (g) => ({
  status: "composing", round: 1, timer: 40, storytellerId: "p1", prompt: { text: "Finding Nemo" },
  promptCategory: "Movie", guesses: [], scores: SCORES, ...g,
});
const snake = (g) => ({
  status: "running", rows: 30, cols: 30, food: [5, 5],
  snakes: [
    { id: "p1", body: [[3, 3], [3, 4]], alive: true, color: "#e63946", score: 3 },
    { id: "p2", body: [[8, 8]], alive: false, color: "#457b9d", score: 1 },
    { id: "p3", body: [[12, 12]], alive: true, color: "#2a9d8f", score: 0 },
  ], ...g,
});
const bomber = (g) => ({
  status: "playing", timer: 60, round: 2, scores: { p1: 2, p2: 1 }, roundWinnerIds: [],
  players: {
    p1: { id: "p1", name: "Ana", color: "#e63946", alive: true, maxBombs: 2, flameRange: 3 },
    p2: { id: "p2", name: "Bo", color: "#457b9d", alive: false, maxBombs: 1, flameRange: 1 },
    p3: { id: "p3", name: "Zephyrine", color: "#2a9d8f", alive: true, maxBombs: 1, flameRange: 2 },
  }, ...g,
});

const game = (component, name, me, g) => ({ component, name, props: { game: g, room: ROOM, me, send: () => {} } });

const SCREENS = [
  game("trivia", "trivia question, answered", P2, trivia({ answers: { p2: 1 } })),
  game("trivia", "trivia reveal", P2, trivia({ status: "reveal", correctIndex: 1, answers: { p2: 0 }, timer: 3 })),
  game("trivia", "trivia set complete (host)", HOST, trivia({ status: "round_complete", roundWinnerId: "p3", timer: null })),
  game("trivia", "trivia set complete (guest)", P2, trivia({ status: "round_complete", roundWinnerId: "p3", timer: null })),

  game("wordchain", "word chain, my turn", HOST, wordchain({ invalidReason: "wrong_letter" })),
  game("wordchain", "word chain, someone else's turn", P2, wordchain({ currentPlayerId: "p3", currentWord: null, eliminated: ["p1"] })),
  game("wordchain", "word chain, eliminated", P3, wordchain({ eliminated: ["p3"] })),
  game("wordchain", "word chain round over (host)", HOST, wordchain({ status: "round_end", roundWinnerId: "p1", lastEliminatedId: "p2" })),
  game("wordchain", "word chain round over, no winner", P2, wordchain({ status: "round_end", roundWinnerId: null })),

  game("typeracer", "type racer, closing countdown", P2, typeracer({
    timer: 30, closingCountdown: 8,
    progress: { p1: { typedLength: 44, finished: true }, p2: { typedLength: 10, finished: false } },
  })),
  game("typeracer", "type racer, finished", HOST, typeracer({
    progress: { p1: { typedLength: 44, finished: true }, p3: { typedLength: 44, finished: true } },
  })),
  game("typeracer", "type racer results", P2, typeracer({
    status: "reveal", timer: null, scores: { p1: 900, p2: 800, p3: 0 },
    progress: {
      p1: { finished: true, wpm: 62, mistakes: 1, typedLength: 44 },
      p2: { finished: true, wpm: 40, mistakes: 0, typedLength: 44 },
      p3: { finished: false, typedLength: 11 },
    },
  })),

  game("hottake", "hot take voting", P2, hottake()),
  game("hottake", "hot take, voted", P2, hottake({ votes: { p2: "agree" } })),
  game("hottake", "hot take reveal", P2, hottake({
    status: "reveal", timer: null, votes: { p2: "agree" },
    roundResult: { majority: "agree", agreeCount: 2, disagreeCount: 1 }, roundWinnerIds: ["p1", "p2"],
  })),
  game("hottake", "hot take tie", HOST, hottake({
    status: "reveal", timer: null, roundResult: { majority: "tie", agreeCount: 1, disagreeCount: 1 }, roundWinnerIds: [],
  })),

  game("truths", "two truths, writing", HOST, truths()),
  game("truths", "two truths, waiting for the presenter", P2, truths()),
  game("truths", "two truths, voting", P2, truths({ status: "voting" })),
  game("truths", "two truths, presenter watching votes", HOST, truths({ status: "voting" })),
  game("truths", "two truths reveal", P2, truths({ status: "reveal", timer: null, lieIndex: 2, roundWinnerIds: ["p2", "p3"] })),

  game("sketch", "sketch, drawing", HOST, sketch()),
  game("sketch", "sketch, guessing after a correct guess", P2, sketch({
    word: undefined, revealIn: 3, roundWinnerId: "p3",
    guesses: [{ playerId: "p2", text: "tower", correct: false }, { playerId: "p3", text: "lighthouse", correct: true }],
  })),
  game("sketch", "sketch reveal", P2, sketch({ status: "reveal", timer: null, roundWinnerId: "p3" })),

  game("emoji", "emoji, composing", HOST, emoji()),
  game("emoji", "emoji, waiting for the storyteller", P2, emoji()),
  game("emoji", "emoji, last try", P2, emoji({
    status: "guessing", emojis: "🐟🔍", triesLeft: 1, guessLimit: 3, hint: "F______ N___",
    guesses: [{ playerId: "p3", text: "fish hunt", correct: false }, { playerId: "p2", text: "nemo", correct: true }],
  })),
  game("emoji", "emoji, storyteller watching", HOST, emoji({ status: "guessing", emojis: "🐟🔍", triesLeft: 3, guessLimit: 3 })),
  game("emoji", "emoji reveal", P2, emoji({ status: "reveal", timer: null, emojis: "🐟🔍", answer: "Finding Nemo", roundWinnerId: "p2" })),

  game("snake", "snake running", P2, snake()),
  game("snake", "snake round over (host)", HOST, snake({ status: "gameover" })),

  game("bomber", "bomber, playing", HOST, bomber()),
  game("bomber", "bomber, knocked out", P2, bomber()),
  game("bomber", "bomber round won", HOST, bomber({ status: "round_end", timer: null, roundWinnerIds: ["p3"] })),
  game("bomber", "bomber tie", HOST, bomber({ status: "round_end", timer: null, roundWinnerIds: ["p1", "p3"] })),

  { component: "voting", name: "game vote", props: {
    voting: { timer: 20, availableGames: ["trivia", "snake"], gameLabels: { trivia: "Speed Trivia", snake: "Snake Arena" }, tallies: { trivia: 1, snake: 2 } },
    room: ROOM, me: P2, send: () => {},
  } },
];

let vite;
const components = {};
const html = {};

before(async () => {
  vite = await createServer({
    root: fileURLToPath(new URL("../..", import.meta.url)),
    logLevel: "error",
    appType: "custom",
    server: { middlewareMode: true, hmr: false, watch: null },
    optimizeDeps: { noDiscovery: true, include: [] },
  });
  for (const [key, path] of Object.entries(MODULES)) components[key] = (await vite.ssrLoadModule(path)).default;
  for (const s of SCREENS) html[s.name] = renderToString(React.createElement(components[s.component], s.props));
});

after(async () => { await vite?.close(); });

const nodes = (screen) => textNodes(html[screen]);
// Every node whose text is exactly `value`; at least one, so a renamed fixture
// can't make an assertion pass by matching nothing.
function exactly(screen, value) {
  const found = nodes(screen).filter((t) => t.value.trim() === value);
  assert.ok(found.length > 0, `${screen}: no text node reads exactly "${value}"`);
  return found;
}

for (const s of SCREENS) {
  test(`${s.name}: no element outside translate="no" holds two text nodes side by side`, () => {
    assert.deepEqual(adjacentTextOutsideNoTranslate(html[s.name]), []);
  });
}

test("player names are never translated", () => {
  for (const s of SCREENS) {
    for (const t of exactly(s.name, "Zephyrine")) {
      assert.equal(t.translatable, false, `${s.name}: "Zephyrine" in <${t.parentTag} class="${t.parentClass}">`);
    }
  }
});

test("countdown timers are never translated", () => {
  const timers = SCREENS.flatMap((s) =>
    nodes(s.name).filter((t) => /\bvoting-timer\b/.test(t.parentClass) && /\d/.test(t.value)).map((t) => ({ s, t })));
  assert.ok(timers.length >= 10, `expected a timer on most screens, found ${timers.length}`);
  for (const { s, t } of timers) assert.equal(t.translatable, false, `${s.name}: timer "${t.value}"`);
});

test("text a game checks typed input against stays in English", () => {
  const paragraph = nodes("type racer, closing countdown").filter((t) => /^char-/.test(t.parentClass));
  assert.equal(paragraph.length, PARAGRAPH.length);
  assert.ok(paragraph.every((t) => !t.translatable), "the Type Racer paragraph is translatable");

  const english = [
    ["word chain, my turn", "apple"],
    ["word chain, my turn", "E"],
    ["sketch, drawing", "lighthouse"],
    ["sketch reveal", "lighthouse"],
    ["sketch, drawing", "tower"],
    ["emoji, last try", "F______ N___"],
    ["emoji, last try", "fish hunt"],
    ["emoji reveal", "Finding Nemo"],
  ];
  for (const [screen, value] of english) {
    for (const t of exactly(screen, value)) assert.equal(t.translatable, false, `${screen}: "${value}"`);
  }
});

// The positive control: without it, translate="no" on the whole page would pass
// every test above while taking translation away from players who rely on it.
test("text players read to play is still translatable", () => {
  const readable = [
    ["trivia question, answered", QUESTION],
    ["trivia question, answered", "Mars"],
    ["trivia question, answered", "Waiting for others... (1/3)"],
    ["hot take voting", HOT_TAKE],
    ["two truths, voting", "I was born on a ship"],
    ["emoji, composing", "Finding Nemo"],
    ["word chain, someone else's turn", "Zephyrine's turn…"],
  ];
  for (const [screen, value] of readable) {
    for (const t of exactly(screen, value)) assert.equal(t.translatable, true, `${screen}: "${value}"`);
  }
});
