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

# Run smoke tests
npm test
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

- Start command (set in Railway dashboard, not in a config file): `node server/index.js`
- Railway generates the public domain. The server serves both WebSocket and static files (dist/) from a single port.
- Free tier may sleep after inactivity; first visitor wakes it in ~5 seconds.
- No Dockerfile, Procfile, or railway.json exists. Railway detects the Node.js project automatically.

## Tech Stack

- **Frontend:** React 18, Vite 5, plain CSS (single file: `src/index.css`), native browser WebSocket
- **Backend:** Node.js, `ws` library, `http` module for static file serving
- **Hosting:** Railway (auto-deploy from GitHub)
- **No database, no backend framework, no CSS preprocessor, no test runner**
- Dependencies are intentionally minimal. Do not add libraries without discussing first.

## Architecture

### Server (`server/`)

`index.js` (~890 lines) is the entire server: HTTP static file serving, WebSocket lifecycle, room management, message routing, timer orchestration, and game dispatch. The `rooms` Map is the single source of truth.

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

`words-en.txt` is a bundled 172k-word English dictionary (ENABLE2k, public domain) used by `wordchain-engine.js` for word validation. Loaded once at startup into a Set.

**Pattern for engines:** functions take current state + inputs, return new state. `index.js` calls engine functions, manages timers (`setInterval`), and broadcasts results. Keep this separation strict.

### Frontend (`src/`)

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

### Leaderboard

Two tiers tracked separately:
- **Round wins:** within a game session, reset when host ends the game
- **Game wins:** awarded to the round-win leader on End Game, persist for the room's lifetime

### Timers

- Snake ticks every 120ms
- Bomber Arena ticks every 100ms (movement) and 1000ms (round timer)
- All other game/voting timers tick every 1000ms
- WebSocket ping/pong heartbeat runs every 25s to keep connections alive through proxies and load balancers

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
- JSON parse wrapped in try-catch
- No file system writes, no database, no external API calls

Known gaps to be aware of:
- **No rate limiting on WebSocket messages.** A client could spam messages. Be cautious about adding game logic that is expensive per-message.
- **No reconnection handling.** If a player's WebSocket drops, they lose their session. The frontend does not attempt to reconnect.
- **No input sanitisation beyond length clamping.** Player names and text inputs are JSON-serialised (not rendered as raw HTML), so XSS risk is low. Any future feature rendering user text as HTML must sanitise it.
- **In-memory state means zero persistence.** Server restart (including Railway redeploys) loses all rooms and scores.

## Performance Considerations

- Snake's 120ms tick interval is the tightest loop. Keep `stepGame()` fast and avoid allocations where possible.
- `broadcastGameState()` serialises per-player for Emoji and Sketch games. With 8 players this means 8 JSON.stringify calls per tick. Fine at current scale but would need attention if game complexity grows.
- The static file server in index.js has no caching headers. Railway sits behind a CDN, so this is acceptable for now.

## Mobile Support

The app is designed for phone use. Key patterns to maintain:
- All inputs use `font-size: 16px` minimum (prevents iOS Safari auto-zoom)
- Touch controls exist alongside keyboard controls (swipe + on-screen buttons for Snake, finger drawing for Sketch)
- Touch event handlers use `passive: false` where needed to prevent pull-to-refresh on iOS

## Testing

### Automated Smoke Tests

`test/smoke-test.js` starts the server on port 9876, connects two WebSocket clients, and runs through the core flow: host a room, join it, start voting, vote for a game, verify the game starts, test error handling, and test disconnect cleanup. Run with `npm test`.

A **pre-push git hook** (`.git/hooks/pre-push`) runs the smoke test automatically before every `git push`. If any test fails, the push is blocked. Bypass with `git push --no-verify` if needed.
Note: `.git/hooks/` is not committed to the repo. On a fresh clone, recreate the hook manually — it should run `npm test` and exit 1 on failure.

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
