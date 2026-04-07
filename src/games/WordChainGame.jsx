import { useState, useEffect, useRef } from "react";

export default function WordChainGame({ game, room, me, send }) {
  const [wordInput, setWordInput] = useState("");
  const inputRef = useRef(null);

  const isHost = room?.hostId === me.id;
  const isMyTurn = game?.currentPlayerId === me.id;
  const isEliminated = game?.eliminated?.includes(me.id);

  const playerName = (id) => room?.players.find((p) => p.id === id)?.name || "?";
  const currentPlayerName = playerName(game?.currentPlayerId);

  useEffect(() => {
    if (isMyTurn && game?.status === "playing") {
      inputRef.current?.focus();
    }
    setWordInput("");
  }, [game?.currentPlayerId, game?.status, game?.round]);

  const handleSubmit = () => {
    const w = wordInput.trim();
    if (!w || !isMyTurn) return;
    send({ type: "gameAction", action: { kind: "submit", word: w } });
    setWordInput("");
  };

  if (!game) return null;

  const lastLetter = game.currentWord ? game.currentWord[game.currentWord.length - 1] : null;

  return (
    <main className="game-stage">
      <div className="game-header">
        <span>Round {game.round}</span>
        {game.status === "playing" && (
          <span className={`voting-timer${game.timer <= 5 ? " timer-urgent" : ""}`}>{game.timer}s</span>
        )}
      </div>

      {game.status === "playing" && (
        <div className="panel">
          {game.currentWord ? (
            <div className="wordchain-current">
              <span className="wordchain-word">{game.currentWord}</span>
              <span className="wordchain-hint"> → must start with <strong>{lastLetter?.toUpperCase()}</strong></span>
            </div>
          ) : (
            <div className="status">Say any word to start the chain!</div>
          )}

          {/* Player turn indicators */}
          <div className="wordchain-players">
            {room?.players
              .filter((p) => !game.eliminated?.includes(p.id))
              .map((p) => (
                <div
                  key={p.id}
                  className={`wordchain-player-chip ${p.id === game.currentPlayerId ? "wordchain-active" : ""}`}
                  style={{ borderColor: p.color }}
                >
                  <span className="swatch" style={{ background: p.color }} />
                  {p.name}
                  {p.id === game.currentPlayerId && ` (${game.timer}s)`}
                </div>
              ))}
            {game.eliminated?.length > 0 && (
              <div className="wordchain-eliminated-label">Eliminated: {game.eliminated.map(playerName).join(", ")}</div>
            )}
          </div>

          {isMyTurn && !isEliminated && (
            <div className="guess-row">
              <input
                ref={inputRef}
                value={wordInput}
                onChange={(e) => setWordInput(e.target.value.replace(/[^a-zA-Z]/g, ""))}
                placeholder={lastLetter ? `Word starting with "${lastLetter.toUpperCase()}"…` : "Any word…"}
                maxLength={40}
                onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
                style={{ fontSize: "16px" }}
              />
              <button type="button" onClick={handleSubmit} disabled={!wordInput.trim()}>Submit</button>
            </div>
          )}

          {!isMyTurn && !isEliminated && (
            <div className="status">{currentPlayerName}'s turn…</div>
          )}

          {isEliminated && (
            <div className="status" style={{ opacity: 0.6 }}>You're eliminated — watching the rest</div>
          )}

          {game.invalidReason === "wrong_letter" && isMyTurn && (
            <div className="status" style={{ color: "#c0392b" }}>That word doesn't start with "{lastLetter?.toUpperCase()}"!</div>
          )}
          {game.invalidReason === "already_used" && isMyTurn && (
            <div className="status" style={{ color: "#c0392b" }}>That word was already used!</div>
          )}
          {game.invalidReason === "not_a_word" && isMyTurn && (
            <div className="status" style={{ color: "#c0392b" }}>That's not a valid word!</div>
          )}
        </div>
      )}

      {game.status === "round_end" && (
        <div className="panel">
          {game.roundWinnerId ? (
            <div className="status round-winner">
              {playerName(game.roundWinnerId)} wins this round!
            </div>
          ) : (
            <div className="status">Round over — no winner!</div>
          )}
          {game.lastEliminatedId && (
            <div className="status" style={{ opacity: 0.7 }}>
              {playerName(game.lastEliminatedId)} ran out of time.
            </div>
          )}
          {isHost && (
            <div className="actions">
              <button type="button" onClick={() => send({ type: "skipPhase" })}>Next Round</button>
            </div>
          )}
        </div>
      )}

      <p className="game-instructions">
        Each word must start with the last letter of the previous word · Can't think of one in time? You're eliminated · Last player standing wins
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
