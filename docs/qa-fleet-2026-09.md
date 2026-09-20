# Parallel gameplay QA — 2026-09-20 (v1.22.2 → v1.22.3)

Ten QA agents drove real WebSocket clients through the production protocol
(`host` / `join` / `vote` / `gameAction` / `input`) against a live server — one
agent per game, 2–8 players each — plus an Opus-run room-layer suite and
targeted probes for anything an agent reported.

**Scale:** 186 games across 147 rooms; peak 17 concurrent rooms / 117 seats.
**Outcome:** 3 major bugs, all fixed in v1.22.3. 9 minor/cosmetic findings, all
still open and listed below. The server itself was clean.

Harness and repro scripts live in [`tools/qa-bots/`](../tools/qa-bots/README.md).

---

## Server health: clean

| Metric | Result |
|---|---|
| Server error events (`"level":"error"`) | **0** |
| Game-loop aborts (`game_loop_error`) | **0** |
| Uncaught exceptions / unhandled rejections | **0** |
| RSS | avg 32 MB, peak 53 MB, no drift over 45 min |
| Event-loop lag p99 | peak **1.9 ms** under full fleet load |
| Room/seat reclaim | 17 rooms → 0, no leak |
| 16 malformed/non-JSON messages | server stayed healthy |

**Production** (`huddleplayroom.com`): action→broadcast round-trip **166–175 ms**
to Singapore via Cloudflare (matches the documented ~177 ms), and rooms reclaimed
~40 s after the last socket closed, exactly as the 45 s grace intends.

**Room layer — 19/19 passed.** Capacity (9th player refused), bad room code,
double-host on one socket, 16-char name clamping, mid-game join refusal, host-star
migration (**0 ms**), promoted host can actually start, resume restores player id
*and* host role, bogus resume token rejected with `resume_failed`, non-host
`endGame`/`skipPhase` ignored, tied game-vote resolution, leaderboard tiers.

---

## Fixed in v1.22.3

### 1. Tied round winners were silently dropped — MAJOR
Hot Take, Two Truths and Type Racer picked one round winner from a genuine tie
(strict `>` scan over a Map, or element `[0]`), so the credit in `room.roundWins`
— which the leaderboard shows and which `topWinners()` reads to decide the End
Game winner — went to whoever's packet landed first. Confirmed on production:
four Hot Take voters each scored +1 and exactly one was credited.

Fixed by giving all three engines the plural `roundWinnerIds` that Trivia and
Bomber already had, and looping at the award site via `awardRoundWins()`
(`server/index.js`). The singular `roundWinnerId` stays for the frontend, and the
Hot Take / Two Truths reveal banners now name every co-winner.

### 2. Type Racer's anti-cheat fell to an ordinary copy-paste — MAJOR
The existing gate only sets a **floor** on elapsed time, so waiting
`paragraph.length / MAX_CPS` seconds and then pasting finished with zero mistakes
at the fastest legal time. Measured live: the pasting racer scored **931 and won
the round** against honest typists on 901 / 876 / 851 / 811. The paragraph is
selectable text with no `onPaste` guard, so no modified client was needed.

Fixed with a token-bucket **rate** cap in `updateProgress` (MAX_CPS refill,
40-char burst for IME/autocorrect). Deliberately still content-blind — see the
open item below.

### 3. The 45 s resume grace left a stale engine roster — MAJOR
`reconcileDisconnect` already knew to prune a leaver (its Bomber branch exists so
`checkRoundEnd` resolves "instead of counting a phantom"), but it runs from
`handleDisconnect`, which the grace defers — and a round is far shorter than 45 s.
A disconnected Bomber player could stand still and win the round; Sketch could
hand the pencil to an empty chair.

Fixed by benching Bomber players on socket close, rolling role rotations forward
to someone present (`rotateToPresent`), and excluding absent seats from the Snake
round-win award. Snake itself is deliberately **not** benched — `resume.test.js`
#14 pins that an away snake keeps drifting so a quick reconnect resumes a living
snake.

---

## Still open

Nothing below is fixed. Ordered by how much a real player would notice.

