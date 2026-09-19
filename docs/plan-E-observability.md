# Plan E — Logging & error monitoring (structured logs + Sentry)

**Status:** E1 shipped in v1.17.1 (2026-09-19). E2 (Sentry) and E3 (uptime monitor) pending. Written 2026-09-19 alongside v1.17.0.
**Why:** today nobody finds out when something breaks. Server errors go to `console.error` in Railway logs that nobody watches; a React crash shows "Something went wrong" to the player and is never reported; there is no count of rooms/players, so there is no way to tell "is anyone playing right now?" before a deploy (every deploy wipes live rooms). The v1.17.0 review found a bug (malformed message → socket wedged → player kicked 30s later) that was *invisible* in production for exactly this reason.

**Recommendation:** yes — but in two layers, cheapest first:
- **E1 (zero dependencies):** structured JSON logs + a richer `/health`. Most of the value, no new packages, no bundle cost.
- **E2 (Sentry, errors only):** frontend + server exception capture with email alerts, no tracing, no replay. Fits the free plan if guarded against error storms.
- **E3:** the free Sentry uptime monitor on `/health`.

---

## 1. Sentry free plan — does it fit?

Checked on 2026-09-19 (sentry.io/pricing, "Developer" plan): **1 user, unlimited projects, 5k errors/month, 5GB logs, 5M spans, 50 replays, 1 uptime monitor, 1 cron monitor, 30-day retention, email alerts only.**

The user's org is `nux-kb` (region `https://us.sentry.io`) with one existing project, `python`. **Quota is per organisation**, so a new `huddle-play-room` project shares the 5k errors/month with `python`.

### Pros
- **Frontend crashes become visible.** The React `ErrorBoundary` and uncaught browser errors (odd phones, old Safari) are currently silent. This is the biggest blind spot and the thing Sentry is best at.
- **Server errors arrive as grouped issues with email alerts** instead of scrolling past in Railway logs: `[gameAction]`, `[message]` (added in v1.17.0), `uncaughtException`, `unhandledRejection`, feedback/Linear failures.
- **Release tracking:** tag events with the `package.json` version → "this started in v1.17.0".
- **The Sentry MCP is already connected in Claude Code** → future sessions can query issues directly ("what broke since the last deploy?"). Strong fit for how this project is developed.
- Free uptime monitor for `/health` (E3) — pages you when the site is down.
- Solo developer → the 1-user limit doesn't matter.

### Cons / risks
- **New dependencies** (CLAUDE.md: minimal deps, discuss first). `@sentry/react` (browser) + `@sentry/node` (server). Current versions: 10.75.0.
- **Bundle size:** the browser SDK adds tens of KB gzipped to today's 73.8 KB JS bundle. Measure; lazy-load Sentry after first paint if it adds more than ~25 KB.
- **Shared 5k quota can be burned by one bug.** A bug firing inside a game loop (Snake ticks 8×/s) sends thousands of events in minutes and silences the `python` project for the rest of the month. **Must** add client-side throttling + dedupe (see E2) and check the project's spike protection / key rate limit settings.
- **Ad blockers** block `*.ingest.sentry.io` for a share of browser users (errors from them are lost) — acceptable, or add a small `tunnel` endpoint later.
- **CSP change:** `connect-src` must allow the Sentry ingest host.
- **Privacy:** player names and IPs are personal data. Use `sendDefaultPii: false`, don't attach names/room codes as user info, and enable "Prevent storing of IP addresses" in the project settings.
- **Server SDK weight:** `@sentry/node` v10 is OpenTelemetry-based and wants `node --import ./instrument.mjs` for auto-instrumentation. For **errors only** we don't need that: set `tracesSampleRate: 0` / no tracing and init at the top of `server/index.js`. Must verify there's no measurable effect on the Snake tick (see Verification). If there is, drop the server SDK and forward server errors via E1 logs only.
- Not a network monitor: Sentry won't tell you ping is bad. E1's event-loop-lag metric is the better signal for server-side jitter.

