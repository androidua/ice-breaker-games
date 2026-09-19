# Plan D — Reconnect & session resume (grace period)

**Status:** planned, not started. Written 2026-09-19 alongside v1.17.0.
**Why:** the #1 real-world failure for a phone party game is a *brief* connection drop — screen lock, app switch, Wi-Fi → mobile data, a lift. Today the server removes the player the instant their socket closes, so the player loses their seat, their round wins and (mid-game) their place in the game. v1.17.0 softened this (rejoin during the game-vote screen, prefilled lobby, a "Rejoin" banner) but the player still comes back as a **new** player and cannot return mid-game.
**Goal:** a player whose connection drops for up to ~45s silently gets **the same seat back** — same player id, host role, colour, scores, and their place in the running game — without touching anything.

> Network-safety rule for this work (from the user): *only touch networking when sure it cannot make ping worse.* Everything below adds messages **only on reconnect**. Steady-state traffic, tick loops (Snake 120ms, Bomber 100ms), heartbeat (15s) and `perMessageDeflate` settings must stay byte-for-byte unchanged. Re-measure live WebSocket RTT before/after (method in "Verification").

---

## 1. Current behaviour (read these first)

| Where | What it does today |
|---|---|
| `server/index.js` `wss.on("connection")` | Mints `clientId = p<N>` per socket. **The socket id *is* the player id** everywhere (rooms, engines, votes, round/game wins). |
| `ws.on("close")` → `handleDisconnect(clientId)` | Immediately deletes the player, reassigns host, prunes the leaver from the voting state (v1.17.0) or calls `reconcileDisconnect` (per-game roster pruning + phase completion). |
| `handleJoin` | Allows join in `lobby` and `voting` only (v1.17.0). |
| `src/App.jsx` connection effect | Auto-reconnects **only when not in a room** (v1.17.0). In a room it shows the "Connection lost… Rejoin" banner (reload → prefilled lobby). |
| `src/storage.js` | `hpr.lastRoom` (sessionStorage), `hpr.name` (localStorage). |

The key refactor is separating **connection id** from **player id**.

---

## 2. Design

### 2.1 Identity
- Keep `clientId` for the *connection* (rate limiting stays keyed by it).
- A player gets a **`playerId`** (keep the `p<N>` format so nothing downstream changes) plus a secret **`resumeToken`** = `crypto.randomUUID()` (Node built-in, no dependency).
- Server keeps `sessions: Map<resumeToken, { playerId, roomCode, expiresAt }>` and `socketToPlayer: Map<clientId, playerId>`.
- `welcome` gains `{ id: playerId, resumeToken }`. The token is sent **only** to its owner, never in `room`/`state` broadcasts.

### 2.2 Grace period instead of instant removal
- On socket close for a player **in a room**: mark `player.connected = false`, `player.ws = null`, start `player.graceTimer = setTimeout(() => removePlayer(playerId), GRACE_MS)`.
- `GRACE_MS` default **45s**, env-overridable (`RESUME_GRACE_MS`) so tests use ~500ms.
- `removePlayer` = today's `handleDisconnect` body, unchanged (host reassignment, vote pruning, `reconcileDisconnect`). **Do not fork the disconnect logic** — the grace timer just delays the existing path.
- Players not in a room (lobby screen) keep today's instant cleanup.
- `broadcast`/`sendTo` already skip non-OPEN sockets; make them also skip `ws === null`.
- `sendRoomUpdate` adds `connected: boolean` per player so the UI can show "reconnecting…" next to a name.
- Room deletion: a room is deleted when **all** players are gone *after* grace (not when all sockets close — a shared Wi-Fi blip can drop everyone at once).

