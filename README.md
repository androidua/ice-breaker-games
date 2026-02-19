# Game Arena — Multiplayer Party Games

A collection of real-time multiplayer icebreaker games for up to 6 players. Host a room, share a link, vote on which game to play, and compete!

**Included games:**
- **Snake Arena** — Classic multiplayer snake. Eat food, grow, outlast opponents.
- **Two Truths & a Lie** — One player writes three statements. Others guess which is the lie.
- **Emoji Storytelling** — Describe a movie/phrase using only emojis. Others guess the answer.
- **Sketch & Guess** — One player draws a secret word. Others type guesses in real time.
- **Speed Trivia** — Timed multiple-choice questions. Faster correct answers earn more points.

---

## TL;DR — Host a Game in 5 Minutes

> You only need to do the **First-Time Setup** once. After that, hosting is just two commands.

```bash
# First time only:
#   1. Install Node.js from https://nodejs.org (LTS version)
#   2. Then run:
git clone https://github.com/dmytrobondarenko-cloud/ice-breaker-games.git
cd ice-breaker-games
npm install

# Every time you want to play:
npm start                        # starts the game server

# To let friends join over the internet, open a SECOND terminal:
npx localtunnel --port 3000      # gives you a public URL to share
```

Send the URL to your friends. They open it in their browser — nothing to install on their end. One person clicks **Host Room**, shares the 4-character room code, everyone else clicks **Join Room**.

---

## First-Time Setup (Detailed)

You only need to do this once on the computer that will run the server.

### Step 1: Install Node.js

Node.js is the engine that runs the game server.

**macOS:**
1. Go to https://nodejs.org
2. Download the **LTS** version (the big green button)
3. Open the downloaded `.pkg` file and follow the installer
4. Open **Terminal** (press `Cmd + Space`, type "Terminal", hit Enter) and verify:
   ```bash
   node --version
   npm --version
   ```
   You should see version numbers (e.g. `v20.11.0` and `10.2.0`). If you do, Node.js is installed.

**Windows:**
1. Go to https://nodejs.org
2. Download the **LTS** version
3. Run the `.msi` installer — accept all defaults, make sure "Add to PATH" is checked
4. Open **PowerShell** (press `Win + X`, click "PowerShell") and verify:
   ```bash
   node --version
   npm --version
   ```

### Step 2: Install Git

**macOS:**
- Open Terminal and run `git --version`
- If not installed, macOS will prompt you to install Xcode Command Line Tools — click **Install** and wait

**Windows:**
- Download from https://git-scm.com/download/win
- Run the installer with default settings

### Step 3: Download the Game

Open Terminal (macOS) or PowerShell (Windows) and run:

```bash
git clone https://github.com/dmytrobondarenko-cloud/ice-breaker-games.git
cd ice-breaker-games
```

### Step 4: Install Dependencies

Make sure you're inside the project folder from Step 3, then run:

```bash
cd ice-breaker-games
npm install
```

If you already ran `cd ice-breaker-games` in Step 3, you can skip the `cd` line. This takes about 10–30 seconds. You only need to do this once.

**You're done with setup.** Continue to one of the hosting guides below.

---

## Hosting for Friends Over the Internet

This is the most common scenario: you want to play with friends who are NOT on the same Wi-Fi. You'll run the server on your computer, then use a free tunnel to make it accessible from anywhere.

### What you'll need

- The computer running the server (yours)
- Two terminal windows open on your computer
- Your friends just need a browser (Chrome, Safari, Firefox — any device)

### Step-by-step

**Terminal 1 — Start the game server:**

```bash
cd ice-breaker-games
npm start
```

You'll see:
```
Game server running on http://localhost:3000
Open http://localhost:3000 in your browser to play.
```

Leave this terminal running. **Do not close it** — it's your game server. To stop the server later, press **Ctrl + C** in this terminal.

**Terminal 2 — Create a public link:**

Open a second terminal window and run one of these (pick whichever works for you):

**Option A — localtunnel (easiest, no signup):**
```bash
npx localtunnel --port 3000
```
You'll see something like:
```
your url is: https://ugly-fish-42.loca.lt
```

**Option B — ngrok (most reliable, free signup required):**
1. Create a free account at https://ngrok.com
2. Download and install ngrok from the dashboard
3. Authenticate (one time only):
   ```bash
   ngrok config add-authtoken YOUR_TOKEN_HERE
   ```
4. Start the tunnel:
   ```bash
   ngrok http 3000
   ```
   You'll see a screen with:
   ```
   Forwarding    https://ab12-34-56-78-90.ngrok-free.app -> http://localhost:3000
   ```
   The `https://...ngrok-free.app` URL is what you share.

