import React, { useEffect, useRef, useState, Component } from "react";
import { version } from "../package.json";
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
import FeedbackModal from "./FeedbackModal.jsx";
import { LAST_ROOM_KEY, storageSet } from "./storage.js";
import { reportError } from "./sentry.js";

function getWsUrl() {
  const isDev = window.location.port.startsWith("517");
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  const host = window.location.hostname;
  if (isDev) return `${protocol}//${host}:3000`;
  const port = window.location.port;
  return port ? `${protocol}//${host}:${port}` : `${protocol}//${host}`;
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

class ErrorBoundary extends Component {
  state = { hasError: false };
  static getDerivedStateFromError() { return { hasError: true }; }
  componentDidCatch(error, info) { reportError(error, { componentStack: info?.componentStack }); }
  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          Something went wrong. Please refresh the page.
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const wsRef = useRef(null);
  const [connection, setConnection] = useState("connecting");
  const [me, setMe] = useState({ id: null });
  const [room, setRoom] = useState(null);
  const [game, setGame] = useState(null);
  const [voting, setVoting] = useState(null);
  const [error, setError] = useState("");
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  const send = (payload) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify(payload));
  };

  const roomRef = useRef(null);
  useEffect(() => { roomRef.current = room; }, [room]);

  useEffect(() => {
    let ws = null;
    let retryTimer = null;
    let attempt = 0;
    let disposed = false;

    const connect = () => {
      if (disposed) return;
      clearTimeout(retryTimer);
      retryTimer = null;
      setConnection("connecting");
      const socket = new WebSocket(getWsUrl());
      ws = socket;
      wsRef.current = socket;

      socket.addEventListener("open", () => {
        attempt = 0;
        setConnection("open");
      });
      socket.addEventListener("close", () => {
        if (wsRef.current !== socket) return; // replaced by a newer socket
        setConnection("closed");
        scheduleReconnect();
      });
      socket.addEventListener("error", () => {
        if (wsRef.current === socket) setConnection("error");
      });

      socket.addEventListener("message", (event) => {
        let msg;
        try { msg = JSON.parse(event.data); } catch { return; }
        switch (msg.type) {
          case "welcome":
            setMe({ id: msg.id });
            break;
          case "room":
            setRoom(msg.room);
            setError("");
            storageSet("sessionStorage", LAST_ROOM_KEY, msg.room.code);
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
    };

    // Only reconnect on our own while not in a room: there is no session to
    // lose, so it is always safe. Inside a room the server has already removed
    // this player, so the banner offers a rejoin instead. Backoff with jitter
    // keeps a fleet of idle tabs from hammering a server that is restarting.
    const scheduleReconnect = () => {
      if (disposed || roomRef.current || retryTimer) return;
      const delay = Math.min(10000, 1000 * 2 ** attempt) + Math.random() * 500;
      attempt++;
      retryTimer = setTimeout(connect, delay);
    };

    // Phones suspend background tabs; retry straight away when the page comes
    // back or the network returns instead of waiting out the backoff.
    const reconnectNow = () => {
      if (disposed || roomRef.current) return;
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
      attempt = 0;
      connect();
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") reconnectNow();
    };
    window.addEventListener("online", reconnectNow);
    document.addEventListener("visibilitychange", onVisibility);

    connect();

    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      window.removeEventListener("online", reconnectNow);
      document.removeEventListener("visibilitychange", onVisibility);
      ws?.close();
    };
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
            <h1 className="brand-name">Huddle Play Room</h1>
          </div>
          {!room && <div className="brand-subtitle">Multiplayer party games · up to 8 players</div>}
        </div>
        <div className="topbar-right">{room ? `Room ${room.code}` : ""}</div>
      </header>

      {/* Shown when the WebSocket drops while in a room. Reloading lands on the
          lobby with the room code and name filled in; the server lets players
          (re)join during the lobby and the game-vote screen. */}
      {(connection === "closed" || connection === "error") && room && (
        <div className="disconnected-banner" role="alert">
          <span>
            Connection lost. Rejoin room {room.code}: you can get back in
            {room.status === "voting" ? " now" : " when the next game vote starts"}.
          </span>
          <button type="button" className="rejoin-btn" onClick={() => window.location.reload()}>
            Rejoin
          </button>
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
        <ErrorBoundary>
          <GameComponent game={game} room={room} me={me} send={send} />
        </ErrorBoundary>
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
          {room?.currentGame === "snake" && <span>WASD / Arrows to move</span>}
          <div className="footer-actions">
            <button type="button" className="feedback-btn" onClick={() => setFeedbackOpen(true)}>
              💬 Feedback
            </button>
            <a
              href="https://buymeacoffee.com/huddleplayroom"
              target="_blank"
              rel="noopener noreferrer"
              className="coffee-btn"
            >
              ☕ Buy me a coffee
            </a>
          </div>
          <span className="footer-version">v{version}</span>
        </div>
      </footer>

      {feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} />}
    </div>
  );
}
