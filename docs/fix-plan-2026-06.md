# Huddle Play Room — Test-Driven Fix Plan (June 2026)

Companion to [`docs/project-audit-2026-06.md`](./project-audit-2026-06.md). This document answers a specific question first — **"can we write tests that prove each issue is fixed?"** — and only then lays out the resolution plan. The order is deliberate: every fix is gated by a test that fails on today's code and passes once the fix lands (red → green).

---

## Part 0 — Can these be tested? (honest answer)

| Issue class | Testable as pass/fail? | How |
|---|---|---|
| Engine logic bugs (typeracer paste, wordchain turn order, ties, bomber scoring) | **Yes — deterministic unit tests** | Pure engine fns + injected `rng`; `node:test` |
| Server orchestration (disconnect stalls, snake double-loop, timer double-fire, emoji no-timeout) | **Yes — integration tests** | Real server + WebSocket clients (existing smoke-test pattern) |
| Snake input lag | **Partly** | Client-prediction *logic* is unit-testable; perceived latency needs a **measurement protocol** + manual high-latency play |
| CSS jitter interpolation | **No assertion** | Visual / frame-timing measurement protocol |
| `perMessageDeflate` / payload size | **No assertion** | Benchmark script (bytes & CPU per frame) |

So: **~34 of the 43 findings get a real automated test.** The remaining ~9 are latency/render/perf items where the honest verification is a measurement, not a green checkmark — those get a defined protocol with a numeric acceptance target instead.

---

## Part 1 — Test infrastructure (zero new dependencies)

CLAUDE.md says "no test runner" and "don't add libraries without discussing." We honour both:

- **Unit layer:** Node's **built-in** `node:test` + `node:assert/strict` (Node v25 here — fully supported, no install). New folder `test/engines/`.
- **Integration layer:** extend the **existing** hand-rolled WebSocket harness in `test/smoke-test.js` (`createClient`, `waitFor`, `assert`). New folder `test/integration/`, sharing a small extracted helper.
- **Determinism:** engines already take `rng` as a parameter. Add one helper:

```js
// test/helpers/rng.js
// Identity-order RNG: makes fisherYates a no-op, so turnOrder / paragraph / prompts are predictable.
export const identityRng = () => 0.999999;
// Seeded sequence RNG for cases needing specific draws:
export const seqRng = (vals) => { let i = 0; return () => vals[i++ % vals.length]; };
```

- **npm scripts** (add; keep `npm test` = smoke so the pre-push hook is unchanged):
```json
"test": "node test/smoke-test.js",
"test:unit": "node --test test/engines/",
"test:integration": "node --test test/integration/",
"test:all": "npm run test:unit && npm run test:integration && npm test"
```
- **Pre-push hook:** after this lands, update `.git/hooks/pre-push` to run `test:all` (currently runs only smoke).
- **Note on `Date.now()`:** `typeracer`/`sketch`/`bomber` read the real clock. Unit tests use the real clock with generous windows; timing-sensitive cases inject elapsed time via the state where possible.

---

## Part 2 — Concrete test specs (per finding)

Each spec: **Red** = assertion that fails on current code (reproduces the bug). **Green** = assertion that holds after the fix. Representative ones are written out in full; the rest are specified precisely enough to implement directly.

### P0 — reliability bugs

#### T-01 · Snake restart spawns a second game loop  → `test/integration/snake-restart.test.js`
Distinguish one 120ms loop from two by counting `state` frames in a fixed window.
```js
// after hosting + starting snake (status 'playing'), with `host` connected:
host.messages.length = 0;
host.send({ type: 'restart' });          // re-enters startSnake while a loop is live
await new Promise(r => setTimeout(r, 720)); // ~6 ticks @120ms
const frames = host.messages.filter(m => m.type === 'state').length;
assert(frames <= 8, `RED: double-loop emits ~12 frames in 720ms; got ${frames}. GREEN: ~6 (<=8)`);
```
Also assert the snake head advances **one** cell per tick, not two (read two consecutive `state` frames, compare head delta).

