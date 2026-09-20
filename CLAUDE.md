# Huddle Play Room

Real-time multiplayer party game platform with nine browser-based games. Designed for phones and desktops, played over WebSocket. All state lives in-memory on the server; there is no database.

**Live at:** [huddleplayroom.com](https://huddleplayroom.com/)

## Commands

```bash
# Development (hot-reload): run both in separate terminals
npm run server      # Terminal 1: Node.js game server on :3000
npm run dev         # Terminal 2: Vite dev server on :5173

# Production
npm run build       # Build frontend to dist/
npm run server      # Serve built app on :3000
npm start           # Build + serve in one command

# Custom port
PORT=8080 npm start

# Tests
npm test                # smoke test only
npm run test:unit       # engine unit tests (test/engines/)
npm run test:integration # server integration tests (test/integration/)
npm run test:all        # unit + integration + smoke (~30-45s)

# Reinstall the pre-push git hook (e.g. on a fresh clone)
npm run install-hooks
```

In dev mode, the frontend on :5173 connects its WebSocket to :3000 automatically (detected by port in `App.jsx`). No Vite proxy is configured.

## Git

Two remotes: `origin` (work GitHub) and `personal` (personal GitHub).

- Work directly on `main` — no feature branches. Solo developer, no PR review needed.
- Push to `personal` only by default
- Push to both only when explicitly asked

## Versioning

Follows semver. After every confirmed fix or feature, before pushing:

1. Bump `version` in `package.json` (`patch` for bug fixes, `minor` for new features/games)
2. Run `npm install --package-lock-only` to sync `package-lock.json` (no actual install, just updates the lockfile metadata)
3. Commit both files together with any remaining changes
4. Create an annotated git tag: `git tag -a vX.Y.Z -m "vX.Y.Z — short description"`
5. Push branch and tag: `git push personal main && git push personal vX.Y.Z`

Current version is tracked in `package.json`. `package-lock.json` must always match. Git tags are the source of truth for releases. The tag message should briefly describe what changed (e.g. `v1.5.1 — Word Chain duplicate/dictionary fixes`).

The footer in the live app displays the current version (e.g. `v1.9.0`). It is sourced directly from `package.json` via a Vite JSON import in `src/App.jsx` — **no manual footer update is needed**. Bumping `package.json` is sufficient; the footer version auto-syncs on the next build.

## Deployment

Hosted on **Railway**, auto-deploying from GitHub on every push.

- Builder: Railpack, with no custom start command, so Railway runs `npm start` = `vite build && node server/index.js` and rebuilds the bundle on every container start. Checked 2026-09-19 via the service config and deploy logs. `VITE_*` Railway variables are therefore present when the bundle is built.
- Railway variables: `LINEAR_API_KEY` (feedback), `VITE_SENTRY_DSN` (browser Sentry DSN, read by Vite at build time and by the `/api/sentry` tunnel at runtime), `SENTRY_DSN` (server Sentry DSN, project `huddle-play-room-server`), `TRUSTED_PROXY_SECRET` (set 2026-09-20; must match the `x-origin-secret` header a Cloudflare request-header transform rule adds — see Security Notes). Optional overrides: `TRUSTED_PROXY_HEADER` (default `x-origin-secret`), `SENTRY_TUNNEL_DAILY_MAX`, `SENTRY_SERVER_DAILY_MAX` (both default 50), `RESUME_GRACE_MS` (seat hold after a drop, default 45000; 0 = instant removal).
- **Restart policy: ALWAYS** (set 2026-09-20; Railway's default is On Failure capped at 10 restarts, which would leave the service down after 11 crashes). A crash therefore self-heals — and is invisible unless something reports it, which is what the crash webhook is for.
- **Crash alerts:** a project webhook (Railway → project **Settings** → **Webhooks**) posts critical events — `Deployment Oom Killed`, `Deployment Failed`, volume/monitor alerts — to Discord `#huddleplayroom-status`. Railway formats Discord/Slack payloads itself. This is the only layer that can see the process die: a V8 heap OOM aborts before any JS handler runs, so Sentry can never report it, and UptimeRobot only catches an outage that outlasts its 5-minute check.
- **Region: Southeast Asia — Singapore (`asia-southeast1-eqsg3a`), single replica.** Most players are in Asia, so the server was moved here (from US East) on 2026-06-23 to cut WebSocket RTT — the main lever for real-time games like Snake. Region lives in Railway service settings (`multiRegionConfig`), not in a config file, like the start command. To change it: set `multiRegionConfig` via the Railway API/dashboard and redeploy (no downtime — no volume attached). Single-region only; multi-region replicas need the Pro plan.
- Railway generates the public domain. The server serves both WebSocket and static files (dist/) from a single port.
- **Wait for CI is on** (deploy trigger `checkSuites: true`, set 2026-09-19): Railway only deploys a push after the GitHub Actions test workflow passes. **Healthcheck:** `healthcheckPath: /health` (timeout 120s) — a new deploy must answer 200 there before it replaces the old one. `/health` is handled *before* the canonical-host redirect because Railway's probe uses its own Host header; keep it that way or deploys will fail.
- **Check `/health` before deploying.** Every deploy wipes all in-memory rooms. `curl -s https://huddleplayroom.com/health` returns `ok`, `version`, `region`, `uptime` (the healthcheck and region proof rely on these; never change them) plus live gauges: `rooms`, `players`, `sockets`, `rssMB`, `eventLoopLagMs` (`p50`/`p99`/`max` over the last completed minute) and `proxied`. Deploy when `rooms` is 0, or tell the user who is online.
  - `proxied` is `true` when *this* request carried the edge secret, `false` when it didn't, `null` when `TRUSTED_PROXY_SECRET` isn't set. One curl answers "is the Cloudflare transform rule still reaching the origin?".
  - **Reading `eventLoopLagMs`:** the histogram samples at 20 ms resolution and `readLoopLag()` subtracts exactly that, so the smallest non-zero value it can report is ~20 ms — meaning "the sampler was one tick late", not 20 ms of stall. Measured 2026-09-20: an idle container on one Railway host sat at p50 0.2 / p99 ~21 while using 0.35% of its 8-vCPU limit, where earlier hosts idled at p99 0.2 for hours on the same code. Treat p99 ≈ 20 on an idle server as host scheduling; take the reading that matters when `rooms > 0`.
- **Cloudflare sits in front** (zone on the free plan, apex CNAME proxied to Railway). `www.huddleplayroom.com` is a proxied CNAME plus a Cloudflare Single Redirect rule → 301 to the apex (path + query preserved). Keep the Cloudflare proxy: on 2026-09-19 WebSocket RTT via Cloudflare was ~177ms median vs ~360ms direct to `*.up.railway.app`.
- App sleeping is **not** enabled (the service config has no `sleepApplication`), and the restart policy is ALWAYS, which Railway offers only on a paid plan — so the old "free tier may sleep, first visitor wakes it in ~5s" note no longer applies.
- No Dockerfile, Procfile, or railway.json exists. Railway detects the Node.js project automatically.

## Tech Stack

- **Frontend:** React 18, Vite 6, plain CSS (single file: `src/index.css`), native browser WebSocket, `@sentry/react` (errors only, lazy-loaded)
- **Backend:** Node.js, `ws` library, `http` module for static file serving, `@sentry/node` (errors only, imported only when `SENTRY_DSN` is set)
- **Hosting:** Railway (auto-deploy from GitHub)
- **No database, no backend framework, no CSS preprocessor.** Tests use Node's built-in `node:test` runner — no test framework dependency.
- Dependencies are intentionally minimal. Do not add libraries without discussing first.

## Architecture

### Server (`server/`)

`index.js` (~2050 lines) is the entire server: HTTP static file serving, WebSocket lifecycle, room management, message routing, timer orchestration, and game dispatch. The `rooms` Map is the single source of truth.

Each game has a **pure engine module** (no side effects, no timers, no WebSocket access):

| Engine file | Game | Key functions |
|---|---|---|
| `engine.js` | Snake Arena | `createGameState()`, `stepGame()`, `setSnakeDirection()` |
| `truths-engine.js` | Two Truths & a Lie | `createTruthsState()`, `handleTruthsAction()`, `revealTruths()` |
| `emoji-engine.js` | Emoji Storytelling | `createEmojiState()`, `handleEmojiAction()`, `tickEmoji()` |
| `sketch-engine.js` | Sketch & Guess | `createSketchState()`, `handleSketchAction()`, `tickSketch()`, `revealSketch()` |
| `trivia-engine.js` | Speed Trivia | `createTriviaState()`, `handleTriviaAction()`, `tickTrivia()` |
| `bomber-engine.js` | Bomber Arena | `createBomberState()`, `handleBomberAction()`, `stepBomber()`, `tickBomberTimer()` |
| `typeracer-engine.js` | Type Racer | `createTyperacerState()`, `handleTyperacerAction()`, `tickTyperacer()` |
| `wordchain-engine.js` | Word Chain | `createWordChainState()`, `handleWordChainAction()`, `tickWordChain()` |
| `hottake-engine.js` | Hot Take Voting | `createHotTakeState()`, `handleHotTakeAction()`, `tickHotTake()` |
| `voting-engine.js` | Game voting phase | `createVotingState()`, `submitVote()`, `resolveVoting()` |

`room-loop.js` is one function, `guardedTick`. Every room timer runs through it (`startLoop`/`startPendingAdvance` in `index.js`): Node reschedules an interval whose callback throws, so before this a bug inside a tick repeated its error every tick — 8x/s for Snake — with the room frozen. Now that one room logs `game_loop_error` once, stops its game, tells the players and returns to the game vote; the other rooms are untouched.

`client-ip.js` decides who a request counts as for the per-IP limits on `/api/feedback` and `/api/sentry`. It is pure, and it is pure because the wrong answer was invisible through the endpoints: keying an untrusted request on `req.socket.remoteAddress` passes every local test (a laptop's socket address is constant) and does nothing in production (Railway's edge hands each request to the container from its own internal address, so every request got a fresh budget). Requests that don't carry the edge secret now share one identity.

`sentry.js` is errors-only server Sentry (Plan E2 part 2). It has no automatic instrumentation (`defaultIntegrations: false`, `skipOpenTelemetrySetup`, `registerEsmLoaderHooks: false`) and no Sentry process handlers; ours keep the process alive. Events are sent only through `captureError(err, tags)` in the existing error paths: message and game-action catches, uncaught exceptions and unhandled rejections, feedback 5xx. `createErrorGate` allows each distinct error once per 10 minutes and at most 50 per 24h. Client mistakes must stay 4xx (e.g. invalid JSON to `/api/feedback` is a 400) so they never reach Sentry. `serverName` is pinned so a laptop hostname is never sent. Verified: Snake tick timing is unchanged with the SDK loaded, and it adds no event-loop handles; RSS grows by about 20 MB.

`log.js` is structured logging: `log(event, fields, level)` writes one JSON line to stdout in Railway's schema (`message` = event name, `level`, every other field a filterable `@attribute`). `createLimitedLog()` caps an event per minute. Use it for error and abuse events a client or a bug can fire in a loop, so a flood can't push Railway past its 500 lines/s cap. Lifecycle events go through `logLifecycle` (capped at 120 per event per minute) when a client can drive them in a loop — a fresh socket may resume the same seat, and host-then-drop recreates rooms; 1200 lines/s would push Railway past its 500 lines/s cap. Events: `server_started`, `server_shutdown`, `room_created`, `room_closed`, `player_joined`, `player_left` (with WebSocket close code: 1000/1001 normal, 1006 dropped; logged when the seat is actually released, i.e. after the resume grace), `game_started`, `game_ended`, `heartbeat_terminate`, `resume_ok` (`awayMs`, `replaced`, `conn` = the new socket's connection id), `resume_failed` (capped: a client can loop it), `grace_expired`. Never log a `resumeToken`. Errors: `message_error`, `game_action_error`, `uncaught_exception`, `unhandled_rejection`, `feedback_error`. **Never log inside a game tick loop, and never log player names or IPs** (room codes and player ids only). `test/integration/lifecycle-logs.test.js` enforces both.

`words-en.txt` is a bundled 172k-word English dictionary (ENABLE2k, public domain) used by `wordchain-engine.js` for word validation. Loaded once at startup into a Set.

**Pattern for engines:** functions take current state + inputs, return new state. `index.js` calls engine functions, manages timers (`setInterval`), and broadcasts results. Keep this separation strict.

### Frontend (`src/`)

- `sentry.js` sets up errors-only Sentry (Plan E2). It does nothing unless `VITE_SENTRY_DSN` is set and the page is on `huddleplayroom.com`. The SDK is its own chunk (`sentry-sdk.js`, ~30 KB gzipped), fetched after the page's `load` event. Keep it behind that named-import wrapper: a direct `import("@sentry/react")` pulls in the whole SDK (~160 KB gzipped). `sentry-gate.js` sends each distinct error once and at most 10 per page load. Events go to our own `/api/sentry` tunnel, never straight to Sentry. The game `ErrorBoundary` reports through `reportError()`.
- `App.jsx` owns the WebSocket connection and all top-level state (`room`, `game`, `voting`, `me`). It routes to the correct game component via the `GAME_COMPONENTS` map.
- `Lobby.jsx` handles host/join UI before a room exists.
- `VotingPhase.jsx` renders the game selection voting screen.
- `src/games/` has one component per game. Each receives `{ game, room, me, send }` as props.

### WebSocket Protocol

Client to server: `host`, `join`, `resume`, `start`, `input`, `stopInput`, `vote`, `gameAction`, `endGame`, `skipPhase`, `restart`

Server to client: `welcome`, `state`, `vote_state`, `room`, `error`, `resume_failed`, `sketch_stroke`, `sketch_clear`

`welcome` carries `{ id, resumeToken }`; the token goes only to its owner, never into `room`/`state`/`vote_state` or the logs. The server closes a socket with code **4000** when its seat was resumed on a newer socket (last connection wins); the client must not auto-reconnect after a 4000.

Emoji and Sketch serialise state per-player to hide secret words. All other games broadcast identical state to everyone.

### Room Lifecycle

`lobby` -> `voting` -> `playing` -> `voting` -> ... (host ends game to return to voting)

Players can join in `lobby` **and** `voting`; mid-game joins are rejected because every engine freezes its roster at game start.

**Host role while away (v1.22.0).** If the host's socket drops, the star moves to a connected player at once and returns if the original host resumes inside the grace (`hostReturnsTo`). Without it, lobby Start, Snake's game over and Trivia's "Start Next Set" — the phases with no timer — waited out the whole grace, up to ~75s counting heartbeat detection.

**Room reclaim (v1.22.0).** A seat in its grace holds the room, so host-and-drop could pin all `MAX_ROOMS` slots with no socket open. At the cap, `reclaimIdleRoom()` closes the oldest room nobody is connected to; a room with anyone in it is never touched.

**Session resume (Plan D, v1.21.0).** A socket's connection id (`clientId`, also the rate-limit key) is also the player id of the seat it takes. When a player's socket closes, the seat is held for `RESUME_GRACE_MS` (45s): the player stays in `room.players` with `connected: false` (sent in `room` only while away, so the payload is unchanged when everyone is connected) and keeps id, host role, colour, scores, votes and place in the running game. A new socket sends `{ type: "resume", token }` and gets back `welcome { resumed: true }`, `room`, then `vote_state`/`state`; after that `socketToPlayer` maps it to the old player id, via `playerIdFor()` at the top of `handleMessage`. If the grace runs out, the timer calls the normal `handleDisconnect` (host reassignment prefers a connected player, vote pruning, `reconcileDisconnect`); that path is not forked. The storyteller/drawer/presenter gets the same 45s (decided 2026-09-19): phase timers bound a stalled turn and the host can Skip. A room is deleted only when its last seat is released, so a shared Wi-Fi drop doesn't lose it. Resume can't survive a deploy (in-memory); the client then gets `resume_failed` and falls back to the Rejoin banner / prefilled lobby.

### Leaderboard

Two tiers tracked separately:
- **Round wins:** within a game session, reset when host ends the game
- **Game wins:** awarded to the round-win leader on End Game, persist for the room's lifetime

### Timers

- Snake ticks every 120ms
- Bomber Arena ticks every 100ms (movement); the round timer counts down from the same loop via an accumulator
- All other game/voting timers tick every 1000ms
- WebSocket ping/pong heartbeat runs every 15s to keep connections alive through proxies and load balancers
- Resume grace: one `setTimeout` per away player (`RESUME_GRACE_MS`, default 45s), cleared on resume

## Adding a New Game

1. Create `server/<game>-engine.js` as a pure module (no imports from index.js, no side effects)
2. Add game dispatch logic in `server/index.js`: handle its message types, timer setup, and state broadcasting
3. Create `src/games/<Game>Game.jsx` receiving `{ game, room, me, send }`
4. Register the component in `GAME_COMPONENTS` and `GAME_LABELS` in `App.jsx`
5. Add the game key to the voting options in `voting-engine.js`

## Constraints and Limits

- Max 8 players per room
- Player names clamped to 16 characters
- Room codes are 4 characters from `ABCDEFGHJKMNPQRSTUVWXYZ23456789` (no ambiguous chars like 0/O/I/L)
- Snake board size is 30x30

## Security Notes

Current protections:
- Host-only validation on sensitive actions (start, end game, skip phase)
- Room capacity enforcement (max 8)
- Player name length clamping
- JSON parse wrapped in try-catch; non-object messages rejected; the whole `handleMessage` dispatch is wrapped in try/catch (a throw escaping the ws `message` listener wedges that socket's receiver until the heartbeat kicks it)
- Player names and room codes type-checked (`cleanName`) before use
- Per-client WebSocket rate limit (60 msg/sec, fixed 1-second window)
- 16 KB max WebSocket payload
- Origin verification on WebSocket handshake (exact hostname match — canonical domain, localhost, 127.0.0.1; rejects cross-site connections)
- One room per socket (host/join rejected while already in a room) plus a global room cap (`MAX_ROOMS`, default 500, env-overridable)
- `handleGameAction` switch wrapped in try/catch so an engine throw can't take down the whole server
- `process.on('uncaughtException')` + `unhandledRejection` last-resort handlers
- Full security headers on HTTP responses (CSP, HSTS, X-Frame-Options, Permissions-Policy, Referrer-Policy) The CSP allows only `'self'` plus Cloudflare Web Analytics: `script-src https://static.cloudflareinsights.com` for the beacon, which Cloudflare injects at the edge (kept on by the user), and `connect-src https://cloudflareinsights.com`. It is pinned exactly by `static-http.test.js`.
- HTTPS canonical redirect
- Sketch input is validated and budgeted: points must be `{x,y}` numbers (rounded, clamped to the 400x400 canvas), max 200 per stroke, 20k points and 1000 strokes per round, colour must match `#rrggbb`, and each player gets 20 guesses per round. A stroke is broadcast on its own (`sketch_stroke`) and the per-second state leaves the canvas out, so a round's cost is bounded instead of quadratic
- Per-IP limits are keyed by `server/client-ip.js`: with `TRUSTED_PROXY_SECRET` set, `cf-connecting-ip` is believed only on requests carrying the edge's `x-origin-secret`; everything else shares one bucket. Unset, it behaves as before
- The canonical-host redirect parses IPv6 literals (`[::1]:3000` → `::1`, which is a local host). Splitting the Host header on the first colon used to yield `"["`, so dev over the IPv6 loopback was redirected to production
- Feedback API: per-IP rate limit keyed on `cf-connecting-ip` (the first `X-Forwarded-For` entry is client-controlled), global hourly cap on Linear issue creation (`FEEDBACK_GLOBAL_MAX`, default 20), CORS only for the canonical origin + localhost, honeypot, time-trap, screenshot size cap
- `ws` kept at ≥ 8.21.3 (8.21.0 fixed a remote memory-exhaustion DoS, GHSA-96hv-2xvq-fx4p)
- Sentry tunnel `POST /api/sentry` (`server/sentry-tunnel.js`) forwards browser error envelopes to Sentry. It accepts only our own DSN, forwards only `event` items (sessions, client reports, traces and replays are dropped) and caps bodies at 256 KB. It rate-limits each IP to 10/hour and allows one global cap of `SENTRY_TUNNEL_DAILY_MAX` events (default 50) per 24h. The client IP is never forwarded. This is the Sentry quota guard: per-key rate limits need a paid Sentry plan, and the org's 5k errors/month is shared with the Nux project. The CSP needs no Sentry host, because the tunnel is same-origin.
- No file system writes, no database. External calls: Linear API (feedback), Sentry ingest (via the tunnel).

Known gaps to be aware of:
- **Resume is in-memory and grace-bounded.** A drop longer than `RESUME_GRACE_MS` (45s), or any deploy, loses the seat. The client always auto-reconnects with backoff and sends `resume`; on `resume_failed` it shows the "Rejoin" banner (reload → lobby prefilled with room code + name) and the player re-enters at the next game vote as a new player. The client only notices a silently dead socket when the browser fires `close`; there is no app-level ping, because it would add steady-state traffic.
- **Sentry alerts depend on UI settings.** Browser errors go to project `huddle-play-room` and server errors to `huddle-play-room-server` (org `dmytro-projects`, shared with project `nux`). Email alerts and "Prevent storing IP addresses" are per-project UI settings the MCP can't set or read. Uptime monitoring is on UptimeRobot's free plan instead (the Sentry org's only free uptime slot belongs to Nux). The real check is monitor **804033693**: a **KEYWORD** monitor on `https://huddleplayroom.com/health` (keyword `"ok":true`, alert when it's missing, every 5 min, emails the owner). Free **HTTP** monitors can only send HEAD, and HEAD `/health` falls through to the SPA fallback (200 text/html), so an HTTP monitor proves only that *something* answered. Free KEYWORD monitors send GET and read the body. Verified 2026-09-19: an absent keyword turned the monitor Down, confirmed from 4 locations about 15 s apart, and restoring it brought it back Up. The UptimeRobot connector (claude.ai) can read and update monitors but not delete them.
- **No input sanitisation beyond length clamping.** Player names and text inputs are JSON-serialised (not rendered as raw HTML), so XSS risk is low. Any future feature rendering user text as HTML must sanitise it.
- **In-memory state means zero persistence.** Server restart (including Railway redeploys) loses all rooms and scores.
- **The origin answers without Cloudflare**, because Railway routes on the Host header — so `https://huddleplayroom.com` also resolves at Railway's edge directly, where `cf-connecting-ip` is whatever the caller sends. Closed 2026-09-20: a Cloudflare **request** header transform rule adds `x-origin-secret` to every request, and `TRUSTED_PROXY_SECRET` makes the server believe forwarded IPs only when it matches; anything else shares one rate-limit bucket. Verified live — 12 direct-to-origin posts with a rotating `cf-connecting-ip` give ten 400s then 429, while the same 12 through Cloudflare keep their own budget. **The rule must be a *Request* Header Transform Rule** (a Response rule publishes the secret to every visitor instead; that mistake was made twice, caught by `curl -sI`, and the secret rotated each time). Check with `/health` → `proxied`.

## Performance Considerations

- Snake's 120ms tick interval is the tightest loop. Keep `stepGame()` fast and avoid allocations where possible.
- `broadcastGameState()` serialises per-player for Emoji and Sketch games. With 8 players this means 8 JSON.stringify calls per tick. Fine at current scale but would need attention if game complexity grows. Sketch's canvas is **not** part of that per-tick payload (see `light` in `broadcastGameState`): re-sending it per player per action is what made one drawer able to exhaust the heap.
- `broadcast()`/`sendTo()` skip a socket with more than 1 MB queued and terminate one past 8 MB (`canSend`). ws queues without limit otherwise, so a stuck socket became server memory. A terminated player reconnects and resumes their seat.
- Static caching: only Vite's hashed `/assets/*` get `immutable` (1 year); other `public/` files (favicon, icons, `og-image.png`) get `max-age=86400`; HTML/robots/sitemap/manifest are `no-cache` **at the origin** — Cloudflare's Browser Cache TTL rewrites some of them (checked 2026-09-19: `/robots.txt` and a 404 for a missing `/assets/*` come back `max-age=14400`). A missing `/assets/*` file returns 404 (never index.html). Cloudflare sits in front.
- Source maps are public on purpose: `build.sourcemap: true`, served as `application/json` under `/assets` with the immutable cache. Sentry fetches them to symbolicate browser stack frames, so no upload step or auth token is needed; the repo is public anyway, and the project setting "Enable JavaScript source fetching" must stay on. **Gotcha:** Vite's chunk hash doesn't cover the `sourceMappingURL` comment, so a chunk whose content differs only by that comment keeps its old name. Cloudflare may then hold the old immutable copy: purge that URL (cloudflare-api MCP, zone `61363c59fe0d92f0313b907d1d0eba99`).
- Sketch strokes are sent in 120-point pieces while drawing (`STROKE_CHUNK_POINTS` in `SketchGame.jsx`) — a whole long stroke in one message could exceed the 16 KB `maxPayload` and get the drawer disconnected.

## Mobile Support

The app is designed for phone use. Key patterns to maintain:
- All inputs use `font-size: 16px` minimum (prevents iOS Safari auto-zoom)
- Touch controls exist alongside keyboard controls (swipe + on-screen buttons for Snake, finger drawing for Sketch)
- Touch event handlers use `passive: false` where needed to prevent pull-to-refresh on iOS

## Testing

### Automated Tests

Three tiers, all on Node's built-in `node:test` runner (no framework dependency):

- `npm run test:unit` — pure engine unit tests in `test/engines/`
- `npm run test:integration` — server integration tests in `test/integration/` (disconnect handling, phase advancement, health endpoint, etc.)
- `npm test` — the smoke test: `test/smoke-test.js` starts the server on port 9876, connects two WebSocket clients, and runs through the core flow: host a room, join it, start voting, vote for a game, verify the game starts, test error handling, and test disconnect cleanup
- `npm run test:all` — all of the above in sequence (~30–45s). This is what the pre-push hook and CI run.

A **pre-push git hook** runs `npm run test:all` automatically before every `git push`. If any test fails, the push is blocked. Bypass with `git push --no-verify` if needed. The canonical copy of the hook is committed at `scripts/pre-push`; the live copy in `.git/hooks/` is not committed, so on a fresh clone restore it with `npm run install-hooks` (worktree-safe — installs into the common git dir).

**CI:** `.github/workflows/test.yml` runs `npm ci && npm run test:all` on Node 22 for every push and pull request, so the suite guards production even if the local hook is bypassed or missing. Since 2026-09-19 Railway waits for CI (`checkSuites: true`), so **a red CI run blocks the deploy** — CI is now a gate. Tests must not depend on `npm run build` (CI doesn't build); `static-http.test.js` serves a temp `DIST_DIR` fixture instead. Integration test ports must stay unique across files (node:test runs files in parallel); used so far: 9882–9915.

`docs/second-review-2026-09.md` is an independent adversarial review of v1.17.0–v1.21.0 (2026-09-19) and the v1.22.x fixes that came out of it: ten findings, the probes that reproduced them, the mutation testing, the latency breakdown, and the infrastructure checklist. Read it before trusting that a green suite means much here.

`docs/qa-fleet-2026-09.md` is the 2026-09-20 parallel gameplay QA run (186 games across 147 rooms, bots driving the real protocol): the three major fairness bugs fixed in v1.22.3, **nine minor findings that are still open** with file:line for each, and two agent results that did not survive verification. The bots themselves are in `tools/qa-bots/` (not part of `test:all` — exploratory QA and by-hand repros; see its README).

**Two testing gotchas that run recorded, both worth knowing before writing a test here:**
- **The harness hides the resume grace.** `startServer()` defaults `RESUME_GRACE_MS=0`, so every disconnect suite asserts the *post*-grace world while production spends 45s in the pre-grace one. `bomber-disconnect.test.js` passed for exactly that reason while a disconnected player could really win a Bomber round. `grace-stale-roster.test.js` sets the grace on purpose — **write disconnect tests both ways.**
- **A silently-ignored action is indistinguishable from a passing test.** Snake's `setSnakeDirection` takes only uppercase (`"UP"`), `handleInput` never normalises, and anything else is dropped with no error — one QA agent tested a whole game where no input ever registered and reported it green. Pair every "the engine correctly refused X" assertion with a positive control showing the same action shape *does* work when it should.

Two env vars exist only for tests and are never set in production: `DEBUG_INTERNALS=1` adds `GET /__internals` (map sizes, grace timers, live loops, timer handles) and accepts a `__throwOnTick` game action that makes one tick throw; `SLOW_SOCKET_SKIP_BYTES` / `SLOW_SOCKET_DROP_BYTES` move the backpressure thresholds. They exist because the regressions that matter most here are invisible from the outside: a leaked session, an orphaned loop, a grace timer that was never cleared. **When changing resume, cleanup or loop code, mutation-test it** — break the line on purpose and check a test goes red. Four such regressions passed the whole suite before v1.22.0. The harness `startServer()` defaults to `RESUME_GRACE_MS=0` (instant removal, the pre-Plan D behaviour the disconnect suites assert); only `resume.test.js` opts into a grace period.

After tests pass, if the push targets `refs/heads/main` the hook also background-spawns `scripts/verify-deploy.js`. That script polls Railway for the deployment of the pushed SHA, then curls `huddleplayroom.com` to confirm the new code is live. Results land in `/tmp/hpr-deploy-verify-<short-sha>.log` and a macOS notification fires when complete (~30–90s after push).

### Manual deploy verification

`npm run verify-deploy` runs the same Railway poll + live URL check against the local HEAD commit. Use it to spot-check whether a recent push made it live, or pass an explicit SHA:

```bash
npm run verify-deploy             # checks current HEAD
node scripts/verify-deploy.js c14e8da   # checks a specific commit
```

Requires the `railway` CLI installed, logged in, and the project linked (`railway link --project 2df6c931-bddb-4fd3-b576-ffbebfa09373 --environment production --service ice-breaker-games`).

### AI-Powered Pre-Push Review

The `pre-push-review` skill (in `.claude/skills/pre-push-review/`) runs three checks when invoked in Claude Code or Cowork:

1. **Smoke tests** - runs `npm test` and reports failures
2. **Cross-file impact analysis** - checks that changes to engine modules, server dispatch, and React components are consistent with each other
3. **Code review** - reviews changes against the project's architecture rules, security constraints, performance considerations, and mobile compatibility patterns

Trigger it by saying "pre-push", "ready to push", or "review before push".

### Manual Testing

For features the smoke test doesn't cover:
- Open two browser tabs to simulate multiplayer (one hosts, one joins)
- Test on both desktop and mobile (or use Chrome DevTools device mode)
- Remember that Railway redeploys on every push, so broken code goes live immediately

## Content Maintenance

For static text bank reviews and expansions (Hot Take, Trivia, Emoji, Sketch, Type Racer), follow:
- `docs/content-health-checklist.md`

Invoke in AI sessions with: "Run the content health checklist in `docs/content-health-checklist.md`."
