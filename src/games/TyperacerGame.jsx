import { useState, useEffect, useRef } from "react";

export default function TyperacerGame({ game, room, me, send }) {
  const [typed, setTyped] = useState("");
  const inputRef = useRef(null);

  const isHost = room?.hostId === me.id;
  const canSkip = isHost && game?.status === "racing";

  // Focus the hidden input whenever racing
  useEffect(() => {
    if (game?.status === "racing") {
      inputRef.current?.focus();
      setTyped("");
    }
  }, [game?.status, game?.round]);

  const handleInput = (e) => {
    if (game?.status !== "racing") return;
    const value = e.target.value;
    // Clamp to paragraph length + a small buffer so the server can reject excess
    const clamped = value.slice(0, game.paragraph.length + 5);
    setTyped(clamped);
    send({ type: "gameAction", action: { kind: "progress", typed: clamped } });
  };

  if (!game) return null;

  const paragraph = game.paragraph || "";
  const myProgress = game.progress?.[me.id] || { typedLength: 0, finished: false };

  const playerName = (id) => room?.players.find((p) => p.id === id)?.name || "?";

  return (
    <main className="game-stage">
      <div className="game-header">
        <span>Round {game.round}</span>
        {game.closingCountdown != null ? (
          <span className={`voting-timer${game.closingCountdown <= 5 ? " timer-urgent" : ""}`}>
            {game.closingCountdown}s
          </span>
        ) : (
          game.timer != null && (
            <span className={`voting-timer${game.timer <= 15 ? " timer-urgent" : ""}`}>{game.timer}s</span>
          )
        )}
      </div>

      {game.status === "racing" && (
        <div className="panel">
          {game.closingCountdown != null && (() => {
            const finishedPlayers = room?.players.filter((p) => game.progress?.[p.id]?.finished) || [];
            const label =
              finishedPlayers.length === 1
                ? `${finishedPlayers[0].name} finished!`
                : `${finishedPlayers.length} players finished!`;
            return <div className="status">{label} {game.closingCountdown}s left</div>;
          })()}
          {/* Paragraph display with per-character colouring */}
          <div className="typeracer-text" onClick={() => inputRef.current?.focus()}>
            {paragraph.split("").map((char, i) => {
              let cls = "char-pending";
              if (i < typed.length) {
                cls = typed[i] === char ? "char-correct" : "char-wrong";
              } else if (i === typed.length) {
                cls = "char-cursor";
              }
              return (
                <span key={i} className={cls}>
                  {char}
                </span>
              );
            })}
          </div>

          {/* Hidden input captures all keystrokes */}
          {!myProgress.finished && (
            <input
              ref={inputRef}
              className="typeracer-hidden-input"
              value={typed}
              onChange={handleInput}
              autoCapitalize="none"
              autoCorrect="off"
              autoComplete="off"
              spellCheck={false}
              inputMode="text"
              aria-label="Type the paragraph"
            />
          )}

          {myProgress.finished && (
            <div className="status">You finished! Waiting for others...</div>
          )}

          {/* Progress bars for all players */}
          <div className="typeracer-progress-list">
            {room?.players.map((p) => {
              const prog = game.progress?.[p.id] || { typedLength: 0, finished: false };
              const pct = paragraph.length > 0 ? Math.min(100, (prog.typedLength / paragraph.length) * 100) : 0;
              return (
                <div key={p.id} className="typeracer-progress-row">
                  <span className="typeracer-progress-name">{p.name}</span>
                  <div className="typeracer-progress-bar">
                    <div
                      className="typeracer-progress-fill"
                      style={{ width: `${pct}%`, background: p.color }}
                    />
                  </div>
                  {prog.finished && <span className="typeracer-done">✓</span>}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {game.status === "reveal" && (
        <div className="panel">
          <div className="status">Race over!</div>
          <div className="typeracer-results">
            {room?.players
              .map((p) => {
                const prog = game.progress?.[p.id] || { finished: false, mistakes: 0, wpm: 0 };
                return {
                  ...p,
                  score: game.scores?.[p.id] || 0,
                  finished: prog.finished,
                  mistakes: prog.mistakes,
                  wpm: prog.wpm,
                };
              })
              .sort((a, b) => b.score - a.score)
              .map((p) => (
                <div key={p.id} className="typeracer-result-row">
                  <span className="swatch" style={{ background: p.color }} />
                  <span className="typeracer-result-name">{p.name}</span>
                  {p.finished ? (
                    <>
                      <span>{p.wpm} wpm</span>
                      <span>{p.mistakes} mistake{p.mistakes !== 1 ? "s" : ""}</span>
                    </>
                  ) : (
                    <span style={{ opacity: 0.5 }}>
                      {Math.round(((game.progress?.[p.id]?.typedLength || 0) / (game.paragraph?.length || 1)) * 100)}% done
                    </span>
                  )}
                  <span><strong>{p.score} pts</strong></span>
                </div>
              ))}
          </div>
        </div>
      )}

      {canSkip && (
        <div className="actions">
          <button type="button" className="skip-btn" onClick={() => send({ type: "skipPhase" })}>
            Skip
          </button>
        </div>
      )}

      <p className="game-instructions">
        Type the paragraph as fast and accurately as you can · Mistakes are penalised but won't block you from finishing
      </p>

      <Scoreboard game={game} room={room} />
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
    <div className="panel">
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
    </div>
  );
}
