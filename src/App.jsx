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
import { LAST_ROOM_KEY, RESUME_TOKEN_KEY, PLAYER_ID_KEY, storageGet, storageSet, storageRemove } from "./storage.js";
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

// While a phase is ticking the server sends at least one message a second, so
// this much silence means the socket is gone even if the browser still calls it
// open. Six missed ticks is slack enough for a stalled phone or a slow link.
const SILENCE_LIMIT_MS = 6000;

// The server leaves the Sketch canvas out of the per-second state — strokes
// arrive one at a time as they are drawn — so a state with no `strokes` keeps
// the ones this client already has.
function mergeGameState(prev, next) {
  if (!next || next.strokes !== undefined) return next;
  const keep = prev && prev.gameType === next.gameType ? prev.strokes : null;
  return { ...next, strokes: keep || [] };
}

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
  // Plan D session resume: "idle", "pending" (asked for our seat back, no answer
  // yet) or "failed" (the seat is gone: grace ran out or the server restarted).
  const [resume, setResume] = useState("idle");
  const [me, setMe] = useState({ id: null });
  const [room, setRoom] = useState(null);
  const [game, setGame] = useState(null);
  const [voting, setVoting] = useState(null);
  const [error, setError] = useState("");
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  // For the silent-socket watchdog below: when the server owes us a message a
  // second, and when the last one actually arrived.
  const expectingRef = useRef(false);
  const lastMessageRef = useRef(Date.now());

  const send = (payload) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify(payload));
  };

  useEffect(() => {
    let ws = null;
    let retryTimer = null;
    let attempt = 0;
    let disposed = false;
    let replaced = false; // another tab resumed our seat; don't fight it for the seat

    const connect = () => {
      if (disposed) return;
      clearTimeout(retryTimer);
      retryTimer = null;
      setConnection("connecting");
      const socket = new WebSocket(getWsUrl());
      ws = socket;
      wsRef.current = socket;
      // `seat` is the identity this socket plays as. While a resume is in flight,
      // the socket's own fresh welcome waits in `fresh`, used only if the server
      // refuses the resume, so `me` never flickers to a throwaway id.
      let seat = null;
      let resuming = false;
      let fresh = null;

      socket.addEventListener("open", () => {
        attempt = 0;
        lastMessageRef.current = Date.now();
        setConnection("open");
        const token = storageGet("sessionStorage", RESUME_TOKEN_KEY);
        if (token) {
          resuming = true;
          setResume("pending");
          socket.send(JSON.stringify({ type: "resume", token }));
        }
      });
      socket.addEventListener("close", (event) => {
        if (wsRef.current !== socket) return; // replaced by a newer socket
        if (event.code === 4000) {
          // Last connection wins: this seat was resumed in another tab.
          replaced = true;
          setConnection("replaced");
          return;
        }
        setConnection("closed");
        scheduleReconnect();
      });
      socket.addEventListener("error", () => {
        if (wsRef.current === socket) setConnection("error");
      });

      socket.addEventListener("message", (event) => {
        lastMessageRef.current = Date.now();
        let msg;
        try { msg = JSON.parse(event.data); } catch { return; }
        switch (msg.type) {
          case "welcome":
            if (resuming && !msg.resumed) {
              fresh = msg;
              break;
            }
            resuming = false;
            seat = msg;
            setMe({ id: msg.id });
            if (msg.resumed) setResume("idle");
            break;
          case "resume_failed":
            // Fall back to the pre-resume flow: the Rejoin banner, or after a
            // reload the lobby with the room code and name filled in.
            resuming = false;
            seat = fresh;
            if (fresh) setMe({ id: fresh.id });
            storageRemove("sessionStorage", RESUME_TOKEN_KEY);
            storageRemove("sessionStorage", PLAYER_ID_KEY);
            setResume("failed");
            break;
          case "room":
            setRoom(msg.room);
            setError("");
            setResume("idle"); // a room message means we hold a live seat again
            storageSet("sessionStorage", LAST_ROOM_KEY, msg.room.code);
            // Only a seat in a room is worth resuming, so the start screen never
            // sends a resume that can only fail.
            if (seat) {
              storageSet("sessionStorage", RESUME_TOKEN_KEY, seat.resumeToken);
              storageSet("sessionStorage", PLAYER_ID_KEY, seat.id);
            }
            if (msg.room.status === "voting") setGame(null);
            break;
          case "state":
            setGame((prev) => mergeGameState(prev, msg.state));
            break;
          // Sketch sends each stroke once instead of the whole canvas.
          case "sketch_stroke":
            setGame((prev) => (prev?.gameType === "sketch"
              ? { ...prev, strokes: [...(prev.strokes || []), msg.stroke] }
              : prev));
            break;
          case "sketch_clear":
            setGame((prev) => (prev?.gameType === "sketch" ? { ...prev, strokes: [] } : prev));
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

    // Always reconnect. In a room the server holds our seat for a grace period
    // and the new socket asks for it back (see "open"). Backoff with jitter
    // keeps a fleet of idle tabs from hammering a server that is restarting.
    const scheduleReconnect = () => {
      if (disposed || replaced || retryTimer) return;
      const delay = Math.min(10000, 1000 * 2 ** attempt) + Math.random() * 500;
      attempt++;
      retryTimer = setTimeout(connect, delay);
    };

    // A socket can die without the browser noticing — flaky Wi-Fi, a captive
    // portal, a middlebox that stops forwarding — and `readyState` still says
    // OPEN. Nothing then reconnects and the player sits in front of a frozen
    // game until the server's grace runs out and the seat is gone. Silence
    // while a phase is ticking is proof enough. This reads traffic the server
    // already sends, so it adds nothing to the wire in steady state.
    const socketLooksDead = () =>
      expectingRef.current && Date.now() - lastMessageRef.current > SILENCE_LIMIT_MS;

    const replaceSocket = () => {
      lastMessageRef.current = Date.now(); // don't fire again while it reconnects
      attempt = 0;
      try { ws?.close(4001, "silent"); } catch { /* already gone */ }
      connect();
    };

    // Phones suspend background tabs; retry straight away when the page comes
    // back or the network returns instead of waiting out the backoff.
    const reconnectNow = () => {
      if (disposed || replaced) return;
      const live = ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING);
      if (live && !socketLooksDead()) return;
      if (live) {
        replaceSocket();
        return;
      }
      attempt = 0;
      connect();
    };

    // Background tabs throttle timers, so this checks again as soon as the tab
    // is awake; `reconnectNow` covers the wake-up itself.
    const watchdog = setInterval(() => {
      if (disposed || replaced) return;
      if (ws?.readyState === WebSocket.OPEN && socketLooksDead()) replaceSocket();
    }, 2000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") reconnectNow();
    };
    window.addEventListener("online", reconnectNow);
    document.addEventListener("visibilitychange", onVisibility);

    connect();

    return () => {
      disposed = true;
      clearTimeout(retryTimer);
      clearInterval(watchdog);
      window.removeEventListener("online", reconnectNow);
      document.removeEventListener("visibilitychange", onVisibility);
      ws?.close();
    };
  }, []);

  // The watchdog only judges silence when the server owes us a message every
  // second: the vote screen always ticks, and a game phase does while it has a
  // countdown. Trivia's "set complete" and Snake's game over have none, and
  // they wait on the host, so silence there is normal.
  useEffect(() => {
    expectingRef.current = room?.status === "voting"
      || (room?.status === "playing" && (game?.status === "running" || typeof game?.timer === "number"));
  }, [room?.status, game?.status, game?.timer]);

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
  const awayNames = room ? room.players.filter((p) => p.connected === false).map((p) => p.name) : [];
  const reconnecting = room && resume !== "failed" && connection !== "replaced"
    && (connection !== "open" || resume === "pending");

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

      {/* The socket dropped but the server is holding our seat: nothing to do
          but wait while the client reconnects and resumes it. */}
      {reconnecting && (
        <div className="disconnected-banner reconnecting" role="status">
          <span>Connection lost. Reconnecting…</span>
        </div>
      )}

      {room && connection === "replaced" && (
        <div className="disconnected-banner" role="alert">
          <span>You're playing in another tab.</span>
          <button type="button" className="rejoin-btn" onClick={() => window.location.reload()}>
            Play here
          </button>
        </div>
      )}

      {/* The seat is gone (grace ran out, or the server restarted). Reloading
          lands on the lobby with the room code and name filled in; the server
          lets players (re)join during the lobby and the game-vote screen. */}
      {room && resume === "failed" && (
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

      {awayNames.length > 0 && connection === "open" && resume !== "failed" && (
        <div className="away-notice" role="status">
          {awayNames.join(", ")} {awayNames.length === 1 ? "is" : "are"} reconnecting…
        </div>
      )}

      {/* After a reload, the lobby waits (disabled) while we ask for our seat back. */}
      {!room && <Lobby connection={resume === "pending" ? "connecting" : connection} error={error} send={send} />}

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
