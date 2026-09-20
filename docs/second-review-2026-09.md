# Second review — September 2026 (independent, adversarial)

Reviewer: Claude (Opus 5), 2026-09-19. Scope: v1.17.0 → v1.21.0 as of `ed71f6d`.
Mode: read-only. No code, config, or infrastructure was changed. Probes ran against a local server on unused ports, with scripts in the session scratchpad. Only read-only GETs and WebSocket pings went to production.

## Update — all ten findings fixed (v1.22.0 / v1.22.1, shipped 2026-09-20)

**Live and verified:** `/health` reports `version 1.22.1`, region `asia-southeast1-eqsg3a`, event-loop lag p50 0.1 ms. CI passed before Railway deployed (both runs green, ~1 min). WebSocket ping to production after the deploy: p50 **152.7 ms** (30 samples), against 179 ms measured before — no regression; the difference is route variance, and the changes remove bytes from the wire rather than adding per-tick work. The production page loads at v1.22.1 with no console errors.

v1.22.1 is a one-line follow-up: `abortRoomGame` stops retrying after two failures, so the counter is cleared whenever a game starts cleanly.


Every F1–F10 item is addressed in code, with a test that fails if the fix is removed (verified by mutation, below). Two items also need something done in Cloudflare/Railway, which is written out under "Infrastructure steps" — the code half ships disabled until you do it.

| # | Fix | Test that pins it |
|---|---|---|
| F1 | `sketch-engine.js`: points rebuilt as `{x,y}` numbers, rounded and clamped to the 400×400 canvas, ≤200 per stroke, 20k points and 1000 strokes per round, colour must match `#rrggbb`, 20 guesses per player per round, feed trimmed to 25. `index.js`: a `draw` broadcasts the one new stroke (`sketch_stroke`), `clear` sends `sketch_clear`, the per-second state omits the canvas, and a refused action costs no broadcast at all. `canSend()` skips a socket with >1 MB queued and terminates one past 8 MB. `App.jsx` merges strokes client-side. | `test/engines/sketch.test.js` (9), `test/integration/sketch-protocol.test.js` (4), `loop-guard.test.js` (backpressure) |
| F2 | Trivia completion is checked with the phase: `status === "question" && allAnswered(...)`. | `trivia-phase.test.js`, plus an engine test pinning that answers survive into `round_complete` |
| F3 | `DEBUG_INTERNALS=1` exposes `GET /__internals` (map sizes, grace timers, live loops, timer handles) so tests can assert the invariants, not just the happy path. | `resume.test.js` 16 (a resumed seat outlives its old deadline), 17 (nothing left behind: sessions, socketToPlayer, rate limits, loops, timers) |
| F4 | Passive watchdog in `App.jsx`: while a phase is ticking, >6 s of silence means the socket is dead, so it is replaced. Reads only traffic the server already sends. | Verified in the browser by freezing the server with SIGSTOP (below) |
| F5 | The host role is lent to a connected player the moment the host goes away, and returned on resume (`hostReturnsTo`). | `resume.test.js` 3 and 3b |
| F6 | At `MAX_ROOMS`, `reclaimIdleRoom()` closes the oldest room nobody is connected to; rooms with anyone in them are untouched. | `room-reclaim.test.js` (2) |
| F7 | Client-drivable lifecycle events go through `logLifecycle` (120 per event per minute). | `resume.test.js` 18 |
| F8 | `TRUSTED_PROXY_SECRET` (+ `TRUSTED_PROXY_HEADER`): forwarded-IP headers are believed only with the edge's secret, otherwise the socket address is the identity. Oversized feedback bodies are refused on Content-Length before buffering. | `proxy-trust.test.js` (4) |
| F9 | No code trigger left once F1 is fixed; restart policy + alert steps below. | — |
| F10 | Every room timer runs through `guardedTick` (`server/room-loop.js`): one failing tick logs once, stops that room's game, tells the players and returns them to the game vote. | `room-loop.test.js` (3), `loop-guard.test.js` (forced tick failure) |

**Verification that matters most — the original crash probe, re-run against the fixed server:**

| Scenario (55 msg/s, ~1000 messages) | Before | After |
|---|---|---|
| Junk strokes (15.5 KB each) | RSS 99 → 709 MB, **heap OOM / SIGABRT at ~22 s**, all rooms lost | RSS flat at 116 MB, victim received **0 MB**, bystander Bomber room ticked at 101 ms p50 throughout, server alive |
| Valid 200-point strokes (worst case a real client can send) | (would follow the same curve) | RSS 105 → 110 MB, victim received 0.4 MB total, largest message 3 KB |
| Guess flood | victim received **217 MB in 25 s**, messages up to 315 KB | victim received 0.2 MB, messages up to 5 KB |

Event-loop lag stayed at p99 ≤ 2.7 ms in all three.

**Mutation test, 15 deliberate regressions, all caught** (baseline 0 failures): the five from F3 plus one per fix — no point validation, no round budget, no guess cap, Trivia phase check removed, host not lent, no room reclaim, `resume_ok` uncapped, proxy secret ignored, no backpressure, tick not guarded. Before this work, 4 of the first 5 shipped green.

