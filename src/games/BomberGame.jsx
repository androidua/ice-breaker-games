import { useEffect, useRef } from "react";

const WALL = 1;
const BREAKABLE = 2;
const POWERUP_BOMB = 3;
const POWERUP_RANGE = 4;

function drawBomber(canvas, game) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width;
  const H = canvas.height;
  const { rows, cols, grid, players, bombs, flames } = game;
  const cw = W / cols;
  const ch = H / rows;

  // Background (floor)
  ctx.fillStyle = "#2d2d2d";
  ctx.fillRect(0, 0, W, H);

  // Tiles
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const tile = grid[y][x];
      const px = x * cw;
      const py = y * ch;

      if (tile === WALL) {
        ctx.fillStyle = "#555";
        ctx.fillRect(px, py, cw, ch);
        ctx.fillStyle = "#666";
        ctx.fillRect(px, py, cw, 2);
        ctx.fillRect(px, py, 2, ch);
      } else if (tile === BREAKABLE) {
        ctx.fillStyle = "#8b6914";
        ctx.fillRect(px, py, cw, ch);
        ctx.fillStyle = "#6a5010";
        ctx.fillRect(px, py, cw, 1);
        ctx.fillRect(px, py, 1, ch);
        ctx.fillStyle = "#a07820";
        ctx.fillRect(px + cw * 0.2, py + ch * 0.2, cw * 0.6, ch * 0.6);
      } else if (tile === POWERUP_BOMB || tile === POWERUP_RANGE) {
        ctx.font = `${Math.min(cw, ch) * 0.65}px serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(tile === POWERUP_BOMB ? "💣" : "🔥", px + cw / 2, py + ch / 2);
      }
    }
  }

  // Flames
  flames.forEach(({ x, y }) => {
    const px = x * cw;
    const py = y * ch;
    ctx.fillStyle = "#e05b00";
    ctx.fillRect(px, py, cw, ch);
    const m = Math.min(cw, ch) * 0.2;
    ctx.fillStyle = "#ff9900";
    ctx.fillRect(px + m, py + m, cw - m * 2, ch - m * 2);
  });

  // Bombs
  bombs.forEach(({ x, y, timerMs }) => {
    const cx = x * cw + cw / 2;
    const cy = y * ch + ch / 2;
    const r = Math.min(cw, ch) * 0.32;

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = "#111";
    ctx.fill();
    ctx.strokeStyle = "#555";
    ctx.lineWidth = 1;
    ctx.stroke();

    const ratio = Math.max(0, timerMs / 3000);
    const fuseColor = ratio > 0.5 ? "#ffdd00" : ratio > 0.25 ? "#ff8800" : "#ff2200";
    ctx.beginPath();
    ctx.arc(cx, cy, r + 3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
    ctx.strokeStyle = fuseColor;
    ctx.lineWidth = 3;
    ctx.stroke();
  });

  // Players
  Object.values(players).forEach((p) => {
    if (!p.alive) return;
    const cx = p.x * cw + cw / 2;
    const cy = p.y * ch + ch / 2;
    const r = Math.min(cw, ch) * 0.38;

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "#fff";
    ctx.font = `bold ${Math.round(r * 1.1)}px sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText((p.name[0] || "?").toUpperCase(), cx, cy);
  });
}