#### T-02 · Disconnect mid-vote stalls the phase (Hot Take)  → `test/integration/disconnect-hottake.test.js`
```js
// host + p2 in hottake 'voting'. p2 votes; host leaves without voting.
p2.send({ type: 'gameAction', action: { kind: 'hotTakeVote', vote: 'agree' } });
host.close();
// GREEN (after fix): with only p2 left and p2 has voted, reveal fires fast.
const st = await p2.waitFor('state', 2000);
assert(st.state.status === 'reveal',
  'RED: stays in voting until the timer; GREEN: disconnect re-checks completion → reveal');
```
Replicate for **Truths** (`allTruthsVotesIn`) and **Trivia** (`allAnswered` early-reveal).

#### T-03 · Emoji guessing phase has no timeout (permanent hang)  → `test/integration/emoji-guess-timeout.test.js`
```js
// host(storyteller) + p2(guesser). Storyteller submits emojis → status 'guessing'. p2 disconnects.
// GREEN (after fix): a guessing-phase timer (or disconnect re-check) advances to reveal.
const st = await host.waitFor('state', /* fix's guess timeout + margin */ 8000);
assert(st.state.status === 'reveal',
  'RED: guessing has no interval and exhausted is unreachable → hangs forever; GREEN: resolves');
```

#### T-04 · Untracked `setTimeout` double-fires on host-skip (Word Chain)  → `test/integration/wordchain-double-advance.test.js`
Drive to `round_end` (let a turn time out, or host-skip during play), then host-skip again while the 3s auto-advance is pending. Assert exactly **one** advance:
```js
const before = roomMsg.room.roundWins[winnerId] || 0;
// ... trigger round_end, then immediately: host.send({type:'skipPhase'})
await new Promise(r => setTimeout(r, 3500)); // let any pending setTimeout fire
const after = (await host.waitFor('room')).room.roundWins[winnerId] || 0;
assert(after - before === 1, `RED: double-fire awards 2 & skips a round; GREEN: exactly +1`);
```
Replicate for **Bomber** (`startBomberLoop` setTimeout at index.js:1121).

#### T-05 · Bomber: disconnected player stays alive → round can't end  → `test/integration/bomber-disconnect.test.js`
2-player bomber. p2 disconnects mid-round. GREEN: round resolves to last-man-standing within a couple seconds (not the 120s timer), and the round-win is **not** credited to the departed id.
```js
const room = await host.waitFor('room', 4000);
assert((room.room.roundWins[p2Id] || 0) === 0, 'ghost is not credited a round win');
```
Engine-level companion (`test/engines/bomber.test.js`): set a player `alive:false`, call `stepBomber`/`checkRoundEnd`, assert the dead player is excluded from `aliveIds`/winners.

### P1 — lag + fairness

#### T-06 · Snake input latency / client prediction  → unit + protocol
- **Unit** (`test/engines/snake-client.test.js`): the existing pure client engine `src/game/engine.js` is importable in Node. Assert prediction is immediate and reconciliation is correct:
```js
import { createInitialState, setPendingDirection, step } from '../../src/game/engine.js';
let s = createInitialState({ rows: 30, cols: 30, rng: identityRng });
const head0 = s.snake[0];
s = step(setPendingDirection(s, { x: 0, y: -1 }), identityRng); // predict UP
assert.equal(s.snake[0].y, head0.y - 1, 'local prediction moves the head immediately');
```
This guards the prediction module the fix will wire in. **It only proves the logic; it does not prove perceived latency.**
- **Measurement protocol** (`test/measure-snake-latency.js`, run manually): timestamp an `input` send and the first `state` reflecting the turn. **Acceptance:** after the fix, the *rendered* local snake changes direction within one animation frame of the keypress, independent of server RTT (verified by the unit test above + manual play over a throttled/Sydney link).

#### T-07 · Type Racer paste-to-win  → `test/engines/typeracer.test.js`  *(full example)*
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTyperacerState, handleTyperacerAction } from '../../server/typeracer-engine.js';
import { identityRng } from '../helpers/rng.js';

const players = [{ id: 'p1' }, { id: 'p2' }];

