# Huddle Play Room — Multiplayer Party Games

A collection of real-time multiplayer icebreaker games for up to 8 players. Host a room, share a link, vote on which game to play, and compete!

**Works on mobile** — players can join from phones or tablets. Snake and Bomber Arena support swipe-to-move and on-screen controls. Sketch & Guess supports finger drawing. All other games are tap-friendly with large touch targets.

**Live at:** [huddleplayroom.com](https://huddleplayroom.com/)

**Included games:**
- **Snake Arena** — Classic multiplayer snake. Eat food, grow, outlast opponents.
- **Bomber Arena** — Bomberman-style free-for-all. Drop bombs, chain explosions, collect power-ups.
- **Type Racer** — Race to type a paragraph fastest. Mistakes lower points but do not block finishing.
- **Word Chain** — Each word must start with the last letter of the previous. Too slow? You're eliminated.
- **Two Truths & a Lie** — One player writes three statements. Others guess which is the lie.
- **Emoji Storytelling** — Describe a movie/phrase using only emojis. Others guess the answer.
- **Sketch & Guess** — One player draws a secret word. First to guess correctly wins the round.
- **Speed Trivia** — Timed multiple-choice questions. Faster correct answers earn more points.
- **Hot Take Voting** — Vote agree/disagree on spicy prompts. Match the majority to score.

---

## TL;DR — Play Now (No Setup Required)

The game is already hosted online. Just share the link:

```
https://huddleplayroom.com/
```

- One person opens the link, clicks **Host Room**, and shares the 4-character room code
- Everyone else opens the same link, enters the code, and clicks **Join Room**
- Click **Start Games** when everyone's in — up to 8 players

**That's it.** No installs, no tunnel, no server to run.

---

## Hosting on Railway (Your Own Deployment)

If you want your own copy of the game hosted permanently online — with auto-deploy whenever you push code to GitHub — Railway is the recommended approach.

### What you get
- A permanent public URL (like `https://your-app.up.railway.app`) that always works
- Auto-deploys every time you push to your GitHub repo — no manual redeploys
- Free tier available (sufficient for small groups); no credit card required to start
- Nothing to run locally — Railway runs the server 24/7

### Step 1 — Create a Railway account

1. Go to [railway.app](https://railway.app)
2. Click **Login** → **Login with GitHub**
3. Authorise Railway to access your GitHub account

### Step 2 — Create a new project

1. In the Railway dashboard, click **New Project**
2. Select **Deploy from GitHub repo**
3. Find and select `ice-breaker-games` (or your fork of it)
4. Railway will detect the project and start deploying automatically

### Step 3 — Set the start command

Railway needs to know how to run the server. In your project settings:

1. Click on the deployed service (the box that appears after connecting the repo)
2. Go to **Settings** → **Deploy** → **Start Command**
3. Enter: `node server/index.js`
4. Click **Save** — Railway will redeploy with the correct command

### Step 4 — Get your public URL

1. In the Railway project, click on your service
2. Go to **Settings** → **Networking** → **Generate Domain**
3. Railway gives you a URL like `https://your-app-name.up.railway.app`
4. That's your permanent link — share it with anyone to play

### Step 5 — Auto-deploy is already on

Every time you push code to the connected GitHub branch, Railway rebuilds and redeploys automatically. No extra steps needed.

### Notes on the free tier

- Railway's free tier includes 500 hours/month of runtime — enough for regular play sessions
- The server may "sleep" after a period of inactivity on the free tier; the first person to open the URL wakes it up (takes ~5 seconds)
- If you play frequently, consider upgrading to the Hobby plan ($5/month) for always-on uptime

---

## Running Locally (Development / Testing)

Use this if you're making changes to the code and want to test before pushing.

### First-Time Setup

You only need to do this once on your local machine.

**Step 1 — Install Node.js**

Node.js is the engine that runs the game server.

**macOS:**
1. Go to [nodejs.org](https://nodejs.org)
2. Download the **LTS** version and run the installer
3. Verify in Terminal:
   ```bash
   node --version
   npm --version
   ```

**Windows:**
1. Go to [nodejs.org](https://nodejs.org)
2. Download the **LTS** version, run the `.msi` installer with default settings
3. Verify in PowerShell:
   ```bash
   node --version
   npm --version
   ```

**Step 2 — Install Git**

**macOS:** Run `git --version` — if not installed, macOS will prompt you to install Xcode Command Line Tools.

**Windows:** Download from [git-scm.com/download/win](https://git-scm.com/download/win) and install with defaults.

**Step 3 — Clone and install**

```bash
git clone https://github.com/androidua/ice-breaker-games.git
cd ice-breaker-games
npm install
```

Run `npm install` from inside the `ice-breaker-games` folder. This takes 10–30 seconds and only needs to be done once.

### Running the server locally

```bash
npm start
```

Open **http://localhost:3000** in your browser. Open multiple tabs to simulate multiple players.

To stop the server, press **Ctrl + C** in the terminal.

### Development mode (with hot-reload)

```bash
# Terminal 1 — Game server
npm run server

# Terminal 2 — Vite dev server with hot-reload
npm run dev
```

Open **http://localhost:5173**. Changes to `src/` files reload instantly.

---

## Playing Over the Same Wi-Fi (LAN)

If everyone is in the same room or on the same network, you can run locally and share your local IP — no internet required.

### 1. Start the server

```bash
cd ice-breaker-games
npm start
```

### 2. Find your local IP

**macOS:**
```bash
ipconfig getifaddr en0
```

**Windows (PowerShell):**
```bash
ipconfig | findstr /i "IPv4"
```

This prints something like `192.168.1.42`.

### 3. Share the link

The link to share with friends on the same network:
```
http://192.168.1.42:3000
```
(swap in your actual IP)

Friends open that in their browser — no install needed. You open it too (don't use `localhost`, use the IP so everyone is on the same connection).

### 4. Host and play

- Click **Host Room** and share the 4-character code
- Friends enter the code and click **Join Room**
- Click **Start Games** when everyone's in

---

## Optional — Internet Play Without Railway (Cloudflare Tunnel)

If Railway isn't an option (e.g. company security policy blocks it), you can still host temporarily from your local machine using a free tunnel.

This requires your computer to be on while people are playing. The public URL changes every session.

**Install Cloudflare Tunnel (one time):**

macOS:
```bash
brew install cloudflared
```

Windows (PowerShell as Administrator):
```powershell
winget install Cloudflare.cloudflared
```

Or download directly from [developers.cloudflare.com](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/)

**Run it:**

```bash
# Terminal 1 — game server
npm start

# Terminal 2 — creates a public link
cloudflared tunnel --url http://localhost:3000
```

You'll see a URL like `https://some-random-words.trycloudflare.com` — share that with friends.

**When you're done playing:**
1. Press **Ctrl + C** in Terminal 2 to stop the tunnel (the public URL immediately stops working)
2. Press **Ctrl + C** in Terminal 1 to stop the game server

The tunnel doesn't install any background service and doesn't leave anything running — it's fully temporary.

> **No cloudflared?** As a fallback, run `npx localtunnel --port 3000` instead — no install or signup needed. You'll get a URL like `https://ugly-fish-42.loca.lt`. Note: localtunnel may show a warning page on first visit; click through it once and refresh.

---

## How to Play Each Game

### Snake Arena

**Controls:**
- **Desktop:** Arrow keys or WASD
- **Mobile:** Swipe on the board in any direction, or tap the on-screen arrow buttons

**How it works:** Each player controls a snake on a shared 30×30 grid. Your snake moves forward continuously — you can only change direction. Eat the red food pellets to grow longer and score points. If your snake hits a wall, another snake, or its own body, you die. Solo play is fully supported — the game only ends when your snake actually dies.

**Scoring:** +1 point per food pellet eaten.

**Winning a round:** The last snake alive wins the round. If all snakes die simultaneously, the one with the highest score wins.

**Host controls:** After a round ends, the host clicks **Next Round** to start a fresh snake game, or **End Game** to return to voting.

---

### Bomber Arena

**Controls:**
- **Desktop:** Arrow keys or WASD to move, Space to drop a bomb
- **Mobile:** On-screen D-pad to move, 💣 button to drop a bomb

**How it works:** Each player starts in a corner of a 30×30 grid filled with breakable walls. Move continuously to navigate the maze, drop bombs to destroy walls and eliminate other players. Bombs explode in a + pattern after a short fuse.

**Power-ups** spawn when a breakable wall is destroyed:
- 💣 — increases your maximum bomb capacity by 1
- 🔥 — increases your flame range by 1 tile

**Scoring:** 1 point per kill (player eliminated by your bomb's explosion).

**Winning a round:** The last player alive wins the round.

**Timer:** Rounds have a time limit. When it expires the player with the highest score wins. The host clicks **Next Round** to start a new round.

---

### Type Racer

**How it works:** All players see the same paragraph. Type it as fast and accurately as you can — your progress is shown in real time as a progress bar. Incorrect characters are highlighted in red and must be corrected before you can advance.

**Scoring:** Each player who finishes scores `1000 − (mistakes × 50) + speed bonus`, where the speed bonus is up to 500 points based on how much time was left. Players who don't finish score 0. The player with the highest score wins the round.

**Stats shown after each round:** WPM (words per minute) and mistake count per player.

**Timer:** 90 seconds. The host can click **Skip** to end early.

---

### Word Chain

**How it works:** Players take turns in order. On your turn, type a word that starts with the **last letter** of the previous word. For example: *apple* → *elephant* → *tiger* → *rabbit* → ...

**Elimination:** If you can't think of a valid word before your timer runs out, you're eliminated. The game continues until only one player remains.

**Rules:**
- Words must start with the correct letter
- Words already used in this round are rejected
- Words must be real English words (gibberish is rejected)
- Only letters are allowed (no numbers or punctuation)

**Scoring:** 1 point awarded to the round winner (last player standing).

**Timer:** Each player has **10 seconds** per turn (shown on screen). Runs out → eliminated.

---

### Two Truths & a Lie

**How it works:** Players take turns as the presenter. The presenter writes three statements about themselves — two true and one lie — then marks which one is the lie. They have **60 seconds** to submit. The other players then have **30 seconds** to vote on which statement they think is the lie.

**Scoring:**
- If you correctly identify the lie → **+1 point** for you
- If you're fooled (pick a truth) → **+1 point** for the presenter

**Winning a round:** The player who gained the most points in that round wins.

**Timers:** 60s to write statements, 30s to vote. The host can click **Skip** to force-advance.

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

**Timer:** The storyteller has **45 seconds** to pick and submit emojis. If time runs out, the round is automatically skipped. Once emojis are submitted, guessing is untimed. The host can click **Skip** to move on early.

---

### Sketch & Guess

**How it works:** Players take turns as the drawer. The drawer sees a secret word and draws it on a canvas using their mouse, trackpad, or finger (touch screens fully supported). Colour options (black, blue, red, yellow, green) and a clear button are available. Other players see the drawing in real time and type guesses while the drawer is still drawing.

**Scoring:**
- First player to guess correctly → **1 point** and wins the round immediately
- No points for later guesses or the drawer

**Winning a round:** The moment the first correct guess lands, a 3-second countdown begins, then the round ends. If time runs out with no correct guess, no one scores.

**Timer:** The drawer has **45 seconds**. The host can also click **Skip**.

---

### Speed Trivia

**How it works:** Timed multiple-choice questions are shown to all players simultaneously. Each question has 4 options and a **15-second countdown**. Click your answer — the faster you answer correctly, the more points you earn. After each question, the correct answer is highlighted for 5 seconds. A set of 10 questions forms one round.

**Scoring:** Points per correct answer depend on speed:
- Answer instantly → **up to 1,000 points**
- Answer at the last second → **100 points** (minimum for a correct answer)
- Wrong answer → **0 points**

Formula: `points = ceil((time_remaining / 15) × 1000)`, minimum 100.

**Winning a round:** The player with the highest score across 10 questions wins the round. After 10 questions, the host presses **Start Next Set** to begin a fresh set — it won't auto-start.

**No host skip** — trivia is fully automated with its own timers.

---

### Hot Take Voting

**How it works:** Each round shows one hot take prompt. Everyone votes **Agree** or **Disagree** before the timer ends. Votes are locked after submission.

**Scoring:**
- If your vote matches the round majority → **+1 point**
- If it's a tie (equal agree/disagree) → **0 points for everyone**

**Winning a round:** Players on the majority side are considered round winners.

**Prompt variety:** Uses a bank of **300 unique static prompts**, shuffled at game start and reshuffled after the pool is exhausted to reduce repeats for frequent players.

**Timer:** 15s voting + 5s reveal. The host can click **Skip** during the voting phase.

---

## Host Controls & Leaderboards

**Host controls (available to the room creator):**
- **Start Games** — begins the first voting round from the lobby
- **End Game** — ends the current game, awards a game win to the leading player, and returns to voting
- **Next Round** (Snake, Bomber) — starts a new round after one ends
- **Skip** (Truths, Emoji, Sketch, Type Racer, Hot Take Voting) — force-advances a stuck phase
- **Start Next Set** (Trivia only) — begins the next 10-question set after a round completes

**Two-tier leaderboard:**
- **Rounds Won** (shown during each game) — tracks how many rounds each player has won within the current game session
- **Games Won** (shown in lobby and voting screens) — when the host clicks **End Game**, the player with the most rounds won is credited with **1 game win**; this persists across all games in the session

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| `npm: command not found` | Node.js is not installed. See First-Time Setup above. |
| `git: command not found` | Git is not installed. See First-Time Setup above. |
| `npm start` shows an error | Make sure you ran `npm install` first and you're in the `ice-breaker-games` folder. |
| huddleplayroom.com doesn't load | Railway may be waking up the server — wait 5–10 seconds and refresh. |
| Friends can't open the tunnel URL | Make sure your tunnel terminal is still running. The URL changes each session. |
| Page loads but shows "Connection: connecting" | The game server may have stopped. Check that `npm start` is still running. |
| "Room not found" error | Double-check the 4-character room code. It's case-insensitive. |
| "Game already in progress" | Players can only join during the lobby phase, before the host clicks Start. |
| Friend sees the page but can't connect | They might be using `localhost` instead of the shared URL. |
| localtunnel shows a warning page | Click through it once and refresh — this is a localtunnel quirk. |
| `cloudflared: command not found` | Install it: `brew install cloudflared` (macOS) or `winget install Cloudflare.cloudflared` (Windows). |

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
│       ├── BomberGame.jsx
│       ├── TyperacerGame.jsx
│       ├── WordChainGame.jsx
│       ├── TruthsGame.jsx
│       ├── EmojiGame.jsx
│       ├── SketchGame.jsx
│       ├── TriviaGame.jsx
│       └── HotTakeVotingGame.jsx
├── server/                 # Backend (Node.js + ws)
│   ├── index.js            # HTTP + WebSocket server, room management
│   ├── engine.js           # Snake game engine
│   ├── bomber-engine.js    # Bomber Arena engine
│   ├── typeracer-engine.js # Type Racer engine
│   ├── wordchain-engine.js # Word Chain engine
│   ├── voting-engine.js    # Voting phase logic
│   ├── truths-engine.js    # Two Truths & a Lie engine
│   ├── emoji-engine.js     # Emoji Storytelling engine
│   ├── sketch-engine.js    # Sketch & Guess engine
│   ├── trivia-engine.js    # Speed Trivia engine
│   └── hottake-engine.js   # Hot Take Voting engine
└── package.json
```

## Tech Stack

- **Frontend:** React 18, Vite 5
- **Backend:** Node.js, native `ws` WebSocket library
- **Hosting:** Railway (auto-deploy from GitHub)
- **Styling:** Plain CSS
- **No database** — all state is in-memory on the server
