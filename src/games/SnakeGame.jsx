import { useEffect, useMemo, useRef, useState } from "react";

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

  const snakeCells = useMemo(() => {
    const map = new Map();
    if (!game?.snakes) return map;
    game.snakes.forEach((snake) => {
      snake.body.forEach(([x, y], index) => {
        const key = `${x},${y}`;
        map.set(key, { color: snake.color, head: index === 0, alive: snake.alive });
      });
    });
    return map;
  }, [game]);

  const boardCells = useMemo(() => {
    if (!game) return [];
    const cells = [];
    for (let y = 0; y < game.rows; y += 1) {
      for (let x = 0; x < game.cols; x += 1) {
        const key = `${x},${y}`;
        const sc = snakeCells.get(key);
        let className = "cell";
        let style = undefined;
        if (sc) {
          className += " snake";
          if (sc.head) className += " head";
          if (!sc.alive) className += " dead";
          style = { background: sc.color };
        }
        if (game.food && key === `${game.food[0]},${game.food[1]}`) className += " food";
        cells.push(<div key={key} className={className} style={style} />);
      }
    }
    return cells;
  }, [game, snakeCells]);

  const isHost = room?.hostId === me.id;
  const roundOver = game?.status === "gameover" || game?.status === "win";

  const statusLabel = (() => {
    if (game?.status === "gameover") return "Round Over!";
    if (game?.status === "win") return "Board Full — Round Over!";
    return "Use arrow keys or WASD";
  })();

  return (
    <>
      <main className="stage">
        <div className="board-wrapper">
          <div
            ref={boardRef}
            className="board"
            style={{ gridTemplateColumns: `repeat(${game?.cols || 20}, 1fr)` }}
          >
            {boardCells}
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
      </main>
      <p className="game-instructions">
        <kbd>↑↓←→</kbd> or <kbd>WASD</kbd> to steer · Swipe on mobile · Eat food to grow · Avoid walls &amp; other snakes
      </p>
      <section className="controls" aria-label="On-screen controls">
        <div className="snake-dpad">
          <button type="button" className="dpad-up" onClick={() => send({ type: "input", dir: "UP" })}>Up</button>
          <button type="button" className="dpad-left" onClick={() => send({ type: "input", dir: "LEFT" })}>Left</button>
          <button type="button" className="dpad-down" onClick={() => send({ type: "input", dir: "DOWN" })}>Down</button>
          <button type="button" className="dpad-right" onClick={() => send({ type: "input", dir: "RIGHT" })}>Right</button>
        </div>
      </section>
    </>
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
