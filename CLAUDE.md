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
- Railway variables: `LINEAR_API_KEY` (feedback), `VITE_SENTRY_DSN` (browser Sentry DSN, read by Vite at build time and by the `/api/sentry` tunnel at runtime).
- **Region: Southeast Asia — Singapore (`asia-southeast1-eqsg3a`), single replica.** Most players are in Asia, so the server was moved here (from US East) on 2026-06-23 to cut WebSocket RTT — the main lever for real-time games like Snake. Region lives in Railway service settings (`multiRegionConfig`), not in a config file, like the start command. To change it: set `multiRegionConfig` via the Railway API/dashboard and redeploy (no downtime — no volume attached). Single-region only; multi-region replicas need the Pro plan.
- Railway generates the public domain. The server serves both WebSocket and static files (dist/) from a single port.
- **Wait for CI is on** (deploy trigger `checkSuites: true`, set 2026-09-19): Railway only deploys a push after the GitHub Actions test workflow passes. **Healthcheck:** `healthcheckPath: /health` (timeout 120s) — a new deploy must answer 200 there before it replaces the old one. `/health` is handled *before* the canonical-host redirect because Railway's probe uses its own Host header; keep it that way or deploys will fail.
- **Check `/health` before deploying.** Every deploy wipes all in-memory rooms. `curl -s https://huddleplayroom.com/health` returns `ok`, `version`, `region`, `uptime` (the healthcheck and region proof rely on these; never change them) plus live gauges: `rooms`, `players`, `sockets`, `rssMB`, `eventLoopLagMs` (`p50`/`p99`/`max` over the last completed minute). Deploy when `rooms` is 0, or tell the user who is online.
- **Cloudflare sits in front** (zone on the free plan, apex CNAME proxied to Railway). `www.huddleplayroom.com` is a proxied CNAME plus a Cloudflare Single Redirect rule → 301 to the apex (path + query preserved). Keep the Cloudflare proxy: on 2026-09-19 WebSocket RTT via Cloudflare was ~177ms median vs ~360ms direct to `*.up.railway.app`.
- Free tier may sleep after inactivity; first visitor wakes it in ~5 seconds.
- No Dockerfile, Procfile, or railway.json exists. Railway detects the Node.js project automatically.

## Tech Stack

- **Frontend:** React 18, Vite 6, plain CSS (single file: `src/index.css`), native browser WebSocket, `@sentry/react` (errors only, lazy-loaded)
- **Backend:** Node.js, `ws` library, `http` module for static file serving
- **Hosting:** Railway (auto-deploy from GitHub)
- **No database, no backend framework, no CSS preprocessor.** Tests use Node's built-in `node:test` runner — no test framework dependency.
- Dependencies are intentionally minimal. Do not add libraries without discussing first.

## Architecture

### Server (`server/`)

`index.js` (~1300 lines) is the entire server: HTTP static file serving, WebSocket lifecycle, room management, message routing, timer orchestration, and game dispatch. The `rooms` Map is the single source of truth.

Each game has a **pure engine module** (no side effects, no timers, no WebSocket access):

| Engine file | Game | Key functions |
|---|---|---|
| `engine.js` | Snake Arena | `createGame()`, `stepGame()`, `changeDirection()` |
| `truths-engine.js` | Two Truths & a Lie | `createTruthsState()`, `submitStatements()`, `submitGuess()` |
| `emoji-engine.js` | Emoji Storytelling | `createEmojiState()`, `submitGuess()`, `tickEmoji()` |
| `sketch-engine.js` | Sketch & Guess | `createSketchState()`, `submitSketchGuess()`, `tickSketch()`, `revealSketch()` |
| `trivia-engine.js` | Speed Trivia | `createTriviaState()`, `submitAnswer()`, `tickTrivia()` |
| `bomber-engine.js` | Bomber Arena | `createBomberState()`, `handleBomberAction()`, `stepBomber()`, `tickBomberTimer()` |
| `typeracer-engine.js` | Type Racer | `createTyperacerState()`, `handleTyperacerAction()`, `tickTyperacer()` |
| `wordchain-engine.js` | Word Chain | `createWordChainState()`, `handleWordChainAction()`, `tickWordChain()` |
| `hottake-engine.js` | Hot Take Voting | `createHotTakeState()`, `handleHotTakeAction()`, `tickHotTake()` |
| `voting-engine.js` | Game voting phase | `createVotingState()`, `submitVote()`, `resolveVoting()` |

