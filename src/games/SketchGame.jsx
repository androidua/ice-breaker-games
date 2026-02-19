import { useCallback, useEffect, useRef, useState } from "react";

const CANVAS_SIZE = 400;
const LINE_WIDTH = 3;
const COLORS = ["#2a2a2a", "#3d5a80", "#c04b3a", "#e8b800", "#3a8c4b"];

export default function SketchGame({ game, room, me, send }) {
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const pointsRef = useRef([]);
  const lastStrokeCountRef = useRef(0);
  const [penColor, setPenColor] = useState(COLORS[0]);
  const [guessInput, setGuessInput] = useState("");

  const isDrawer = me.id === game?.drawerId;
  const isHost = room?.hostId === me.id;
  const drawerName = room?.players.find((p) => p.id === game?.drawerId)?.name || "Someone";
  const roundWinnerName = game?.roundWinnerId
    ? room?.players.find((p) => p.id === game.roundWinnerId)?.name
    : null;

  const replayStrokes = useCallback((strokes) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.lineWidth = LINE_WIDTH;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    strokes.forEach((stroke) => {
      if (stroke.points.length < 2) return;
      ctx.strokeStyle = stroke.color || "#2a2a2a";
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
      for (let i = 1; i < stroke.points.length; i++) {
        ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
      }
      ctx.stroke();
    });
  }, []);

  useEffect(() => {
    if (!game?.strokes) return;
    if (game.strokes.length !== lastStrokeCountRef.current) {
      replayStrokes(game.strokes);
      lastStrokeCountRef.current = game.strokes.length;
    }
  }, [game?.strokes, replayStrokes]);

  const getCanvasPoint = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const scaleX = CANVAS_SIZE / rect.width;
    const scaleY = CANVAS_SIZE / rect.height;
    const clientX = e.touches ? e.touches[0].clientX : e.clientX;
    const clientY = e.touches ? e.touches[0].clientY : e.clientY;
    return {
      x: Math.round((clientX - rect.left) * scaleX),
      y: Math.round((clientY - rect.top) * scaleY),
    };
  };

  const handlePointerDown = (e) => {
    if (!isDrawer || game?.status !== "drawing") return;
    e.preventDefault();
    drawingRef.current = true;
    const point = getCanvasPoint(e);
    if (point) pointsRef.current = [point];
  };

  const handlePointerMove = (e) => {
    if (!drawingRef.current) return;
    e.preventDefault();
    const point = getCanvasPoint(e);
    if (!point) return;
    pointsRef.current.push(point);

    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const pts = pointsRef.current;
    if (pts.length < 2) return;
    ctx.strokeStyle = penColor;
    ctx.lineWidth = LINE_WIDTH;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(pts[pts.length - 2].x, pts[pts.length - 2].y);
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    ctx.stroke();
  };

  const handlePointerUp = () => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    if (pointsRef.current.length > 1) {
      send({
        type: "gameAction",
        action: { kind: "draw", points: pointsRef.current, color: penColor },
      });
    }
    pointsRef.current = [];
  };

  const handleClear = () => {
    send({ type: "gameAction", action: { kind: "clear" } });
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  };

  const handleGuess = () => {
    if (guessInput.trim().length === 0) return;
    send({ type: "gameAction", action: { kind: "guess", text: guessInput } });
    setGuessInput("");
  };

  const playerName = (id) => room?.players.find((p) => p.id === id)?.name || "?";
  const canSkip = isHost && game?.status === "drawing";

  if (!game) return null;

  return (
    <main className="game-stage">
      <div className="game-header">
        <span>Sketch & Guess</span>
        <span>Round {game.round}</span>
        {game.timer != null && (
          <span className={`voting-timer${game.timer <= 15 ? " timer-urgent" : ""}`}>{game.timer}s</span>
        )}
      </div>

      {/* Status line — above the grid, full width */}
      {isDrawer && game.status === "drawing" && (
        <div className="status">Draw: <strong>{game.word}</strong></div>
      )}
      {!isDrawer && game.status === "drawing" && (
        <div className="status">{drawerName} is drawing ({game.wordLength} letters)</div>
      )}
      {game.status === "reveal" && (
        <div className="status">
          The word was: <strong>{game.word}</strong>
          {roundWinnerName && <span className="round-winner"> — Round winner: {roundWinnerName}</span>}
        </div>
      )}

      {/* Grid — only canvas + sidebar so both are exactly the same height */}
      <div className="sketch-layout">
        <canvas
          ref={canvasRef}
          width={CANVAS_SIZE}
          height={CANVAS_SIZE}
          className="sketch-canvas"
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onMouseLeave={handlePointerUp}
          onTouchStart={handlePointerDown}
          onTouchMove={handlePointerMove}
          onTouchEnd={handlePointerUp}
        />

        <div className="panel sketch-sidebar">
          {!isDrawer && game.status === "drawing" && (
            <div className="guess-row">
              <input
                value={guessInput}
                onChange={(e) => setGuessInput(e.target.value)}
                placeholder="Type your guess..."
                maxLength={200}
                onKeyDown={(e) => e.key === "Enter" && handleGuess()}
              />
              <button type="button" onClick={handleGuess}>Guess</button>
            </div>
          )}
          <div className="guess-feed">
            {game.guesses.map((g, i) => (
              <div key={i} className={`guess-item ${g.correct ? "guess-correct" : ""}`}>
                <strong>{playerName(g.playerId)}:</strong> {g.text}
                {g.correct && " ✓"}
              </div>
            ))}
          </div>
          <Scoreboard game={game} room={room} />
        </div>
      </div>

      {/* Drawing tools — below the grid, aligned under the canvas */}
      {isDrawer && game.status === "drawing" && (
        <div className="actions sketch-tools">
          {COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={`color-btn ${penColor === c ? "color-active" : ""}`}
              style={{ background: c }}
              onClick={() => setPenColor(c)}
            />
          ))}
          <button type="button" onClick={handleClear}>Clear</button>
        </div>
      )}

      {canSkip && (
        <div className="actions">
          <button type="button" className="skip-btn" onClick={() => send({ type: "skipPhase" })}>
            Skip
          </button>
        </div>
      )}
    </main>
  );
}

function Scoreboard({ game, room }) {
  if (!game?.scores || !room) return null;
  const sorted = room.players
    .map((p) => ({
      ...p,
      score: game.scores[p.id] || 0,
      roundWins: room.roundWins?.[p.id] || 0,
    }))
    .sort((a, b) => b.roundWins - a.roundWins || b.score - a.score);

  return (
    <div className="players">
      {sorted.map((p) => (
        <div key={p.id} className="player">
          <span className="swatch" style={{ background: p.color }} />
          <span>{p.name}</span>
          <span>{p.score} pts</span>
          <span>{p.roundWins} {p.roundWins === 1 ? "round" : "rounds"} won</span>
        </div>
      ))}
    </div>
  );
}
