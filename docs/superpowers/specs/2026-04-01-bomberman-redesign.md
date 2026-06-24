# Bomber Arena Redesign

**Date:** 2026-04-01  
**Status:** Approved

## Problem

The current Bomber Arena has three critical issues:
1. **Flickering / "page refresh" feel** — 225 CSS `<div>` elements re-render every 150ms, CSS animations (flame-pulse, bomb-pulse) restart on every toggle.
2. **Broken movement** — `pendingDir` is cleared after each step; players must re-input for every cell moved, which is unintuitive and undiscoverable.
3. **Confusing game mode** — team assignment, idle player rotation, and odd-player-out logic add friction to a party game.

## Goals

- Smooth, flicker-free rendering
- Intuitive continuous movement (hold to walk, release to stop)
- Free-for-all (no teams), survival-order scoring
- Works on desktop (keyboard) and mobile (D-pad + swipe)

---

## Architecture

### Files changed

| File | Change |
|---|---|
| `server/bomber-engine.js` | Remove teams/idle, add `dir`/`moving` per player, add elimination-order scoring |
| `server/index.js` | Handle new `stopInput` message type for bomber |
| `src/games/BomberGame.jsx` | Replace CSS grid with `<canvas>` renderer, rewrite controls |
| `src/index.css` | Remove bomber-grid/bomber-cell CSS, keep mobile controls CSS |

No new files needed.

---

## Engine Changes (`bomber-engine.js`)

### Player state
Replace `pendingDir: null` with:
- `dir: null` — current walk direction ("up"/"down"/"left"/"right"), persists until changed
- `moving: false` — true while a direction key/button is held

### Movement
`movePlayers()` moves a player one cell per tick **only if** `player.moving === true`. Wall collision does not clear `moving` — player stays "pressing" until they change direction or release.

### Actions
- `{ kind: "move", dir }` — sets `dir` + `moving: true`
- `{ kind: "stop" }` — sets `moving: false`
- `{ kind: "bomb" }` — unchanged

### Game mode: free-for-all
Remove: `assignTeams`, `team0/team1`, `idlePlayerId`, `idleQueue`, `teamScores`, `roundWinnerTeam`.  
Add: `eliminationOrder: []` — player IDs appended when they die (first dead = index 0).

### Scoring (Option 2 — survival order)
Elimination is tracked as groups: players killed in the same tick share the same rank.

`eliminationOrder` is an array of **groups**: `[[id, id], [id], [id]]` where index 0 = first group eliminated.

Points per group = the rank of the *last* player in that group's position:
- Example with 4 players, all die individually: `[0, 1, 2, 3]` pts (first dead = 0, winner = 3)
- Example with 4 players, last two die simultaneously: both get `3` pts and are both round winners
- Example with 4 players: first two die together → each gets `0`, last two die together → each gets `3` (both winners)

`scores` Map accumulates across rounds. Round win (`awardRoundWin`) is awarded to all players in the final surviving group (last alive or simultaneous last-two).

### Round end detection
`checkRoundEnd()`: when `≤ 1` player alive, OR when all remaining players die in the same tick → status = `"round_end"`.  
`eliminationOrder` is built incrementally in `killPlayersInFlames()` — newly killed players in each tick call are appended as a single group. `roundWinnerIds: []` (array, replaces `roundWinnerTeam`) contains the IDs of the final group.

---

## Canvas Renderer (`BomberGame.jsx`)

### Setup
- Single `<canvas ref={canvasRef}>` sized to `min(90vw, 420px)` via CSS (same as current `.bomber-grid`).
- `useEffect([game])` redraws on every game state update.
- `cellSize = canvas.width / cols` — computed at draw time, no resize listener needed.

### Draw order (back to front)
1. Floor tiles — dark `#2d2d2d` fill for all non-wall cells
2. Fixed walls — solid grey `#555`
3. Breakable walls — brown `#8b6914`
4. Power-ups — small emoji centered in cell (💣 / 🔥)
5. Bombs — dark circle + shrinking arc fuse (arc length proportional to `timerMs / 3000`)
6. Flames — orange `#e05b00` fill
7. Players — filled circle in `player.color`, white initial letter centered

### No React re-renders of the canvas content
Canvas draw is imperative — React only re-runs the `useEffect`, it never diffs canvas internals.

---

## Controls

### Desktop
Attached to `window` in `useEffect([], ...)`:
- `keydown` ArrowUp/W → send `{ type: "input", dir: "up" }` (only if not already sending this dir — track `heldKeys` Set)
- `keydown` ArrowDown/S, ArrowLeft/A, ArrowRight/D → same pattern
- `keyup` → remove from `heldKeys`; if no keys held, send `{ type: "stopInput" }`; if another dir still held, send that dir
- `keydown` Space → send `{ type: "gameAction", action: { kind: "bomb" } }`

### Mobile
- **D-pad**: 4 buttons with `onPointerDown` (send move) + `onPointerUp`/`onPointerCancel` (send stop)
- **Bomb button**: `onClick` + `onTouchEnd` (existing pattern)
- **Swipe fallback**: `touchstart`/`touchmove` on canvas (same threshold as Snake: 20px) → sends `{ type: "input", dir }`; does not send stop (direction stays set until next input)

---

## Server Changes (`index.js`)

Add handler for `stopInput` message type (alongside existing `input`):
```
case "stopInput":
  if (room.currentGame === "bomber") {
    room.game = handleBomberAction(room.game, clientId, { kind: "stop" });
  }
  break;
```

No other server changes needed — tick, round management, `awardRoundWin` all unchanged.

---

## Scoring Integration

`nextBomberRound()` keeps the `scores` Map across rounds (already the case).  
On `endGame`, the existing game-win logic in `index.js` uses `roundWins` — Bomber awards round wins per-round already via `awardRoundWin`. No change needed there.

For display: the `scores` Map is serialized and shown in the UI as per-round point totals (separate from the room-level `roundWins`).

---

## Out of Scope

- Player death animations
- Sound effects
- Spectator mode after elimination
- Chat/emoji reactions during game
