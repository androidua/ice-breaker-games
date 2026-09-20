# QA bots

Bot clients that play the real games over the real WebSocket protocol. Not part
of `npm run test:all` — these are for exploratory QA and for reproducing a
specific finding by hand. The automated suites live in `test/`.

The whole server contract is the WebSocket protocol, so a Node `ws` client
exercises exactly the code paths a phone does, about 100× faster, and keeps a
timestamped transcript of every message as evidence.

Produced by the 2026-09 parallel QA run — see
[`docs/qa-fleet-2026-09.md`](../../docs/qa-fleet-2026-09.md) for what it found
and what is still open.

## Running

Start a server first (these never start one for you):

```bash
npm run server        # :3000
```

Then, from the repo root:

```bash
node tools/qa-bots/room-layer.js
```

`QA_PORT` (default `3000`) picks the target; `QA_URL` / `QA_ORIGIN` override it
completely — that is how you point a probe at production:

```bash
QA_URL=wss://huddleplayroom.com QA_ORIGIN=https://huddleplayroom.com \
  node tools/qa-bots/cowinner-probe.js
```

**Before pointing anything at production, check `/health` shows `rooms: 0`.**
Real players may be in a room, and every bot you add is load on a single
in-memory server. `live-smoke.js` refuses to run if the server is not idle.

## What's here

| File | What it does |
|---|---|
| `harness.js` | The shared library: `Bot` (one player), `Session` (a room full of them), `runSession()`. Self-throttles to stay under the server's 60 msg/sec limit. Everything else imports this. |
| `room-layer.js` | The room layer every game shares: capacity, join rules, host migration, resume grace, bogus tokens, vote resolution, leaderboard tiers, protocol abuse. 19 checks. |
| `live-smoke.js` | Small production pass — connects, plays two short games, measures action→broadcast round-trip. Aborts if production is not idle. |
| `cowinner-probe.js` | Regression check for the v1.22.3 co-winner fix: forces a genuine tie in Two Truths and Hot Take and asserts every tied player is credited in `room.roundWins`. |
| `sketch-leak-exploitability.js` | Whether Sketch's guess-feed word leak can actually be scored with (it can't — that is why it is a LOW, not a CRITICAL). |
| `snake-survival-fixed.js` | Snake with bots that actually steer, for growth / food respawn / tick health. Also demonstrates the uppercase-direction contract. |

## Writing a new probe

```js
import { runSession } from "./harness.js";

const { session } = await runSession("hottake", 4, async (s) => {
  await s.host.waitForStatus("voting");
  for (const bot of s.bots) await bot.act({ kind: "hotTakeVote", vote: "agree" });
  await s.host.waitForStatus("reveal");
  await s.checkConsensus(["status", "timer"]);   // MUST be awaited
  s.trackScores();
}, { log: console.log });
```

Two traps that cost real time in the 2026-09 run:

1. **Always `await s.checkConsensus(...)`** (or `await s.settle()`) before
   comparing two bots' states. Broadcasts reach sockets a few ms apart, so a raw
   comparison straight after `waitForStatus` always looks divergent. That is a
   harness artifact, not a bug.
2. **A silently-ignored action looks exactly like a passing test.** Snake takes
   only uppercase directions (`"UP"`, not `"up"`) and drops anything else with no
   error — one agent "tested" a whole game where no input ever registered and
   reported it all green. Pair every "the engine correctly refused X" with a
   positive control showing the same action shape *does* work when it should.
