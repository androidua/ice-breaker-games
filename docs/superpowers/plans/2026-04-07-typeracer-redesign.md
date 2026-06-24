# Type Racer Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three interconnected Type Racer bugs: same-score-for-all-finishers, 90s timer too long, and forced backspace-to-fix-errors.

**Architecture:** All scoring and state logic lives in `server/typeracer-engine.js` (pure functions). Timer trigger logic lives in `server/index.js`. Display changes live in `src/games/TyperacerGame.jsx`. The changes are: (1) finish condition uses typed length not exact match, (2) closing countdown starts when first player finishes, (3) scoring uses per-player `finishTime` and gives partial credit to non-finishers.

**Tech Stack:** Node.js (engine), React 18 (UI), native WebSocket

---

## File Map

| File | What changes |
|---|---|
| `server/typeracer-engine.js` | Add `closingCountdown` to state; update finish condition; set closing on first finish; update `tickTyperacer`; rewrite `revealTyperacer` scoring; update `serializeTyperacer`; update `nextTyperacerRound` reset |
| `server/index.js` | Add `closingCountdown <= 0` trigger in `startTyperacerTick` |
| `src/games/TyperacerGame.jsx` | Show closing countdown in header; add closing notice in racing panel; update instructions; update reveal non-finisher display; clean up unused `sentFinishRef` exact-match check |

---

### Task 1: Add `closingCountdown` to engine state

**Files:**
- Modify: `server/typeracer-engine.js:57-82` (createTyperacerState), `server/typeracer-engine.js:154-178` (nextTyperacerRound)

- [ ] **Step 1: Add `closingCountdown: null` to `createTyperacerState` return object**

In `server/typeracer-engine.js`, find the return block of `createTyperacerState` (lines 68–81). Add `closingCountdown: null` after `raceStartTime`:

```js
return {
  gameType: "typeracer",
  status: "racing",
  playerIds,
  paragraph,
  progress,
  scores,
  timer: RACE_DURATION,
  raceStartTime: Date.now(),
  closingCountdown: null,   // ← add this line
  round: 1,
  roundWinnerId: null,
  paragraphPool: shuffledParas,
  poolIndex: 1,
};
```

- [ ] **Step 2: Reset `closingCountdown` in `nextTyperacerRound`**

In `nextTyperacerRound` (lines 166–177), add `closingCountdown: null` to the returned object after `raceStartTime`:

```js
return {
  ...state,
  status: "racing",
  paragraph,
  progress,
  timer: RACE_DURATION,
  raceStartTime: Date.now(),
  closingCountdown: null,   // ← add this line
  round: state.round + 1,
  roundWinnerId: null,
  paragraphPool,
  poolIndex: poolIndex + 1,
};
```

- [ ] **Step 3: Start the server and confirm it still boots**

```bash
npm run server
```

Expected: Server starts on :3000 with no errors.

- [ ] **Step 4: Commit**

```bash
git add server/typeracer-engine.js
git commit -m "feat(typeracer): add closingCountdown field to state"
```

---

### Task 2: Update finish condition and set closing countdown on first finish

**Files:**
- Modify: `server/typeracer-engine.js:109-131` (updateProgress)

- [ ] **Step 1: Replace `updateProgress` with the new version**

Replace the entire `updateProgress` function (lines 109–131):

```js
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
```

- [ ] **Step 2: Manually verify finish condition in browser**

Open two tabs, start a Type Racer game. Deliberately type past the end of the paragraph with some errors (do not backspace). Confirm: the progress bar reaches 100% and the "You finished! Waiting for others..." message appears. Confirm the second tab sees a closing countdown appear in the header timer.

- [ ] **Step 3: Commit**

```bash
git add server/typeracer-engine.js
git commit -m "feat(typeracer): allow finishing with errors, start 20s closing window on first finish"
```

---

### Task 3: Tick closing countdown down each second

**Files:**
- Modify: `server/typeracer-engine.js:180-183` (tickTyperacer)

- [ ] **Step 1: Replace `tickTyperacer`**

Replace the existing `tickTyperacer` function (lines 180–183):

```js
export function tickTyperacer(state) {
  if (state.timer == null || state.timer <= 0) return state;
  const newClosing =
    state.closingCountdown != null && state.closingCountdown > 0
      ? state.closingCountdown - 1
      : state.closingCountdown;
  return { ...state, timer: state.timer - 1, closingCountdown: newClosing };
}
```

- [ ] **Step 2: Commit**

```bash
git add server/typeracer-engine.js
git commit -m "feat(typeracer): tick closing countdown each second"
```

---