**Option C — Cloudflare Tunnel (no signup, reliable):**
1. Install cloudflared: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/
2. Run:
   ```bash
   cloudflared tunnel --url http://localhost:3000
   ```
3. Look for the `*.trycloudflare.com` URL in the output.

### Share the link and play

1. **Copy the public URL** from your tunnel (e.g., `https://ugly-fish-42.loca.lt`)
2. **Send it to your friends** via text, Slack, Discord, email — whatever you use
3. Friends open the URL in their browser. They'll see the Game Arena lobby.
4. **You** (the host) also open the same URL in your browser
5. Enter your name and click **Host Room**
6. You'll see a 4-character room code like `AB12`
7. **Tell your friends the room code** — they enter it and click **Join Room**
8. Once everyone's in (up to 6 players), click **Start Games**
9. Everyone votes on which game to play (30-second timer). The most-voted game starts automatically.
10. The host clicks **End Game** when ready to move on — voting starts again for the next game.

### Important notes

- **Keep both terminals open** while playing. Closing either one stops the game.
- **The URL changes** every time you restart the tunnel. You'll need to share a new link next session.
- **Players don't install anything.** They just click the link and play in their browser.
- **You should also use the tunnel URL** (not `localhost:3000`) to play, so you're on the same connection as your friends.

---

## Hosting on the Same Wi-Fi (LAN)

If everyone is in the same room or on the same Wi-Fi network, you don't need a tunnel.

### 1. Start the server

```bash
cd ice-breaker-games
npm start
```

### 2. Find your local IP address

**macOS:**
```bash
ipconfig getifaddr en0
```

**Windows (PowerShell):**
```bash
ipconfig | findstr /i "IPv4"
```

This gives you something like `192.168.1.42`.

### 3. Everyone opens the game

Tell your friends to open their browser and go to:

```
http://192.168.1.42:3000
```

(Replace with your actual IP.)

### 4. Host and play

- You click **Host Room** and share the 4-character code
- Friends enter the code and click **Join Room**
- Click **Start Games** when everyone's in

---

## Playing Solo (Testing / Local)

Just to try the game on your own machine:

```bash
npm start
```

Open **http://localhost:3000** in your browser. You can open multiple tabs to simulate multiple players.

---

## Development Mode

For developers making changes to the code (with hot-reload):

```bash
# Terminal 1 — Game server
npm run server

# Terminal 2 — Vite dev server with hot-reload
npm run dev
```

Open **http://localhost:5173**. The frontend auto-connects to the game server on port 3000. Changes to `src/` files reload instantly.

---

## How to Play Each Game

### Snake Arena

**Controls:** Arrow keys or WASD to move.

**How it works:** Each player controls a snake on a shared grid. Your snake moves forward continuously — you can only change direction. Eat the red food pellets to grow longer and score points. If your snake hits a wall, another snake, or its own body, you die.

**Scoring:** +1 point per food pellet eaten.

**Winning a round:** The last snake alive wins the round. If all snakes die simultaneously, the one with the highest score wins.

**Host controls:** After a round ends, the host clicks **Next Round** to start a fresh snake game, or **End Game** to return to voting.

---

### Two Truths & a Lie

**How it works:** Players take turns as the presenter. The presenter writes three statements about themselves — two true and one lie — then marks which one is the lie. They have **60 seconds** to submit. The other players then have **30 seconds** to vote on which statement they think is the lie.

**Scoring:**
- If you correctly identify the lie → **+1 point** for you
- If you're fooled (pick a truth) → **+1 point** for the presenter

**Winning a round:** The player who gained the most points in that round (either a clever presenter or a sharp guesser) wins the round.

**Timers:** 60s to write statements, 30s to vote. If the presenter doesn't submit in time, the round is skipped. If voting time runs out, the reveal happens with whatever votes are in. The host can also click **Skip** to force-advance.

---

### Emoji Storytelling

**How it works:** Players take turns as the storyteller. The storyteller is given a movie, TV show, event, or phrase and must describe it using **only emojis** — picked from the built-in emoji picker (8 categories: People, Activities, Animals, Food, Travel, Nature, Objects, Symbols). The picker includes body-part emojis like 🦶👣🦵 so you can represent things like "Cold Feet". Once submitted, all other players type text guesses.

**Scoring:**
- 1st correct guesser → **4 points**
- 2nd correct guesser → **3 points**
- 3rd correct guesser → **2 points**
- 4th+ correct guesser → **1 point**
- The storyteller gets **+1 point** for each player who guesses correctly

**Winning a round:** The first player to guess correctly wins the round.

**Timer:** The storyteller has **45 seconds** to pick and submit their emojis. If time runs out without a submission, the round is automatically skipped to the next storyteller. Once emojis are submitted, guessing is untimed — the round auto-reveals when all players have guessed correctly. The host can click **Skip** to move on early.