### 2.3 Resume handshake
- Client → server: `{ type: "resume", token }` as the first message after `welcome` when it holds a token.
- Server:
  1. Look up the session; reject if missing/expired → `{ type: "resume_failed" }`.
  2. If the player still has an OPEN socket (duplicate tab), close the old one with code 4000 "replaced" — **last connection wins**.
  3. Rebind: `player.ws = ws`, `player.connected = true`, clear `graceTimer`, map `clientId → playerId`.
  4. Send, in order: `welcome { id: playerId }` (re-sent so the client's `me.id` is the old id), `room`, then either `vote_state` (voting) or a per-player `state` via the existing serializer (Emoji/Sketch hide secrets per player — `broadcastGameState` already handles this once `ws` is rebound).
- Every handler that calls `findRoomByPlayer(clientId)` must use the **playerId** for the connection. Do this with one helper `playerIdFor(clientId)` at the top of `handleMessage`, not by editing each handler's logic.

### 2.4 Client
- Store `resumeToken` + `playerId` in **sessionStorage** (per tab — a second tab must not steal the seat by accident; the reload in the same tab keeps it).
- Remove the `roomRef.current` guard from `scheduleReconnect`: reconnect with backoff always; if a token exists, send `resume` on open.
- On `resume_failed`: clear the token and fall back to today's v1.17.0 flow (lobby with prefilled code + name).
- Banner: while reconnecting in a room show "Reconnecting…" (no action needed). Only show the "Rejoin" button after `resume_failed` or after the grace window has passed.
- Keep game components untouched: they already render from `game`/`room`/`me`.

### 2.5 Per-game behaviour during grace (decide per game, test each)
| Game | During grace | Notes |
|---|---|---|
| Snake / Bomber | Player's entity keeps its last input (Snake moves straight; Bomber stands still). | Real-time: they'll likely die — acceptable. No change to tick loops. |
| Trivia / Hot Take / Truths votes | Disconnected player still counts toward "everyone answered" until grace expires → phase waits for its timer at worst. | Optional refinement: treat `connected:false` as absent for completion checks (then un-prune on resume is tricky — **recommend not doing this**; the phase timers already bound the wait). |
| Emoji / Sketch / Truths presenter | If the storyteller/drawer/presenter drops, they have up to GRACE_MS to come back before `reconcileDisconnect` reassigns. The phase timer still runs. | Consider a shorter grace for the active role (e.g. 15s) — decide in-session. |
| Word Chain | If it's the dropped player's turn, the turn timer runs; timeout eliminates them as today. | No change. |
| Voting (game select) | Their vote stays counted during grace. | On final removal, v1.17.0 pruning applies. |

### 2.6 Out of scope
- **Server restarts/redeploys** still wipe everything (in-memory state). Resume can't survive a deploy; the client must handle `resume_failed` cleanly. (Mitigation is operational: deploy when no rooms are active — see Plan E's `/health` room count.)
- Mid-game **new** joins (spectator mode) — separate feature.

---

## 3. Test plan (write each red first)

New file `test/integration/resume.test.js` (next free ports: check `grep -h "PORT = " test/integration/*.test.js`; v1.17.0 used up to 9899). Start the server with `RESUME_GRACE_MS=600`.

1. **Resume within grace keeps identity:** A hosts, B joins; B's socket closes; B reconnects and sends `resume` → gets `welcome` with the **same id**, `room` still lists B once, colour unchanged.
2. **Resume after grace fails:** wait > grace → `resume_failed`; room no longer lists B.
3. **Host resumes as host:** host drops and resumes within grace → `hostId` unchanged; no host reassignment broadcast happened.
4. **Scores survive:** B has 1 round win; drop + resume → `roundWins[B] === 1`.
5. **Mid-game resume gets private state:** Emoji — storyteller drops during `composing`, resumes → receives its private `state` including the secret word; guessers still don't see it.
6. **Grace expiry runs the existing reconciliation exactly once:** Hot Take voting, B drops and never returns → after grace the reveal fires (same as today's disconnect test, just delayed).
7. **Duplicate tab:** B resumes from a second socket while the first is still open → first socket closed with 4000; only one B in `room`.
8. **Token hygiene:** the token never appears in any `room`/`state`/`vote_state` payload seen by other clients (scan every message A receives).
9. **All players drop at once:** room survives the grace window; if nobody returns, the room is deleted afterwards (check with a new `join` → "Room not found").
10. **Lobby clients unchanged:** a client not in a room disconnects → instant cleanup as today.
11. Existing suites must stay green unchanged: `npm run test:all`. Disconnect tests that expect *instant* reconciliation must run with `RESUME_GRACE_MS=0` (make `0` mean "no grace" = today's behaviour) — do **not** rewrite their assertions.

## 4. Verification (beyond tests)
- Browser pane, two tabs: host + join, start Sketch, stop the tab's network (DevTools offline or close/reopen within grace) → same seat, drawing continues.
- Phone test (real device): lock the screen for 20s mid-Trivia, unlock → still in the game with the same score.
- **Latency guard:** measure live WS RTT before and after deploy with the probe used on 2026-09-19 (20 pings via `wss://huddleplayroom.com`, median ~177ms from the user's machine). Must be unchanged within noise.

## 5. Rollout
- Minor version bump (feature). One commit + tag per CLAUDE.md. Railway now waits for CI and health-checks `/health`, so a broken build won't go live.
- Deploy when `/health` shows no active rooms if Plan E's room count exists by then.

## 6. Kickoff prompt for the new session
> Read `docs/plan-D-reconnect-resume.md` and CLAUDE.md. Implement Plan D test-first: write `test/integration/resume.test.js` cases 1–10 red, then implement §2.1–2.4 on the server and client, keeping `RESUME_GRACE_MS=0` equal to today's behaviour so existing disconnect tests pass unchanged. Don't change tick loops, heartbeat or deflate settings. Decide §2.5's active-role grace with me before coding it. Verify in the browser pane with two tabs, run `npm run test:all`, then bump the minor version and push to `personal` only.
