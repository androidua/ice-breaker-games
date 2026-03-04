# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development (hot-reload): run both in separate terminals
npm run server      # Terminal 1 — Node.js game server on :3000
npm run dev         # Terminal 2 — Vite dev server on :5173

# Production
npm run build       # Build frontend to dist/
npm run server      # Serve built app on :3000
npm start           # Build + serve in one command

# Custom port
PORT=8080 npm start
```

In dev mode, Vite proxies WebSocket from `:5173` to the game server at `:3000` — `App.jsx` detects port 5173 and connects to port 3000 automatically.

## Architecture

**All state is in-memory on the server — no database.**

### Communication model
- Single persistent WebSocket per client
- Server assigns each client an ID (`p1`, `p2`, …) on connect via `welcome` message
- Client sends typed messages (`host`, `join`, `start`, `input`, `vote`, `gameAction`, `endGame`, `skipPhase`, `restart`)
- Server broadcasts `room`, `state`, and `vote_state` messages to all players in a room
- Emoji and Sketch serialize state per-player (to hide secret words); all others broadcast identically

### Server (`server/`)
- `index.js` — HTTP static file server + WebSocket server. Contains all room lifecycle, message routing, game dispatch, and timer management. The `rooms` Map is the single source of truth.
- Each game engine (`engine.js`, `truths-engine.js`, `emoji-engine.js`, `sketch-engine.js`, `trivia-engine.js`, `voting-engine.js`) is a **pure module** — functions take state + inputs and return new state. No side effects.
- `index.js` drives all timers (`setInterval`) and calls engine functions to advance state.
- Snake ticks every 100ms; all other timers tick every 1000ms.
- A 25s WebSocket ping/pong keeps connections alive through proxies.

### Frontend (`src/`)
- `App.jsx` — owns the WebSocket connection, all top-level state (`room`, `game`, `voting`, `me`), and keyboard input for Snake. Routes rendering to the correct game component based on `room.currentGame`.
- `Lobby.jsx` — host/join UI (pre-room state)
- `VotingPhase.jsx` — game selection voting UI
- `src/games/` — one component per game, receives `{ game, room, me, send }` props

### Room lifecycle
`lobby` → `voting` → `playing` → `voting` → ... (host clicks End Game returns to voting)

### Leaderboard tiers
- **Round wins** — tracked within a game session, reset when host ends the game
- **Game wins** — awarded to the round-win leader when host clicks End Game; persists for the room session