### Task 4: Trigger reveal when closing countdown expires

**Files:**
- Modify: `server/index.js:681-695` (startTyperacerTick)

- [ ] **Step 1: Add closing countdown expiry check inside `startTyperacerTick`**

Find the `setInterval` block in `startTyperacerTick` (lines 683–695). The current block is:

```js
room.interval = setInterval(() => {
  room.game = tickTyperacer(room.game);
  broadcastGameState(room);
  if (room.game.status === "racing" && room.game.timer <= 0) {
    triggerTyperacerReveal(room);
  } else if (room.game.status === "reveal" && room.game.timer <= 0) {
    stopLoop(room);
    awardRoundWin(room, room.game.roundWinnerId);
    room.game = nextTyperacerRound(room.game, Math.random);
    broadcastGameState(room);
    startTyperacerTick(room);
  }
}, 1000);
```

Replace it with:

```js
room.interval = setInterval(() => {
  room.game = tickTyperacer(room.game);
  broadcastGameState(room);
  if (room.game.status === "racing" && room.game.timer <= 0) {
    triggerTyperacerReveal(room);
  } else if (
    room.game.status === "racing" &&
    room.game.closingCountdown !== null &&
    room.game.closingCountdown <= 0
  ) {
    triggerTyperacerReveal(room);
  } else if (room.game.status === "reveal" && room.game.timer <= 0) {
    stopLoop(room);
    awardRoundWin(room, room.game.roundWinnerId);
    room.game = nextTyperacerRound(room.game, Math.random);
    broadcastGameState(room);
    startTyperacerTick(room);
  }
}, 1000);
```

- [ ] **Step 2: Manually verify the closing window ends the race**

Open two tabs. In Tab A, finish typing (with or without errors). Wait for the 20s closing countdown to appear. Let it expire without Tab B finishing. Confirm: reveal screen appears after the countdown hits 0, not after the full 90 seconds.

- [ ] **Step 3: Commit**

```bash
git add server/index.js
git commit -m "feat(typeracer): trigger reveal when closing countdown expires"
```

---

### Task 5: Rewrite scoring formula in `revealTyperacer`

**Files:**
- Modify: `server/typeracer-engine.js:137-152` (revealTyperacer)

- [ ] **Step 1: Replace `revealTyperacer`**

Replace the entire `revealTyperacer` function (lines 137–152):

```js
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
      points = Math.max(0, Math.floor(progress * 400) - currentMistakes * 10);
    }
    scores.set(playerId, (scores.get(playerId) || 0) + points);
    if (points > topScore) {
      topScore = points;
      winnerId = playerId;
    }
  });

  return { ...state, status: "reveal", scores, timer: REVEAL_DURATION, roundWinnerId: winnerId };
}
```

- [ ] **Step 2: Verify scores differ between players**

Open two tabs. Have Tab A finish quickly (e.g. copy-paste the text), let Tab B finish slowly or not at all. Confirm in the reveal screen that Tab A's score is higher than Tab B's, and no two finishers with different finish times have identical scores.

- [ ] **Step 3: Commit**

```bash
git add server/typeracer-engine.js
git commit -m "feat(typeracer): per-player elapsed-time scoring, partial credit for non-finishers"
```

---

### Task 6: Include `closingCountdown` in serialized state

**Files:**
- Modify: `server/typeracer-engine.js:185-206` (serializeTyperacer)

- [ ] **Step 1: Add `closingCountdown` to the return value of `serializeTyperacer`**

In `serializeTyperacer` (lines 196–206), add `closingCountdown` to the returned object:

```js
return {
  gameType: "typeracer",
  status: state.status,
  paragraph: state.paragraph,
  progress: progressObj,
  scores: Object.fromEntries(state.scores),
  timer: state.timer,
  closingCountdown: state.closingCountdown ?? null,   // ← add this line
  round: state.round,
  roundWinnerId: state.roundWinnerId,
};
```

- [ ] **Step 2: Commit**

```bash
git add server/typeracer-engine.js
git commit -m "feat(typeracer): serialize closingCountdown to clients"
```

---

### Task 7: Update TyperacerGame.jsx UI

**Files:**
- Modify: `src/games/TyperacerGame.jsx`

- [ ] **Step 1: Replace the header timer span to show closing countdown when active**

Find the `game-header` block (lines 42–47):

```jsx
<div className="game-header">
  <span>Round {game.round}</span>
  {game.timer != null && (
    <span className={`voting-timer${game.timer <= 15 ? " timer-urgent" : ""}`}>{game.timer}s</span>
  )}
</div>
```

Replace with:

