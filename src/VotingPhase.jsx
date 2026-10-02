export default function VotingPhase({ voting, room, me, send }) {
  if (!voting) return null;

  const handleVote = (game) => {
    send({ type: "vote", game });
  };

  const sortedByGameWins = [...room.players].sort(
    (a, b) => (room.gameWins?.[b.id] || 0) - (room.gameWins?.[a.id] || 0)
  );

  return (
    <main className="voting-stage">
      <div className="voting-header">
        <div className="status">Vote for the next game!</div>
        <div translate="no" className={`voting-timer${voting.timer <= 15 ? " timer-urgent" : ""}`}>{voting.timer}s</div>
      </div>
      <div className="game-grid">
        {voting.availableGames.map((game) => {
          const label = voting.gameLabels?.[game] || game;
          const votes = voting.tallies?.[game] || 0;
          return (
            <button
              key={game}
              type="button"
              className="game-card"
              onClick={() => handleVote(game)}
            >
              <span className="game-card-name">{label}</span>
              <span className="game-card-votes">
                {`${votes} ${votes === 1 ? "vote" : "votes"}`}
              </span>
            </button>
          );
        })}
      </div>
      <div className="panel">
        <div className="leaderboard-title">Overall Leaderboard — Games Won</div>
        <div className="players">
          {sortedByGameWins.map((player) => (
            <div key={player.id} className="player">
              <span className="swatch" style={{ background: player.color }} />
              <span translate="no">{player.name}</span>
              <span>{`${room.gameWins?.[player.id] || 0} games won`}</span>
              {room.hostId === player.id ? <span>★</span> : null}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
