# UI/UX Consistency Pass — Design Spec

**Date:** 2026-04-11  
**Version target:** 1.10.0 (minor — visible UX changes across multiple games)

---

## Context

A cross-game audit identified six inconsistencies in UI patterns and UX completeness. This spec covers all six fixes in a single pass. Issues are grouped into three themes: D-pad unification, structural consistency in Snake, and missing host controls in Hot Take and Word Chain.

---

## Section 1 — Unified D-pad

### Decision
Both Snake and Bomber adopt:
- **Style:** site design system (beige `#f7f3ea` background, `1px solid #2a2a2a` border) — no custom dark `.dpad-btn` override
- **Layout:** 3-row cross grid (`". up ." / "left . right" / ". down ."`) — center cell empty

### CSS changes (`src/index.css`)

**Add** shared `.dpad` class:
```css
.dpad {
  display: grid;
  grid-template-areas:
    ". up ."
    "left . right"
    ". down .";
  grid-template-columns: repeat(3, 56px);
  grid-template-rows: repeat(3, 56px);
  gap: 6px;
  justify-content: center;
}

.dpad button {
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  padding: 0;
  -webkit-tap-highlight-color: transparent; /* suppress iOS tap flash */
}
```

**Add** mobile override (inside `@media (max-width: 720px)`):
```css
.dpad {
  grid-template-columns: repeat(3, 72px);
  grid-template-rows: repeat(3, 72px);
}
.dpad button {
  min-height: unset;
  font-size: 22px;
}
```

**Remove:**
- `.controls { display: grid; … }` — replaced by `.dpad`
- `.controls-row { display: flex; … }` — no longer used (already removed from JSX in v1.9.3)
- `.controls button { … }` — replaced by `.dpad button`
- `.ctrl-up/left/down/right { grid-area: … }` — replaced by existing `.dpad-up/left/down/right`
- `.bomber-dpad { display: grid; … }` — replaced by `.dpad`
- `.dpad-btn { border: none; border-radius: 8px; background: #444; … }` — dark style removed; buttons inherit site style
- All mobile `@media` overrides referencing `.controls` or `.controls-row`

**Keep unchanged:**
- `.dpad-up/left/down/right { grid-area: … }` — these are the shared area assignments
- `.bomber-controls` wrapper (flex row, bomb button beside dpad)
- `.bomber-bomb-btn` — circular bomb button keeps its orange/dark distinct style

### JSX changes

**`src/games/SnakeGame.jsx`:**
- `<section className="controls"` → `<section className="dpad"`
- `className="ctrl-up"` → `className="dpad-up"`
- `className="ctrl-left"` → `className="dpad-left"`
- `className="ctrl-down"` → `className="dpad-down"`
- `className="ctrl-right"` → `className="dpad-right"`

**`src/games/BomberGame.jsx`:**
- `<div className="bomber-dpad"` → `<div className="dpad"`
- On each direction button: remove `dpad-btn` from className (keep `dpad-up` etc.)
  - e.g. `className="dpad-btn dpad-up"` → `className="dpad-up"`

---

## Section 2 — Snake: game-header + outer container

### Problem
Snake has no `.game-header` bar showing the round number — it is the only game without one. Snake also uses a bare `<>` fragment as its root, while all other games use `<main className="game-stage">`.

### Solution

Restructure SnakeGame to wrap everything in `<main className="game-stage">`. The inner board+panel 2-column grid keeps `<div className="stage">` (the `.stage` CSS grid definition stays unchanged — it is Snake-specific). Instructions and the dpad move inside the wrapper.

