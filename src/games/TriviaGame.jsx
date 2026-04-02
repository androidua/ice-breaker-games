import { useEffect, useRef, useState } from "react";

export default function TriviaGame({ game, room, me, send }) {
  const [selectedAnswer, setSelectedAnswer] = useState(null);
  const lastQuestionRef = useRef(null);
  const isHost = room?.hostId === me.id;

  useEffect(() => {
    if (game && game.questionIndex !== lastQuestionRef.current) {
      lastQuestionRef.current = game.questionIndex;
      setSelectedAnswer(null);
    }
  }, [game?.questionIndex]);

  if (!game) return null;

  const handleAnswer = (index) => {
    if (selectedAnswer !== null) return;
    setSelectedAnswer(index);
    send({ type: "gameAction", action: { kind: "answer", index } });
  };

  const myAnswer = game.answers?.[me.id];
  const answered = selectedAnswer !== null || myAnswer !== undefined;
  const roundWinnerName = game.roundWinnerId
    ? room?.players.find((p) => p.id === game.roundWinnerId)?.name
    : null;

  return (
    <main className="game-stage">
      <div className="game-header">
        <span>
          {game.status === "round_complete"
            ? `Set ${game.triviaRound || 1} Complete`
            : `Q${game.questionIndex + 1}/${game.totalQuestions} (Set ${game.triviaRound || 1})`}
        </span>
        {game.timer != null && (
          <span className={`voting-timer${game.timer <= 15 ? " timer-urgent" : ""}`}>{game.timer}s</span>
        )}
      </div>

      {game.status === "round_complete" ? (
        <div className="panel trivia-panel">
          <div className="trivia-question">
            Set {game.triviaRound} complete — {game.totalQuestions} questions done!
          </div>
          {roundWinnerName && (
            <div className="status round-winner">Round winner: {roundWinnerName}</div>
          )}
          {isHost ? (
            <div className="actions">
              <button
                type="button"
                onClick={() => send({ type: "gameAction", action: { kind: "nextSet" } })}
              >
                Start Next Set
              </button>
            </div>
          ) : (
            <div className="status">Waiting for host to start the next set...</div>
          )}
        </div>
      ) : (
        <div className="panel trivia-panel">
          <div className="trivia-question">{game.question}</div>

          <div className="trivia-options">
            {game.options.map((option, i) => {
              let className = "trivia-option";
              if (game.status === "reveal") {
                if (i === game.correctIndex) className += " trivia-correct";
                else if (myAnswer === i || selectedAnswer === i) className += " trivia-wrong";
              } else if (selectedAnswer === i) {
                className += " trivia-selected";
              }

              return (
                <button
                  key={i}
                  type="button"
                  className={className}
                  onClick={() => handleAnswer(i)}
                  disabled={game.status === "reveal" || answered}
                >
                  {option}
                </button>
              );
            })}
          </div>

          {game.status === "question" && answered && (
            <div className="status">Waiting for others... ({game.answerCount}/{game.playerCount})</div>
          )}

          {game.status === "reveal" && (
            <div className="status">
              {(myAnswer === game.correctIndex || selectedAnswer === game.correctIndex)
                ? "Correct!"
                : "Wrong!"}
            </div>
          )}
        </div>
      )}

      <p className="game-instructions">
        Tap the correct answer before time runs out · Answer faster to score more points · Most points after all sets wins
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