**Alternatives considered:** Railway's own logs (already there; fine for E1, but no alerts or grouping); Cloudflare Web Analytics (free, cookie-less, zone already on Cloudflare — useful for **SEO/traffic**, not errors; optional E4); self-hosted logging (too heavy for this project).

---

## 2. E1 — Structured logs + richer `/health` (no dependencies)

- `server/log.js`: `log(event, fields)` → one JSON line to stdout: `{"t":"…","lvl":"info","ev":"room_created","room":"SW5R","players":1}`. Railway's log explorer can filter JSON attributes.
- Events (keep it small; **never log inside the Snake/Bomber tick**):
  - `room_created`, `room_closed` (lifetime seconds, peak players, games played)
  - `player_joined` / `player_left` (room, status/game, close code — distinguishes heartbeat kicks from normal closes)
  - `game_started` / `game_ended` (game, rounds, duration)
  - `heartbeat_terminate` (a socket that stopped answering pings — the "silent disconnect" count)
  - `message_error`, `game_action_error`, `uncaught_exception`, `unhandled_rejection` (replace the current `console.error` calls)
  - `feedback_submitted` / `feedback_capped` / `feedback_rate_limited`
- No player names in logs (room code + player id only).
- `/health` gains live gauges: `rooms`, `players`, `sockets`, `rssMB`, and **`eventLoopLagMs` (p50/p99 over the last minute)** via `perf_hooks.monitorEventLoopDelay()` (built in, negligible cost). Event-loop lag is the server-side cause of tick jitter, so it is the best cheap "is the game server healthy" number.
- Use `/health`'s `rooms`/`players` before deploying: deploy when it reads 0 (every deploy wipes live rooms).

**As built (v1.17.1), with deviations from the sketch above:**
- Lines use Railway's documented structured-log schema: `message` is the event name and `level` is the severity, not `ev`/`lvl`. Railway only uses `message` as the line text and only reads `level` for severity. There's no `t` field because Railway timestamps every line. Filter with `@level:error`, `@room:SW5R`, or search the event name.
- Error and abuse events (`message_error`, `game_action_error`, `uncaught_exception`, `unhandled_rejection`, `feedback_*` except `feedback_submitted`) go through `createLimitedLog`: at most 10 lines per event per minute, and the next window's first line carries a `suppressed` count. This stops a flood or a throwing timer from pushing Railway past 500 lines/s, which would drop the lines that matter.
- Extra events beyond the list above: `server_started` (version, region, node) and `server_shutdown` (rooms/players/sockets at SIGTERM, i.e. how many players a deploy kicked), `feedback_spam` (honeypot / too_fast), `feedback_screenshot_failed`, `feedback_error`.
- `eventLoopLagMs` is `{p50, p99, max}` in ms. The histogram (20 ms resolution) records the whole sampling interval, so the resolution is subtracted. It reports the last completed minute, or everything since boot during the first minute.
- Tests: `test/engines/log.test.js`, `test/integration/health-gauges.test.js` (port 9900) and `test/integration/lifecycle-logs.test.js` (port 9901). The lifecycle test fails if the Snake or Bomber loop writes any line, or if a player name reaches stdout. Both guards were mutation-checked.
- Latency guard (§6), measured locally on 2026-09-19. 2-bot Snake, 60 s per run, 992 frame gaps per run, baseline v1.17.0 vs E1, interleaved: gap mean 120.84–120.87 ms and p99 122.64–122.89 ms on both sides. Loop-lag p99 was 1.63–1.74 ms on both sides. The server wrote 0 lines during the steady window.

Tests: extend `health-endpoint.test.js` (fields present and numeric; `rooms` goes 0 → 1 after a host); a unit test for `log()` output shape. Keep existing `/health` fields unchanged (`ok`, `version`, `region`, `uptime`) — `scripts/verify-deploy.js` and the Railway healthcheck rely on the path returning 200.

## 3. E2 — Sentry, errors only

**Setup (user does the account part):** in Sentry org `nux-kb` create project `huddle-play-room` (platform: React); copy the DSN. Server can use the same DSN or a second `huddle-play-room-server` project (both share the org quota). Add `SENTRY_DSN` to Railway variables. The browser DSN is public by design (it goes in the bundle) — inject at build time via `VITE_SENTRY_DSN`.

