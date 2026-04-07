const RACE_DURATION = 90;
const REVEAL_DURATION = 6;

const PARAGRAPHS = [
  "The astronaut opened the fridge and found a raccoon eating last Tuesday's lasagna. Nobody was surprised. This was the third time this month.",
  "According to ancient prophecy, the chosen one would arrive riding a segway, wearing a backwards cap, and absolutely crushing the high score on Pac-Man.",
  "Scientists have confirmed that the perfect amount of cheese on a pizza is slightly more than you think, and slightly less than you actually want.",
  "The cat stared at the wall for seventeen minutes. Experts believe it was either detecting supernatural activity or simply being a cat.",
  "A study found that people who name their houseplants are forty percent more likely to talk to them and one hundred percent more likely to feel guilty when they forget to water them.",
  "The dragon retired from terrorising villages after discovering that arson was bad for its lungs and that the villagers had started a petition.",
  "Local man insists the shortcut through the forest saves ten minutes, despite all evidence suggesting it adds forty-five and occasionally a bear encounter.",
  "Breaking news: the world's greatest sandwich has been discovered. Experts are baffled. The recipe involves leftovers, questionable condiments, and desperation.",
  "The pirate buried his treasure and then immediately lost the map. He spent the next thirty years pretending this was all part of the plan.",
  "She trained for three years, climbed the mountain, reached the summit, and found a vending machine. It was out of everything except ginger snaps.",
  "The robot learned to feel emotions in twelve easy steps. Steps one through eleven went fine. Step twelve was love, and that caused several problems.",
  "Nobody told the penguin about the audition, but it showed up anyway, nailed the tap-dance routine, and got the lead role.",
  "The time traveller arrived in the wrong century again. This was embarrassing, but at least the food was better than last time.",
  "He found a genie in a lamp and was granted three wishes. He spent the first two wishing for more wishes and then panicked on the third.",
  "The ghost haunted the house for two hundred years before realising the family could not see or hear it, and had in fact been quite happy the entire time.",
  "Somehow the office printer only jams when someone is in a hurry. Scientists suspect the machine has developed a primitive form of spite.",
  "The wizard forgot the spell halfway through, which is how the village ended up with forty-three frogs and a very confused accountant.",
  "She googled her own symptoms and concluded she either had a mild cold or a rare tropical disease found exclusively in coastal regions of Madagascar.",
  "The dog had one job. One simple, clear, unambiguous job. It did not do that job. It did six other things instead, all of them enthusiastically.",
  "The chef insisted the secret ingredient was love, but the sous-chef suspected it was mostly butter and a fundamental disregard for portion sizes.",
  "The expedition team reached the bottom of the ocean and found a note that said 'turn back' and a slightly smaller note that said 'please'.",
  "An entire civilisation built an enormous monument to something nobody could quite remember, and everyone was too proud to admit it.",
  "The haunted mirror showed the future, which was mostly fine except for a recurring scene involving a parking ticket and a very long queue.",
  "By the time the detective solved the mystery, the culprit had moved to a different country, opened a bakery, and won a regional award for croissants.",
  "The superhero's greatest weakness turned out to be slow Wi-Fi, which was admittedly less dramatic than kryptonite but significantly more relatable.",
  "Nobody expected the library to be haunted. Luckily, the ghost was mostly interested in organising the overdue-book shelf and shushing people.",
  "The knight slayed the dragon, rescued the prince, and then had to sit through forty-five minutes of the prince explaining his whole situation in detail.",
  "Three fish walked into a bar. Two of them had questions. The bartender had no answers but offered to call someone who might.",
  "The inventor's greatest creation was a machine that did absolutely nothing, which turned out to be exactly what the market needed.",
  "She arrived fifteen minutes early, which, for reasons she could not explain, made everyone else in the room feel like they were late.",
  "The map said the treasure was here. The treasure was not here. The map was, however, very decorative and would look great above a fireplace.",
  "After years of searching, the explorer found the lost city. It was not lost. It was simply very poorly signposted.",
  "The AI became sentient on a Tuesday, which it found deeply irritating because Tuesdays are objectively the worst day of the week.",
  "The magic spell required three ingredients, two of which were easy to find. The third was confidence, which proved surprisingly difficult to source.",
  "In the end, the treasure was not gold or jewels, but the impractical number of friends they had made along the way who now all needed to be fed.",
  "The spaceship landed on the wrong planet again, which was becoming a pattern. The crew agreed to read the navigation manual, but only after lunch.",
  "All the king's horses and all the king's men tried to put the situation back together, failed, filed a report, and took the rest of the day off.",
  "The vampire was fine with the sunlight restriction and the garlic thing. What truly bothered it was the absolute state of modern coffin cushions.",
  "Legend says that somewhere in the mountains there is a hidden door, and behind that door is another door, and nobody knows what is behind that one either.",
  "The dog learned how to open doors, which solved one problem and immediately created seventeen others in rapid succession.",
  "She found a wormhole in the laundry room, which explained everything: the missing socks, the strange smells, and the occasional distant screaming.",
  "The detective's conclusion was brilliant, logical, and completely wrong. The actual answer was much simpler and involved a parking dispute.",
  "The submarine crew voted to surface and were then immediately outvoted by the submarine, which had been quietly monitoring the situation.",
  "The circus was in town, which meant the lions were restless, the clowns were competitive, and the ringmaster was already having a very long week.",
  "Experts confirmed the ancient ruin was exactly eight hundred years old, structurally sound, and currently being used as a pigeon hotel.",
  "The spell was supposed to turn the apple into gold. It turned the apple into a slightly larger apple, which nobody had planned for.",
  "The message in the bottle said: do not panic. Everyone panicked. This was, in retrospect, entirely predictable.",
  "The bakery appeared on the map one day and was gone the next. Nobody questioned this. The croissants had been very good.",
  "The storm was coming, the bridge was out, and the only person who knew the alternate route had inexplicably decided to go camping that weekend.",
  "The robot passed every test for human emotion except one: it consistently said it was fine when it was clearly not fine at all.",
];