| # | Game | Finding | Ref |
|---|---|---|---|
| 1 | Trivia | `submitAnswer` checks `typeof index !== "number"` but never `Number.isInteger`, so `1.5` is stored, counts toward `allAnswered`, can never match the answer — and the duplicate guard then **permanently locks that player out of correcting it**. Cost a player a point in a real run. One-word fix: add `!Number.isInteger(index)`. | `server/trivia-engine.js:527` |
| 2 | Emoji | `slice(0, 30)` counts UTF-16 code units, so a multi-byte emoji is split and a **lone high surrogate (`0xD83D`) reaches guessers' screens** as a broken glyph. Reachable in ordinary play — the picker allows stacking composite emoji to the cap. | `server/emoji-engine.js:374` |
| 3 | Emoji | Same line does `String(emojis)` with no type check: `null` → `"null"`, `[a,b]` → `"a,b"`, `{}` → `"[object Object]"` are all accepted as the round's clue. | `server/emoji-engine.js:374` |
| 4 | Bomber | Round-end timer freezes instead of counting down — `startBomberLoop` calls `stopLoop` the instant status becomes `round_end`, while the client renders `{timer}s` unconditionally. Looks like a hang; the advance still fires correctly. | `server/index.js:1866` (`startBomberLoop`), `src/games/BomberGame.jsx` |
| 5 | Sketch | A correct guess is broadcast **verbatim** in the shared `guesses` feed, publishing the answer to guessers who haven't guessed. **Not exploitable** — verified a second guesser scoring the leaked word gained 0 points (`roundWinnerId !== null` blocks later guesses), the window is ~1.7 s before the reveal shows the word anyway, and the word is never leaked before the first correct guess. Worth masking as "X guessed it!" like other drawing games. | `server/sketch-engine.js:290` + `:382` |
| 6 | Snake | `setSnakeDirection` accepts **only uppercase** directions and `handleInput` never normalises, so anything else is silently discarded — no error, no feedback. Not user-facing (the client sends uppercase) but inconsistent with Bomber, which does `toLowerCase()` and accepts both. See the methodology note below for what this cost us. | `server/engine.js:190` |
| 7 | Word Chain | `String(word)` coercion — a JSON `null` becomes `"null"`, which is a real ENABLE2k word, and is accepted as a legal move. Raw-WebSocket only; no unfair advantage. | `server/wordchain-engine.js:62` |
| 8 | Word Chain | Stale `invalidReason` survives into `round_end`: it is reset on the "round continues" branches but not the "round ends" ones. The client never renders it there today. | `server/wordchain-engine.js:95,146,213,233` |
| 9 | Word Chain | A submit that normalises to `""` gets no feedback at all and can leave a misleading stale reason on screen. Raw-WebSocket only. | `server/wordchain-engine.js:62-63` |

### One open design question

**Type Racer still lets gibberish "finish."** `finished` is decided from length +
elapsed time, never content, so 118 characters of junk still counts as a finish
(floored at 50 points, which beats every honest non-finisher capped at 49) and
triggers the 20 s closing countdown that cuts everyone else's race short.

This was left alone on purpose: `test/engines/typeracer.test.js` records
**resolved decision #3** — fix the paste *"without inspecting content"*, because
"mistakes won't block you from finishing" is an intended rule. The v1.22.3 rate
cap closes the paste exploit without touching that. Closing the gibberish gap
means revisiting decision #3, which is a product call.

---

## Methodology note — two agent results did not survive verification

Worth recording, because both failure modes are easy to repeat:

1. **A whole Snake suite was invalid.** The agent sent lowercase directions;
   `setSnakeDirection` accepts only uppercase and discards silently. It was
   testing a game where *no input ever registered* and reported every check as
   passing — including "direction reversal correctly refused", when in truth
   everything was refused. Caught by noticing all 8 snakes died in ~1.6 s every
   run: the spawn layout (`server/engine.js`) puts snakes in four head-on pairs
   that collide simultaneously around tick 13 when nobody steers. Re-run
   correctly, Snake is healthy — 45 s / 374 ticks with 8 snakes, tick p50 131 ms
   / p99 134 ms against a 120 ms target, growth and food respawn verified, 0
   anomalies.
2. **A CRITICAL was really a LOW** (Sketch, open item #5 above) — corrected after
   testing exploitability directly rather than reasoning from the code.

**The rule both point at:** a silently-ignored action is indistinguishable from a
passing test. Every "the engine correctly refused X" claim needs a *positive
control* proving the same action shape does work when it should.

## Testing note — the grace blind spot

`test/integration/bomber-disconnect.test.js` already asserted "never credits the
ghost" and **passed**, because the shared `startServer()` helper defaults
`RESUME_GRACE_MS` to `0`. The suite was asserting the post-grace world while
production spends 45 s in the pre-grace one. `grace-stale-roster.test.js` now runs
with the grace explicitly set. **Write future disconnect tests both ways.**
