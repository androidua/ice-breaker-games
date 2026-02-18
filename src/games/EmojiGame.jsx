import { useState } from "react";

const EMOJI_CATEGORIES = [
  { name: "People", emojis: ["😀","😂","😍","😎","🤔","😱","😴","🤯","🥳","👶","👨","👩","👴","💀","👻","🤖","👑","💪","👋","🤝","👀","🧠","❤️","💔","💍"] },
  { name: "Animals", emojis: ["🐶","🐱","🐭","🐸","🐵","🦁","🐯","🐻","🐧","🐦","🦅","🐍","🐢","🐟","🦈","🐬","🐙","🦋","🐛","🐝","🐞","🦖","🐊","🐘","🦄"] },
  { name: "Food", emojis: ["🍎","🍕","🍔","🌮","🍣","🍰","🍩","🍿","☕","🍺","🧊","🍳","🥗","🍫","🧁","🍦","🍪","🥕","🌽","🍌","🍉","🍇","🥑","🍜","🥤"] },
  { name: "Travel", emojis: ["🚗","✈️","🚀","🚢","🚂","🏠","🏰","🗽","🗼","🌍","🏖️","⛰️","🌋","🏕️","🎢","🚲","🛸","🚁","⛵","🏎️","🚌","🛳️","🗺️","🧳","🛤️"] },
  { name: "Nature", emojis: ["☀️","🌙","⭐","🌧️","❄️","🌈","🔥","💧","🌊","🌸","🌲","🌵","🍂","🌺","🍀","⚡","🌪️","☁️","🌤️","🌻","🪨","💎","🌑","🌕","☄️"] },
  { name: "Objects", emojis: ["📱","💻","📷","🔑","💰","🎁","🎈","🏆","🎯","🔮","💡","📚","✏️","🎨","🎭","🎬","🎤","🎸","🎹","🔔","⏰","🔒","💣","🧲","🪄"] },
  { name: "Symbols", emojis: ["⬆️","⬇️","➡️","⬅️","✅","❌","❓","💯","🔴","🟢","🔵","⚠️","♻️","🏁","🚫","➕","➖","✖️","➗","💤","💢","💥","🎵","🔊","👆"] },
];

export default function EmojiGame({ game, room, me, send }) {
  const [emojiInput, setEmojiInput] = useState("");
  const [guessInput, setGuessInput] = useState("");
  const [pickerCategory, setPickerCategory] = useState(0);

  if (!game) return null;

  const isStoryteller = me.id === game.storytellerId;
  const isHost = room?.hostId === me.id;
  const storytellerName = room?.players.find((p) => p.id === game.storytellerId)?.name || "Someone";
  const roundWinnerName = game.roundWinnerId
    ? room?.players.find((p) => p.id === game.roundWinnerId)?.name
    : null;

  const handleSubmitEmojis = () => {
    if (emojiInput.trim().length === 0) return;
    send({ type: "gameAction", action: { kind: "submitEmojis", emojis: emojiInput } });
    setEmojiInput("");
  };

  const handlePickEmoji = (emoji) => {
    if (emojiInput.length >= 30) return;
    setEmojiInput((prev) => prev + emoji);
  };

  const handleGuess = () => {
    if (guessInput.trim().length === 0) return;
    send({ type: "gameAction", action: { kind: "guess", text: guessInput } });
    setGuessInput("");
  };

  const playerName = (id) => room?.players.find((p) => p.id === id)?.name || "?";
  const canSkip = isHost && (game.status === "composing" || game.status === "guessing");

  return (
    <main className="game-stage">
      <div className="game-header">
        <span>Emoji Storytelling</span>
        <span>Round {game.round}</span>
        {game.timer != null && <span className="voting-timer">{game.timer}s</span>}
      </div>

      {game.status === "composing" && isStoryteller && (
        <div className="panel">
          <div className="status">
            Describe with emojis only: <strong>{game.prompt?.text}</strong>
            {" "}({game.promptCategory})
          </div>

          <div className="emoji-preview">{emojiInput || "Tap emojis below..."}</div>

          <div className="emoji-picker">
            <div className="emoji-tabs">
              {EMOJI_CATEGORIES.map((cat, i) => (
                <button
                  key={cat.name}
                  type="button"
                  className={`emoji-tab ${pickerCategory === i ? "emoji-tab-active" : ""}`}
                  onClick={() => setPickerCategory(i)}
                >
                  {cat.name}
                </button>
              ))}
            </div>
            <div className="emoji-grid">
              {EMOJI_CATEGORIES[pickerCategory].emojis.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  className="emoji-btn"
                  onClick={() => handlePickEmoji(emoji)}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          <div className="actions">
            {emojiInput.length > 0 && (
              <button type="button" onClick={() => setEmojiInput((prev) => [...prev].slice(0, -1).join(""))}>
                Backspace
              </button>
            )}
            {emojiInput.length > 0 && (
              <button type="button" onClick={() => setEmojiInput("")}>Clear</button>
            )}
            <button type="button" onClick={handleSubmitEmojis} disabled={emojiInput.trim().length === 0}>
              Send Emojis
            </button>
          </div>
        </div>
      )}

      {game.status === "composing" && !isStoryteller && (
        <div className="panel">
          <div className="status">{storytellerName} is picking emojis ({game.promptCategory})...</div>
        </div>
      )}

      {game.status === "guessing" && (
        <div className="panel">
          <div className="emoji-display">{game.emojis}</div>
          {!isStoryteller && (
            <div className="guess-row">
              <input
                value={guessInput}
                onChange={(e) => setGuessInput(e.target.value)}
                placeholder="Type your guess..."
                maxLength={200}
                onKeyDown={(e) => e.key === "Enter" && handleGuess()}
              />
              <button type="button" onClick={handleGuess}>Guess</button>
            </div>
          )}
          {isStoryteller && (
            <div className="status">Players are guessing...</div>
          )}
          <div className="guess-feed">
            {game.guesses.map((g, i) => (
              <div key={i} className={`guess-item ${g.correct ? "guess-correct" : ""}`}>
                <strong>{playerName(g.playerId)}:</strong> {g.text}
                {g.correct && " ✓"}
              </div>
            ))}
          </div>
        </div>
      )}

      {game.status === "reveal" && (
        <div className="panel">
          <div className="emoji-display">{game.emojis}</div>
          <div className="status">The answer was: <strong>{game.answer}</strong></div>
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
