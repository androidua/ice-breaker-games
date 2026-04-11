import { useEffect, useState } from "react";

export default function HotTakeVotingGame({ game, room, me, send }) {
  const [selectedVote, setSelectedVote] = useState(null);
  const [seenRound, setSeenRound] = useState(null);

  useEffect(() => {
    if (!game) return;
    if (seenRound !== game.round) {
      setSeenRound(game.round);
      setSelectedVote(null);
    }
  }, [game, seenRound]);

  if (!game) return null;

  const myVote = game.votes?.[me.id];
  const hasVoted = selectedVote !== null || myVote === "agree" || myVote === "disagree";
  const isTie = game.roundResult?.majority === "tie";
  const isMajority = !isTie && myVote && myVote === game.roundResult?.majority;
  const roundWinnerName = game.roundWinnerId
    ? room?.players.find((p) => p.id === game.roundWinnerId)?.name
    : null;

  const isHost = room?.hostId === me.id;

  const castVote = (vote) => {
    if (hasVoted || game.status !== "voting") return;
    setSelectedVote(vote);
    send({ type: "gameAction", action: { kind: "hotTakeVote", vote } });
  };

  return (
    <main className="game-stage">
      <div className="game-header">
        <span>Round {game.round}</span>
        {game.timer != null && (
          <span className={`voting-timer${game.timer <= 5 ? " timer-urgent" : ""}`}>{game.timer}s</span>
        )}
      </div>

      <div className="panel hottake-panel">
        <div className="hottake-prompt">{game.prompt}</div>

        {game.status === "voting" && (
          <>
            <div className="hottake-actions">
              <button
                type="button"
                className={`hottake-btn${(selectedVote === "agree" || myVote === "agree") ? " hottake-selected" : ""}`}
                onClick={() => castVote("agree")}
                disabled={hasVoted}
              >
                Agree
              </button>
              <button
                type="button"
                className={`hottake-btn${(selectedVote === "disagree" || myVote === "disagree") ? " hottake-selected" : ""}`}
                onClick={() => castVote("disagree")}
                disabled={hasVoted}
              >
                Disagree
              </button>
            </div>
            <div className="status">
              {hasVoted
                ? `Vote locked in. Waiting for others... (${game.voteCount}/${game.playerCount})`
                : `Cast your vote (${game.voteCount}/${game.playerCount})`}
            </div>
          </>
        )}

        {game.status === "reveal" && game.roundResult && (
          <>
            <div className="status">
              {isTie
                ? "Tie round, no points awarded."
                : `Majority picked ${game.roundResult.majority}.`}
            </div>
            <div className="status">
              Agree: {game.roundResult.agreeCount} · Disagree: {game.roundResult.disagreeCount}
            </div>
            <div className="status">
              {isTie
                ? "No one scores this round."
                : isMajority
                  ? "You matched the majority and gained +1 point."
                  : "You did not match the majority this round."}
            </div>
            {roundWinnerName && (
              <div className="status round-winner">Round winner: {roundWinnerName}</div>
            )}
          </>
        )}
      </div>

      {isHost && game.status === "voting" && (
        <div className="actions">
          <button type="button" className="skip-btn" onClick={() => send({ type: "skipPhase" })}>
            Skip
          </button>
        </div>
      )}

      <p className="game-instructions">
        Vote agree or disagree before time runs out · Majority side gets +1 point · Ties give no points
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