```jsx
<div className="game-header">
  <span>Round {game.round}</span>
  {game.closingCountdown != null ? (
    <span className={`voting-timer${game.closingCountdown <= 5 ? " timer-urgent" : ""}`}>
      {game.closingCountdown}s
    </span>
  ) : (
    game.timer != null && (
      <span className={`voting-timer${game.timer <= 15 ? " timer-urgent" : ""}`}>{game.timer}s</span>
    )
  )}
</div>
```

- [ ] **Step 2: Add closing window notice inside the racing panel**

Inside the racing `<div className="panel">` (after line 50, before the `typeracer-text` div), add:

```jsx
{game.closingCountdown != null && (() => {
  const finishedPlayers = room?.players.filter((p) => game.progress?.[p.id]?.finished) || [];
  const label =
    finishedPlayers.length === 1
      ? `${finishedPlayers[0].name} finished!`
      : `${finishedPlayers.length} players finished!`;
  return <div className="status">{label} {game.closingCountdown}s left</div>;
})()}
```

- [ ] **Step 3: Update non-finisher display in the reveal screen**

In the reveal results map (lines 130–137), replace:

```jsx
{p.finished ? (
  <>
    <span>{p.wpm} wpm</span>
    <span>{p.mistakes} mistake{p.mistakes !== 1 ? "s" : ""}</span>
  </>
) : (
  <span style={{ opacity: 0.5 }}>did not finish</span>
)}
```

with:

```jsx
{p.finished ? (
  <>
    <span>{p.wpm} wpm</span>
    <span>{p.mistakes} mistake{p.mistakes !== 1 ? "s" : ""}</span>
  </>
) : (
  <span style={{ opacity: 0.5 }}>
    {Math.round(((game.progress?.[p.id]?.typedLength || 0) / (game.paragraph?.length || 1)) * 100)}% done
  </span>
)}
```

- [ ] **Step 4: Update the instructions text**

Find line 154:

```jsx
<p className="game-instructions">
  Type the paragraph as fast and accurately as you can · First to finish wins · Errors must be corrected before you can continue
</p>
```

Replace with:

```jsx
<p className="game-instructions">
  Type the paragraph as fast and accurately as you can · Mistakes are penalised but won't block you from finishing
</p>
```

- [ ] **Step 5: Remove the unused sentFinishRef exact-match check in `handleInput`**

Find lines 28–30 in `handleInput`:

```jsx
if (clamped === game.paragraph && !sentFinishRef.current) {
  sentFinishRef.current = true;
}
```

Delete those three lines. The `sentFinishRef` declaration on line 6 can also be removed:

```jsx
const sentFinishRef = useRef(false);  // ← delete this line
```

And the `sentFinishRef.current = false` reset in the `useEffect` (line 16):

```jsx
sentFinishRef.current = false;  // ← delete this line
```

- [ ] **Step 6: Verify the full UI flow in two browser tabs**

1. Start a race. Confirm the header shows the main 90s countdown.
2. Finish on Tab A. Confirm: "X finished! 20s left" notice appears in the racing panel; header timer switches to the 20s closing countdown.
3. Let the closing window expire on Tab B. Confirm reveal shows Tab B's progress as "N% done" with a partial score.
4. Start another round. Confirm the closing countdown disappears and the main timer resets to 90s.

- [ ] **Step 7: Commit**

```bash
git add src/games/TyperacerGame.jsx
git commit -m "feat(typeracer): update UI for closing countdown, error-tolerant finish, partial scores"
```

---

### Task 8: Run smoke tests and bump version

**Files:**
- Modify: `package.json`, `package-lock.json`

- [ ] **Step 1: Run the smoke tests**

```bash
npm test
```

Expected: All tests pass. The smoke test runs the host/join/start/vote flow and verifies disconnect cleanup — it does not play through any specific game, so typeracer changes will not break it.

- [ ] **Step 2: Bump version to 1.6.0 (minor feature)**

In `package.json`, change `"version": "1.5.2"` to `"version": "1.6.0"`.

- [ ] **Step 3: Sync package-lock.json**

```bash
npm install --package-lock-only
```

Expected: Only the `version` field in `package-lock.json` changes. No new packages installed.

- [ ] **Step 4: Commit and tag**

```bash
git add package.json package-lock.json
git commit -m "chore: bump to v1.6.0 — Type Racer scoring, closing window, error-tolerant finish"
git tag -a v1.6.0 -m "v1.6.0 — Type Racer scoring, closing window, error-tolerant finish"
```

- [ ] **Step 5: Push**

```bash
git push personal main && git push personal v1.6.0
```