**Round number** is derived from room state (Snake's game object has no round field):
```js
const roundNum = 1 + Object.values(room?.roundWins || {}).reduce((max, v) => Math.max(max, v), 0);
```

**New structure (`src/games/SnakeGame.jsx`):**
```jsx
return (
  <main className="game-stage">
    <div className="game-header">
      <span>Round {roundNum}</span>
      {roundOver && <span className="voting-timer timer-urgent">Round Over</span>}
    </div>
    <div className="stage">          {/* was <main className="stage"> */}
      <div className="board-wrapper">…</div>
      <div className="panel">…</div>
    </div>
    <p className="game-instructions">…</p>
    <section className="dpad" aria-label="On-screen controls">…</section>
  </main>
);
```

Note: `<main>` moves to the outermost element; the inner board+panel wrapper becomes a `<div>`.

---

## Section 3 — Bomber: instructions → shared pattern

### Problem
Bomber uses custom `.bomber-help` / `.bomber-help-row` / `.bomber-help-mobile` markup. Every other game uses `<p className="game-instructions">`.

### Solution

Replace with `<p className="game-instructions">` and two inner spans toggled by `@media (hover: none)`:

**`src/games/BomberGame.jsx`** — replace the bomber-help block with:
```jsx
<p className="game-instructions">
  <span className="hint-kb">WASD / Arrow keys to move · Space to plant bomb</span>
  <span className="hint-touch">Tap controls to move · Tap 💣 to plant bomb</span>
</p>
```

**`src/index.css`** — add to base styles:
```css
.hint-touch { display: none; }
@media (hover: none) {
  .hint-kb    { display: none; }
  .hint-touch { display: inline; }
}
```

**Remove** from CSS: `.bomber-help`, `.bomber-help-row`, `.bomber-help-mobile` (and their `@media (hover: none)` override).

---

## Section 4 — Hot Take: host skip button

### Problem
Hot Take has no skip button for the host. Every other phase-based game (Truths, Emoji, Typeracer, Sketch) gives the host a way to advance early.

### Server
`handleSkipPhase` in `server/index.js` already handles `hottake` + `"voting"` → triggers reveal (lines 344–348). **No server changes needed.**

### Frontend (`src/games/HotTakeVotingGame.jsx`)

Add after the main panel content, before `<p className="game-instructions">`:
```jsx
{isHost && game.status === "voting" && (
  <div className="actions">
    <button type="button" className="skip-btn" onClick={() => send({ type: "skipPhase" })}>
      Skip
    </button>
  </div>
)}
```

`isHost` is already derived in this component as `room?.hostId === me.id`.

---

## Section 5 — Word Chain: host skip during active play

### Problem
Word Chain's `skipPhase` only handles `"round_end"`. During `"playing"` status (a player's active turn), the host has no way to move things along.

### Server (`server/index.js`)

Extend the `wordchain` case in `handleSkipPhase` (currently lines 330–338):
```js
case "wordchain":
  if (room.game.status === "round_end") {
    // existing — unchanged
    stopLoop(room);
    awardRoundWin(room, room.game.roundWinnerId);
    room.game = nextWordChainRound(room.game, Math.random);
    broadcastGameState(room);
    startWordChainTick(room);
  } else if (room.game.status === "playing") {
    // Skip current player's turn — same outcome as a timeout
    room.game = eliminateCurrentPlayer(room.game);
    broadcastGameState(room);
    if (room.game.status === "round_end") {
      stopLoop(room);
      awardRoundWin(room, room.game.roundWinnerId);
      sendRoomUpdate(room);
      setTimeout(() => {
        if (!room || room.status !== "playing") return;
        stopLoop(room);
        room.game = nextWordChainRound(room.game, Math.random);
        broadcastGameState(room);
        startWordChainTick(room);
      }, 3000);
    }
  }
  break;
```

The `3000ms` delay mirrors the existing auto-advance pattern in `startWordChainTick` (lines 906–920).

### Frontend (`src/games/WordChainGame.jsx`)

Add after the main game panel, before `<p className="game-instructions">`:
```jsx
{isHost && game.status === "playing" && (
  <div className="actions">
    <button type="button" className="skip-btn" onClick={() => send({ type: "skipPhase" })}>
      Skip Turn
    </button>
  </div>
)}
```

`isHost` must be derived: `const isHost = room?.hostId === me.id;`

---

## Files to modify

| File | Changes |
|------|---------|
| `src/index.css` | Add `.dpad`, `.dpad button`, mobile overrides; remove `.controls`, `.bomber-dpad`, `.dpad-btn`, `.ctrl-*`; add `.hint-kb`/`.hint-touch`; remove `.bomber-help*` |
| `src/games/SnakeGame.jsx` | Wrap in `game-stage`, add `game-header`, restructure dpad classes |
| `src/games/BomberGame.jsx` | Replace `bomber-dpad`→`dpad`, remove `dpad-btn` from direction buttons, replace bomber-help with game-instructions |
| `src/games/HotTakeVotingGame.jsx` | Add host skip button during voting |
| `src/games/WordChainGame.jsx` | Add host skip-turn button during playing |
| `server/index.js` | Extend wordchain skipPhase to handle `"playing"` status |

---

## Verification

1. **Snake:** D-pad shows cross shape with site-style (beige/bordered) buttons; game-header shows "Round 1" on load, "Round 2" after first win, "Round Over" in red when round ends.
2. **Bomber:** D-pad shows same cross shape with same site-style buttons; bomb button unchanged; instructions show keyboard hint on desktop, touch hint on mobile.
3. **Hot Take:** Host sees "Skip" button during voting phase; clicking it advances to reveal immediately.
4. **Word Chain:** Host sees "Skip Turn" button during active play; clicking it eliminates the current player and advances (auto-proceeds to next round after 3s if last player standing).
5. **Cross-game:** Open each game and confirm `.game-header` is present and shows consistent Round/Timer format.
6. Run `npm test` — all 22 smoke tests must pass.