---

### Sketch & Guess

**How it works:** Players take turns as the drawer. The drawer sees a secret word and draws it on a canvas using their mouse or trackpad. Color options (black, blue, red, yellow, green) and a clear button are available. Other players see the drawing in real time and type guesses. Guessing happens live while the drawer is still drawing.

**Scoring:** Same as Emoji Storytelling:
- 1st correct guesser → **4 points**
- 2nd correct guesser → **3 points**
- 3rd correct guesser → **2 points**
- 4th+ correct guesser → **1 point**
- The drawer gets **+1 point** per correct guesser

**Winning a round:** The first player to guess correctly wins the round.

**Timer:** The drawer has **45 seconds**. When it runs out, the word is revealed and the next round starts. If all guessers get it right early, it reveals immediately. The host can also click **Skip**.

---

### Speed Trivia

**How it works:** Timed multiple-choice questions are shown to all players simultaneously. Each question has 4 options and a **15-second countdown**. Click your answer — the faster you answer correctly, the more points you earn. After each question, the correct answer is highlighted for 5 seconds. A set of 10 questions forms one round. After 10 questions, the round winner is announced and a new set begins.

**Scoring:** Points per correct answer depend on speed:
- Answer instantly → **up to 1,000 points**
- Answer at the last second → **100 points** (minimum for a correct answer)
- Wrong answer → **0 points**

The formula: `points = ceil((time_remaining / 15) × 1000)`, minimum 100.

**Winning a round:** The player with the highest score gained across the 10-question set wins the round.

**No host skip** — trivia is fully automated with its timers.

---

## Host Controls & Leaderboards

**Host controls (available to the room creator):**
- **Start Games** — begins the first voting round from the lobby
- **End Game** — ends the current game, awards a game win to the leading player, and returns to voting
- **Next Round** (Snake only) — starts a new snake round after one ends
- **Skip** (Truths, Emoji, Sketch) — force-advances a stuck phase

**Two-tier leaderboard:**
- **Rounds Won** (shown during each game) — every round has a winner. This tracks how many rounds each player has won within the current game session.
- **Games Won** (shown in lobby and voting screens) — when the host clicks **End Game**, the player with the most rounds won in that session is credited with **1 game win**. This is the overall score that persists across all games in the session.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `npm: command not found` | Node.js is not installed. See Step 1 in First-Time Setup. |
| `git: command not found` | Git is not installed. See Step 2 in First-Time Setup. |
| `npm start` shows an error | Make sure you ran `npm install` first. Make sure you're in the `ice-breaker-games` folder. |
| Friends can't open the URL | Make sure your tunnel is still running (Terminal 2). The URL changes each session. |
| Page loads but shows "Connection: connecting" | The game server (Terminal 1) might have stopped. Check that `npm start` is still running. |
| "Room not found" error | Double-check the 4-character room code. It's case-insensitive. |
| "Game already in progress" | Players can only join during the lobby phase, before the host clicks Start. |
| Friend sees the page but can't connect | They might be using `localhost` instead of the tunnel URL. Share the tunnel URL (the `https://...` one). |
| localtunnel asks for a password | Visit the URL once, accept the warning page, then refresh. This is a localtunnel quirk. |
| ngrok shows "ERR_NGROK_8012" | Your ngrok authtoken is missing or expired. Re-run the `ngrok config add-authtoken` command. |

---

## Configuration

The server runs on port `3000` by default. To use a different port:

```bash
PORT=8080 npm start
```

---

## Project Structure

```
ice-breaker-games/
├── src/                    # Frontend (React + Vite)
│   ├── App.jsx             # Main app — WS connection, routing
│   ├── Lobby.jsx           # Host/join room UI
│   ├── VotingPhase.jsx     # Game selection voting
│   ├── index.css           # All styles
│   └── games/
│       ├── SnakeGame.jsx
│       ├── TruthsGame.jsx
│       ├── EmojiGame.jsx
│       ├── SketchGame.jsx
│       └── TriviaGame.jsx
├── server/                 # Backend (Node.js + ws)
│   ├── index.js            # HTTP + WebSocket server, room management
│   ├── engine.js           # Snake game engine
│   ├── voting-engine.js    # Voting phase logic
│   ├── truths-engine.js    # Two Truths & a Lie engine
│   ├── emoji-engine.js     # Emoji Storytelling engine
│   ├── sketch-engine.js    # Sketch & Guess engine
│   └── trivia-engine.js    # Speed Trivia engine
└── package.json
```

## Tech Stack

- **Frontend:** React 18, Vite 5
- **Backend:** Node.js, native `ws` WebSocket library
- **Styling:** Plain CSS
- **No database** — all state is in-memory on the server
