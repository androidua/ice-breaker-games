# Huddle Play Room — Project Audit (June 2026)

**Scope:** bugs, edge cases, and speed/reliability improvements. Review only — no code was changed.
**Method:** a dynamic multi-agent workflow fanned out across 9 review dimensions (server hot-path, WebSocket lifecycle, each game engine, frontend, cross-cutting). It produced **46 raw findings → 43 unique**. Every HIGH-severity finding below was then **verified by reading the cited code directly**. (The workflow's automated verifier hit a monthly spend limit partway through; verification + synthesis were completed inline, which is why this report exists as a durable file.)

**Headline:** the Snake lag your Sydney colleagues felt is **not a code bug** — it is an architecture choice (server-authoritative input + full server round-trip with no client-side prediction), made worse by the server living in a US Railway region. Three of the highest-impact *reliability* issues are also new: a permanent round-stall when a player disconnects mid-phase, a Snake "restart" that spawns a second game loop, and untracked timers that double-fire on host-skip.

---

## 1. Why Snake feels laggy from Sydney (root-cause diagnosis)

The lag is **input latency**, and it comes from four stacked causes:

**A. Input is fully server-authoritative with no client-side prediction (the dominant cause).**
When a player presses an arrow, `SnakeGame.jsx` only sends `{type:'input'}` to the server (`src/games/SnakeGame.jsx:40`). The server's `handleInput` (`server/index.js:819`) just mutates `room.game` — it does **not** echo anything back immediately. The player sees their snake turn only when the *next* 120ms tick broadcasts (`server/index.js:837`). So perceived turn latency =
`½ RTT (key → server) + up to 120ms (wait for next tick) + ½ RTT (broadcast → client)`.
Sydney ↔ a US Railway region is roughly **200–300ms round-trip**, so a turn can take **~¼ to ⅓ of a second** to appear. That is exactly the "laggy" feel — the snake reacts a beat after you press.

**B. There is a client-side prediction engine in the repo — but it is dead code.**
`src/game/engine.js` is a complete, pure Snake engine (`step()`, `setPendingDirection()`, collision, food). **Nothing imports it** (`grep` across `src/` returns zero references). The capability to predict the local player's movement locally and reconcile against the server already exists; it simply was never wired into the multiplayer component. This is the natural fix path.

**C. The v1.16.0 "client interpolation" is only a CSS transition, and it can't hide jitter.**
What v1.16.0 actually added is `transition: transform 120ms linear` on `.snake-segment` (`src/index.css:158`). That cosmetically glides segments between server frames, but it is a *fixed* 120ms tween: when a frame arrives late (network jitter, which is common over a long-haul link), the segment finishes its tween early and **stalls**, then **snaps** when the late frame lands. So it smooths the steady case but amplifies the stutter under exactly the conditions your colleagues hit.

**D. Compounding factors.**
- **Snake-restart double-loop** (HIGH, see §3): `startSnake` is the only game-start function that forgets to call `stopLoop` first, so a restart can leave two 120ms intervals broadcasting at once — erratic, faster-than-intended motion that reads as "glitchy."
- **`perMessageDeflate` on tiny frames** (`server/index.js:395`): every Snake frame >128B is compressed. For small, high-frequency frames the compress/flush CPU and the deflate context overhead can cost more latency than the bytes saved.
- **Full-state-per-tick** (`server/index.js:837` → `serializeSnake`): the entire board (every segment of every snake) is re-serialized and re-sent every 120ms, with no delta. Fine at 8 players, but it inflates each frame that then has to cross the Pacific.

### Recommended fix path for the lag (in priority order)
1. **Wire up client-side prediction** using the existing `src/game/engine.js`: apply the local player's direction change immediately on keypress, render predicted positions, and reconcile/snap when the authoritative server frame arrives. This removes the full round-trip from *perceived* input latency — the single biggest win.
2. **Replace the fixed CSS transition** with frame-time-aware interpolation (tween from the previous server position to the new one over the *measured* inter-frame gap, not a hard-coded 120ms), or drive rendering off `requestAnimationFrame` against buffered server frames. Eliminates the stall/snap under jitter.
3. **Reconsider hosting region.** Even with prediction, *other* players' snakes and all the non-Snake real-time games still round-trip. If a meaningful share of players are in AU, a Railway region closer to them (or a second region) is the highest-leverage infra change. At minimum, measure RTT from Sydney to the current region.
4. **Disable `perMessageDeflate` for the Snake path** (or raise the threshold well above a Snake frame's size) and **send deltas** instead of full board state. Smaller, cheaper frames.
5. **Fix the restart double-loop** (§3) so motion is never doubled.

> Quick experiment to confirm A vs C dominate: open DevTools on a phone and watch the gap between an arrow press and the server `state` message vs the on-screen turn. If the snake reacts only after the round-trip, prediction (step 1) is the fix.

---

## 2. Cross-cutting themes (most findings cluster into four root causes)

Fixing these four roots resolves ~20 of the 43 findings at once:

| Theme | Root cause | Findings it explains |
|---|---|---|
| **Disconnect handling is Snake-only** | `handleDisconnect` (`server/index.js:617-642`) marks a leaving player's *snake* dead but does nothing for any other game. | Bomber ghost stays alive (round never ends); emoji/sketch storyteller-drawer leaves → 45s dead screen; trivia/hottake/truths early-reveal never fires; wordchain resurrects eliminated players. |
| **Game state is frozen at start** | Engines snapshot `playerIds` at creation and never reconcile membership. `allHotTakeVotesIn`/`allTruthsVotesIn`/trivia `allAnswered` compare against the frozen count. | After *any* mid-phase disconnect, "everyone has voted/answered" can never become true → the phase stalls until its timer expires. |
| **Auto-advance timers are untracked** | Round-end `setTimeout`s (`server/index.js:1121` bomber, `:1190` & `:594` wordchain) are not stored in `room.interval`, so `stopLoop` cannot cancel them. | Host-skip + the pending timer both fire → double round-win award + a skipped round; double `nextRound`. |
| **Tie/winner attribution is order-dependent** | Round/game winners are picked with strict `>` over Map insertion order, no tie handling. | Trivia/Hot Take/End-Game silently credit the earliest-joining player on a tie; Hot Take awards *zero* points on any even split (2-player games never score). |

---

## 3. Prioritized fix list

### P0 — reliability bugs that visibly break a game session
- **Snake restart spawns a second concurrent game loop.** `startSnake` (`server/index.js:833`) never calls `stopLoop` (every other `start*` does). A host pressing "Play again" while a loop is live runs two 120ms intervals → double-speed, erratic snake; the orphaned loop leaks. *Fix: add `stopLoop(room)` at the top of `startSnake`.*
- **Disconnect mid-phase stalls the round until the timer runs out** (emoji *guessing has no timer at all* → permanent stall, host-skip only). *Fix: in `handleDisconnect`, prune the leaver from the active game's player set and re-run the phase-complete check; give the emoji guessing phase a timeout fallback.*
- **Untracked `setTimeout`s double-fire on host-skip** (Word Chain & Bomber): double round-win award + skipped round. *Fix: store the timeout id (e.g. `room.pendingAdvance`) and clear it in `stopLoop`.*
- **Bomber: disconnected player never marked dead** → round can't reach last-man-standing for up to ~2 min, and a departed "ghost" can be credited the round win. *Fix: mirror the Snake branch in `handleDisconnect` for bomber; filter winners against current room membership.*

### P1 — the lag (see §1) + fairness/correctness
- Wire up client-side prediction for Snake (the existing unused engine). **Biggest UX win.**
- **Type Racer paste-to-win:** `updateProgress` (`server/typeracer-engine.js:202`) marks a player finished when the submitted string's length ≥ paragraph length, with no prefix/incremental/timing check. One paste of the paragraph = instant max-score win. *Fix: validate that `typed` is a growing correct prefix and reject implausible jumps.*
- **Word Chain turn order** can skip/repeat a player after an elimination following a wrap-around (`advanceTurn` and `eliminateCurrentPlayer` index differently-filtered arrays — `server/wordchain-engine.js:99,129`). *Fix: derive the next player from the eliminated player's position consistently in both paths.*
- **Tie handling** for round/game winners and Hot Take's zero-points-on-tie (2-player games never score).

### P2 — performance & hygiene (lower urgency at 8-player scale)
- Replace the fixed CSS transition with jitter-aware interpolation; disable `perMessageDeflate` / send deltas for Snake.
- Per-player re-serialization of Sketch strokes (up to 1000×500 points) every second for 45s — cache the serialized non-secret payload.
- `findRoomByPlayer` linear-scans all rooms on every inbound message — index players → room in a Map.
- Heartbeat interval never cleared and its comment claims 25s but uses 15s (`server/index.js:405-418`).
- No idle/abandoned-room reaper — rooms rely solely on the WS close event.
- Dead code: `applyImmediateMove` imported but never called; `src/game/engine.js` unused.
- Frontend: `FeedbackModal` success `setTimeout` not cleared on unmount; Bomber canvas has no resize/orientation handler; EmojiGame re-flattens ~700 emojis per keystroke; Bomber double-sends movement (App-level + component handlers).

### Quick wins (low effort, high value)
1. `stopLoop(room)` at the top of `startSnake` — one line, kills the double-loop.
2. Track the auto-advance `setTimeout` ids so `stopLoop` clears them — kills the double-fire.
3. Prune `playerIds`/votes on disconnect and re-check phase completion — unsticks every "phase frozen after someone left" case.
4. Add a guessing-phase timeout to Emoji — removes the only *permanent* hang.
5. Validate Type Racer progress is a correct growing prefix — closes paste-to-win.

---

## 4. Note on methodology & the spend limit

This audit was generated by a `Workflow` fan-out (9 reviewer agents → per-finding adversarial verifiers → synthesis). The reviewers finished, but the verification/synthesis agents hit a **monthly spend limit** mid-run, so 7 findings were machine-verified and the rest were left unverified. Recovery was done by reading the agents' transcripts to salvage all 46 findings, then verifying the high-severity ones inline (cheaper — no further subagent spend) and writing this file incrementally so progress survives any future interruption.

**For next time, to avoid the limit:** run the review in smaller batches (e.g. 2-3 dimensions per workflow invocation, each writing its findings to a file before the next runs), use a cheaper model (`effort: 'low'` / Haiku) for the mechanical verify stage, or skip the per-finding verifier and verify only HIGH/MEDIUM findings. The script is saved and resumable at `…/workflows/scripts/hpr-project-review-wf_7b0689b3-07d.js`.

---

## 5. Full findings appendix

All 43 unique findings, highest severity first. Legend: ✅ machine-verified · 🔍 verified inline by reading the code · ⏳ reported by review, not yet independently verified.

### 1. [HIGH · edge-case] Game engine playerIds/votes/presenter are frozen at start and never reconciled on disconnect
**🔍 verified inline** — `server/hottake-engine.js` (allHotTakeVotesIn (lines 306-308) using state.playerIds.length; mirrored in truths-engine.js allTruthsVotesIn (lines 76-79); disconnect path server/index.js lines 617-642)

createHotTakeState/createTruthsState snapshot playerIds at game start (hottake-engine.js line 272, truths-engine.js line 13). handleDisconnect (index.js) never updates room.game.playerIds, room.game.votes, room.game.scores, room.game.turnQueue, or room.game.presenterId. Consequences: (1) allHotTakeVotesIn requires votes.size >= playerIds.length using the ORIGINAL roster, so once anyone leaves mid-round the all-votes-in early reveal can never fire and the round only ends when the 15s VOTE_DURATION timer expires. (2) In Truths, nextTruthsRound (lines 108-131) rotates presenterId through the frozen playerIds/turnQueue and can select a player who has already disconnected; since only the presenter can submitStatements (line 48), that round is dead for the full 60s SUBMIT_DURATION before the timer auto-advances. (3) scores Maps retain ghost entries for departed players, which serializeTruths/serializeHotTake still broadcast.

*Impact:* After any mid-game disconnect, Hot Take rounds lose their snappy 'everyone voted' advance and always wait out the timer; Truths can hand the presenter role to a ghost and freeze the round for a full minute. With max 8 players on flaky mobile links this degrades the core loop noticeably.

*Fix:* Add a reconciliation step in handleDisconnect that, for the active game, removes the clientId from room.game.playerIds, room.game.votes, and room.game.scores, drops it from turnQueue, and — if the departed player was the Truths presenter mid-submitting/voting — advances the round (nextTruthsRound or triggerTruthsReveal). Recompute presenterId if it now points at a missing player. Then re-broadcast.

### 2. [HIGH · reliability] Emoji guessing phase has no timer, so a disconnected (or idle) guesser hangs the round indefinitely
**🔍 verified inline** — `server/index.js` (handleGameAction emoji case (lines 741-753) + startEmojiComposeTimer/stopLoop (lines 744-746); engine allEmojiGuessersExhausted/allEmojiGuessersCorrect (server/emoji-engine.js:419-430))

On composing -> guessing the server calls stopLoop(room) (index.js:746) and starts NO new interval, so the guessing phase is entirely timer-less. The round only advances when allEmojiGuessersCorrect or allEmojiGuessersExhausted becomes true, evaluated on every guess (index.js:748). Both functions iterate state.playerIds (emoji-engine.js:420, 426) — the FROZEN player list captured at createEmojiState, which is never updated on disconnect. handleDisconnect (index.js:617-642) deletes the player from room.players but not from game.playerIds. If a guesser disconnects (or simply stops guessing) during guessing, they remain in playerIds, are never in correctGuessers, and their guessAttempts never reach the limit, so guessers.every(...) is permanently false. There is no timer to force a reveal.

*Impact:* The round freezes for all players. The only escape is the host manually invoking skipPhase (index.js:566-568). If the host is the player who left, or is unaware, the emoji game is stuck indefinitely. Given the stated 'no reconnection handling', a single dropped guesser reliably stalls the game.

*Fix:* Either (a) run a guessing-phase timer in startEmojiGame so the round always reveals after a bounded time, or (b) make the exhaustion/all-correct checks operate over currently-connected players. Cleanest: on disconnect, drop the player from game.playerIds (and storyteller reassignment) and re-evaluate allEmojiGuessersCorrect/allEmojiGuessersExhausted, triggering reveal if now satisfied.

### 3. [HIGH · reliability] Disconnect during any vote/answer phase never re-checks completion — phase stalls until the timer expires
**🔍 verified inline** — `server/index.js` (handleDisconnect (lines 617-642); all-votes-in checks only at handleVote line 669, handleGameAction lines 735 (truths) and 794 (hottake))

The 'all votes in' early-advance checks (allVotesIn, allTruthsVotesIn, allHotTakeVotesIn) are only evaluated inside a player's own action handler. handleDisconnect removes the player from room.players (line 621) but never re-evaluates whether the remaining players have now all voted. Concrete case for the lobby voting phase: 3 players, 2 have voted, the 3rd (a non-voter) disconnects. After line 621 room.players.size becomes 2 and votingState.votes.size is 2, so allVotesIn would now be true — but it is never called. The room sits on the voting screen for the remainder of the 30s VOTING_DURATION before finishVoting fires from the timer tick (startVoting interval, line 686). The same gap applies to Hot Take and Truths voting, where the only thing that rescues the round is the per-game timer.

*Impact:* Players who finished voting are stuck staring at a frozen vote/answer screen for up to 30s (lobby voting) or up to the game's vote timer, every time the last outstanding voter drops or rage-quits. On a high-RTT/flaky mobile connection (the reported Sydney scenario) this happens often and feels like the app hung.

*Fix:* At the end of handleDisconnect, re-run the relevant completion check for the current phase: if room.status === 'voting' and allVotesIn(room.votingState, room.players.size) call finishVoting(room); if playing Truths in 'voting' and allTruthsVotesIn(room.game) call triggerTruthsReveal(room); if playing Hot Take in 'voting' and allHotTakeVotesIn(room.game) call triggerHotTakeReveal(room). Guard each against room already being torn down.

### 4. [HIGH · reliability] Snake restart spawns a second concurrent game-loop interval (startSnake skips stopLoop)
**🔍 verified inline** — `server/index.js` (startSnake (lines 833-847); handleRestart (lines 513-521))

Every other game-start helper calls stopLoop(room) before assigning room.interval = setInterval(...), but startSnake does not. handleRestart accepts a restart whenever room.status === "playing" && room.currentGame === "snake" — it does NOT require the round to be over. The client only shows the restart button when roundOver, but the server is the trust boundary. If a client sends {type:"restart"} while the snake is still status==="running" (stale view, double-click race, or a non-conformant client), startSnake overwrites room.interval with a fresh setInterval while the previous interval is never cleared. stopLoop only ever clears the latest room.interval, so the first interval becomes an orphan that ticks stepGame()+broadcast every 120ms forever.

*Impact:* A leaked 120ms interval runs for the room's entire lifetime: doubled state broadcasts (worsening the already-noted Sydney lag), wasted CPU on the tightest loop in the app, and on game-over the orphan fires its own stopLoop+awardRoundWin, double-counting the round win and corrupting the leaderboard. Multiple restarts stack multiple orphans.

*Fix:* Add stopLoop(room) as the first line of startSnake (matching every other start* helper). Optionally also gate handleRestart on the round actually being over (room.game.status !== "running").

### 5. [HIGH · bug] Untracked setTimeout in Word Chain round-end double-fires: double round-win award + skipped round
**🔍 verified inline** — `server/index.js` (startWordChainTick (lines 1177-1200) and handleSkipPhase wordchain branch (lines 580-602))

When the turn timer expires, startWordChainTick calls eliminateCurrentPlayer -> round_end, calls awardRoundWin once, and schedules an auto-advance via setTimeout(...) that is NOT stored in room.interval — so stopLoop() cannot cancel it. Note the interval itself is also never stopped on round_end, it keeps ticking. If the host presses Skip during the ~4s reveal window, handleSkipPhase's round_end branch calls awardRoundWin AGAIN (same roundWinnerId, double count) then nextWordChainRound + startWordChainTick. The orphaned setTimeout from the tick later fires, passes its room.status==="playing" guard (the new round is playing), calls stopLoop() — killing the NEW round's interval — then nextWordChainRound a second time, skipping a whole round and restarting the loop on a stale state.

*Impact:* The round-win leaderboard is inflated (winner credited twice), an entire round is silently skipped, and the active round's timer interval is torn down and re-created mid-play. Because round wins drive the persistent game-win attribution on End Game, this corrupts final standings.

*Fix:* Store the auto-advance handle (e.g. room.advanceTimeout = setTimeout(...)) and clear it in stopLoop and at the top of the skip handler; or call stopLoop(room) when entering round_end and guard nextWordChainRound so it can only run once per round (e.g. check current status is still round_end before advancing).

### 6. [HIGH · reliability] Emoji guessing phase has no timer — a guesser disconnecting permanently stalls the round
**🔍 verified inline** — `server/index.js` (handleGameAction emoji case (lines 741-753) + handleDisconnect (lines 617-642); engine allEmojiGuessersExhausted in emoji-engine.js (lines 424-430))

When the Emoji storyteller submits, the code calls stopLoop(room) (line 746) and submitEmojis sets timer:null (emoji-engine.js:382). The guessing phase therefore runs with NO interval — it advances ONLY when allEmojiGuessersCorrect or allEmojiGuessersExhausted becomes true. Both iterate state.playerIds.filter(id => id !== storytellerId). handleDisconnect (line 621) deletes the player from room.players but never from the engine's state.playerIds. A disconnected guesser thus stays in the required-guesser set forever: they will never guess correctly and never exhaust their attempt count, so allEmojiGuessersExhausted returns false indefinitely. The round hangs with no timer to break it.

*Impact:* If any guesser closes their tab / drops WiFi during the Emoji guessing phase, the round freezes for everyone. The only escape is the host manually pressing skip (triggerEmojiReveal via handleSkipPhase) or ending the game. On a high-RTT/flaky connection (e.g. the reported Sydney players), a mid-round drop is plausible and produces a dead game.

*Fix:* Either (a) run a guessing-phase timeout interval like every other phase so the round always self-resolves, or (b) in handleDisconnect, when currentGame is 'emoji' and status is 'guessing', re-check allEmojiGuessersExhausted/allEmojiGuessersCorrect against the now-smaller player set and trigger reveal if satisfied. Reconciling the engine's playerIds with room.players on disconnect (a shared 'removePlayer' across engines) is the robust fix.

### 7. [HIGH · edge-case] Bomber: disconnected player stays alive, round never resolves to last-man-standing
**✅ machine-verified** — `server/index.js` (handleDisconnect (lines 617-642), interacting with bomber-engine.js checkRoundEnd (lines 323-343))

handleDisconnect only updates per-game state for snake: at lines 633-636 it marks the leaving player's snake dead. There is NO equivalent for bomber. The disconnected player's entry remains in state.players with alive:true. checkRoundEnd (bomber-engine.js:324) computes alivePlayers from state.players.values(); a phantom alive player keeps alivePlayers.length > 1, so the round can never end via last-man-standing. Example: a 2-player bomber round where one player closes their tab — the remaining player kills no one (the opponent left), so the round only ends when the 120s ROUND_DURATION timer expires (tickBomberTimer, bomber-engine.js:348). The phantom is also counted as a co-winner if the timer path runs (line 350 filters alive players including the ghost) and gets a round score (computeRoundScores), and awardRoundWin in index.js:1117 credits a player who already left.

*Impact:* Bomber rounds with a mid-round disconnect hang for up to ~2 minutes instead of ending immediately, and round-win credit can be mis-attributed to a player who already left the room. Highly likely given 'No reconnection handling' and phone players backgrounding the app.

*Fix:* In handleDisconnect, add a bomber branch mirroring the snake one: if room.currentGame === 'bomber' && room.game?.players?.has(clientId), mark that player alive:false (and ideally remove their active bombs/clear from future scoring) before sendRoomUpdate, so checkRoundEnd resolves correctly. Optionally re-run a checkRoundEnd pass after the disconnect to end the round instantly.

### 8. [HIGH · security] Type Racer accepts arbitrary progress strings with no prefix/forward/timing validation (paste-to-win)
**🔍 verified inline** — `server/typeracer-engine.js` (updateProgress (lines 195-224), revealTyperacer scoring (lines 237-239))

updateProgress(state, playerId, typed) takes the client-supplied typed string, only slices it to paragraph.length+10 (line 202), and treats length >= paragraph.length as finished (line 203). There is no check that typed is a prefix of the target, no check that progress only moves forward, and no minimum-elapsed-time guard. countMistakes only penalises characters that differ, so pasting the EXACT paragraph in a single 'progress' message yields 0 mistakes and an immediate finish. With finishTime ~0.5s after raceStartTime, revealTyperacer awards Math.max(50, 1000 - floor(elapsedSeconds*10) - 0) ~= 995 points and serializeTyperacer reports a WPM in the thousands.

*Impact:* Any player can trivially win every round and post impossible WPM by pasting (or scripting) the full paragraph, which is visible to them in the UI. Destroys the competitive integrity of the game and the leaderboard.

*Fix:* Reject or clamp submissions where typed is not a prefix of the paragraph up to its length; reject regressions where new typed length is far below the previously recorded length; and gate finish on a plausible minimum elapsed time / maximum implied WPM (e.g. cap WPM at a sane ceiling and discard finishes faster than physically possible). At minimum, only count correctly-typed prefix characters toward progress so a wrong-but-long paste cannot finish.

### 9. [HIGH · bug] Word Chain turn order skips/repeats players after a wrap-around followed by a timeout
**🔍 verified inline** — `server/wordchain-engine.js` (eliminateCurrentPlayer (lines 107-139), advanceTurn (lines 99-104), currentIndex semantics)

advanceTurn computes nextIndex as a POSITION within the post-filter active array and stores it in state.currentIndex (line 102-103). eliminateCurrentPlayer then reuses that same numeric currentIndex against the NEWLY shrunk active array (line 129: active[state.currentIndex % active.length]) and never updates currentIndex itself. The two paths assume currentIndex always equals the position of currentPlayerId in the active list, but that invariant breaks once the forward turn pointer wraps around (e.g. A->B->C->D->E->A drives currentIndex back to a low value while currentPlayerId is high) and then the active player times out. I brute-forced every sequence of valid-word/timeout actions over a 5-player order: 11 sequences produce the wrong next player. Minimal repro: 4 valid words from the same starting player (turn wraps, currentIndex small) then a timeout -> engine picks e.g. C when it should pick B, either skipping a player's turn or giving someone two turns in a row.

*Impact:* After a timeout-elimination that follows a wrap-around, the wrong player is handed the turn: a player can be skipped (denied their turn and at risk of unfair elimination) or forced to play twice. Unfair turn order in a competitive elimination game; players see the highlighted active player jump unexpectedly.

*Fix:* Stop tracking a numeric currentIndex as the source of truth. In eliminateCurrentPlayer, determine the next player relative to the eliminated player's position: compute the active list BEFORE removal, find the eliminated player's index, then pick active[(idx) % newActive.length] from the post-removal list (i.e. the element that shifted into that slot), or equivalently find the next non-eliminated id walking forward in turnOrder from currentPlayerId. Derive currentIndex from indexOf(currentPlayerId) wherever it is needed instead of carrying a stale value.

### 10. [HIGH · performance] Direction changes are fully server-authoritative with no client-side prediction — every keypress round-trips to the US server before the snake reacts
**🔍 verified inline** — `src/games/SnakeGame.jsx` (SnakeGame onTouchMove (line 40), dpad onClick (lines 153-156), App.jsx handleKey (lines 110-115) -> send({type:'input'}); server handleInput at server/index.js:811-820 calls setSnakeDirection and only mutates room.game; the player never sees their input applied until the NEXT broadcastGameState fires inside the 120ms tick at server/index.js:837-839)

An input event does nothing locally. It is sent to the server, stored as snake.pendingDirection (server/engine.js:189-199), applied on the next stepGame tick, and the result is only visible after the resulting 'state' broadcast arrives back at the client and replaces game wholesale (App.jsx:94-95 setGame(msg.state)). There is no local echo and no predicted movement. The visible latency from a keypress to the snake turning is therefore RTT_up + (time-to-next-tick, 0–120ms) + RTT_down. From a Sydney office to a US Railway region, RTT is ~200ms+ each way, so a turn takes ~400–500ms+ to appear. That is exactly the 'laggy' feel reported. The dead module src/game/engine.js (createInitialState/step/setPendingDirection) is a full client-side engine that is imported by nobody (grep finds zero importers) — the prediction it would enable was never wired up.

*Impact:* On any high-RTT link (Sydney->US), the snake feels unresponsive: turns lag ~400–500ms behind the keypress, causing missed turns and unintended wall/self collisions. The game feels broken specifically for far-from-US players, matching the report.

*Fix:* Add client-side input prediction: on input, immediately apply the direction locally (reuse the already-present but unused src/game/engine.js setPendingDirection/step logic, or a lightweight local model) and reconcile when the authoritative 'state' arrives, snapping only on divergence. At minimum, optimistically render the chosen direction so the turn is acknowledged instantly. The server stays authoritative for collisions/food.

### 11. [MEDIUM · bug] Bomber: dead/disconnected players still receive elimination points; ghost can win the round
**✅ machine-verified** — `server/bomber-engine.js` (tickBomberTimer (lines 345-364) and applyRoundScores/computeRoundScores (lines 300-321))

When the 120s timer expires, tickBomberTimer (line 350) collects ALL players with alive:true into aliveIds and treats them as co-winners. Because disconnected bomber players are never marked dead (see related finding), a player who left the room is included as a co-winner: they appear in roundWinnerIds (applyRoundScores line 317-319) and index.js:1117 awards them a round win via awardRoundWin. Even without disconnects, this is the only sensible timer path, but combined with the disconnect gap it produces a winner who is no longer present.

*Impact:* Leaderboard round-win counts can be credited to absent players, corrupting the visible standings for the rest of the session.

*Fix:* Filter roundWinnerIds / scored ids against room membership before awarding (e.g. in index.js:1117 skip ids not in room.players), or fix the root cause by marking disconnected bomber players dead so they are excluded from aliveIds.

### 12. [MEDIUM · edge-case] Hot Take awards zero points on any tie, making 2-player (and even-split) games permanently scoreless
**⏳ reported (not independently re-verified)** — `server/hottake-engine.js` (revealHotTake, lines 320-340)

revealHotTake computes isTie = agreeCount === disagreeCount; on a tie majority is 'tie', awardedPlayerIds is [] (line 322), no scores change (lines 324-327), and roundWinnerId is set to null (line 340). In a 2-player game where the two players vote opposite ways, every single round is a tie, so nobody ever scores and roundWinnerId is always null. Because index.js startHotTakeTick calls awardRoundWin(room, room.game.roundWinnerId) (line 1154) and awardRoundWin returns immediately on a null winner (index.js lines 646-647), no round wins are ever recorded either. On End Game (handleEndGame, lines 528-539) maxWins stays 0 so no game win is awarded.

*Impact:* Hot Take is effectively unwinnable and unscored for 2 players, and for any even number of players who split evenly the leaderboard never moves — the game has no resolution, which is surprising for a 'voting' game whose whole point is picking a side.

*Fix:* Decide and implement a tie rule: e.g. award a point to everyone (both sides) on a tie, or award based on a secondary signal, or surface ties explicitly as 'no winner' in the UI while still letting the host's End Game pick the round-win leader. At minimum document that even splits never score, and consider giving each voter a point on a tie so 2-player sessions can progress.

### 13. [MEDIUM · reliability] Storyteller/drawer disconnect is not handled in game state; round relies solely on the compose/draw timer to recover
**✅ machine-verified** — `server/index.js` (handleDisconnect (lines 617-642); emoji storytellerId / sketch drawerId never reassigned)

handleDisconnect removes the player from room.players but leaves room.game.storytellerId (emoji) / drawerId (sketch) pointing at the departed player. submitEmojis (emoji-engine.js:371) and addStroke/clearCanvas (sketch-engine.js:212,221) gate on playerId === storytellerId/drawerId, so no remaining player can compose emojis or draw. For emoji-composing and sketch-drawing this only resolves when the 45s COMPOSE_DURATION/DRAW_DURATION timer expires (index.js:928, 973), during which the canvas/compose screen is frozen and the round is unwinnable. Unlike Snake, which marks the disconnected player dead (index.js:633-636), emoji/sketch have no equivalent handling.

*Impact:* When the active storyteller/drawer drops, every other player stares at a dead screen for up to 45 seconds before the round limps to reveal with no content. Repeated if the same disconnected id is re-selected as next storyteller/drawer (it still lives in playerIds and the turnQueue).

*Fix:* In handleDisconnect, when the leaver is the current storytellerId/drawerId, immediately advance the round (trigger reveal or skip to next round) and remove their id from playerIds and turnQueue so they aren't selected again.

### 14. [MEDIUM · bug] Untracked setTimeout in Bomber round-end double-fires, skipping a round
**🔍 verified inline** — `server/index.js` (startBomberLoop (lines 1115-1125) and handleSkipPhase bomber branch (lines 604-608))

On round_end, startBomberLoop calls stopLoop (clearing the interval) then schedules startNextBomberRound via setTimeout(..., room.game.timer*1000) that is never stored in room.interval, so stopLoop can't cancel it. If the host presses Skip during the round-end delay, handleSkipPhase calls startNextBomberRound immediately (its stopLoop is a no-op since the interval is already null). The orphaned setTimeout then fires, passes its room.status==="playing" guard, and calls startNextBomberRound a second time — advancing the round twice.

*Impact:* A bomber round is silently skipped when the host skips during the round-end window; the freshly started round's loop is stopped and replaced, jarring all players. Unlike Word Chain it doesn't double-award (advance doesn't award), so impact is limited to lost rounds and a visual hiccup.

*Fix:* Track the auto-advance timeout handle and clear it in stopLoop / before manual advance, or guard startNextBomberRound to run at most once per round_end (verify status is still round_end before advancing).

### 15. [MEDIUM · edge-case] Emoji guessing phase can deadlock until host skip when a guesser disconnects
**🔍 verified inline** — `server/index.js` (handleGameAction emoji branch (lines 741-753), handleDisconnect (lines 617-642); emoji-engine.js allEmojiGuessersExhausted (lines 424-430))

When emojis are submitted (composing->guessing) the server calls stopLoop(room) at line 747 and the guessing phase runs with NO server timer (submitEmojis sets timer:null). The phase only ends when allEmojiGuessersCorrect or allEmojiGuessersExhausted becomes true, both of which iterate state.playerIds. handleDisconnect only special-cases snake — it never removes the departed player from the engine's playerIds. So if a guesser disconnects mid-guessing without having guessed, every() over playerIds always returns false (that id is neither a correct guesser nor exhausted), and the round hangs indefinitely. Emoji guessing is the only event-driven phase with no fallback timer (truths/sketch/trivia/typeracer/hottake/wordchain all run continuous 1s ticks).

*Impact:* The emoji round freezes; players are stuck on the guessing screen until the host manually presses Skip. With no host (or a host who doesn't notice) the game is stuck. Recoverable only via host action.

*Fix:* Either keep a guessing-phase timeout running (like the compose timer) so the round always resolves, or have handleDisconnect prune the leaving player from the active engine state (playerIds/guessAttempts/correctGuessers) and re-evaluate the completion predicates after a disconnect during playing.

### 16. [MEDIUM · race-condition] Auto-advance setTimeouts are not tracked in room.interval, so stopLoop cannot cancel them — double-advance race with host skip
**🔍 verified inline** — `server/index.js` (Bomber round_end setTimeout (lines 1121-1124), WordChain timer-end setTimeout (lines 1190-1196), WordChain skip setTimeout (lines 594-600); stopLoop (lines 1204-1210))

stopLoop only clears room.interval. The round_end auto-advance timers in Bomber and WordChain are created with bare setTimeout and never stored anywhere, so stopLoop cannot cancel them. They self-guard with `if (!room || room.status !== 'playing') return`, which protects the host-ends-game case (status becomes 'voting'). But they do NOT protect against the host pressing Skip during the same round_end window: handleSkipPhase bomber (line 605) calls startNextBomberRound, and handleSkipPhase wordchain (line 581) calls nextWordChainRound — while the pending untracked setTimeout will ALSO fire startNextBomberRound / nextWordChainRound. The second firing calls stopLoop+startBomberLoop (or startWordChainTick) again, abandoning the interval created by the first and advancing the game an extra round, skipping a round and creating a brief window where two paths mutate room.game.

*Impact:* A host who skips a round-end screen (common, to keep the game moving) can cause a round to be silently skipped or the game state to jump, because the orphaned timeout fires a few seconds later and advances again. Intermittent, hard-to-reproduce 'the game skipped a round' bug.

*Fix:* Store these setTimeout handles on the room (e.g. room.pendingTimeout) and clear them in stopLoop alongside room.interval, OR set a generation/round token checked inside the timeout callback so a manual advance invalidates the pending one. Note: stopLoop already calls clearTimeout(room.interval) defensively (line 1207), so the pattern of storing the handle in room.interval would work — these three timeouts just forgot to assign it.

### 17. [MEDIUM · reliability] Host disconnect mid-game leaves an orphaned-role game with no host to skip/advance manually
**⏳ reported (not independently re-verified)** — `server/index.js` (handleDisconnect (lines 629-642))

On host disconnect, hostId is reassigned to the next player (line 630), which is good. But host-only manual recovery actions (handleSkipPhase line 547, handleEndGame line 523, nextSet in trivia line 763) are gated on clientId === room.hostId. For timer-driven games this is fine, but combined with the Emoji-guessing stall above, if the ORIGINAL host was the disconnected guesser, the new host can skip — so that path is covered. The genuine residual gap: the disconnected player may still hold an active engine role (presenterId/storytellerId/drawerId/currentPlayerId) that is never cleared. Timer-driven games self-heal on timeout, but the round is wasted and the UI shows a phantom 'waiting for <gone player>' until the timer expires.

*Impact:* Wasted rounds and confusing 'waiting for a player who left' UI for up to a full phase duration (e.g. 45s Emoji compose, 60s Truths submit) whenever the active-role player drops. Degraded experience, especially on flaky connections.

*Fix:* In handleDisconnect, when room.status === 'playing', detect if the leaving clientId is the current active-role player for the running game and immediately advance the phase (reuse the existing triggerXReveal / nextXRound helpers) instead of waiting for the timer. A small per-game 'onPlayerLeave(state, id)' hook in each engine would centralize this.

### 18. [MEDIUM · reliability] Active-role player disconnect mid-game wastes a full phase on timer-driven games
**⏳ reported (not independently re-verified)** — `server/index.js` (handleDisconnect (lines 629-642))

On disconnect, only Snake reconciles engine state (lines 633-636, marks the snake dead). For all turn-based / role-based games the engine keeps the leaver as the active role: WordChain currentPlayerId, Truths presenterId, Emoji storytellerId, Sketch drawerId are never updated because handleDisconnect deletes from room.players but not from the engine state. Timer-driven phases (WordChain 15s turn, Truths 60s submit / 30s vote, Emoji 45s compose, Sketch 45s draw) do eventually self-heal when the timer expires, but until then the round is dead air with a 'waiting for <gone player>' UI for everyone. Host reassignment itself is handled correctly (line 630).

*Impact:* Whenever the active-role player drops, all other players sit through a phantom 'waiting' screen for up to a full phase duration (up to 60s in Truths). Wasted rounds and confusing UX, more likely on the flaky/high-RTT connections noted for remote players.

*Fix:* In handleDisconnect, when room.status === 'playing', detect if the leaving clientId holds the current active role for room.currentGame and immediately advance the phase using the existing triggerXReveal / nextXRound helpers instead of waiting for the timer. A per-engine onPlayerLeave(state, id) hook would centralize the role reassignment and the Emoji-guessing recompute together.

### 19. [MEDIUM · performance] Sketch strokes (up to 1000 strokes x 500 points) are re-serialized per-player every second for the entire 45s draw phase
**⏳ reported (not independently re-verified)** — `server/sketch-engine.js` (serializeSketch (lines 316-340) returning full state.strokes; driven by startSketchDrawTimer 1000ms loop (server/index.js:965-978) and broadcastGameState (server/index.js:1227-1231))

serializeSketch always includes the complete state.strokes array (line 320). broadcastGameState serializes per-player via sendTo (index.js:1228-1229), and the draw-phase tick fires every 1000ms (index.js:967-969) for all 45 seconds, regardless of whether strokes changed since the last tick. Each stroke point is an {x,y} object, and addStroke caps at 1000 strokes x 500 points (sketch-engine.js:214-216) — a theoretical ~500k points, ~1M numbers. With 8 players that is 8 full JSON.stringify passes of the entire canvas every second. Even at realistic usage (a busy ~150-stroke drawing) this is a large payload re-encoded and re-sent 8x/sec with no delta or change-detection.

*Impact:* On a near-full or busy canvas the 1Hz broadcast pushes hundreds of KB to each of up to 8 clients every second. For high-RTT clients (the reported Sydney-to-US case) this saturates the link and amplifies perceived lag, and burns server CPU on redundant serialization of unchanged stroke history.

*Fix:* Only re-broadcast strokes when they actually change (track a stroke version/count and skip the strokes field on unchanged timer ticks, sending just timer/revealIn), or send stroke deltas (new strokes since last broadcast) rather than the full array each tick. Push stroke updates on the draw action itself rather than relying on the 1s timer to carry them.

### 20. [MEDIUM · reliability] Disconnect during a question leaves playerIds stale, so the 'all answered' early-reveal never fires
**✅ machine-verified** — `server/trivia-engine.js` (allAnswered() lines 534-536; playerIds set once in createTriviaState() line 494/508 and never updated)

state.playerIds is captured once at game creation (createTriviaState, line 494) and is never reconciled when a player leaves. On disconnect, server/index.js handleDisconnect() (line 621) only does room.players.delete(clientId); it does not touch room.game.playerIds. allAnswered() compares state.answers.size >= state.playerIds.length (line 535). If a player drops after the question starts but before answering, the remaining connected players can submit at most (playerIds.length - 1) answers, so allAnswered() can never return true. The early-reveal fast path in index.js (line 770 handleTriviaReveal) therefore never triggers.

*Impact:* After anyone disconnects mid-question, every subsequent question forces all remaining players to wait out the full 15s QUESTION_DURATION even when all connected players have already answered. The speed game feels broken/laggy. serializeTrivia also reports a stale playerCount (line 622), so clients show e.g. '3/4 answered' permanently. The 15s timer still advances the game, so it is not a hard deadlock, but the core 'reveal as soon as everyone answers' mechanic is dead for the rest of the session.

*Fix:* On disconnect, prune the departed id from room.game.playerIds (and from answers/scores as desired) for trivia, e.g. a reconcileTrivia(state, presentIds) helper called from handleDisconnect when currentGame === 'trivia'. Simpler: have allAnswered/serialize derive the active player count from room.players rather than the frozen playerIds snapshot. Re-check allAnswered after the prune so a pending reveal can fire immediately.

### 21. [MEDIUM · reliability] Disconnected players are never pruned from Word Chain turn order; new rounds resurrect them and stall on timeouts
**⏳ reported (not independently re-verified)** — `server/wordchain-engine.js` (nextWordChainRound (lines 141-159) using state.playerIds; index.js handleDisconnect (lines 617-642))

handleDisconnect only special-cases snake (index.js line 633); for wordchain it just removes the client from room.players. The engine's playerIds and turnOrder still contain the departed id. Within the current round the active player who left can only be advanced past by a 15s timeout-elimination. Worse, nextWordChainRound re-shuffles state.playerIds (the original, never-pruned list) at lines 142, so every subsequent round resurrects disconnected players into turnOrder and as a possible currentPlayerId (order[0]). A ghost player can never submit, so the round can only progress one full 15s TURN_DURATION timeout at a time for each ghost, and a ghost can even be declared the starting player.

*Impact:* Rounds drag through dead 15-second timeouts for every disconnected player, every round, for the room's lifetime. With several drop-offs the game becomes mostly waiting; a disconnected ghost can also be the highlighted starting player, confusing remaining players.

*Fix:* On disconnect, when room.currentGame === 'wordchain', remove the clientId from game.playerIds and game.turnOrder; if they were the currentPlayerId, advance to the next active player (and reset the timer); if <=1 real player remains, end the round. Also recompute turnOrder/playerIds from current room.players inside nextWordChainRound rather than the frozen original list.

### 22. [MEDIUM · bug] Bomber canvas has no resize/orientation handler — backing store frozen at mount size
**⏳ reported (not independently re-verified)** — `src/games/BomberGame.jsx` (useEffect at lines 122-128 (mount sizing) and 131-136 (redraw); no resize listener anywhere in component)

The canvas backing-store resolution is set exactly once, on mount, from canvas.clientWidth (lines 124-127): canvas.width = canvas.height = size. The CSS sizes it responsively with width: min(90vw, 540px) and aspect-ratio: 1/1 (src/index.css:948-955). There is no window 'resize' or orientationchange listener, so after the player rotates their phone or the viewport width changes (e.g. mobile browser chrome collapsing, split-screen), the CSS box resizes but the bitmap stays at the original pixel size. The browser then scales the fixed-resolution bitmap to the new CSS box, producing a blurry board and — because drawBomber computes cell size as W/cols from the stale canvas.width — players/bombs/flames drawn at coordinates that no longer line up crisply with the displayed grid. Additionally, if clientWidth is ever 0 at mount (canvas not yet laid out), width/height become 0 and the redraw guard `if (!canvas.width) return` (line 134) permanently skips all drawing, leaving a blank board with no recovery.

*Impact:* On mobile (the app's primary target per CLAUDE.md), rotating the device or any viewport change mid-round leaves Bomber rendered blurry and slightly misaligned for the rest of the session, with no way to recover short of a full reload. Worst case (0-width mount) the board never renders at all.

*Fix:* Extract the sizing into a resizeCanvas() that reads clientWidth, sets canvas.width/height, and immediately redraws the latest game. Call it on mount and from a window 'resize'/'orientationchange' listener (debounced via requestAnimationFrame), cleaning the listener up in the effect return. Guard against clientWidth===0 by retrying on the next animation frame.

### 23. [MEDIUM · performance] CSS 'transition: transform 120ms linear' is mislabeled as interpolation and does not smooth over network jitter — it stalls when frames arrive late
**🔍 verified inline** — `src/index.css` (.snake-segment / .food-segment rule, lines 152-160 (transition: transform 120ms linear); driven by SnakeGame.jsx transform updates at lines 114 and 128)

The v1.16.0 commit (8c8659e) and CLAUDE.md describe 'client interpolation', but what shipped is purely a CSS tween: each segment animates its transform over exactly 120ms whenever a new server state moves it one cell. This is hardcoded to the server tick period, not to actual frame arrival time. Under Sydney->US RTT with jitter, frames do not arrive every 120ms — they bunch and gap. When a frame is late, the previous tween finishes and the snake freezes in place until the next state lands, then jumps and re-tweens. Because the tween duration (120ms) is fixed while inter-frame arrival is variable, the result is stutter/teleport on the slow link, not smoothing. True interpolation would buffer 1–2 server states and render the snake at (now - renderDelay) by lerping between the two most recent authoritative frames, decoupling render smoothness from arrival jitter.

*Impact:* Players on high-RTT/jittery links see the snake stall-and-jump rather than glide, reinforcing the 'laggy' perception even though the local frame rate is fine. The mechanism gives no buffer against packet timing variance.

*Fix:* Implement real entity interpolation in SnakeGame: keep a small buffer of the last 2 authoritative states with arrival timestamps, and in a requestAnimationFrame loop render segment positions lerped between them at a fixed render-delay (e.g. ~1 tick). Drop the fixed-duration CSS transition in favor of rAF-driven transforms so render is decoupled from frame arrival timing.

### 24. [LOW · reliability] Emoji last-guess hint can throw in serializeEmoji on an empty word token, and the throw is outside the action try/catch
**⏳ reported (not independently re-verified)** — `server/emoji-engine.js` (serializeEmoji hint block (lines 500-505): word[0].toUpperCase())

When a player's triesLeft === 1, serializeEmoji builds a hint via state.prompt.text.split(' ').map(word => word[0].toUpperCase() + ...). prompt.text is stored as prompt.text.trim() only (buildPromptBank, lines 302-306) — internal whitespace is not collapsed (only the dedup key is normalized). A prompt containing a double space would yield an empty token, making word[0] undefined and word[0].toUpperCase() throw a TypeError. Crucially, serializeEmoji runs inside broadcastGameState which is called from the tick interval (index.js:927,945) and from handleGameAction's broadcast path; a throw in the interval callback is NOT wrapped by the try/catch in handleGameAction (index.js:725-808) and would surface to the global uncaughtException handler.

*Impact:* Currently latent: no shipped prompt has a double space, so it does not fire today. But it is an unguarded assumption — any future prompt addition with stray internal whitespace would crash serialization for the affected player at the worst moment (their final guess), potentially disrupting the room's tick loop.

*Fix:* Guard the hint mapping against empty tokens (e.g. filter falsy tokens or use word.charAt(0) with a length check), and/or collapse internal whitespace when storing clean.text in buildPromptBank so prompt.text matches the normalized form.

### 25. [LOW · performance] stepGame allocates many Maps, Sets, and short-lived string keys every tick, creating steady GC churn at 8.3Hz
**⏳ reported (not independently re-verified)** — `server/engine.js` (stepGame, lines 56-187 (next/nextHeads/nextBodies/headCounts Maps, ateFood/wallHits/deaths/tailSets/fullBodySets Sets, keyOf string interpolation at line 230))

Each tick allocates 4 Maps and 7+ Sets plus a `${x},${y}` template-string key for every body segment, twice (tailSets and fullBodySets) plus once per head and once per headCounts entry — roughly 3 key strings per segment. For 8 snakes averaging 18 segments that is ~432 throwaway strings per tick, ~3,600/sec, on top of per-snake object spreads ({...snake}) and body array spreads/slices. The collision pass at lines 137-139 also does fullBodySets.forEach inside next.forEach, i.e. O(N^2) over snakes plus O(L) set probes. None of this is wrong, but it is the tightest loop in the app (CLAUDE.md flags the 120ms tick as the budget) and it manufactures garbage proportional to total snake length every tick.

*Impact:* Per-room GC pressure that grows with snake length and player count. Under multiple concurrent rooms this can cause periodic GC pauses on a small Railway instance, which manifest as occasional tick hitches — felt as micro-lag on top of network latency.

*Fix:* Replace `${x},${y}` string keys with integer keys (y*cols+x) for the collision Sets/Maps to avoid string allocation; reuse a small number of scratch Sets/Maps cleared each tick instead of reallocating; and build one combined occupancy map for collision rather than separate tail/full sets per snake. Keep the engine pure but allocation-light.

### 26. [LOW · bug] Hot Take credits only one player a round-win when the whole majority side should count
**⏳ reported (not independently re-verified)** — `server/hottake-engine.js` (revealHotTake, line 340 (roundWinnerId: awardedPlayerIds[0] || null) consumed by index.js awardRoundWin line 1154)

When the majority side has multiple players (e.g. 3 agree vs 2 disagree), revealHotTake gives every member of the majority a score point (lines 324-327, awardedPlayerIds), but roundWinnerId is set to only awardedPlayerIds[0]. index.js awardRoundWin(room, room.game.roundWinnerId) then credits exactly one player a round win. So the in-game score (scores) and the round-win leaderboard (roundWins) disagree: all 3 majority voters gain a score point, but only the first one in iteration order gets a round-win toward the End Game game-win award.

*Impact:* The two leaderboards tell inconsistent stories, and the End Game game-win is biased toward whichever majority player happened to be first in the votes Map, rather than reflecting the round outcome. Minor but can decide who 'wins the game' unfairly across a session.

*Fix:* Either award a round win to each player in awardedPlayerIds (change index.js to iterate the majority list instead of a single roundWinnerId), or intentionally keep round-wins single-winner but document/justify the choice. Align the two tiers so scores and round-wins reflect the same set of winners.

### 27. [LOW · performance] Full Snake state (including static fields) is re-serialized and rebroadcast every 120ms with no delta — and a redundant broadcast fires even on the post-game-over tick
**🔍 verified inline** — `server/index.js` (serializeSnake (lines 849-861) called from broadcastGameState (line 1217) on every tick in startSnake's interval (lines 837-846))

serializeSnake rebuilds the entire board state object every tick: per-snake id, name, color, alive, score, plus the full body coordinate array, and top-level rows/cols/gameType/status. name, color, rows, cols, gameType are immutable for the whole round yet are re-sent ~8.3 times/sec. Measured payload is ~376B (2 snakes) up to ~1.8KB (8 long snakes) per frame, so per-client throughput reaches ~10KB/s and the server emits ~60KB/s for a busy 6-player room. Bandwidth itself is not the bottleneck, but every tick allocates a fresh array of fresh per-snake objects each containing a freshly mapped body array (snake.body.map(([x,y])=>[x,y])), then JSON.stringify runs on the whole thing. Additionally, when stepGame returns a non-running status, the interval still calls broadcastGameState BEFORE stopLoop (lines 838-842), and there is no early-out, so a final full frame is sent and then state is re-derived; minor but it is an extra full serialization on the transition tick.

*Impact:* Constant GC pressure and redundant serialization at 8.3Hz per room. Mostly negligible at current scale, but it scales with snake length x player count x rooms and re-sends data that never changes, wasting CPU and bytes that matter more on slow/metered mobile links.

*Fix:* Send static fields (name, color, rows, cols) once in an init frame and stream only mutable per-snake data (body, alive, score, food, status) thereafter, or emit a delta (changed snakes only). At minimum, hoist the immutable header out of the per-tick path. Add an early-return so the game-over tick does not double-serialize.

### 28. [LOW · performance] perMessageDeflate compresses every Snake frame (>128B) — CPU cost and flush latency on tiny high-frequency frames likely outweigh the byte savings
**⏳ reported (not independently re-verified)** — `server/index.js` (WebSocketServer perMessageDeflate config, lines 395-398 (threshold: 128) — applies to the 8.3Hz Snake broadcast at line 1217)

Compression threshold is 128 bytes, but every realistic Snake frame is 376B–1.8KB (measured), so deflate runs on every single tick frame for every client. perMessageDeflate carries per-message CPU overhead and, more importantly for latency, the deflate stream must flush on each message; on small frequent frames the compression ratio is poor (little redundancy in short coordinate arrays) while the added serialization/flush work sits directly in the send path. With context-takeover the sliding window also retains state per connection (extra memory). For a latency-sensitive 8.3Hz stream of ~1KB frames, Nagle-like batching and deflate flush cycles tend to add jitter rather than remove meaningful bytes.

*Impact:* Extra server CPU per frame and potential added per-frame latency/jitter on the realtime Snake stream, with marginal bandwidth benefit. On the high-RTT Sydney path, any added flush/serialization jitter compounds the already-poor responsiveness.

*Fix:* Disable perMessageDeflate for the realtime game stream (or raise the threshold above the typical Snake/Bomber frame size, e.g. 2KB+, so only large infrequent payloads compress), and/or measure latency with deflate off. Keep compression only where it pays — large, infrequent messages — not on the 8.3Hz Snake/Bomber tick frames.

### 29. [LOW · edge-case] End Game silently drops round-win ties when attributing the persistent game win
**⏳ reported (not independently re-verified)** — `server/index.js` (handleEndGame (lines 528-543))

handleEndGame determines the game-win recipient with a strict > scan over roundWins, so on a tie (e.g. two players each won 2 rounds) only the first player encountered in Map-iteration order is credited the persistent game win; the equally-tied player(s) get nothing, and the outcome depends on insertion order rather than any tiebreak rule. The maxWins>0 guard is correct (no false award when nobody won a round), so this is strictly a tie-handling gap.

*Impact:* In a tied session the persistent Games-Won leaderboard (shown in the lobby and voting screen) reflects an arbitrary, insertion-order-dependent winner instead of recognizing the tie, which players can perceive as unfair/buggy.

*Fix:* Collect all ids whose roundWins equal maxWins and either award a game win to each tied leader or apply an explicit deterministic tiebreak (e.g. cumulative in-game score), instead of taking the first > match.

### 30. [LOW · reliability] Heartbeat interval is never cleared and its comment claims a 25s period it does not use
**🔍 verified inline** — `server/index.js` (Heartbeat setInterval (lines 405-418))

The ping/pong heartbeat setInterval is created at module load and never stored or cleared. gracefulShutdown (lines 1316-1327) closes wss and httpServer but never clears this interval; the process relies on process.exit to tear it down. More concretely, the comment on line 405 says 'every 25 seconds' but the interval is 15000ms (line 418), and the comment says a non-responding client is terminated 'within one interval' — with isAlive toggling each tick, a dead client is actually terminated on the NEXT tick (up to ~30s), not one interval. Functionally the heartbeat works, but the 5s graceful-shutdown timer (line 1326) can race with a pending heartbeat tick that calls ws.ping() on already-closing sockets.

*Impact:* Low: no leak in practice because the process exits on shutdown. Mainly a correctness/documentation hazard — the stated timing is wrong, which could mislead future tuning of the Cloudflare/Railway idle window.

*Fix:* Store the heartbeat interval id and clearInterval it in gracefulShutdown; fix the comment to say 15s and clarify the up-to-2-interval termination latency.

### 31. [LOW · performance] findRoomByPlayer does a full linear scan of all rooms × players on every inbound message
**🔍 verified inline** — `server/index.js` (findRoomByPlayer (lines 1285-1290), called from nearly every handler (handleStart, handleVote, handleInput, handleGameAction, etc.))

Every game action, vote, and input message resolves the player's room by iterating every room and calling room.players.has(playerId) until a match. Snake/Bomber send input messages at high frequency (multiple per tick across up to 8 players). With N concurrent rooms this is O(N × playersPerRoom) per message. There is no clientId -> room index.

*Impact:* At current scale (small number of rooms) this is negligible, as the comments acknowledge elsewhere. But it scales poorly: a busy server with many simultaneous rooms pays this cost on every Snake direction change and every Bomber move, on the hot path that also feeds the 100-120ms tick loops. A reliability/latency risk if the platform grows.

*Fix:* Maintain a clientId -> roomCode Map updated in handleHost/handleJoin/handleDisconnect, and look up the room in O(1). The data to build it already exists at every mutation point.

### 32. [LOW · reliability] Rooms Map relies solely on the WebSocket close event for cleanup — no idle/abandoned-room reaper
**⏳ reported (not independently re-verified)** — `server/index.js` (Room deletion only in handleDisconnect when players.size===0 (lines 623-627); rooms Map (line 373))

A room is deleted only when its last player's 'close' event fires (line 625). If a close event is missed or delayed (half-open TCP connections behind a proxy, abrupt network loss without a FIN), the heartbeat will eventually ws.terminate() the dead socket (lines 411-413) which DOES emit 'close', so most cases are covered. However, there is no independent sweep for rooms whose players are all stale or for lobby rooms created by handleHost (line 466) that are abandoned before anyone joins and whose host's terminate is delayed. Combined with the heartbeat's up-to-2-interval detection latency, a flood of host-and-abandon connections could accumulate rooms for ~30s each.

*Impact:* Low under normal use because terminate() drives close. Residual risk: a buggy/malicious client opening many host connections and silently dropping them leaves rooms (and rateLimits/feedbackLimits map entries) lingering until heartbeat termination, a mild memory-growth/abuse vector.

*Fix:* Add a periodic reaper that deletes rooms with no OPEN-readyState players and a lastActivity timestamp older than a threshold, and prune stale rateLimits/feedbackLimits entries. Record room.lastActivity on each message to drive it.

### 33. [LOW · reliability] Heartbeat interval is never cleared and its comment states the wrong period
**🔍 verified inline** — `server/index.js` (Heartbeat setInterval (lines 405-418); gracefulShutdown (lines 1316-1327))

The ping/pong heartbeat setInterval is created at module load, never stored, and never cleared. gracefulShutdown closes wss and httpServer but never clears this interval, relying on process.exit to tear it down. The comment on line 405 claims 'every 25 seconds' while the actual interval is 15000ms (line 418); the comment also says a non-responding client is terminated 'within one interval', but because isAlive toggles each tick, a dead client is only terminated on the following tick (up to ~2 intervals). The 5s graceful-shutdown fallback (line 1326) can also race a heartbeat tick that calls ws.ping() on already-closing sockets.

*Impact:* Low: no real leak because the process exits on shutdown. Primarily a correctness/documentation hazard — the stated 25s timing is wrong, which could mislead future tuning of the Cloudflare/Railway idle-disconnect window.

*Fix:* Store the heartbeat interval id and clearInterval it in gracefulShutdown; correct the comment to 15s and clarify the up-to-2-interval termination latency.

### 34. [LOW · reliability] Room cleanup depends entirely on the close event; no idle/abandoned-room reaper
**⏳ reported (not independently re-verified)** — `server/index.js` (Room deletion only at handleDisconnect players.size===0 (lines 623-627); rooms Map (line 373); rateLimits (line 379) / feedbackLimits (line 56))

A room is deleted only when its last player's 'close' event fires. Most missed-close cases are covered because the heartbeat ws.terminate() (lines 411-413) emits 'close'. But there is no independent sweep for rooms whose sockets are all non-OPEN, nor for lobby rooms created by handleHost (line 466) and abandoned before anyone joins while the host's terminate is delayed (up to ~2 heartbeat intervals, ~30s). The rateLimits and feedbackLimits Maps are also only pruned opportunistically (rateLimits on close at line 440; feedbackLimits never).

*Impact:* Low under normal use because terminate() drives close. Residual abuse/growth vector: a client repeatedly opening host connections and silently dropping them leaves rooms plus map entries lingering ~30s each; feedbackLimits entries are never reclaimed.

*Fix:* Add a periodic reaper that deletes rooms with no OPEN-readyState players past a lastActivity threshold and prunes expired rateLimits/feedbackLimits entries. Stamp room.lastActivity on each message to drive it.

### 35. [LOW · edge-case] Bomber: round-end pause can be shortened by 1s when a kill tick coincides with the 1s timer tick
**✅ machine-verified** — `server/index.js` (startBomberLoop (lines 1101-1126); tickBomberTimer round_end branch (bomber-engine.js:366-370))

Each 100ms iteration runs stepBomber first (which may set status='round_end' with timer=ROUND_END_DURATION=4 via checkRoundEnd). If that same iteration also hits the secAccum>=1000 boundary (line 1109), tickBomberTimer runs next and takes the round_end branch (bomber-engine.js:367-369), decrementing timer 4->3. Then line 1115 detects round_end and schedules the auto-advance with setTimeout(..., room.game.timer * 1000) using the now-decremented value (3000ms instead of 4000ms). The round-end summary screen is occasionally cut short by one second.

*Impact:* Minor: the inter-round results/standings screen is sometimes 1 second shorter than intended. Cosmetic, not a crash.

*Fix:* Detect round_end immediately after stepBomber and skip the tickBomberTimer call in the same iteration (e.g. early-continue once status !== 'playing'), or read a fixed ROUND_END_DURATION for the setTimeout delay instead of the mutable room.game.timer.

### 36. [LOW · reliability] Snake/Bomber: imported applyImmediateMove is dead code (never invoked)
**✅ machine-verified** — `server/index.js` (import line 15; bomber-engine.js applyImmediateMove (lines 191-199))

applyImmediateMove is imported in index.js:15 and exported from bomber-engine.js but is never called anywhere in index.js (verified by grep — the only occurrence is the import). Bomber 'move' input goes through handleBomberAction's 'move' kind which only sets moving/dir flags (bomber-engine.js:103-111); actual movement happens on the next 100ms tick via movePlayers. This means the intended 'move immediately on input receipt, before the next tick' optimisation that applyImmediateMove was written for is not active, contributing to perceived input lag — especially relevant to the reported Sydney→US high-RTT laggy feel, since every move waits a full tick after the round-trip.

*Impact:* No correctness bug, but dead code is misleading and the latency-hiding immediate-move path it implements is unused, so bomber movement feels one tick (up to 100ms) + RTT laggier than designed.

*Fix:* Either wire applyImmediateMove into the bomber 'move' input handler in handleInput (index.js:814-816) to apply the first step instantly, or remove the unused import and export to avoid confusion about intended behavior.

### 37. [LOW · edge-case] Sketch guess requires exact string equality, rejecting trivially-correct guesses on multi-word answers
**⏳ reported (not independently re-verified)** — `server/sketch-engine.js` (submitSketchGuess (line 236): correct = guess.toLowerCase() === state.word.toLowerCase())

Sketch matches the guess by strict equality after trim+lowercase only. The word bank contains many multi-word/spelling-sensitive entries such as 'ice cream', 'corn on the cob', 'hot dog', 'french fries', 'yo-yo'. A guesser who types 'icecream', 'ice  cream' (double space), 'hotdog', or 'yoyo' is marked incorrect even though they clearly identified the drawing. By contrast the emoji engine uses lenient substring matching (emoji-engine.js:398). There is no internal-whitespace normalization or punctuation tolerance.

*Impact:* Players who correctly identify the sketch are denied the point and the round win over spacing/hyphen differences, which feels like a bug to users. Sketch awards the round to the FIRST correct guesser (sketch-engine.js:247-252), so a false-negative can hand the win to a slower player or let the timer expire with no winner.

*Fix:* Normalize both guess and word before comparison (collapse internal whitespace, strip hyphens/punctuation) and optionally accept a space-insensitive match, mirroring normalizeWord (sketch-engine.js:125-127) which already exists but is not used in the comparison.

### 38. [LOW · edge-case] Round-winner tie resolution is order-dependent and silently picks the first player in Map order
**✅ machine-verified** — `server/trivia-engine.js` (nextTriviaQuestion() lines 560-568)

Round winner is computed with `if (gain > maxGain)` over scores.forEach in insertion order. When two or more players have the identical (highest) positive gain for the set, the strict '>' means the first one encountered in scores Map iteration order wins and all others are ignored; there is no tie handling. maxGain is initialized to 0, so a genuine tie at the top is resolved purely by who joined first.

*Impact:* On a tied set, awardRoundWin (index.js line 1034) credits a round win to an essentially arbitrary player (the earliest joiner among the tied leaders), which then feeds the persistent game-win leaderboard. Two equally-performing players get different standings for reasons unrelated to play.

*Fix:* Detect ties explicitly: collect all ids whose gain === maxGain (maxGain > 0) and either award no round win on a tie, split it, or surface a tie state to clients. At minimum document the deterministic-by-join-order behavior.

### 39. [LOW · edge-case] Word Chain silently drops submissions that become empty after stripping non-letters
**⏳ reported (not independently re-verified)** — `server/wordchain-engine.js` (submitWord (lines 62-63))

Input is normalised with .replace(/[^a-z]/g, '') and, if the result is empty, the function returns state unchanged with no invalidReason (line 63). A submission of pure digits/punctuation (e.g. '123', '!!!') is accepted by the handler, produces no state change, and is re-broadcast identically. The submitting player gets zero feedback and the turn timer keeps running. Separately, stripping (rather than rejecting) non-letters silently rewrites inputs like "don't"->"dont", "co-op"->"coop", "fox5"->"fox", which can turn an intended-invalid entry into an accidental valid word or alter the last-letter used for chaining.

*Impact:* Confusing UX: a player who fat-fingers a number/symbol-only entry sees nothing happen and loses turn time; word normalisation can accept inputs the player did not intend as the played word.

*Fix:* If the sanitised word is empty, return state with invalidReason: 'not_a_word' (or 'empty') so the client shows feedback. Consider rejecting submissions containing non-letters outright (invalidReason) instead of silently stripping, so the stored word matches what the player typed.

### 40. [LOW · bug] Stale Word Chain invalidReason is re-broadcast to all players for the rest of the turn
**⏳ reported (not independently re-verified)** — `server/wordchain-engine.js` (submitWord invalid returns (lines 68, 72, 75), tickWordChain (lines 162-165), serializeWordChain (line 179))

When a word is rejected, submitWord returns { ...state, invalidReason }. tickWordChain spreads ...state each second and preserves invalidReason, and serializeWordChain broadcasts it. Because Word Chain broadcasts identical state to everyone, every player keeps receiving the (now stale) invalidReason on each 1s tick until the current player finally plays a valid word (which resets it to null) or the turn ends. invalidReason is also not cleared on the eliminate path's round_end except via the spread.

*Impact:* All clients can persistently display another player's last 'wrong letter / already used / not a word' error for up to a full 15s turn, and the error is shown to spectators who did not submit. Cosmetic but misleading.

*Fix:* Clear invalidReason at the start of each tick (or only attach it to a per-action response sent to the submitting client rather than to the broadcast state), so the rejection message is transient and player-scoped.

### 41. [LOW · performance] Bomber sends duplicate movement inputs per keypress (App-level handler + component handler both fire)
**⏳ reported (not independently re-verified)** — `src/App.jsx` (App.jsx keydown effect lines 109-120 (condition includes 'bomber'); BomberGame.jsx onKeyDown lines 145-157)

App.jsx attaches a window keydown handler that fires for both snake AND bomber: `if (room?.currentGame !== "snake" && room?.currentGame !== "bomber") return` (line 111), then sends `{type:"input", dir}` using KEY_TO_DIR (uppercase, e.g. "UP"). BomberGame.jsx attaches its own window keydown handler (line 171) that ALSO sends `{type:"input", dir}` (lowercase, e.g. "up") for the same key event, plus handles space/keyup/stopInput which the App handler does not. The bomber engine lowercases dir (server/bomber-engine.js:106) so both arrive valid and idempotent, but every arrow/WASD press during Bomber sends two WebSocket messages instead of one. The App handler is clearly intended for Snake (which has no component-level keyboard handler); Bomber has a complete, self-contained handler. The double-send is pure waste and pushes a fast key-masher closer to the server's 60 msg/sec per-client rate limit, where dropped messages would manifest as missed moves.

*Impact:* Doubles outbound keyboard message volume during Bomber for no benefit; under rapid keypresses brings the client nearer the rate-limit ceiling, risking dropped inputs and unresponsive movement.

*Fix:* Remove "bomber" from the App.jsx keydown condition (line 111) so only Snake uses the App-level handler, leaving Bomber's dedicated handler as the single source. Bomber already handles keydown/keyup/space/stopInput itself.

### 42. [LOW · reliability] FeedbackModal success setTimeout not cleared on unmount
**⏳ reported (not independently re-verified)** — `src/FeedbackModal.jsx` (handleSubmit, line 94: setTimeout(() => onClose(), 2000))

After a successful submit, a 2-second setTimeout calls onClose() to auto-dismiss the modal (line 94). The timeout id is never stored or cleared. If the user dismisses the modal manually (backdrop click or ✕) within those 2 seconds, the component unmounts but the timer still fires and calls onClose() again. onClose just runs setFeedbackOpen(false) in the parent (App.jsx:228), so calling it on an already-closed modal is harmless today, but it is a dangling timer firing a callback tied to an unmounted component — fragile if onClose ever does more than toggle a boolean.

*Impact:* No user-visible breakage today, but a latent unmount-time side effect; React will not warn but the pattern is a leak waiting to bite if onClose gains side effects.

*Fix:* Store the timeout id and clear it in a useEffect cleanup, or move the auto-close into a useEffect keyed on `submitted` that returns clearTimeout. Alternatively call onClose synchronously and let the parent animate.

### 43. [LOW · performance] EmojiGame search re-flattens the full ~700-emoji list on every keystroke
**⏳ reported (not independently re-verified)** — `src/games/EmojiGame.jsx` (searchResults useMemo, lines 469-473)

The search useMemo rebuilds the flattened emoji list from scratch on every searchQuery change: `EMOJI_CATEGORIES.flatMap((cat) => cat.emojis).filter(...)` (line 472). EMOJI_CATEGORIES is a module constant with ~700 emojis across 8 categories, so flatMap allocates a fresh ~700-element array on each keystroke before filtering, even though the flattened list never changes. The dependency array is correct, but the flattening work is redundant per keystroke.

*Impact:* Minor wasted allocation/work on each character typed in the emoji search (storyteller only). Negligible on desktop; a small avoidable cost on low-end phones during the compose phase.

*Fix:* Hoist the flattened list to a module-level constant, e.g. `const ALL_EMOJIS = EMOJI_CATEGORIES.flatMap(c => c.emojis);`, and have the useMemo only run the .filter over ALL_EMOJIS.