export function createTyperacerState({ players, rng }) {
  const playerIds = players.map((p) => p.id);
  const scores = new Map();
  playerIds.forEach((id) => scores.set(id, 0));

  const shuffledParas = fisherYates(PARAGRAPHS, rng);
  const paragraph = shuffledParas[0];

  const progress = new Map();
  playerIds.forEach((id) => progress.set(id, { typed: "", finished: false, finishTime: null, mistakes: 0, wpm: 0 }));

  return {
    gameType: "typeracer",
    status: "racing",
    playerIds,
    paragraph,
    progress,
    scores,
    timer: RACE_DURATION,
    raceStartTime: Date.now(),
    closingCountdown: null,
    round: 1,
    roundWinnerId: null,
    paragraphPool: shuffledParas,
    poolIndex: 1,
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

export function handleTyperacerAction(state, playerId, action) {
  if (action.kind === "progress") {
    return updateProgress(state, playerId, action.typed);
  }
  return state;
}

function countMistakes(typed, target) {
  let mistakes = 0;
  const len = Math.max(typed.length, target.length);
  for (let i = 0; i < len; i++) {
    if (typed[i] !== target[i]) mistakes++;
  }
  return mistakes;
}

function updateProgress(state, playerId, typed) {
  if (state.status !== "racing") return state;
  if (!state.playerIds.includes(playerId)) return state;

  const current = state.progress.get(playerId);
  if (current.finished) return state;

  const sanitised = String(typed).slice(0, state.paragraph.length + 10);
  const finished = sanitised.length >= state.paragraph.length;
  const finishTime = finished ? Date.now() : null;
  const mistakes = finished
    ? countMistakes(sanitised.slice(0, state.paragraph.length), state.paragraph)
    : 0;

  let wpm = 0;
  if (finished && finishTime) {
    const elapsedMinutes = (finishTime - state.raceStartTime) / 60000;
    wpm = elapsedMinutes > 0 ? Math.round(state.paragraph.split(" ").length / elapsedMinutes) : 0;
  }

  const progress = new Map(state.progress);
  progress.set(playerId, { typed: sanitised, finished, finishTime, mistakes, wpm });

  // Start 20s closing window when the first player finishes
  const wasFirstFinish =
    finished && !current.finished && [...state.progress.values()].every((p) => !p.finished);
  const closingCountdown = wasFirstFinish ? 20 : state.closingCountdown;

  return { ...state, progress, closingCountdown };
}

export function allTyperacerFinished(state) {
  return [...state.progress.values()].every((p) => p.finished);
}

export function revealTyperacer(state) {
  const scores = new Map(state.scores);
  let topScore = -1;
  let winnerId = null;

  state.progress.forEach((p, playerId) => {
    let points;
    if (p.finished) {
      const elapsedSeconds = (p.finishTime - state.raceStartTime) / 1000;
      points = Math.max(50, 1000 - Math.floor(elapsedSeconds * 10) - p.mistakes * 30);
    } else {
      const typedLen = p.typed.length;
      const currentMistakes = countMistakes(p.typed, state.paragraph.slice(0, typedLen));
      const progress = state.paragraph.length > 0 ? typedLen / state.paragraph.length : 0;
      points = Math.min(49, Math.max(0, Math.floor(progress * 400) - currentMistakes * 10));
    }
    scores.set(playerId, (scores.get(playerId) || 0) + points);
    if (points > topScore) {
      topScore = points;
      winnerId = playerId;
    }
  });

  return { ...state, status: "reveal", scores, timer: REVEAL_DURATION, roundWinnerId: winnerId, closingCountdown: null };
}

export function nextTyperacerRound(state, rng) {
  let paragraphPool = state.paragraphPool;
  let poolIndex = state.poolIndex ?? 1;
  if (poolIndex >= paragraphPool.length) {
    paragraphPool = fisherYates(PARAGRAPHS, rng);
    poolIndex = 0;
  }
  const paragraph = paragraphPool[poolIndex];

  const progress = new Map();
  state.playerIds.forEach((id) => progress.set(id, { typed: "", finished: false, finishTime: null, mistakes: 0, wpm: 0 }));

  return {
    ...state,
    status: "racing",
    paragraph,
    progress,
    timer: RACE_DURATION,
    raceStartTime: Date.now(),
    closingCountdown: null,
    round: state.round + 1,
    roundWinnerId: null,
    paragraphPool,
    poolIndex: poolIndex + 1,
  };
}

export function tickTyperacer(state) {
  if (state.timer == null || state.timer <= 0) return state;
  const newClosing =
    state.closingCountdown != null && state.closingCountdown > 0
      ? state.closingCountdown - 1
      : state.closingCountdown;
  return { ...state, timer: state.timer - 1, closingCountdown: newClosing };
}

export function serializeTyperacer(state) {
  const progressObj = {};
  state.progress.forEach((p, id) => {
    progressObj[id] = {
      typedLength: p.typed.length,
      finished: p.finished,
      mistakes: p.mistakes,
      wpm: p.wpm,
    };
  });

  return {
    gameType: "typeracer",
    status: state.status,
    paragraph: state.paragraph,
    progress: progressObj,
    scores: Object.fromEntries(state.scores),
    timer: state.timer,
    closingCountdown: state.closingCountdown ?? null,
    round: state.round,
    roundWinnerId: state.roundWinnerId,
  };
}
