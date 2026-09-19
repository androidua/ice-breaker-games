import { useState } from "react";
import { LAST_ROOM_KEY, NAME_KEY, storageGet, storageSet } from "./storage.js";

export default function Lobby({ connection, error, send }) {
  // Prefilled after a reload so a dropped player can rejoin with one tap.
  const [nameInput, setNameInput] = useState(() => storageGet("localStorage", NAME_KEY));
  const [codeInput, setCodeInput] = useState(() => storageGet("sessionStorage", LAST_ROOM_KEY));

  const rememberName = () => {
    if (nameInput.trim()) storageSet("localStorage", NAME_KEY, nameInput.trim());
  };

  const handleHost = () => {
    rememberName();
    send({ type: "host", name: nameInput || "Player" });
  };

  const handleJoin = () => {
    rememberName();
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
          {connection === "open"
            ? "Connected"
            : connection === "connecting"
              ? "Connecting…"
              : "Connection lost. Reconnecting…"}
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