**Browser check (local, two tabs):** a stroke drawn in one tab rendered pixel-identical in the other (2846 ink pixels both sides); a full page reload mid-drawing restored the canvas exactly (988 pixels) with the word still secret; `SIGSTOP` on the server — a real silent stall, socket still "open" — produced "Connection lost. Reconnecting…" within 9 s and a clean `resume_ok` on `SIGCONT`. No console errors.

### Infrastructure status — F8 and F9 complete (2026-09-20)

Both done and verified on production:

| Check | Result |
|---|---|
| `/health` → `proxied` | **true** — the Cloudflare request-header rule reaches the origin |
| Secret in responses (`curl -sI`) | **absent** — nothing leaked to visitors |
| Spoof: 12 direct-to-origin POSTs, rotating `cf-connecting-ip` | `400` ×10 then **`429 429`** — rotating a fake IP buys nothing |
| Real traffic: 12 POSTs through Cloudflare from one IP | `400` ×10 then **`429 429`** — genuine visitors keep their own per-IP budget |
| Site | 200, v1.22.2, WS ping p50 173 ms (unchanged) |
| Railway restart policy | **ALWAYS** (set via the Railway API) |
| Crash alerts | Railway project webhook → Discord `#huddleplayroom-status`, critical events (OOM killed, deployment failed, volume/monitor alerts). Railway's test payload was confirmed in the channel. |

Two wrong turns on the way, both worth remembering:

1. **Response vs Request Header Transform Rule.** A *Response* rule was created twice by mistake. It sends the header to the **browser**, so the origin never sees it — and it published the shared secret in every HTTP response (`curl -sI` showed it). Caught within minutes both times; the secret was rotated after each, and the live one has never been in a response. In the Cloudflare **+ Create rule** dropdown the two entries sit in different groups, seven items apart: *Request Header Transform Rule* is the second item, under "Transform requests or responses".
2. **The fix itself was wrong in production first** (see below): untrusted requests were keyed on the socket address, which on Railway differs per request.

Nothing outstanding. Cloudflare **Browser Cache TTL** was considered and deliberately left alone: only `/robots.txt` and 404s for missing hashed assets are overridden to 4 h, and HTML still passes through as `no-cache`, so the override lands nowhere that matters.

**Alerting now has three layers, and each covers what the others structurally cannot:** Sentry sees application errors while the process lives; the Railway webhook sees the process dying or a deploy failing (a V8 heap OOM aborts before any JS handler runs, so Sentry can never report it — exactly the F1 crash); UptimeRobot's keyword monitor sees a sustained outage from outside. Before 2026-09-20 only the first two existed, and neither would have reported the crash this review found.

#### If it ever needs re-doing

### Infrastructure checklist — do these in this order

Steps 1-3 are safe at any time. Step 5 restarts the server and wipes rooms in progress. Nothing here touches WebSockets, gameplay or ping.

**1. Make the secret**

```bash
openssl rand -hex 32
```

**2. Cloudflare: add the header.**
dash.cloudflare.com → **huddleplayroom.com** → **Rules** → **Overview** → **Create rule** → **Request Header Transform Rule** (not *Response*).
- Rule name: `Origin trust header`
- When incoming requests match: **All incoming requests**
- Modify request header: **Set static**
- Header name: `x-origin-secret` · Value: the secret from step 1
- **Deploy**

**3. Optional preview:** account-level Trace page, `https://dash.cloudflare.com/?to=/:account/trace` — URL `https://huddleplayroom.com/api/sentry`, method POST, any body, **Send Trace**, and look for the rule in the matched list. Skip it if you can't find the page; step 6 is the real check.

**4. Wait for an empty server:** `curl -s https://huddleplayroom.com/health` → continue when `"rooms":0`.

**5. Railway:** project **lively-patience** → service **ice-breaker-games** → **Variables** → **New Variable** → `TRUSTED_PROXY_SECRET` = the secret from step 1 → **Deploy**. (Restart policy is already set to ALWAYS.)

**6. Verify — one command:**

```bash
curl -s https://huddleplayroom.com/health
```

- `"proxied": true` → the Cloudflare rule is reaching the origin. Done.
- `"proxied": false` → the variable is set but the header isn't arriving (or its value differs). **Fix it or remove the variable**: while it is false, every visitor shares one rate-limit bucket (3 feedback submissions per 10 minutes and 10 Sentry events per hour, for everyone together).
- `"proxied": null` → no secret configured; nothing has changed.

Optional deeper check, that the spoof itself is dead:

```bash
for i in $(seq 1 12); do printf "%s " $(curl -s -o /dev/null -w "%{http_code}" -X POST https://huddleplayroom.com/api/sentry --connect-to huddleplayroom.com:443:ice-breaker-games-production.up.railway.app:443 -H "cf-connecting-ip: 203.0.113.$i" --data 'not-an-envelope'); done; echo
```

Want `400` ×10 then `429 429`. Confirmed on production at v1.22.2.

**7. Crash alerts (optional):** Railway → project → **Settings** → **Webhooks** → a Slack or Discord webhook URL → **Save Webhook**. Crashes arrive as `"type": "Deployment.crashed"`.

**8. Optional:** Cloudflare → **Caching** → **Configuration** → **Browser Cache TTL** → **Respect Existing Headers**.

**Rollback at any point:** delete `TRUSTED_PROXY_SECRET` in Railway and deploy.