test('RED→GREEN: an instant full-paragraph paste cannot win', () => {
  let s = createTyperacerState({ players, rng: identityRng });
  const full = s.paragraph;
  s = handleTyperacerAction(s, 'p1', { kind: 'progress', typed: full }); // 0 → full in one jump
  const p = s.progress.get('p1');
  // Current code: p.finished === true with an absurd wpm. After fix: paste is rejected or wpm-capped.
  assert.ok(!p.finished || p.wpm <= 200, 'instant paste must not yield an instant/absurd win');
});

test('legitimate incremental typing still finishes (no over-correction)', () => {
  let s = createTyperacerState({ players, rng: identityRng });
  const full = s.paragraph;
  for (let i = 1; i <= full.length; i++)
    s = handleTyperacerAction(s, 'p1', { kind: 'progress', typed: full.slice(0, i) });
  assert.equal(s.progress.get('p1').finished, true);
});
```
> Design note: the fix mechanism (rate-limit chars/sec, or require correct growing prefix + bounded per-update delta) is an implementation choice; the test pins the **observable** outcome.

#### T-08 · Word Chain turn order skips/repeats after elimination  → `test/engines/wordchain.test.js`
Robust version builds state directly (no dictionary dependency) and exercises `eliminateCurrentPlayer`:
```js
import { eliminateCurrentPlayer } from '../../server/wordchain-engine.js';
// 4 players, simulate "current player is the last in active, then times out"
const base = {
  status:'playing', playerIds:['a','b','c','d'], turnOrder:['a','b','c','d'],
  currentIndex:3, currentPlayerId:'d', currentWord:'x', usedWords:new Set(),
  eliminated:new Set(), timer:0, round:1, roundWinnerId:null, lastEliminatedId:null,
  scores:new Map([['a',0],['b',0],['c',0],['d',0]]),
};
const next = eliminateCurrentPlayer(base);
// GREEN: next.currentPlayerId is a real, non-eliminated player and the turn cycle visits
// every active player exactly once before repeating (assert across a full simulated cycle).
assert.ok(!next.eliminated.has(next.currentPlayerId));
assert.notEqual(next.currentPlayerId, 'd');
```
Add a **property test**: from N players, repeatedly advance (valid word via `handleWordChainAction`) and eliminate (timeout); assert the multiset of `currentPlayerId` values per cycle contains each active player exactly once — no skip, no repeat.

#### T-09 · Tie handling (Trivia round winner, Hot Take, Voting, End-Game)  → `test/engines/*.test.js`  *(decision-pinning)*
Hot Take example (`test/engines/hottake.test.js`):
```js
import { createHotTakeState, handleHotTakeAction, revealHotTake } from '../../server/hottake-engine.js';
let s = createHotTakeState({ players:[{id:'a'},{id:'b'}], rng: identityRng });
s = handleHotTakeAction(s, 'a', { kind:'hotTakeVote', vote:'agree' });
s = handleHotTakeAction(s, 'b', { kind:'hotTakeVote', vote:'disagree' });
s = revealHotTake(s);
// RESOLVED rule: an exact split is a valid "Split!" outcome — no award, no hang, round advances.
assert.equal(s.roundResult.majority, 'tie');
assert.equal(s.roundResult.awardedPlayerIds.length, 0, 'a split awards nobody');
assert.equal(s.status, 'reveal', 'a split still advances (never stalls)');
// Trivia counterpart (test/engines/trivia.test.js): on a top-score tie, ALL tied players co-win
// the round (assert every tied id appears in the round-winner set — no first-joiner-only).
```
> Decisions are RESOLVED in Part 3 (2026-06-22): rewards → co-winners share; selections → random among tied.

### P2 — performance & hygiene (mostly protocols / light asserts)

- **T-10 Sketch per-player re-serialization** — micro-benchmark `serializeSketch` with 1000 strokes × 8 players; **acceptance:** post-fix caches the shared non-secret payload (assert it's computed once per tick, e.g. via a call counter/spy).
- **T-11 `findRoomByPlayer` linear scan** — after switching to a `playerId → room` index, unit-assert lookup is O(1) and still correct across host/join/leave.
- **T-12 Heartbeat comment/period** — trivial: assert the interval constant and comment agree (or just fix; low value as a test).
- **T-13 Frontend leaks** (FeedbackModal timeout, Bomber canvas resize, Emoji search re-flatten, Bomber double-send) — these need a component test runner (Vitest/RTL = **new deps, must discuss**). Until then: verify by code review + manual. Do **not** add a frontend test framework without sign-off.
- **T-14 deflate / delta / lag protocols** — `test/measure-frame-size.js`: log bytes per Snake frame and frames/sec; **acceptance:** smaller frames (delta) and/or deflate disabled for the snake path.

---

## Part 3 — Resolution plan (ordered, TDD)

Work top-down; within each item: **write the test (red) → implement → green → run `npm test` smoke to confirm no regression.** Bump version per CLAUDE.md after each shippable group, push to `personal` only.

### Phase A — P0 reliability (highest value, mostly small fixes)
- **A0. Stand up test infra** (Part 1): `test/helpers/rng.js`, `test/engines/`, `test/integration/`, npm scripts. Extract the `createClient` harness from `smoke-test.js` into `test/helpers/ws-client.js` so both can use it.
- **A1. Centralised disconnect reconciliation** — the root fix for ~10 findings. In `handleDisconnect` (`server/index.js:617`): when `status==='playing'`, (a) prune the leaver from the active engine's `playerIds`/`votes`/turn structures, (b) reassign storyteller/drawer/active-player if it was them, (c) re-run the phase-complete check (`allHotTakeVotesIn`/`allTruthsVotesIn`/`allAnswered`/bomber `checkRoundEnd`) and advance if satisfied. Tests: **T-02, T-03, T-05**.
- **A2. `startSnake` calls `stopLoop(room)` first** — one line. Test: **T-01**.
- **A3. Track auto-advance timers** — store the round-end `setTimeout` id (e.g. `room.pendingAdvance`) and clear it in `stopLoop`. Test: **T-04** (wordchain + bomber).
- **A4. Emoji guessing-phase timeout** — add a guessing interval/deadline so the phase can't hang. Test: **T-03**.

### Phase B — P1 lag + fairness
- **B1. Snake client-side prediction** — wire the existing `src/game/engine.js` into `SnakeGame.jsx`: apply the local player's direction immediately, render predicted state, reconcile/snap on the authoritative frame. Test: **T-06** (unit + protocol). *Biggest UX win.*
- **B2. Jitter-aware interpolation** — replace the fixed `transition: transform 120ms` with interpolation over the measured inter-frame gap (or rAF against buffered frames). Protocol: **T-14**.
- **B3. Type Racer prefix/rate validation** — Test: **T-07**.
- **B4. Word Chain turn-order fix** — make `eliminateCurrentPlayer` and `advanceTurn` index consistently. Test: **T-08**.
- **B5. Tie handling** (needs product decisions — see ⚠️ below) — Test: **T-09**.

### Phase C — P2 perf / hygiene
- **C1.** Disable `perMessageDeflate` for snake / send deltas (T-14). **C2.** Cache sketch serialization (T-10). **C3.** `playerId→room` index (T-11). **C4.** Heartbeat comment, room reaper, dead-code removal (`applyImmediateMove`, unused client engine once B1 either uses or replaces it). **C5.** Frontend leaks (T-13) — review-only unless we agree to add a component test runner.

### ✅ Decisions (RESOLVED 2026-06-22)
**Unifying principle:** *rewards are shared, selections are random.* Replace every strict-`>`-over-Map-order winner pick with: ties on a **reward** → all tied-top players are co-winners; ties on a **selection** → random among tied (use the injected `rng`).

1. **Trivia round winner tie:** all top-scorers co-win the round (each credited). **Voting (game select) tie:** random pick among tied games via `rng`. **Hot Take exact split:** a tie is a valid **"Split!"** outcome — nobody scores, clearly labelled, round still advances to reveal (do NOT award both sides; it would void the read-the-room mechanic and doesn't help anyway — see note).
   - *Known limitation (not in scope):* binary-vote Hot Take can never differentiate **2** players (their scores always move in lockstep). A real fix is a different mechanic (secretly predict the majority, score for predicting right) — flagged as an optional **future enhancement**, not this pass.
2. **End-Game game-win on a round-win tie:** **co-champions** — every tied leader gets a persistent game win. No secondary tiebreak (round wins is already the metric).
3. **Type Racer anti-cheat:** **(a)** require `typed` to be a correct growing prefix of the paragraph, **plus (b)** gate a "finish" on a minimum plausible time — `finishTime - raceStartTime >= paragraph.length / MAX_CPS` with `MAX_CPS ≈ 20` (~240 WPM). A paste finishing in ~0.2s is not accepted as a finish; keystrokes are still recorded. Chosen over a raw WPM clamp because scoring rewards *elapsed time*, so gating the finish removes the cheat's advantage at the source.
4. **Reconnection:** **keep "disconnect = gone" for this pass** — do NOT add session-resume now (it's a feature, and it keeps A1 tractable). **Flagged as the #1 next feature:** a brief-grace-period reconnect (hold the slot ~20–30s, rejoin with the same id) is the highest-value reliability UX for a phone party game (screen-lock / app-switch disconnects).

### Rough sequencing / effort
A2 + A3 are quick wins (hours). A1 is the big one (touches every game's disconnect path) — do it test-first, one game at a time. B1 is the headline lag fix and the largest frontend change. C-phase is incremental and low-risk.

---

## Part 4 — How to start in a new session

1. **Open a fresh Claude Code session in this repo** (this worktree/branch is fine, or a new branch off `main`).
2. **Paste this kickoff prompt:**

   > Read `docs/project-audit-2026-06.md` and `docs/fix-plan-2026-06.md`. We're executing the fix plan **test-first**. Start with **Phase A**: build the test infrastructure (Part 1), then implement A1–A4, writing each test red before the fix and confirming green after. Don't touch Phase B/C yet. For each fix, also run `npm test` (smoke) to confirm no regression. Before pushing, bump the version per CLAUDE.md and push to `personal` only. Pause after Phase A so I can review.

3. **First concrete steps the session should take (Phase A):**
   - Create `test/helpers/rng.js` and `test/helpers/ws-client.js` (extract from `smoke-test.js`), add the npm scripts.
   - Write `test/integration/snake-restart.test.js` (**T-01**) → watch it fail → add `stopLoop(room)` to `startSnake` → watch it pass (**A2**).
   - Write `test/integration/disconnect-*.test.js` (**T-02/03/05**) → implement A1 disconnect reconciliation game-by-game → green.
   - Write `test/integration/*-double-advance.test.js` (**T-04**) → implement A3 timer tracking → green.
   - Run `npm run test:all`, then `npm test`.
4. **The four design decisions are already resolved** (Part 3, 2026-06-22) — implement them as written; no need to re-ask.
5. **Verification mindset:** a fix isn't "done" until its test goes red→green *and* the smoke test still passes. Evidence before claims.

---

## Appendix — finding → test mapping (coverage check)

| Finding (audit) | Test | Layer |
|---|---|---|
| Snake restart double-loop | T-01 | integration |
| Disconnect stalls vote/answer (hottake/truths/trivia) | T-02 | integration |
| Frozen `playerIds` never reconciled | T-02/T-05 | integration |
| Emoji guessing no timer | T-03 | integration |
| Storyteller/drawer disconnect | T-03 (variant) | integration |
| Untracked setTimeout double-fire (wordchain/bomber) | T-04 | integration |
| Bomber ghost alive / mis-credited win | T-05 | integration + unit |
| Snake input lag / no prediction | T-06 | unit + protocol |
| CSS interpolation jitter | T-06/T-14 | protocol |
| Type Racer paste-to-win | T-07 | unit |
| Word Chain turn order | T-08 | unit |
| Trivia/HotTake/Voting/EndGame ties | T-09 | unit (decision-pinning) |
| Sketch per-player serialization | T-10 | benchmark |
| findRoomByPlayer scan | T-11 | unit |
| Heartbeat comment/period | T-12 | trivial |
| Frontend leaks (4 findings) | T-13 | review/manual (no FE runner yet) |
| perMessageDeflate / full-state-per-tick | T-14 | benchmark |
| Bomber 1s round-end shorten | (covered by A3 timer rework) | integration |
| applyImmediateMove dead code / unused client engine | (removed/used in B1/C4) | n/a |

**Coverage:** every HIGH and MEDIUM finding has an automated test; only the latency/render/perf items and the 4 frontend-leak nits fall back to protocols/review (flagged, not silently dropped).
