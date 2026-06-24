# Type Racer Redesign

**Date:** 2026-04-07  
**Status:** Approved

## Context

Three user-reported issues in the Type Racer game:

1. **Same points for all finishers** — scoring used the shared `state.timeRemaining` countdown, meaning players finishing within the same 1-second tick received identical scores. Per-player `finishTime` was already stored but ignored.
2. **Timer too long** — 90 seconds felt excessive; the race dragged even after the fastest player finished.
3. **Must backspace to fix errors** — `finished` required an exact string match, so any typo blocked progress until corrected.

All three problems are interconnected and are solved together.

---

## Changes

### 1. Finish Condition (typeracer-engine.js)

**Before:** `finished = (typed === paragraph)` — exact match only.

**After:** `finished = (typed.length >= paragraph.length)` — reaching the end of the paragraph registers as finished regardless of errors. Mistakes are still counted and penalised in scoring. The character-by-character red/green highlight UI is unchanged.

### 2. Game State (typeracer-engine.js)

Add two fields to the state object created in `createTyperacerState()`:

- `startTime: Date.now()` — timestamp when the race begins, used for per-player elapsed time calculation.
- `closingCountdown: null` — set to `20` (seconds) when the first player finishes; `null` while nobody has finished yet.

### 3. Scoring Formula (typeracer-engine.js — `revealTyperacer()`)

Replace the current formula (which used shared `state.timeRemaining`) with per-player elapsed time.

**Finishers:**
```
elapsedSeconds = (finishTime - state.startTime) / 1000
score = max(50, 1000 - floor(elapsedSeconds * 10) - mistakes * 30)
```

Examples:
- 20s, 0 mistakes → 800 pts
- 40s, 3 mistakes → 510 pts  
- 90s, 0 mistakes → 100 pts (floor: 50)

**Non-finishers (partial credit):**
```
progress = typedLength / paragraphLength
score = max(0, floor(progress * 400) - mistakes * 10)
```

Examples:
- 90% progress, 0 mistakes → 360 pts
- 50% progress, 5 mistakes → 150 pts

Partial credit is capped at 400 so a slow finisher (~60s, 0 mistakes → 400 pts) always scores at least as well as an equivalent non-finisher.

### 4. Closing Window Timer (typeracer-engine.js + server/index.js)

When the **first player finishes**, set `state.closingCountdown = 20`.

In `tickTyperacer()`: if `closingCountdown` is not null, decrement it each second instead of (or in addition to) the main race timer. When `closingCountdown` reaches 0, trigger reveal — same as when `timeRemaining` hits 0.

In `server/index.js` dispatch: after each `handleTyperacerAction()` call, check if this was the first finish (previously no finishers, now one finisher) and set `closingCountdown` if so. Already-existing `allTyperacerFinished()` check triggers reveal immediately when everyone finishes.

The absolute 90-second maximum (`RACE_DURATION`) is kept as a fallback for games where nobody finishes.

### 5. UI — Closing Window Display (src/games/TyperacerGame.jsx)

When `game.closingCountdown !== null`, show a notice replacing the main timer:

> `"[PlayerName] finished! [N]s left"`

Where `[PlayerName]` is the name of the first finisher (derive from `game.players` + `game.progress`). If multiple players have finished, show the count instead: `"2 players finished! [N]s left"`.

The existing race timer display (`timeRemaining`) is hidden once `closingCountdown` is active.

---

## Files to Modify

| File | Changes |
|---|---|
| `server/typeracer-engine.js` | Add `startTime`, `closingCountdown` to state; update finish condition; update `revealTyperacer()` scoring; update `tickTyperacer()` to decrement `closingCountdown` |
| `server/index.js` | Detect first-finish event after `handleTyperacerAction()`, set `closingCountdown = 20`; handle `closingCountdown === 0` as reveal trigger |
| `src/games/TyperacerGame.jsx` | Show closing countdown notice instead of main timer once first player finishes |

---

## Verification

1. **Unit-level:** Start a race with two browser tabs. Tab A finishes — closing countdown of 20s should appear for Tab B. Tab B finishes before 20s — reveal triggers immediately.
2. **Scoring:** Two players finish at different times (deliberately slow on one tab). Scores should differ based on elapsed seconds. Player who finishes faster should score higher.
3. **Error tolerance:** Type incorrectly and do NOT backspace — keep typing to the end. Should register as finished with mistake penalties applied.
4. **Non-finisher partial credit:** Let one tab time out (or close the window). Reveal should show partial score proportional to progress.
5. **Nobody finishes:** Verify 90s absolute fallback still triggers reveal correctly.
6. **Smoke test:** Run `npm test` — existing WebSocket flow tests should still pass.