`log.js` is structured logging: `log(event, fields, level)` writes one JSON line to stdout in Railway's schema (`message` = event name, `level`, every other field a filterable `@attribute`). `createLimitedLog()` caps an event per minute. Use it for error and abuse events a client or a bug can fire in a loop, so a flood can't push Railway past its 500 lines/s cap. Lifecycle events: `server_started`, `server_shutdown`, `room_created`, `room_closed`, `player_joined`, `player_left` (with WebSocket close code: 1000/1001 normal, 1006 dropped), `game_started`, `game_ended`, `heartbeat_terminate`. Errors: `message_error`, `game_action_error`, `uncaught_exception`, `unhandled_rejection`, `feedback_error`. **Never log inside a game tick loop, and never log player names or IPs** (room codes and player ids only). `test/integration/lifecycle-logs.test.js` enforces both.

`words-en.txt` is a bundled 172k-word English dictionary (ENABLE2k, public domain) used by `wordchain-engine.js` for word validation. Loaded once at startup into a Set.

**Pattern for engines:** functions take current state + inputs, return new state. `index.js` calls engine functions, manages timers (`setInterval`), and broadcasts results. Keep this separation strict.

### Frontend (`src/`)

- `sentry.js` sets up errors-only Sentry (Plan E2). It does nothing unless `VITE_SENTRY_DSN` is set and the page is on `huddleplayroom.com`. The SDK is its own chunk (`sentry-sdk.js`, ~30 KB gzipped), fetched after the page's `load` event. Keep it behind that named-import wrapper: a direct `import("@sentry/react")` pulls in the whole SDK (~160 KB gzipped). `sentry-gate.js` sends each distinct error once and at most 10 per page load. Events go to our own `/api/sentry` tunnel, never straight to Sentry. The game `ErrorBoundary` reports through `reportError()`.
- `App.jsx` owns the WebSocket connection and all top-level state (`room`, `game`, `voting`, `me`). It routes to the correct game component via the `GAME_COMPONENTS` map.
- `Lobby.jsx` handles host/join UI before a room exists.
- `VotingPhase.jsx` renders the game selection voting screen.
- `src/games/` has one component per game. Each receives `{ game, room, me, send }` as props.

### WebSocket Protocol

Client to server: `host`, `join`, `start`, `input`, `vote`, `gameAction`, `endGame`, `skipPhase`, `restart`

Server to client: `welcome`, `state`, `vote_state`, `room`, `error`

Emoji and Sketch serialise state per-player to hide secret words. All other games broadcast identical state to everyone.

### Room Lifecycle

`lobby` -> `voting` -> `playing` -> `voting` -> ... (host ends game to return to voting)

Players can join in `lobby` **and** `voting` (the game-vote screen is the re-entry point for a player whose connection dropped); mid-game joins are rejected because every engine freezes its roster at game start. A player who leaves during `voting` has their vote removed, and the vote resolves immediately if everyone left has voted. There is no session resume yet — a reconnecting player is a new player (see `docs/plan-D-reconnect-resume.md`).

### Leaderboard

Two tiers tracked separately:
- **Round wins:** within a game session, reset when host ends the game
- **Game wins:** awarded to the round-win leader on End Game, persist for the room's lifetime

### Timers