**Frontend (`src/main.jsx`):**
- `Sentry.init({ dsn, release: version, environment, sendDefaultPii: false, tracesSampleRate: 0, replaysSessionSampleRate: 0, replaysOnErrorSampleRate: 0 })`.
- Report from the existing `ErrorBoundary` (`componentDidCatch` → `Sentry.captureException`), keep the current fallback UI.
- `beforeSend`: drop events when `window.location.hostname` isn't the canonical domain (no dev noise); **throttle to max ~10 events per page load and dedupe identical messages** (protects the shared quota).
- CSP: add the ingest origin to `connect-src` in `applySecurityHeaders`.
- Measure the bundle before/after (`npm run build` output). Lazy-load via dynamic `import()` after first render if the increase is large.

**Server (`server/index.js`, top of file or `server/instrument.js`):**
- `Sentry.init({ dsn: process.env.SENTRY_DSN, release: APP_VERSION, tracesSampleRate: 0, sendDefaultPii: false })`; no-op when `SENTRY_DSN` is unset (tests, local dev).
- `captureException` in: the `handleMessage` catch, `handleGameAction` catch, `uncaughtException`, `unhandledRejection`, feedback 5xx path.
- A simple per-process rate limiter around capture (e.g. max 30 events/hour, identical-message dedupe for 10 minutes) — a bug inside a timer must not burn the monthly quota.
- Check the Railway start command (it currently isn't visible in the service config; CLAUDE.md says `node server/index.js`). Errors-only doesn't need `--import`.

**Sentry project settings:** "Prevent storing of IP addresses" on; data scrubbing defaults on; alert rule: email on new issue + on a regression; check spike protection and set a client key rate limit if the plan offers it.

## 4. E3 — Uptime monitor
Sentry free includes **1 uptime monitor** — check whether the `python` project already uses it. Point it at `https://huddleplayroom.com/health` (expects 200 + `"ok":true`), 5-minute interval, email alert. If the slot is taken, Cloudflare Health Checks need a paid plan; UptimeRobot's free tier is the fallback.

## 5. Optional E4 — Cloudflare Web Analytics (SEO/traffic)
Free, cookie-less page-view analytics for a Cloudflare-proxied site. Useful to see whether the v1.17.0 SEO changes bring visitors. Requires CSP: `script-src https://static.cloudflareinsights.com` and `connect-src https://cloudflareinsights.com`. Enable in the Cloudflare dashboard (Analytics & Logs → Web Analytics) — do it only if the user wants traffic numbers.

---

## 6. Verification
- `npm run test:all` green; new E1 tests red → green.
- Throw a deliberate test error on a preview deploy or locally with a real DSN → the issue appears in Sentry with the release tag, **no player names, no IP**.
- **Latency guard (server SDK):** run a 2-player Snake game locally for 60s and record the gaps between `state` frames on a client, with and without Sentry initialised. Mean ≈ 120ms and p99 must not change. Also compare `/health` `eventLoopLagMs`. Re-measure live WS RTT after deploy (2026-09-19 baseline: median ~177ms via Cloudflare from the user's machine).
- Check the Sentry usage page after a week; if error volume is above ~100/week, find out why before trusting the quota.

## 7. Rollout order
1. E1 (logs + `/health` gauges) → patch/minor release, deploy.
2. E3 uptime monitor (no code).
3. E2 frontend Sentry → release. Watch quota for a week.
4. E2 server Sentry → release, after the latency guard passes.

## 8. Kickoff prompt for the new session
> Read `docs/plan-E-observability.md` and CLAUDE.md. Implement E1 first, test-first (structured `log()` helper, lifecycle events, `/health` gauges with event-loop lag), never logging inside game tick loops. Then pause and ask me for the Sentry DSN before E2. For E2 use errors-only Sentry (no tracing/replay), with the quota guards in §3, and run the latency guard in §6 before shipping the server part. Bump the version per CLAUDE.md and push to `personal` only.
