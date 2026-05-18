import { useState } from "react";

export default function Lobby({ connection, error, send }) {
  const [nameInput, setNameInput] = useState("");
  const [codeInput, setCodeInput] = useState("");

  const handleHost = () => {
    send({ type: "host", name: nameInput || "Player" });
  };

  const handleJoin = () => {
    send({ type: "join", code: codeInput.trim().toUpperCase(), name: nameInput || "Player" });
  };

  return (
    <main className="lobby">
      <div className="panel">
        <div className="status">Multiplayer party games for up to 8 players.</div>
        <label className="field">
          <span>Name</span>
          <input
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            placeholder="Player"
          />
        </label>
        <label className="field">
          <span>Room Code</span>
          <input
            value={codeInput}
            onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
            placeholder="AB12"
            maxLength={4}
          />
        </label>
        <div className="actions">
          <button type="button" onClick={handleHost} disabled={connection !== "open"}>
            Host Room
          </button>
          <button type="button" onClick={handleJoin} disabled={connection !== "open"}>
            Join Room
          </button>
        </div>
        <div className="status">
          {connection === "open" ? "Connected" : `Connection: ${connection}`}
        </div>
        {error && <div className="error">{error}</div>}
      </div>
      <section className="lobby-intro">
        <p>
          Free browser-based party games for groups of 2 to 8 — pick a game,
          share the room code, play instantly. No install, no signup.
        </p>
        <p>
          Nine games: Snake Arena, Bomber Arena, Sketch &amp; Guess, Emoji
          Storytelling, Speed Trivia, Type Racer, Word Chain, Two Truths &amp;
          a Lie, Hot Take Voting.
        </p>
      </section>
    </main>
  );
}
