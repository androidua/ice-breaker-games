import { useEffect, useRef, useState } from "react";
import GameInstructions from "../components/GameInstructions";

const RULES = [
  "Steer with ↑↓←→ or WASD on keyboard, or swipe on mobile",
  "Eat food to grow",
  "Avoid walls and other snakes",
];

export default function SnakeGame({ game, room, me, send }) {
  const boardRef = useRef(null);
  const touchStartRef = useRef(null);
  // sendRef keeps the event handler from ever going stale without re-attaching
  const sendRef = useRef(send);
  sendRef.current = send;
  const [showSwipeHint, setShowSwipeHint] = useState(false);

  // Board-scoped swipe controls — { passive: false } is required so
  // preventDefault() actually blocks pull-to-refresh and back-swipe on iOS/Android.
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;

    const onTouchStart = (e) => {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };

    const onTouchMove = (e) => {
      e.preventDefault();
      if (!touchStartRef.current || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - touchStartRef.current.x;
      const dy = e.touches[0].clientY - touchStartRef.current.y;
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      if (Math.max(absDx, absDy) < 20) return;
      const dir = absDx > absDy ? (dx > 0 ? "RIGHT" : "LEFT") : (dy > 0 ? "DOWN" : "UP");
      touchStartRef.current = null; // consume gesture — prevents re-fire on touchend
      sendRef.current({ type: "input", dir });
    };

    const onTouchEnd = () => {
      touchStartRef.current = null; // cleanup if threshold was never reached
    };

    el.addEventListener("touchstart", onTouchStart, { passive: false });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: false });

    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
    };
  }, []); // attach once — sendRef.current is always fresh

  // Show "Swipe to move" hint when game starts on a touch device
  useEffect(() => {
    const isTouch = "ontouchstart" in window || navigator.maxTouchPoints > 0;
    if (game?.status === "running" && isTouch) {
      setShowSwipeHint(true);
    }
  }, [game?.status]);

  const isHost = room?.hostId === me.id;
  const roundOver = game?.status === "gameover" || game?.status === "win";
  const roundNum = 1 + Object.values(room?.roundWins || {}).reduce((max, v) => Math.max(max, v), 0);

  const statusLabel = (() => {
    if (game?.status === "gameover") return "Round Over!";
    if (game?.status === "win") return "Board Full — Round Over!";
    return "Use arrow keys or WASD";
  })();

  const rows = game?.rows || 30;
  const cols = game?.cols || 30;
  const cellWidthPct = 100 / cols;
  const cellHeightPct = 100 / rows;

  return (
    <main className="game-stage">
      <div className="game-header">
        <span>Round {roundNum}</span>
        <div className="game-header-right">
          <GameInstructions title="Snake Arena" rules={RULES} />
          {roundOver && <span className="voting-timer timer-urgent">Round Over</span>}
        </div>
      </div>
      <div className="stage">
        <div className="board-wrapper">
          <div
            ref={boardRef}
            className="board"
            style={{
              "--cols": cols,
              "--rows": rows,
            }}
          >
            <div className="board-overlay">
              {game?.snakes?.flatMap((snake) =>
                snake.body.map(([x, y], i) => {
                  // Defensive clamp — engine should keep positions in-bounds,
                  // but if anything slips through we still render inside the grid.
                  const cx = Math.max(0, Math.min(x, cols - 1));
                  const cy = Math.max(0, Math.min(y, rows - 1));
                  return (
                    <div
                      key={`${snake.id}_r${roundNum}_${i}`}
                      className={`snake-segment${i === 0 ? " head" : ""}${!snake.alive ? " dead" : ""}`}
                      style={{
                        width: `${cellWidthPct}%`,
                        height: `${cellHeightPct}%`,
                        transform: `translate(${cx * 100}%, ${cy * 100}%)`,
                        background: snake.color,
                      }}
                    />
                  );
                })
              )}
              {game?.food && (
                <div
                  key={`food_r${roundNum}_${game.food[0]}_${game.food[1]}`}
                  className="food-segment"
                  style={{
                    width: `${cellWidthPct}%`,
                    height: `${cellHeightPct}%`,
                    transform: `translate(${game.food[0] * 100}%, ${game.food[1] * 100}%)`,
                  }}
                />
              )}
            </div>
          </div>
          {showSwipeHint && (
            <div className="swipe-hint" onAnimationEnd={() => setShowSwipeHint(false)}>
              Swipe to move
            </div>
          )}
        </div>
        <div className="panel">
          <div className="status" aria-live="polite">{statusLabel}</div>
          {isHost && roundOver && (
            <div className="actions">
              <button type="button" onClick={() => send({ type: "restart" })}>
                Next Round
              </button>
            </div>
          )}
          <Scoreboard game={game} room={room} />
        </div>
      </div>
      <section className="dpad" aria-label="On-screen controls">
        <button type="button" className="dpad-up" aria-label="Move up" onClick={() => send({ type: "input", dir: "UP" })}>↑</button>
        <button type="button" className="dpad-left" aria-label="Move left" onClick={() => send({ type: "input", dir: "LEFT" })}>←</button>
        <button type="button" className="dpad-down" aria-label="Move down" onClick={() => send({ type: "input", dir: "DOWN" })}>↓</button>
        <button type="button" className="dpad-right" aria-label="Move right" onClick={() => send({ type: "input", dir: "RIGHT" })}>→</button>
      </section>
    </main>
  );
}

function Scoreboard({ game, room }) {
  if (!room) return null;
  const sorted = room.players
    .map((p) => {
      const snake = game?.snakes?.find((s) => s.id === p.id);
      return {
        ...p,
        score: snake?.score ?? 0,
        alive: snake?.alive ?? true,
        roundWins: room.roundWins?.[p.id] || 0,
      };
    })
    .sort((a, b) => b.roundWins - a.roundWins || b.score - a.score);

  return (
    <div className="players">
      {sorted.map((p) => (
        <div key={p.id} className="player">
          <span className="swatch" style={{ background: p.color }} />
          <span>{p.name}</span>
          <span>{p.score} pts</span>
          <span>{p.roundWins} {p.roundWins === 1 ? "round" : "rounds"} won</span>
          {!p.alive && game?.status !== "waiting" ? <span>✕</span> : null}
          {room.hostId === p.id ? <span>★</span> : null}
        </div>
      ))}
    </div>
  );
}
