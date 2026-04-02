import { useMemo, useState } from "react";

// Deterministic shuffle: same player + same round always gives same order.
// This lets each player see statements in a unique order without needing server changes.
function seededShuffle(arr, seedStr) {
  let h = 0;
  for (let i = 0; i < seedStr.length; i++) {
    h = (Math.imul(31, h) + seedStr.charCodeAt(i)) | 0;
  }
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    h = ((Math.imul(h, 1664525) + 1013904223) | 0) >>> 0;
    const j = h % (i + 1);
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export default function TruthsGame({ game, room, me, send }) {
  const [statements, setStatements] = useState(["", "", ""]);
  const [lieIndex, setLieIndex] = useState(0);

  if (!game) return null;

  const isPresenter = me.id === game.presenterId;
  const isHost = room?.hostId === me.id;
  const presenterName = room?.players.find((p) => p.id === game.presenterId)?.name || "Someone";
  const roundWinnerName = game.roundWinnerId
    ? room?.players.find((p) => p.id === game.roundWinnerId)?.name
    : null;

  const handleSubmit = () => {
    if (statements.some((s) => s.trim().length === 0)) return;
    send({
      type: "gameAction",
      action: { kind: "submitStatements", statements, lieIndex },
    });
  };

  // Each player sees statements in their own unique order.
  // displayOrder is e.g. [2, 0, 1] meaning: display slot 0 shows original[2], etc.
  const displayOrder = useMemo(
    () => seededShuffle([0, 1, 2], me.id + String(game.round)),
    [me.id, game.round]
  );

  // Map a display-position vote back to the original index before sending to server.
  const handleVote = (displayIdx) => {
    const originalIdx = displayOrder[displayIdx];
    send({ type: "gameAction", action: { kind: "vote", index: originalIdx } });
  };

  const canSkip = isHost && (game.status === "submitting" || game.status === "voting");

  return (
    <main className="game-stage">
      <div className="game-header">
        <span>Round {game.round}</span>
        {game.timer != null && (
          <span className={`voting-timer${game.timer <= 15 ? " timer-urgent" : ""}`}>{game.timer}s</span>
        )}
      </div>

      {game.status === "submitting" && isPresenter && (
        <div className="panel truths-panel">
          <div className="status">Enter two truths and one lie about yourself:</div>
          {statements.map((s, i) => (
            <label key={i} className="field">
              <span>
                Statement {i + 1}
                <button
                  type="button"
                  className={`lie-toggle ${lieIndex === i ? "lie-selected" : ""}`}
                  onClick={() => setLieIndex(i)}
                >
                  {lieIndex === i ? "← THE LIE" : "Mark as lie"}
                </button>
              </span>
              <input
                value={s}
                onChange={(e) => {
                  const next = [...statements];
                  next[i] = e.target.value;
                  setStatements(next);
                }}
                placeholder={`Statement ${i + 1}`}
                maxLength={200}
              />
            </label>
          ))}
          <div className="actions">
            <button type="button" onClick={handleSubmit}>Submit</button>
          </div>
        </div>
      )}

      {game.status === "submitting" && !isPresenter && (
        <div className="panel">
          <div className="status">{presenterName} is writing their statements...</div>
        </div>
      )}

      {game.status === "voting" && (
        <div className="panel truths-panel">
          <div className="status">
            {isPresenter
              ? "Players are voting on which is the lie..."
              : `Which statement by ${presenterName} is the lie?`}
          </div>
          <div className="truths-cards">
            {displayOrder.map((origIdx, displayIdx) => (
              <button
                key={displayIdx}
                type="button"
                className="truth-card"
                onClick={() => !isPresenter && handleVote(displayIdx)}
                disabled={isPresenter}
              >
                {game.statements[origIdx]}
              </button>
            ))}
          </div>
          <div className="status">{game.voteCount}/{game.voterCount} voted</div>
        </div>
      )}

      {game.status === "reveal" && (
        <div className="panel truths-panel">
          <div className="status">The lie was revealed!</div>
          <div className="truths-cards">
            {displayOrder.map((origIdx, displayIdx) => (
              <div
                key={displayIdx}
                className={`truth-card ${origIdx === game.lieIndex ? "truth-lie" : "truth-true"}`}
              >
                <span>{game.statements[origIdx]}</span>
                <span className="truth-label">{origIdx === game.lieIndex ? "LIE" : "TRUTH"}</span>
              </div>
            ))}
          </div>
          {roundWinnerName && (
            <div className="status round-winner">Round winner: {roundWinnerName}</div>
          )}
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
        The presenter writes 2 truths and 1 lie · Everyone else votes on which statement is the lie · Correct guesses earn points
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