export default function BomberGame({ game, room, me, send }) {
  const canvasRef = useRef(null);
  const heldKeysRef = useRef(new Set());
  const sendRef = useRef(send);
  sendRef.current = send;
  const isHost = room?.hostId === me.id;

  // Size canvas to its CSS dimensions once on mount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const size = canvas.clientWidth;
    canvas.width = size;
    canvas.height = size;
  }, []);

  // Redraw on every game state update
  useEffect(() => {
    if (!game) return;
    const canvas = canvasRef.current;
    if (!canvas || !canvas.width) return;
    drawBomber(canvas, game);
  }, [game]);

  // Keyboard controls (desktop)
  useEffect(() => {
    const KEY_DIR = {
      ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
      w: "up", s: "down", a: "left", d: "right",
    };

    const onKeyDown = (e) => {
      if (e.repeat) return;
      if (e.key === " ") {
        e.preventDefault();
        sendRef.current({ type: "gameAction", action: { kind: "bomb" } });
        return;
      }
      const dir = KEY_DIR[e.key];
      if (!dir) return;
      e.preventDefault();
      heldKeysRef.current.add(e.key);
      sendRef.current({ type: "input", dir });
    };

    const onKeyUp = (e) => {
      heldKeysRef.current.delete(e.key);
      const remaining = [...heldKeysRef.current]
        .map((k) => KEY_DIR[k])
        .filter(Boolean);
      if (remaining.length > 0) {
        sendRef.current({ type: "input", dir: remaining[remaining.length - 1] });
      } else {
        sendRef.current({ type: "stopInput" });
      }
    };

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);

  // Touch swipe on the canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let touchStart = null;

    const onTouchStart = (e) => {
      e.preventDefault();
      if (e.touches.length !== 1) return;
      touchStart = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };
    const onTouchMove = (e) => {
      e.preventDefault();
      if (!touchStart || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - touchStart.x;
      const dy = e.touches[0].clientY - touchStart.y;
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 20) return;
      const dir = Math.abs(dx) > Math.abs(dy)
        ? (dx > 0 ? "right" : "left")
        : (dy > 0 ? "down" : "up");
      touchStart = null;
      sendRef.current({ type: "input", dir });
    };
    const onTouchEnd = () => { touchStart = null; };

    canvas.addEventListener("touchstart", onTouchStart, { passive: false });
    canvas.addEventListener("touchmove", onTouchMove, { passive: false });
    canvas.addEventListener("touchend", onTouchEnd, { passive: false });
    return () => {
      canvas.removeEventListener("touchstart", onTouchStart);
      canvas.removeEventListener("touchmove", onTouchMove);
      canvas.removeEventListener("touchend", onTouchEnd);
    };
  }, []);

  if (!game) return null;

  const { timer, round, scores, status, roundWinnerIds } = game;
  const myPlayer = game.players?.[me.id];
  const myScore = scores?.[me.id] ?? 0;

  const dpadDir = (dir) => sendRef.current({ type: "input", dir });
  const dpadStop = () => sendRef.current({ type: "stopInput" });

  return (
    <main className="game-stage">
      <div className="game-header">
        <span>Round {round}</span>
        {timer != null && (
          <span className={`voting-timer${timer <= 15 ? " timer-urgent" : ""}`}>{timer}s</span>
        )}
      </div>

      <canvas ref={canvasRef} className="bomber-canvas" />

      <div className="bomber-controls">
        <div className="bomber-dpad">
          <button type="button" className="dpad-btn dpad-up"
            onPointerDown={() => dpadDir("up")} onPointerUp={dpadStop} onPointerCancel={dpadStop}>▲</button>
          <button type="button" className="dpad-btn dpad-left"
            onPointerDown={() => dpadDir("left")} onPointerUp={dpadStop} onPointerCancel={dpadStop}>◀</button>
          <button type="button" className="dpad-btn dpad-right"
            onPointerDown={() => dpadDir("right")} onPointerUp={dpadStop} onPointerCancel={dpadStop}>▶</button>
          <button type="button" className="dpad-btn dpad-down"
            onPointerDown={() => dpadDir("down")} onPointerUp={dpadStop} onPointerCancel={dpadStop}>▼</button>
        </div>
        <button
          type="button"
          className="bomber-bomb-btn"
          onTouchEnd={(e) => { e.preventDefault(); sendRef.current({ type: "gameAction", action: { kind: "bomb" } }); }}
          onClick={() => sendRef.current({ type: "gameAction", action: { kind: "bomb" } })}
        >💣</button>
      </div>

      {myPlayer && (
        <div className="bomber-stats">
          {myPlayer.alive ? (
            <>
              <span>💣 ×{myPlayer.maxBombs}</span>
              <span>🔥 ×{myPlayer.flameRange}</span>
            </>
          ) : (
            <span style={{ opacity: 0.6 }}>You&apos;re out — watching</span>
          )}
          <span>Points: {myScore}</span>
        </div>
      )}

      <div className="bomber-scoreboard">
        {Object.values(game.players || {})
          .sort((a, b) => (scores?.[b.id] ?? 0) - (scores?.[a.id] ?? 0))
          .map((p) => (
            <div key={p.id} className={`bomber-score-row${p.alive ? "" : " dead"}`}>
              <span className="bomber-score-dot" style={{ background: p.color }} />
              <span className="bomber-score-name">{p.name}</span>
              <span className="bomber-score-pts">{scores?.[p.id] ?? 0}</span>
            </div>
          ))}
      </div>

      {status === "round_end" && (
        <div className="panel">
          {roundWinnerIds && roundWinnerIds.length > 0 ? (
            <div className="status round-winner">
              {roundWinnerIds.length === 1
                ? `${game.players[roundWinnerIds[0]]?.name ?? "?"} wins the round!`
                : `${roundWinnerIds.map((id) => game.players[id]?.name ?? "?").join(" & ")} tie!`}
            </div>
          ) : (
            <div className="status">Draw!</div>
          )}
          {isHost && (
            <div className="actions">
              <button type="button" onClick={() => sendRef.current({ type: "skipPhase" })}>
                Next Round
              </button>
            </div>
          )}
        </div>
      )}
    </main>
  );
}