#### If `proxied` stays false

Check, in this order:

1. **Rule type.** It must be a *Request* Header Transform Rule. A *Response* header rule changes what the browser sees and never reaches the server.
2. **Exact value match.** The server compares the header byte for byte against `TRUSTED_PROXY_SECRET`. A trailing space or newline pasted into either side breaks it. Re-paste both from the same source.
3. **Header name.** `x-origin-secret`, spelled exactly (case doesn't matter). If you used a different name, set `TRUSTED_PROXY_HEADER` in Railway to that name.
4. **Rule state.** In Rules → Overview the rule must be enabled and deployed, on the **huddleplayroom.com** zone, matching **All incoming requests**.

#### Why this order

The server stops trusting `cf-connecting-ip` the moment `TRUSTED_PROXY_SECRET` exists. If the variable lands before Cloudflare sends the header, genuine visitors are untrusted too and share a single bucket.

#### What production taught us (v1.22.2)

The first version of this fix did not work, and only the live environment showed it. Untrusted requests were keyed on `req.socket.remoteAddress`, but Railway's edge hands each request to the container from its own internal address, so every request got its own budget: twelve direct POSTs with a rotating `cf-connecting-ip` returned twelve `400`s and never a `429`. On a laptop the socket address is constant, so the integration test passed either way. The decision now lives in `server/client-ip.js` as a pure function with unit tests, untrusted requests share one identity, and `/health` reports `proxied` so the rollout can be checked with one curl instead of inferred.

## Verdict (as first written, before the fixes)

Plan D's session resume is the strongest part of this release: I attacked it with a race against grace expiry, 20-deep resume chains, two-tab fights, all-players-drop, and drop/resume churn across all nine games, and found no leaked seat, no orphaned timer, no map growth and no token leak — the client's 4000/`resume_failed` handling is right too. The serious problems are elsewhere, in code the release touched but didn't re-examine: **one player can crash the entire server in about 15 seconds through ordinary Sketch messages that break no limit** (F1, reproduced twice, V8 heap OOM, every room lost), and Trivia re-runs its reveal on any stray action, which lets a player farm points and freeze the room (F2). The test suite is green and not flaky, but it is happy-path shaped: four regressions I injected into the resume and cleanup code — including one that would kick every resumed player — passed the entire suite (F3). Observability and security are in reasonable shape, with smaller gaps: uncapped `resume_ok` logging, a Cloudflare-bypassable origin that makes the per-IP limits optional, and no bound on a host who goes away. Latency is not an app problem at all: the 179 ms median WS RTT from Sydney equals the plain TCP RTT to any Singapore host, Cloudflare adds nothing measurable, and the server's event-loop lag is under a millisecond — so the only real levers are client-side prediction and tick cadence, not infrastructure.

## Findings

| # | Sev | Status | Where | Failure scenario | Suggested fix |
|---|-----|--------|-------|------------------|---------------|
| F1 | **Critical** | CONFIRMED | `server/sketch-engine.js:210-217`, `server/index.js:1334-1339`, `1823-1826`, `1870-1881` | One client hosts its own 2-socket room, picks Sketch, and as drawer sends 15.5 KB junk strokes at 55/s (within every limit). Each stroke re-broadcasts the full, growing canvas to every player with no backpressure. V8 heap OOM in ~15 s kills the process and **every room**. Unbounded Sketch guesses give the same amplification (217 MB to one phone in 25 s). | Validate points and colour, cap points per round and guesses per player, send stroke deltas instead of the full canvas per action, add a `bufferedAmount` guard in `broadcast`. |
| F2 | Medium | CONFIRMED | `server/index.js:1348-1353` (+ `trivia-engine.js:535-537`) | Trivia calls `allAnswered()` after **every** trivia action without checking the phase. Once everyone has answered, any action in `reveal` (even one the engine ignores) calls `handleTriviaReveal` again. That re-scores the question and resets the reveal timer. Probe: 3 junk answers took the scorer from 1000 to **4000** and held the timer at 5. The same path in `round_complete` reopens `reveal` and pays out round wins a second time. One player with devtools can farm points and freeze the room. | `if (room.game.status === "question" && allAnswered(room.game))`. Add a regression test. |
| F3 | Medium | CONFIRMED | `test/integration/resume.test.js`, `test/helpers/ws-client.js` | Mutation test: I broke the server in five ways in a scratch copy and ran the whole integration + smoke suite. Only the control was caught. **Not caught:** (a) `handleResume` no longer clears `player.graceTimer` — every resumed player would be dropped at their original 45 s deadline; (b) `sessions` never deleted (unbounded leak); (c) `socketToPlayer` never deleted (leak); (d) `stopLoop` removed from the empty-room branch — a closed room keeps ticking forever; (e) `old.replaced` never set. Caught: removing the `player.ws !== ws` identity check. | Add assertions for the invariants, not just the happy path: after a resume, wait past the original deadline and assert the player is still seated; expose the map sizes (a test-only `/__debug`, or export the maps) and assert they return to zero; assert the room's interval stops when the room closes. |
| F4 | Medium | PLAUSIBLE | `src/App.jsx:189-199` (`reconnectNow`), `src/App.jsx:229-230` | A socket that dies silently (flaky Wi-Fi, captive portal, an upstream that blackholes) leaves `readyState === OPEN`, so `reconnectNow` returns early on both `online` and `visibilitychange`, and the "Reconnecting…" banner never shows (it needs `connection !== "open"`). The player stares at a frozen game while the server drops them after heartbeat (15–30 s) + grace (45 s). I could not reproduce a true half-open socket locally, so this is reasoned from the code path. CLAUDE.md justifies having no app-level ping as avoiding steady-state traffic — but in `playing`/`voting` the server already sends ≥ 1 message/s, so a **passive** watchdog costs nothing. | In a room, track the last inbound message; if nothing arrives for ~5 s while `status` is `voting`/`playing`, close the socket and reconnect. Zero new traffic. |
| F5 | Low | CONFIRMED | `server/index.js:857-902`, `1342`, `1068-1072` | Host-only actions have no fallback while the host is away. Phases with no timer stall: lobby Start, Snake game over, Trivia `round_complete`. Probe (`probes/host-away.mjs`, grace 3 s): at Snake game over the guest's `restart` and `endGame` were ignored ("stuck"); the host was reassigned only at grace expiry (3005 ms) and `endGame` then worked. In production that's 45 s, or up to ~75 s when the socket dies silently (heartbeat first). | Either hand the host role to a connected player as soon as the host goes away (and hand it back on resume), or accept host-only actions from any connected player while the host is away. |
| F6 | Low | CONFIRMED | `server/index.js:975-994`, `793-796` | A dropped host still holds the room for the grace, so rooms can be held **with no open sockets**. Probe with `MAX_ROOMS=3`: three host-then-terminate sockets filled the cap; a fresh client got "Server is at capacity right now", with `sockets: 1`. At production settings, ~11 host-and-drop per second keeps all 500 room slots held indefinitely, and legitimate hosts cannot create rooms. | Release a seat immediately when a room has never had a second player, or hold a grace only for rooms with ≥ 2 players; and/or cap rooms per IP. |
| F7 | Low | CONFIRMED | `server/index.js:1028-1031` (and `817`, `852`, `1298`, `881`) | `resume_ok` uses the uncapped `log()`, and a client can loop it: each new socket may resume the same seat once. Probe: 300 serial resumes produced 300 `resume_ok` lines in 0.24 s (~1270 lines/s). Railway drops past 500 lines/s per replica, so a flood hides the lines that matter. `game_started`/`game_ended` can be looped the same way (endGame → vote → start). CLAUDE.md caps `resume_failed` for exactly this reason but not `resume_ok`. | Route the client-triggerable lifecycle events through `logLimited` too, or rate-limit resumes per connection. |
| F8 | Low | CONFIRMED (reachability) / PLAUSIBLE (spoof) | `server/index.js:159-165`, `217`, `502` | The Railway origin answers directly with `Host: huddleplayroom.com` (curl `--connect-to` → `x-railway-edge: lax1`, 200 with the live `/health` JSON), so Cloudflare can be bypassed. `getClientIp` then trusts the `cf-connecting-ip` header, which only Cloudflare is supposed to set, so the per-IP limits on `/api/feedback` (3 / 10 min) and `/api/sentry` (10 / h) can be sidestepped by rotating the header. Locally, 2792 POSTs of 4.19 MB with rotating `cf-connecting-ip` were all accepted (no 429). Unverified on production, since that needs a POST. The global caps (20 Linear issues/h, 50 tunnel events/day) still bound the damage, but burning the tunnel's 50/day blinds browser error reporting for 24 h. | Trust `cf-connecting-ip` only from Cloudflare IP ranges, and/or lock the origin to Cloudflare (Authenticated Origin Pulls, or a secret header the edge adds). Do the body read after the cheap checks. |
| F9 | Low | PLAUSIBLE | Railway service config (no `restartPolicy` → default) | Railway's default restart policy is On Failure with **max 10 restarts** (docs). Chained to F1, ~11 crashes (each takes ~20 s to trigger, ~4 s to restart: `vite build` measured at 1.86 s in the deploy log) would leave the service down until someone redeploys. Each restart also resets the in-memory Sentry caps (tunnel 50/day, server 50/day), so a crash loop multiplies what the shared 5k/month org quota can lose. | Fixing F1 removes the trigger. Consider an explicit restart policy and a Railway crash alert; UptimeRobot (5 min) is the current detector. |
| F10 | Low | PLAUSIBLE | `server/index.js:1424`, `1462`, `1514`, `1598`, `1691`, `1769` … | No tick callback is wrapped in try/catch. Node reschedules an interval whose callback throws (verified with a standalone script: 3 uncaught throws, the interval still fired), so an engine bug inside a tick throws **every tick** forever — 8×/s for Snake, 10×/s for Bomber — while that room is frozen. `logLimited` (10/min) and the Sentry dedupe keep it quiet, which also means it can go unnoticed. I found no input that reaches such a throw today. | Wrap each tick body in try/catch: log once, `stopLoop(room)`, and tell the room the game ended, rather than looping on a broken state. |

## Checked and found sound

- **Resume state machine holds up under adversarial churn.** Probe `probes/resume-stress.mjs` ran against a scratch copy of the server with a `/__debug` hook that dumps `rooms`, `sessions`, `socketToPlayer`, `rateLimits` and live `Timeout` handles, with grace = 400 ms:
  - (a) Resume raced against grace expiry at offsets 370–430 ms in 4 ms steps. Results: 7 ok, 9 `resume_failed`. Every outcome was consistent: a resumed seat was connected with no timer and its session present; a failed one had neither seat nor session.
  - (b) 20 resumes of one seat, alternating dropped-then-resume with resume-while-old-socket-open. All kept the same id and there were 10 × close 4000. Afterwards `sessions`=2, `socketToPlayer`=1, `rateLimits`=2, matching the live sockets exactly.
  - (c) For all 9 games: 3 players, 12 drop/resume cycles at random times (including a host skip), then everyone drops at once. Seats, host and roster stayed intact. Live Timeouts never went above baseline + 1 (one room loop). After grace: `rooms`, `sessions`, `socketToPlayer` and `rateLimits` were all 0, and Timeouts were back to the baseline of 2. No server error lines. **No leak and no orphaned loop found.**
  - By reading: resume and grace expiry can't interleave (single thread, and the timer callback re-looks up the room). `player.ws !== ws` in `handleSocketClose` (`index.js:978`) makes a replaced or old socket's late close a no-op. Connection ids (`p${n}`) are never reused, so a mapped connection id can't collide with a live player id.
- **Resume tokens don't leak into game state.** Every engine copies only `id`/`name`/`color` or `playerIds` (`bomber-engine.js:62-66`, `engine.js:23-34`, others via `players.map((p) => p.id)`). `sendRoomUpdate` whitelists fields (`index.js:1861-1863`). `resume.test.js` test 8 checks raw frames and stdout for both tokens, but only in Emoji. The other games are covered by the code reading above, not by a test.
- **Client 4000 / resume_failed handling is correct.** `App.jsx:114-118`: a 4000 close sets `replaced` and never reconnects. Only a user click ("Play here" → reload) takes the seat back, so there is no automatic tab war. `resume_failed` clears the token and player id and falls back to the Rejoin banner (`App.jsx:141-150`). The token is stored per tab in `sessionStorage`, and only after a `room` message (`App.jsx:158-161`), so the start screen never sends a resume that can only fail.
- **Per-game disconnect reconciliation behaves under churn.** The 9-game churn probe (above) plus the existing suites (`*-disconnect.test.js`, `double-advance.test.js`) exercise each branch of `reconcileDisconnect`; no round stalled and no round advanced twice.
- **Error containment in the message path is real.** `handleMessage` is wrapped (`index.js:723-735`) and `handleGameAction`'s switch is wrapped again (`index.js:1306-1394`); both log and reply "Action failed." without killing the socket or the process. The 2792-request 4 MB feedback flood, the stroke flood and the resume churn produced **zero** error-level lines apart from the OOM crash itself.
- **Dependencies are clean.** `npm audit` and `npm audit --omit=dev`: **0 vulnerabilities**. `ws@8.21.3` (≥ the 8.21.0 GHSA-96hv-2xvq-fx4p fix), `@sentry/node|react@10.75.0`.
- **Logs carry no PII and no tick-loop noise.** Every `log()`/`logLimited()` call site passes room codes and player ids only; `lifecycle-logs.test.js` asserts names never appear and that no line is written during 12 Snake and 12 Bomber ticks. I re-read all 20 call sites and found no name, IP or token.
- **Sentry tunnel does what it claims.** `handleSentryTunnel` (`index.js:211-254`) checks the envelope's DSN against ours, forwards only `event` items, caps the body at 256 KB, never forwards the client IP, and applies the per-IP and daily caps before the upstream call. Worst case HPR spends 100 events/day (50 browser + 50 server) of the org's shared 5k/month — about 60% if it ran at the cap every day, which leaves Nux the rest.
- **Live headers and SEO are correct.** Every response (including the 404 and the SPA fallback) carries CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy and Permissions-Policy. `immutable` only on `/assets/*`; `og-image.png` `max-age=86400`; a missing `/assets/*` file is a real 404, not index.html; `.map` served as `application/json`. `http://` → 301 apex, `https://www…/x?y=1` → 301 apex keeping path and query. index.html has title, description, canonical, OG + Twitter tags, a valid `WebApplication` JSON-LD block, manifest and `lang="en"`; robots.txt and sitemap.xml are well formed and consistent. The Cloudflare beacon is injected only for browser user agents, and the CSP's `script-src https://static.cloudflareinsights.com` matches the URL it injects.
- **Memory per socket is modest.** 480 in-room sockets across 60 rooms took RSS from 97 → 187 MB, about **192 KB per socket** (mostly per-socket zlib state). At the 500-room cap (4000 sockets) that extrapolates to ~0.85 GB — fine for the container, and worth knowing before raising `MAX_ROOMS`.
- **No flaky tests observed.** `npm run test:all` ran 4 times, all green (unit 39, integration 80, smoke 51), ~21 s each.
- **Test suite is green.** `npm run test:all` ran in 20.8 s wall: unit 39/39, integration 80/80, smoke 51/51, exit 0.

## Latency breakdown

Measured 2026-09-19 from the reviewer's machine. `cdn-cgi/trace`: `colo=SYD`, `loc=AU`, so this is a **Sydney** vantage point, not Asia. Production was idle during the run: `/health` showed `rooms:0`, `eventLoopLagMs {p50:0.1, p99:0.2, max:2.7}`.

| Path | Measure | Result |
|---|---|---|
| Client → Cloudflare SYD edge | curl `time_connect` (1 TCP RTT), 12 samples | **13–24 ms** (typ. 14) |
| Client → Cloudflare → Railway `sin1` edge → container | WebSocket ping/pong RTT, 30 samples 200 ms apart, `Origin: https://huddleplayroom.com` | min 148, **p50 179**, p90 198, max 207 ms |
| Same, but direct to the Railway edge (bypassing CF) | WS ping, 30 samples | min 357, **p50 366**, p90 473, max 855 ms. `x-railway-edge: lax1`: Railway's anycast IP sends a Sydney client to **Los Angeles** |
| HTTP via CF, fresh connection | `/health` TTFB, 12 samples | 213–284 ms typ.; 2/12 outliers at ~805–845 ms (cold CF→origin connection) |
| HTTP via CF, reused connection | 4 follow-up requests on one conn | 218–236 ms |
| Physical floor from this vantage | TCP connect to 3 unrelated Singapore hosts (Vultr, Linode, AWS ap-southeast-1) | **175–190 ms** (Sydney host for contrast: 12.5 ms) |
| Server | `/health` event-loop lag | p50 0.1 ms, p99 0.2 ms |

**Where the 179 ms goes:** ~14 ms client → CF SYD edge, ~165 ms CF SYD → Railway Singapore edge → container, < 1 ms server. The WS RTT via Cloudflare equals the plain TCP RTT from here to any Singapore host (175–190 ms). **Cloudflare adds nothing measurable. This is Sydney-to-Singapore transit, not the app.** The CLAUDE.md numbers (~177 ms via CF vs ~360 ms direct) reproduce closely, and they were probably also taken from Sydney. Players inside Southeast Asia will see much less; I couldn't measure that from here.

Snake adds up to one tick (120 ms, avg 60 ms) between an input arriving and it taking effect, on top of the network. For an Asian player on ~30 ms RTT, tick quantisation is the larger delay. For a Sydney player it's about a third of the total.

**Options (not implemented), with costs and risks:**

1. **Do nothing on the network: it's at the floor for AU.** Singapore is Railway's closest region to both SE Asia and Australia (Railway has no Oceania region), so a region move can't help. Keep the Cloudflare proxy: without it, AU traffic detours via LA (366 ms).
2. **Cloudflare Argo Smart Routing** (~$5/mo + ~$0.10/GB). It could shorten the CF SYD → Singapore leg if CF's backbone beats the transit path. The third-party SG hosts at ~178 ms suggest AU transit to SG is simply long, so the gain is uncertain: expect 0–60 ms. It's cheap to trial and one toggle to revert. Risk: per-GB billing on attacker-driven egress (see F1: 217 MB in 25 s from one room). **Touches networking.**
3. **Client-side prediction / interpolation for Snake (and Bomber movement).** Hides one-way latency and tick quantisation locally. This is the only lever that improves *feel* for AU players regardless of geography. Medium dev cost, and a risk of visible rubber-banding when a prediction is wrong. **Safe for ping** (no infra change).
4. **Snake tick 120 → 80–100 ms.** Cuts average input-to-effect delay by 10–20 ms, but changes gameplay speed and raises broadcast volume by 20–50%. It would also need rebalancing. **Safe for ping**, touches gameplay.
5. **Multi-region replicas.** Needs the Railway Pro plan, and rooms live in process memory, so a room must be pinned to a region (sticky routing or a code→region directory). High complexity and cost for an ice-breaker app; not recommended now.
6. `perMessageDeflate` off: not a ping lever (zlib runs off-thread, microseconds per message). It *is* a memory-safety lever (see F1), and bandwidth would rise for big Sketch states.

## Top 5 recommended actions

Ranked by reliability gained against the risk of making things worse.

1. **Fix F1 (Sketch amplification + validation).** It is the only issue that takes the whole service down, and a fix is local to `sketch-engine.js` and the Sketch broadcast path: validate points/colour, cap points per round and wrong guesses per player, send the new stroke instead of the whole canvas on a `draw` action, and skip sockets whose `bufferedAmount` is over a few MB. **Safe for ping** (it reduces bytes on the wire; keep the tick cadence and deflate settings as they are). Add a test that floods strokes and asserts RSS/state stays bounded.
2. **Close the test gap from F3, at least for the resume invariants.** Four of five injected regressions shipped green, including one that would kick every resumed player at their original deadline. Cheap: a resume test that waits past the original grace deadline, and a test-only debug view of `rooms`/`sessions`/`socketToPlayer` asserted back to zero at the end of a suite. **Safe for ping.**
3. **Fix F2 (Trivia phase check).** One condition, plus a regression test. It stops score farming and a one-player room freeze. **Safe for ping.**
4. **Give the client a passive dead-socket watchdog (F4).** In `voting`/`playing`, if no message arrives for ~5 s, close and reconnect. It uses traffic the server already sends, so it adds nothing in steady state — but it is the one item here that touches the connection lifecycle, so measure WS RTT before and after as CLAUDE.md requires. **Touches networking.**
5. **Bound host-away stalls and the room-cap hold (F5, F6).** Hand the host role to a connected player while the host is away, and don't hold a grace for a room that never had a second player. Both are small changes in `handleSocketClose`/`handleDisconnect`; the room-cap change also removes the cheapest way to make hosting fail for everyone. **Safe for ping.**

Not recommended now: Argo Smart Routing (uncertain gain, per-GB billing exposure while F1 is open) and any multi-region work (Pro plan, in-memory rooms). The latency numbers say the network is already at its floor for this vantage point.

## Docs drift

Checked CLAUDE.md and the plan docs against the code. Claims that don't match:

| Claim | Where | Reality |
|---|---|---|
| "`index.js` (~1300 lines)" | CLAUDE.md, Architecture | 1953 lines (`wc -l`). |
| Engine table: `engine.js` → `createGame()`, `changeDirection()`; `truths-engine.js` → `submitStatements()`, `submitGuess()`; `emoji-engine.js` → `submitGuess()`; `sketch-engine.js` → `submitSketchGuess()`; `trivia-engine.js` → `submitAnswer()` | CLAUDE.md, engine table | Actual exports: `createGameState`, `setSnakeDirection`, `stepGame`; the others expose `handleXAction` — `submitSketchGuess`/`submitAnswer` are module-private. The table names functions that don't exist. |
| "Client to server: host, join, resume, start, input, vote, gameAction, endGame, skipPhase, restart" | CLAUDE.md, protocol | `stopInput` is missing from the list (`index.js:761`). |
| "Per-client WebSocket rate limit (60 msg/sec **sliding** window)" | CLAUDE.md, security | `isRateLimited` (`index.js:646-655`) is a **fixed** 1-second window, so ~120 messages can land across a boundary. The code comment says "sliding" too. |
| "Bomber Arena ticks every 100ms (movement) **and 1000ms** (round timer)" | CLAUDE.md, timers | One 100 ms interval with a `secAccum` accumulator (`index.js:1688-1716`); there is no second interval. |
| "Send a WebSocket ping … every **25 seconds**. This prevents **Cloudflare Tunnel** …" | `index.js:678-681` comment | The interval is 15 s (`index.js:693`), matching CLAUDE.md; and the deployment is Cloudflare proxy, not Cloudflare Tunnel. |
| "HTML/robots/sitemap/manifest are `no-cache`" | CLAUDE.md, performance | True at the origin, **not** what users get: Cloudflare rewrites `/robots.txt` to `cache-control: max-age=14400` (`cf-cache-status: EXPIRED`), and a 404 for a missing `/assets/*.js` also comes back `max-age=14400`. A browser caches that 404 for 4 h. |
| "`resume_failed` (capped: a client can loop it)" | CLAUDE.md, log.js section | True, but `resume_ok` is just as loopable and uses the uncapped `log()` — see F7. |
| "With 8 players this means 8 JSON.stringify calls per tick. Fine at current scale" | CLAUDE.md, performance | It is per **action** as well as per tick for Sketch, and the payload is unbounded — the crash in F1. |
| "Free tier may sleep after inactivity; first visitor wakes it in ~5 seconds" | CLAUDE.md, deployment | The service config shows no app-sleep setting (`get-service-config` returns only healthcheck, region, runtime V2). Probably stale from an earlier setup; I could not verify either way from outside. |
| "Sketch round capped at 1000 strokes (defensive memory guard)" | CLAUDE.md, security | The cap exists but does not bound memory: a stroke can be ~16 KB of arbitrary JSON, and the crash happens at ~810 strokes (F1). |
| Plan D §2.5: "the host can Skip" bounds a stalled turn | `docs/plan-D-reconnect-resume.md:105` | True for the storyteller/drawer/presenter, but nothing bounds an **away host** — see F5. Plan D never analyses the host being the one who drops. |

## Nits (no action needed, recorded for completeness)

- Unknown paths return the SPA `index.html` with **200** (`/some/spa/route`, `/site.webmanifest`), so crawlers see soft-404s. The canonical tag points at `/`, which mitigates it.
- `HEAD /health` falls through to the SPA and returns 200 `text/html` — already documented in CLAUDE.md as the reason for the UptimeRobot KEYWORD monitor.
- Production CSP still allows `ws://localhost:*` in `connect-src`, and there is no `base-uri`/`form-action`/`object-src` (harmless here: `default-src 'self'` and no injection sink).
- `room.gameWins` keeps entries for players who have left and broadcasts them in every `room` payload; bounded by the room's lifetime.
- Each boot logs `npm warn config production Use --omit=dev instead.` on stderr, which Railway records at severity **error**.
- `test/integration/resume.test.js:...` sends Sketch points as `[[1,1],[5,5]]` while the real client sends `{x,y}`. It passes only because nothing validates points (F1); it will need updating when they are validated.
- Feedback's honeypot and time-trap rely on the client-supplied `openedAt`, so any bot that reads the page source passes them; the global hourly cap is the real guard.
- Phase 2 of the feedback system (an agent picking up Linear issues) would make user-submitted text reach an agent. Issues are created in **Backlog** and the plan has a human Backlog→Todo gate: keep it, and treat feedback text as untrusted input in any prompt.

## Working notes (raw, as found)

### Probes used (all in the session scratchpad, nothing written to the repo)

`<scratch>/probes/` — each is a standalone script run against a locally spawned server on ports 9951–9966 (test suite uses 9876 and 9882–9908, so no overlap):

| Script | What it does | Key output |
|---|---|---|
| `run-flood2.mjs` + `sketch-flood.mjs stroke` | Bystander Bomber room + Sketch room; drawer sends 15.5 KB strokes at 55/s | RSS 99→709 MB, then `FATAL ERROR: Ineffective mark-compacts near heap limit`, SIGABRT at 22.7 s (two runs) |
| `sketch-flood.mjs guess` | One guesser sends 200-char wrong guesses at 55/s | Other player received 217 MB in 25 s, largest state 315 KB; server survived |
| `resume-stress.mjs` (instrumented server copy with `/__debug`) | Grace race, resume chains, 9-game churn, all-drop | No inconsistency, no leak, Timeouts back to baseline |
| `trivia-rereveal.mjs` | Both answer, then 3 ignored answers during `reveal` | Score 1000 → 4000, reveal timer pinned at 5 |
| `logflood-roomcap.mjs` | 300 serial resumes; 3 host-and-drop with `MAX_ROOMS=3` | 300 `resume_ok` lines in 0.24 s; "Server is at capacity" with `sockets: 1` |
| `feedback-parse.mjs` | 2792 × 4.19 MB feedback POSTs, rotating `cf-connecting-ip` | All 200, no 429; Bomber tick p99 100.7 → 112 ms, loop lag p99 5.1 ms |
| `host-away.mjs` | Host drops at Snake game over (grace 3 s) | Guest `restart`/`endGame` ignored; host reassigned at 3005 ms |
| `socket-mem.mjs` | 60 rooms × 8 sockets | RSS 97 → 187 MB, ~192 KB per socket |
| `ws-ping.mjs` | 30 WS pings to production via CF and direct | p50 179 ms vs 366 ms |
| `<scratch>/mut/` | Server copy + repo test copy, 6 mutations | Only the control mutation failed the suite |

Reproduction note for F1: the attacker needs no victim. Two sockets from one process host and join their own room, both vote `sketch`, and whichever socket the engine made drawer starts sending `{kind:"draw", points:[...500 strings...]}`. Every limit in the code is respected: the frame is 15.5 KB (max 16 KB), the rate is 55/s (max 60/s), and the stroke count never reaches the 1000 cap.

### F1. One client can crash the whole server via Sketch strokes (CONFIRMED, Critical)

- Code: `server/sketch-engine.js:210-217` accepts any `points` array (only `slice(0, 500)`; elements are not checked) and any `color`, up to 1000 strokes per round. `server/index.js:1334-1339`: every `draw` action calls `broadcastGameState`. `server/index.js:1823-1826` serialises the **whole** stroke list separately for each player, and the 1 s draw timer does the same again (`index.js:1556-1558`). `broadcast`/`sendTo` (`index.js:1870-1881`) never look at `ws.bufferedAmount`, so nothing applies backpressure. `perMessageDeflate` (`index.js:660`) queues every uncompressed string until zlib catches up.
- Repro (scratchpad `probes/run-flood2.mjs`, `sketch-flood.mjs stroke`): a local server, a 2-player Bomber room as a bystander, and a 2-player Sketch room. The drawer sends `{kind:"draw", points: Array(500).fill("x"*28)}` (15.5 KB, under the 16 KB `maxPayload`) at 55 msg/s (under the 60/s rate limit).
  - After 5 s: the other Sketch player had received 553 MB, and the largest message was 4 MB. Server RSS: 99 → 171 → 494 → 709 MB.
  - At about 15.5 s of flooding (~810 strokes, so the 1000 cap is never reached): `FATAL ERROR: Ineffective mark-compacts near heap limit Allocation failed - JavaScript heap out of memory`, SIGABRT. The bystander Bomber room died too.
  - It reproduced on two runs (ports 9953, 9954). Event-loop lag stayed low (p99 ≤ 9 ms): this is a **memory** crash, not a CPU stall.
- Reachability: no victim room is needed. The attacker opens two sockets, hosts and joins their own room, both vote `sketch`, and whichever socket is the drawer floods. One crash drops every room on the single process. `uncaughtException` cannot catch a V8 OOM.
- Related, same root cause: wrong Sketch guesses are unbounded (`sketch-engine.js:225-253`; Emoji caps attempts, Sketch doesn't), and each one re-broadcasts the whole state. In `probes/sketch-flood.mjs guess`, one guesser at 55 msg/s × 200 chars made the other player receive **217 MB in 25 s** (states up to 315 KB each). The server survived that with 2 players, but it is a bandwidth DoS on phones and an egress cost.
- The client is also crash-prone on bad points: `SketchGame.jsx:47` reads `stroke.points[0].x`, so a `null` point throws in every viewer's render and trips the ErrorBoundary.
- Fix: validate strokes server-side (points must be `{x,y}` finite numbers inside the canvas, ≤ ~200 points, colour from a whitelist or `/^#[0-9a-f]{6}$/i`). Cap total points per round (e.g. 20k) and wrong guesses per player per round (e.g. 20). Better still: broadcast a stroke **delta** on `draw` and send the full list only on resume or a state resync. As defence in depth, skip or close sockets whose `bufferedAmount` exceeds a few MB, in `broadcast`/`sendTo`.

