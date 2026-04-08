import { useEffect, useRef, useState } from "react";
import Lobby from "./Lobby.jsx";
import VotingPhase from "./VotingPhase.jsx";
import SnakeGame from "./games/SnakeGame.jsx";
import TruthsGame from "./games/TruthsGame.jsx";
import EmojiGame from "./games/EmojiGame.jsx";
import SketchGame from "./games/SketchGame.jsx";
import TriviaGame from "./games/TriviaGame.jsx";
import TyperacerGame from "./games/TyperacerGame.jsx";
import WordChainGame from "./games/WordChainGame.jsx";
import BomberGame from "./games/BomberGame.jsx";
import HotTakeVotingGame from "./games/HotTakeVotingGame.jsx";

function getWsUrl() {
  const isDev = window.location.port.startsWith("517");
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.hostname;
  const port = isDev ? 3000 : window.location.port;
  return `${protocol}//${host}:${port}`;
}

const KEY_TO_DIR = {
  ArrowUp: "UP", ArrowDown: "DOWN", ArrowLeft: "LEFT", ArrowRight: "RIGHT",
  w: "UP", s: "DOWN", a: "LEFT", d: "RIGHT",
};

const GAME_COMPONENTS = {
  snake: SnakeGame, truths: TruthsGame, emoji: EmojiGame,
  sketch: SketchGame, trivia: TriviaGame, typeracer: TyperacerGame, wordchain: WordChainGame, bomber: BomberGame, hottake: HotTakeVotingGame,
};

const GAME_LABELS = {
  snake: "Snake Arena", truths: "Two Truths & a Lie",
  emoji: "Emoji Storytelling", sketch: "Sketch & Guess", trivia: "Speed Trivia",
  typeracer: "Type Racer",
  wordchain: "Word Chain",
  bomber: "Bomber Arena",
  hottake: "Hot Take Voting",
};

export default function App() {
  const wsRef = useRef(null);
  const [connection, setConnection] = useState("connecting");
  const [me, setMe] = useState({ id: null });
  const [room, setRoom] = useState(null);
  const [game, setGame] = useState(null);
  const [voting, setVoting] = useState(null);
  const [error, setError] = useState("");

  const send = (payload) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify(payload));
  };

  useEffect(() => {
    const ws = new WebSocket(getWsUrl());
    wsRef.current = ws;

    ws.addEventListener("open", () => setConnection("open"));
    ws.addEventListener("close", () => setConnection("closed"));
    ws.addEventListener("error", () => setConnection("error"));

    ws.addEventListener("message", (event) => {
      const msg = JSON.parse(event.data);
      switch (msg.type) {
        case "welcome":
          setMe({ id: msg.id });
          break;
        case "room":
          setRoom(msg.room);
          setError("");
          if (msg.room.status === "voting") setGame(null);
          break;
        case "state":
          setGame(msg.state);
          break;
        case "vote_state":
          setVoting(msg.voting);
          break;
        case "error":
          setError(msg.message);
          break;
      }
    });

    return () => ws.close();
  }, []);

  useEffect(() => {
    const handleKey = (event) => {
      if (room?.currentGame !== "snake" && room?.currentGame !== "bomber") return;
      const dir = KEY_TO_DIR[event.key];
      if (dir) {
        event.preventDefault();
        send({ type: "input", dir });
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [room?.currentGame]);

  const isHost = room?.hostId === me.id;
  const GameComponent = room?.currentGame ? GAME_COMPONENTS[room.currentGame] : null;
  const gameLabel = room?.currentGame ? GAME_LABELS[room.currentGame] : null;

  return (
    <div className="app">
      <header className="topbar">
        <div></div>
        <div className="topbar-center">
          <div className="topbar-brand">
            <svg width="32" height="32" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
              <path d="M128 40 L204 84 L204 172 L128 216 L52 172 L52 84 Z" fill="none" stroke="#2a2a2a" strokeWidth="10"/>
              <path d="M128 40 L128 100 M128 100 L170 120 M128 100 L86 120 M128 150 L128 216 M128 150 L170 170 M128 150 L86 170" fill="none" stroke="#2a2a2a" strokeWidth="7" strokeLinecap="round"/>
            </svg>
            <span className="brand-name">Huddle Play Room</span>
          </div>
          {!room && <div className="brand-subtitle">Multiplayer party games · up to 8 players</div>}
        </div>
        <div className="topbar-right">{room ? `Room ${room.code}` : ""}</div>
      </header>

      {/* Shown when the WebSocket drops mid-game (e.g. tunnel timeout) */}
      {(connection === "closed" || connection === "error") && room && (
        <div className="disconnected-banner">
          Connection lost — please refresh the page to rejoin.
        </div>
      )}

      {!room && <Lobby connection={connection} error={error} send={send} />}

      {room && room.status === "lobby" && (
        <main className="lobby">
          <div className="panel">
            <div className="status">Waiting for players...</div>
            <div className="players">
              {room.players.map((player) => (
                <div key={player.id} className="player">
                  <span className="swatch" style={{ background: player.color }} />
                  <span>{player.name}</span>
                  <span>{room.gameWins?.[player.id] || 0} games won</span>
                  {room.hostId === player.id ? <span>★</span> : null}
                </div>
              ))}
            </div>
            <div className="status">Room code: {room.code}</div>
            {isHost && (
              <div className="actions">
                <button type="button" onClick={() => send({ type: "start" })}>
                  Start Games
                </button>
              </div>
            )}
            {error && <div className="error">{error}</div>}
          </div>
        </main>
      )}

      {room && room.status === "voting" && (
        <VotingPhase voting={voting} room={room} me={me} send={send} />
      )}

      {room && room.status === "playing" && GameComponent && (
        <GameComponent game={game} room={room} me={me} send={send} />
      )}

      <footer className="footer">
        <div className="footer-left">
          {room && isHost && room.status === "playing" && (
            <button type="button" className="end-game-btn" onClick={() => send({ type: "endGame" })}>
              End Game
            </button>
          )}
        </div>
        <div className="footer-center">
          A personal project by{" "}
          <a
            href="https://github.com/androidua/ice-breaker-games"
            target="_blank"
            rel="noopener noreferrer"
            className="credit-link"
          >
            Dmytro B.
          </a>
          , built with Claude AI &amp; Cursor
        </div>
        <div className="footer-right">
          {room?.currentGame === "snake" ? "WASD / Arrows to move" : ""}
        </div>
      </footer>
    </div>
  );
}