- Snake ticks every 120ms
- Bomber Arena ticks every 100ms (movement) and 1000ms (round timer)
- All other game/voting timers tick every 1000ms
- WebSocket ping/pong heartbeat runs every 15s to keep connections alive through proxies and load balancers

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
- Per-client WebSocket rate limit (60 msg/sec sliding window)
- 16 KB max WebSocket payload
- Origin verification on WebSocket handshake (exact hostname match — canonical domain, localhost, 127.0.0.1; rejects cross-site connections)
- One room per socket (host/join rejected while already in a room) plus a global room cap (`MAX_ROOMS`, default 500, env-overridable)
- `handleGameAction` switch wrapped in try/catch so an engine throw can't take down the whole server
- `process.on('uncaughtException')` + `unhandledRejection` last-resort handlers
- Full security headers on HTTP responses (CSP, HSTS, X-Frame-Options, Permissions-Policy, Referrer-Policy)
- HTTPS canonical redirect
- Sketch round capped at 1000 strokes (defensive memory guard)
- Feedback API: per-IP rate limit keyed on `cf-connecting-ip` (the first `X-Forwarded-For` entry is client-controlled), global hourly cap on Linear issue creation (`FEEDBACK_GLOBAL_MAX`, default 20), CORS only for the canonical origin + localhost, honeypot, time-trap, screenshot size cap
- `ws` kept at ≥ 8.21.3 (8.21.0 fixed a remote memory-exhaustion DoS, GHSA-96hv-2xvq-fx4p)
- Sentry tunnel `POST /api/sentry` (`server/sentry-tunnel.js`) forwards browser error envelopes to Sentry. It accepts only our own DSN, forwards only `event` items (sessions, client reports, traces and replays are dropped) and caps bodies at 256 KB. It rate-limits each IP to 10/hour and allows one global cap of `SENTRY_TUNNEL_DAILY_MAX` events (default 50) per 24h. The client IP is never forwarded. This is the Sentry quota guard: per-key rate limits need a paid Sentry plan, and the org's 5k errors/month is shared with the Nux project. The CSP needs no Sentry host, because the tunnel is same-origin.
- No file system writes, no database. External calls: Linear API (feedback), Sentry ingest (via the tunnel).

Known gaps to be aware of:
- **No session resume.** If a player's WebSocket drops while in a room they lose their seat; the client shows a "Rejoin" banner (reload → lobby prefilled with room code + name) and they can re-enter at the next game vote as a new player. On the start screen (not in a room) the client auto-reconnects with backoff. Plan: `docs/plan-D-reconnect-resume.md`.
- **Server errors are not in Sentry yet.** Browser errors go to Sentry project `huddle-play-room` (org `nux-kb`, shared with Nux). Server errors are only structured JSON lines in Railway logs (filter `@level:error`) until the server SDK ships (Plan E2 part 2: `docs/plan-E-observability.md`).
- **No input sanitisation beyond length clamping.** Player names and text inputs are JSON-serialised (not rendered as raw HTML), so XSS risk is low. Any future feature rendering user text as HTML must sanitise it.
- **In-memory state means zero persistence.** Server restart (including Railway redeploys) loses all rooms and scores.

## Performance Considerations

- Snake's 120ms tick interval is the tightest loop. Keep `stepGame()` fast and avoid allocations where possible.
- `broadcastGameState()` serialises per-player for Emoji and Sketch games. With 8 players this means 8 JSON.stringify calls per tick. Fine at current scale but would need attention if game complexity grows.
- Static caching: only Vite's hashed `/assets/*` get `immutable` (1 year); other `public/` files (favicon, icons, `og-image.png`) get `max-age=86400`; HTML/robots/sitemap/manifest are `no-cache`. A missing `/assets/*` file returns 404 (never index.html). Cloudflare sits in front.
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

**CI:** `.github/workflows/test.yml` runs `npm ci && npm run test:all` on Node 22 for every push and pull request, so the suite guards production even if the local hook is bypassed or missing. Since 2026-09-19 Railway waits for CI (`checkSuites: true`), so **a red CI run blocks the deploy** — CI is now a gate. Tests must not depend on `npm run build` (CI doesn't build); `static-http.test.js` serves a temp `DIST_DIR` fixture instead. Integration test ports must stay unique across files (node:test runs files in parallel); used so far: 9882–9905.

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
