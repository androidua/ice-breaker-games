import { createServer } from "http";
import { readFile, readFileSync, existsSync } from "fs";
import { join, extname, resolve, sep } from "path";
import { fileURLToPath } from "url";
import { gzip } from "zlib";
import { monitorEventLoopDelay } from "perf_hooks";
import { randomUUID } from "crypto";
import { WebSocketServer } from "ws";
import { log, logLimited, logLifecycle, errorFields } from "./log.js";
import { parseDsn, inspectEnvelope, createDailyCap, createIpLimiter } from "./sentry-tunnel.js";
import { initServerSentry, captureError } from "./sentry.js";
import { createGameState, setSnakeDirection, stepGame } from "./engine.js";
import { createVotingState, submitVote, tickVoting, allVotesIn, resolveVoting, serializeVoting } from "./voting-engine.js";
import { createTruthsState, handleTruthsAction, allTruthsVotesIn, revealTruths, nextTruthsRound, tickTruths, serializeTruths } from "./truths-engine.js";
import { createEmojiState, handleEmojiAction, allEmojiGuessersCorrect, allEmojiGuessersExhausted, tickEmoji, revealEmoji, nextEmojiRound, serializeEmoji } from "./emoji-engine.js";
import { createSketchState, handleSketchAction, tickSketch, revealSketch, nextSketchRound, serializeSketch } from "./sketch-engine.js";
import { createTriviaState, handleTriviaAction, allAnswered, revealTrivia, nextTriviaQuestion, nextTriviaRound, tickTrivia, serializeTrivia } from "./trivia-engine.js";
import { createTyperacerState, handleTyperacerAction, allTyperacerFinished, revealTyperacer, nextTyperacerRound, tickTyperacer, serializeTyperacer } from "./typeracer-engine.js";
import { createWordChainState, handleWordChainAction, eliminateCurrentPlayer, removeWordChainPlayer, nextWordChainRound, tickWordChain, serializeWordChain } from "./wordchain-engine.js";
import { createBomberState, handleBomberAction, applyImmediateMove, stepBomber, tickBomberTimer, nextBomberRound, serializeBomber, TICK_MS as BOMBER_TICK_MS } from "./bomber-engine.js";
import { createHotTakeState, handleHotTakeAction, allHotTakeVotesIn, revealHotTake, nextHotTakeRound, tickHotTake, serializeHotTake } from "./hottake-engine.js";
import { topWinners } from "./scoring.js";
import { guardedTick } from "./room-loop.js";
import { createClientIp } from "./client-ip.js";

const PORT = Number(process.env.PORT || process.env.SNAKE_WS_PORT || 3000);
const SNAKE_TICK_MS = 120;
const ROWS = 30;
const COLS = 30;
const MAX_PLAYERS = 8;
// Global room cap so one client (or a botnet of sockets) can't grow the rooms
// Map without bound. Env-overridable so tests can exercise the limit cheaply.
const MAX_ROOMS = Number(process.env.MAX_ROOMS || 500);
// Plan D: how long a dropped player's seat is held for a resume. 0 removes them
// at once (the pre-Plan D behaviour, and the test harness default).
const RESUME_GRACE_MS = Number(process.env.RESUME_GRACE_MS || 45000);
const COLORS = [
  "#2a2a2a", // dark charcoal
  "#3d5a80", // steel blue
  "#8d5a3a", // warm brown
  "#5a7d3a", // olive green
  "#7a3d80", // purple
  "#3a7d7d", // teal
  "#c07a30", // amber orange  (player 7)
  "#b03060", // magenta       (player 8)
];

// ── Static file server ───────────────────────────────────────────

const __dirname = fileURLToPath(new URL(".", import.meta.url));
// DIST_DIR is env-overridable so tests can serve a fixture without a build.
const DIST_DIR = process.env.DIST_DIR ? resolve(process.env.DIST_DIR) : join(__dirname, "..", "dist");
const HAS_DIST = existsSync(join(DIST_DIR, "index.html"));

// Read once at startup for the /health diagnostic endpoint.
const APP_VERSION = JSON.parse(
  readFileSync(join(__dirname, "..", "package.json"), "utf8")
).version;

// Errors-only server Sentry (Plan E2 part 2); off unless SENTRY_DSN is set.
// Non-blocking: errors in the first moments before it loads are only logged.
initServerSentry({
  dsn: process.env.SENTRY_DSN,
  release: `huddle-play-room@${APP_VERSION}`,
  environment: process.env.RAILWAY_ENVIRONMENT_NAME || "development",
  maxPerDay: Number(process.env.SENTRY_SERVER_DAILY_MAX || 50),
})
  .then((on) => { if (on) log("sentry_enabled", { release: `huddle-play-room@${APP_VERSION}` }); })
  .catch((err) => logLimited("sentry_init_failed", errorFields(err), "error"));

// ── Event-loop lag (for /health) ─────────────────────────────────
// A stalled event loop is the server-side cause of tick jitter. Sampling runs on
// a native libuv timer (no JS per sample). The histogram records each whole
// sampling interval, so the resolution is subtracted to leave only the delay.
// /health reports the last completed minute (or everything since boot, before
// the first minute has passed).
const LAG_RESOLUTION_MS = 20;
const loopDelay = monitorEventLoopDelay({ resolution: LAG_RESOLUTION_MS });
loopDelay.enable();
let lastLagWindow = null;

function readLoopLag() {
  if (loopDelay.count === 0) return { p50: 0, p99: 0, max: 0 };
  const lagMs = (ns) => Math.max(0, Math.round((ns / 1e6 - LAG_RESOLUTION_MS) * 10) / 10);
  return {
    p50: lagMs(loopDelay.percentile(50)),
    p99: lagMs(loopDelay.percentile(99)),
    max: lagMs(loopDelay.max),
  };
}

setInterval(() => {
  lastLagWindow = readLoopLag();
  loopDelay.reset();
}, 60 * 1000).unref();

const MIME_TYPES = {
  ".html": "text/html", ".js": "application/javascript", ".css": "text/css",
  ".json": "application/json", ".png": "image/png", ".jpg": "image/jpeg",
  ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".woff": "font/woff", ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8", ".xml": "application/xml",
  ".webmanifest": "application/manifest+json",
  ".map": "application/json", // public source maps, fetched by Sentry
};

const CANONICAL_HOST = "huddleplayroom.com";
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

// "example.com:8080" -> "example.com", "[::1]:8080" -> "::1". Splitting on the
// first colon turns an IPv6 literal into "[", which then looks like a foreign
// host and gets redirected to the canonical domain.
function hostnameOf(hostHeader) {
  const host = (hostHeader || "").trim();
  if (host.startsWith("[")) return host.slice(1, host.indexOf("]") === -1 ? undefined : host.indexOf("]"));
  return host.split(":")[0];
}

// Only Vite's content-hashed /assets/* files may be cached as immutable. Other
// static files (favicon, icons, share image) keep stable names, so they get a
// day-long cache instead — a changed logo would otherwise stay stale for a year.
const CACHEABLE_EXTS = new Set([".js", ".css", ".woff", ".woff2", ".png", ".jpg", ".svg", ".ico"]);

// Extensions whose content compresses well (text-based).
const COMPRESSIBLE_EXTS = new Set([".html", ".js", ".css", ".json", ".svg", ".txt", ".xml", ".webmanifest", ".map"]);

// ── Feedback rate limiting ──────────────────────────────────────
const feedbackLimits = new Map(); // ip -> { count, resetAt }
const FEEDBACK_MAX = 3;
const FEEDBACK_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

function isFeedbackRateLimited(ip) {
  const now = Date.now();
  const entry = feedbackLimits.get(ip);
  if (!entry || now > entry.resetAt) {
    feedbackLimits.set(ip, { count: 1, resetAt: now + FEEDBACK_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > FEEDBACK_MAX;
}

// Expired entries are only overwritten when the same IP posts again, so
// without a sweep the map grows by one entry per unique IP, forever.
setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of feedbackLimits) {
    if (now > entry.resetAt) feedbackLimits.delete(ip);
  }
}, FEEDBACK_WINDOW_MS);

// Global backstop on real Linear issue creation, independent of client IP, so
// no amount of IP rotation can flood the tracker. Env-overridable for tests.
const FEEDBACK_GLOBAL_MAX = Number(process.env.FEEDBACK_GLOBAL_MAX || 20);
const FEEDBACK_GLOBAL_WINDOW_MS = 60 * 60 * 1000; // 1 hour
let feedbackGlobal = { count: 0, resetAt: 0 };

function isFeedbackGloballyCapped() {
  const now = Date.now();
  if (now > feedbackGlobal.resetAt) {
    feedbackGlobal = { count: 0, resetAt: now + FEEDBACK_GLOBAL_WINDOW_MS };
  }
  feedbackGlobal.count++;
  return feedbackGlobal.count > FEEDBACK_GLOBAL_MAX;
}

// Client identity for the per-IP limits; see server/client-ip.js. Unset
// TRUSTED_PROXY_SECRET keeps the previous behaviour.
const getClientIp = createClientIp({
  secret: process.env.TRUSTED_PROXY_SECRET,
  header: process.env.TRUSTED_PROXY_HEADER,
});

// CORS is only needed in dev (Vite on :5173 posts to the server on :3000);
// production requests are same-origin. Never answer arbitrary sites.
function allowedCorsOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return null;
  if (origin === `https://${CANONICAL_HOST}`) return origin;
  try {
    return LOCAL_HOSTS.has(new URL(origin).hostname) ? origin : null;
  } catch {
    return null;
  }
}

// Linear API config
const LINEAR_API_KEY = process.env.LINEAR_API_KEY || "";
// Overridable so tests can point at a local stub instead of the real API.
const LINEAR_API_URL = process.env.LINEAR_API_URL || "https://api.linear.app/graphql";
const LINEAR_TEAM_ID = "82c6c2fb-00ab-4cc2-8bae-720d29295836";
const LINEAR_PROJECT_ID = "869ddd27-1864-4461-a9d4-b14f12eb367a";
const LINEAR_BACKLOG_STATE_ID = "da26d051-a623-493c-981c-32dab9139d2d";
const LINEAR_LABELS = {
  bug: "f40a5504-e74e-4c7d-8baa-436edf5e44d8",
  feature: "d9dc4752-1524-4dd1-bfc6-352073cded9d",
  other: "5cf99f15-350b-48b8-a81c-dd4ba0f14a36",
};
const LINEAR_PRIORITIES = { bug: 2, feature: 3, other: 4 };
const TYPE_DISPLAY = { bug: "Bug", feature: "Feature", other: "Other" };

// ── Sentry tunnel (Plan E2) ─────────────────────────────────────
// The browser SDK sends error envelopes to POST /api/sentry instead of Sentry.
// Forwarding them from here puts one counter in front of every browser: the
// free Sentry plan has no per-key rate limits, and its 5k errors/month is
// shared with another project in the org. Only our own DSN and only error
// events pass; the client's IP is never forwarded. Off when the DSN is unset.
const sentryTarget = parseDsn(process.env.VITE_SENTRY_DSN || "");
const sentryDailyCap = createDailyCap({ max: Number(process.env.SENTRY_TUNNEL_DAILY_MAX || 50) });
const sentryIpLimiter = createIpLimiter({ max: 10, windowMs: 60 * 60 * 1000 });
const SENTRY_MAX_BODY = 256 * 1024;
setInterval(() => sentryIpLimiter.sweep(), 10 * 60 * 1000).unref();

function sameDsn(a, b) {
  return a.host === b.host && a.projectId === b.projectId && a.publicKey === b.publicKey;
}

function handleSentryTunnel(req, res) {
  const reply = (status, headers = {}) => {
    res.writeHead(status, headers);
    res.end();
  };
  if (!sentryTarget) return reply(404);
  if (sentryIpLimiter.hit(getClientIp(req))) return reply(429, { "Retry-After": "3600" });

  readRawBody(req, SENTRY_MAX_BODY)
    .then(async (body) => {
      const envelope = inspectEnvelope(body);
      const dsn = envelope && parseDsn(envelope.dsn);
      if (!dsn || !sameDsn(dsn, sentryTarget)) return reply(400);
      // Errors only: sessions, client reports, traces and replays are dropped.
      if (envelope.types.length === 0 || !envelope.types.every((t) => t === "event")) return reply(200);
      if (!sentryDailyCap.take()) {
        logLimited("sentry_tunnel_capped", {}, "warn");
        return reply(429, { "Retry-After": String(sentryDailyCap.retryAfterSec()) });
      }
      const { protocol, host, projectId } = sentryTarget;
      const started = Date.now();
      let upstream;
      try {
        upstream = await fetch(`${protocol}//${host}/api/${projectId}/envelope/`, {
          method: "POST",
          headers: { "Content-Type": "application/x-sentry-envelope" },
          body,
          signal: AbortSignal.timeout(5000),
        });
      } catch (err) {
        // ms tells a fast refusal/unreachable apart from a timeout.
        logLimited("sentry_tunnel_error", { ms: Date.now() - started, ...errorFields(err) }, "error");
        return reply(502);
      }
      log("sentry_event_forwarded", { status: upstream.status }); // bounded by the daily cap
      const retryAfter = upstream.headers.get("retry-after");
      reply(upstream.status, retryAfter ? { "Retry-After": retryAfter } : {});
    })
    .catch((err) => {
      if (err.status === 413) return reply(413);
      logLimited("sentry_tunnel_error", errorFields(err), "error");
      reply(502);
    });
}

// Buffers up to maxBytes. A larger body is drained (not buffered) so the client
// still gets a clean 413, up to a hard stop that drops the connection.
function readRawBody(req, maxBytes, hardMaxBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const tooLarge = () => Object.assign(new Error("Body too large"), { status: 413 });
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > hardMaxBytes) {
        req.destroy();
        reject(tooLarge());
      } else if (size <= maxBytes) {
        chunks.push(chunk);
      }
    });
    req.on("end", () => (size > maxBytes ? reject(tooLarge()) : resolve(Buffer.concat(chunks))));
    req.on("error", reject);
  });
}

// A screenshot is capped at 2.7 MB of base64, so 3.5 MB covers a valid post.
const FEEDBACK_MAX_BODY = 3.5 * 1024 * 1024;

function readJsonBody(req, maxBytes = FEEDBACK_MAX_BODY) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        req.destroy();
        reject(Object.assign(new Error("Body too large"), { status: 413 }));
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        // A client error: a 400, never reported to Sentry as a server error.
        reject(Object.assign(new Error("Invalid JSON"), { status: 400 }));
      }
    });
    req.on("error", reject);
  });
}

async function uploadScreenshotToLinear(screenshot) {
  // Parse the data URL: "data:<mime>;base64,<data>"
  const match = screenshot.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
  if (!match) return null;
  const [, contentType, b64] = match;
  const buffer = Buffer.from(b64, "base64");
  const ext = contentType === "image/jpeg" ? "jpg" : contentType === "image/png" ? "png" : "webp";
  const filename = `screenshot.${ext}`;

  // Step 1 — ask Linear for a presigned S3 upload URL
  const uploadMutation = `mutation FileUpload($contentType: String!, $filename: String!, $size: Int!) {
    fileUpload(contentType: $contentType, filename: $filename, size: $size) {
      uploadFile {
        uploadUrl
        assetUrl
        headers { key value }
      }
    }
  }`;

  const uploadResp = await fetch(LINEAR_API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: LINEAR_API_KEY },
    body: JSON.stringify({
      query: uploadMutation,
      variables: { contentType, filename, size: buffer.length },
    }),
  });
  const uploadResult = await uploadResp.json();
  if (uploadResult.errors || !uploadResult.data?.fileUpload?.uploadFile) {
    logLimited("feedback_screenshot_failed", { stage: "fileUpload", err: uploadResult.errors?.[0]?.message }, "warn");
    return null;
  }

  const { uploadUrl, assetUrl, headers: rawHeaders } = uploadResult.data.fileUpload.uploadFile;

  // Step 2 — PUT the raw bytes directly to S3 using the presigned URL
  const s3Headers = { "Content-Type": contentType };
  for (const { key, value } of rawHeaders) s3Headers[key] = value;

  const s3Resp = await fetch(uploadUrl, { method: "PUT", headers: s3Headers, body: buffer });
  if (!s3Resp.ok) {
    logLimited("feedback_screenshot_failed", { stage: "s3", status: s3Resp.status }, "warn");
    return null;
  }

  return assetUrl;
}

async function createLinearIssue({ type, name, subject, description, email, screenshot }) {
  const typeLabel = TYPE_DISPLAY[type];
  const title = `[${typeLabel}] ${subject}`;

  // Upload screenshot first so we can embed inline
  let screenshotMarkdown = "";
  if (screenshot) {
    try {
      const assetUrl = await uploadScreenshotToLinear(screenshot);
      if (assetUrl) screenshotMarkdown = `\n\n## Screenshot\n\n![Screenshot](${assetUrl})`;
    } catch (err) {
      logLimited("feedback_screenshot_failed", { stage: "upload", ...errorFields(err) }, "warn");
    }
  }

  const body = [
    "## Description\n",
    description,
    "\n---\n",
    `**Submitted by:** ${name}`,
    `**Email:** ${email || "Not provided"}`,
    `**Type:** ${typeLabel}`,
    screenshotMarkdown,
  ].filter(Boolean).join("\n");

  const mutation = `mutation CreateIssue($input: IssueCreateInput!) {
    issueCreate(input: $input) {
      success
      issue { id identifier url }
    }
  }`;

  const variables = {
    input: {
      teamId: LINEAR_TEAM_ID,
      projectId: LINEAR_PROJECT_ID,
      stateId: LINEAR_BACKLOG_STATE_ID,
      title,
      description: body,
      priority: LINEAR_PRIORITIES[type],
      labelIds: [LINEAR_LABELS[type]],
    },
  };

  const resp = await fetch(LINEAR_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: LINEAR_API_KEY,
    },
    body: JSON.stringify({ query: mutation, variables }),
  });

  if (!resp.ok) throw new Error(`Linear API returned ${resp.status}`);
  const result = await resp.json();
  if (result.errors) throw new Error(result.errors[0].message);
  if (!result.data.issueCreate.success) throw new Error("Linear issue creation failed.");

  return result.data.issueCreate.issue;
}

function applySecurityHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  // Cloudflare injects its Web Analytics beacon at the edge; it loads from
  // static.cloudflareinsights.com and reports to cloudflareinsights.com.
  res.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self' https://static.cloudflareinsights.com; style-src 'self' 'unsafe-inline'; connect-src 'self' wss://huddleplayroom.com ws://localhost:* https://cloudflareinsights.com; img-src 'self' data:");
}

function sendCompressed(req, res, statusCode, contentType, ext, data) {
  const acceptsGzip = (req.headers["accept-encoding"] || "").includes("gzip");
  if (acceptsGzip && COMPRESSIBLE_EXTS.has(ext)) {
    gzip(data, (err, compressed) => {
      if (err) {
        res.writeHead(statusCode, { "Content-Type": contentType });
        res.end(data);
      } else {
        res.setHeader("Content-Encoding", "gzip");
        res.setHeader("Vary", "Accept-Encoding");
        res.writeHead(statusCode, { "Content-Type": contentType });
        res.end(compressed);
      }
    });
  } else {
    res.writeHead(statusCode, { "Content-Type": contentType });
    res.end(data);
  }
}

const httpServer = createServer((req, res) => {
  applySecurityHeaders(res);
  const urlPath = (req.url || "/").split("?")[0];

  // Test-only view of the maps that must return to zero when everyone leaves.
  // Off in production: nothing sets DEBUG_INTERNALS there.
  if (process.env.DEBUG_INTERNALS === "1" && urlPath === "/__internals") {
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify({
      rooms: rooms.size,
      sessions: sessions.size,
      socketToPlayer: socketToPlayer.size,
      rateLimits: rateLimits.size,
      timers: process.getActiveResourcesInfo().filter((r) => r === "Timeout").length,
      graceTimers: [...rooms.values()].reduce((n, room) =>
        n + [...room.players.values()].filter((p) => p.graceTimer).length, 0),
      loops: [...rooms.values()].filter((room) => room.interval).length,
    }));
    return;
  }

  // ── Health / region diagnostics ─────────────────────────────────
  // Plain-curl proof of which build and Railway region is live. region is null
  // off Railway (RAILWAY_REPLICA_REGION is injected only on the platform).
  // Answered before the canonical-host redirect: Railway's healthcheck probe
  // sends its own Host header and must get a 200, not a 301.
  // The live gauges answer "is anyone playing?" before a deploy (a deploy wipes
  // every in-memory room) and "is the loop healthy?" via event-loop lag.
  if (req.method === "GET" && (urlPath === "/health" || urlPath === "/api/health")) {
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify({
      ok: true,
      version: APP_VERSION,
      region: process.env.RAILWAY_REPLICA_REGION || null,
      uptime: Math.floor(process.uptime()),
      rooms: rooms.size,
      players: countPlayers(),
      sockets: wss.clients.size,
      rssMB: Math.round(process.memoryUsage.rss() / (1024 * 1024)),
      // null when TRUSTED_PROXY_SECRET isn't set; otherwise whether *this*
      // request carried the edge's secret. One curl says whether the Cloudflare
      // transform rule is really reaching the origin.
      proxied: getClientIp.configured ? getClientIp.trusted(req) : null,
      eventLoopLagMs: lastLagWindow || readLoopLag(),
    }));
    return;
  }

  const host = hostnameOf(req.headers.host);
  if (host && host !== CANONICAL_HOST && !LOCAL_HOSTS.has(host)) {
    res.writeHead(301, { Location: `https://${CANONICAL_HOST}${req.url}` });
    res.end();
    return;
  }

  // CORS preflight for /api/feedback (dev mode: frontend on :5173, server on :3000)
  if (req.method === "OPTIONS" && urlPath === "/api/feedback") {
    const corsOrigin = allowedCorsOrigin(req);
    res.writeHead(204, corsOrigin ? {
      "Access-Control-Allow-Origin": corsOrigin,
      "Access-Control-Allow-Methods": "POST",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    } : { "Vary": "Origin" });
    res.end();
    return;
  }

  // ── Feedback API ────────────────────────────────────────────────
  if (req.method === "POST" && urlPath === "/api/feedback") {
    const corsOrigin = allowedCorsOrigin(req);
    if (corsOrigin) res.setHeader("Access-Control-Allow-Origin", corsOrigin);
    res.setHeader("Vary", "Origin");

    if (!LINEAR_API_KEY) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Feedback is temporarily unavailable." }));
      return;
    }

    // Content-Length is a hint, but an honest client saves us buffering 4 MB
    // before finding out. readJsonBody still enforces the real limit.
    const declared = Number(req.headers["content-length"] || 0);
    if (declared > FEEDBACK_MAX_BODY) {
      res.writeHead(413, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Request too large." }));
      return;
    }

    const ip = getClientIp(req);
    if (isFeedbackRateLimited(ip)) {
      logLimited("feedback_rate_limited", {}, "warn"); // never the IP: it's personal data
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Too many submissions. Please try again later." }));
      return;
    }

    readJsonBody(req, FEEDBACK_MAX_BODY)
      .then((data) => {
        if (!data || typeof data !== "object") {
          throw Object.assign(new Error("Invalid request."), { status: 400 });
        }
        // ── Spam checks (silent fake-success so bots think they won) ──
        if (data.website) {
          logLimited("feedback_spam", { reason: "honeypot" });
          return "__honeypot__";
        }
        const formAge = Date.now() - (data.openedAt || 0);
        if (!data.openedAt || formAge < 3000) {
          logLimited("feedback_spam", { reason: "too_fast" });
          return "__too_fast__";
        }

        const { type, name, subject, description, email, screenshot } = data;
        if (!["bug", "feature", "other"].includes(type)) {
          throw Object.assign(new Error("Invalid type."), { status: 400 });
        }
        if (!name || typeof name !== "string" || name.trim().length === 0 || name.length > 50) {
          throw Object.assign(new Error("Name is required (max 50 chars)."), { status: 400 });
        }
        if (!subject || typeof subject !== "string" || subject.trim().length === 0 || subject.length > 100) {
          throw Object.assign(new Error("Subject is required (max 100 chars)."), { status: 400 });
        }
        if (!description || typeof description !== "string" || description.trim().length === 0 || description.length > 2000) {
          throw Object.assign(new Error("Description is required (max 2000 chars)."), { status: 400 });
        }
        if (email && (typeof email !== "string" || email.length > 100)) {
          throw Object.assign(new Error("Email must be under 100 chars."), { status: 400 });
        }
        if (screenshot && (typeof screenshot !== "string" || screenshot.length > 2.7 * 1024 * 1024)) {
          throw Object.assign(new Error("Screenshot must be under 2MB."), { status: 400 });
        }
        if (isFeedbackGloballyCapped()) {
          throw Object.assign(new Error("Feedback is busy right now. Please try again later."), { status: 429 });
        }

        return createLinearIssue({
          type,
          name: name.trim(),
          subject: subject.trim(),
          description: description.trim(),
          email: email?.trim() || "",
          screenshot: screenshot || null,
        }).then((issue) => {
          log("feedback_submitted", { type, issue: issue?.identifier });
          return issue;
        });
      })
      .then(() => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true }));
      })
      .catch((err) => {
        const status = err.status || 500;
        const message = status < 500 ? err.message : "Something went wrong.";
        if (status >= 500) {
          logLimited("feedback_error", { status, ...errorFields(err) }, "error");
          captureError(err, { where: "feedback" });
        }
        else if (status === 429) logLimited("feedback_capped", {}, "warn");
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: message }));
      });
    return;
  }

  if (req.method === "POST" && urlPath === "/api/sentry") {
    handleSentryTunnel(req, res);
    return;
  }

  if (!HAS_DIST) {
    res.writeHead(200, { "Content-Type": "text/html" });
    res.end("<html><body><h2>Game server is running.</h2><p>Run <code>npm run build</code> first, or use <code>npm run dev</code> for development.</p></body></html>");
    return;
  }
  const filePath = resolve(join(DIST_DIR, urlPath === "/" ? "index.html" : urlPath));
  if (filePath !== DIST_DIR && !filePath.startsWith(DIST_DIR + sep)) {
    res.writeHead(400);
    res.end("Bad request");
    return;
  }
  const ext = extname(filePath);
  readFile(filePath, (err, data) => {
    if (!err) {
      if (urlPath.startsWith("/assets/")) {
        res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
      } else if (CACHEABLE_EXTS.has(ext)) {
        res.setHeader("Cache-Control", "public, max-age=86400");
      } else {
        res.setHeader("Cache-Control", "no-cache");
      }
      sendCompressed(req, res, 200, MIME_TYPES[ext] || "application/octet-stream", ext, data);
      return;
    }
    res.setHeader("Cache-Control", "no-cache");
    // A missing hashed asset (e.g. a stale tab after a deploy) must 404, not get
    // index.html back as "JavaScript".
    if (urlPath.startsWith("/assets/")) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }
    // SPA fallback — serve index.html for unmatched routes
    readFile(join(DIST_DIR, "index.html"), (err2, html) => {
      if (!err2) {
        sendCompressed(req, res, 200, "text/html", ".html", html);
      } else {
        res.writeHead(404);
        res.end("Not found");
      }
    });
  });
});

const rooms = new Map();
let nextClientId = 1;

// Plan D identity. Each socket gets a connection id (clientId, also the rate
// limit key). It is also the player id of whatever seat that socket takes, until
// a new socket resumes the seat and from then on acts as the old player id.
const socketToPlayer = new Map(); // clientId -> playerId, for resumed sockets only
const sessions = new Map(); // resumeToken -> { playerId, roomCode }, while the seat exists

function playerIdFor(clientId) {
  return socketToPlayer.get(clientId) ?? clientId;
}

// ── Rate limiting ────────────────────────────────────────────────
// Simple 1-second sliding window per client. Allows burst play actions
// (Snake direction changes, Bomber moves) while blocking floods.
const rateLimits = new Map(); // clientId -> { count, resetAt }

function isRateLimited(clientId) {
  const now = Date.now();
  let limit = rateLimits.get(clientId);
  if (!limit || now > limit.resetAt) {
    limit = { count: 0, resetAt: now + 1000 };
    rateLimits.set(clientId, limit);
  }
  limit.count++;
  return limit.count > 60; // 60 messages/sec is generous for legit play
}

const wss = new WebSocketServer({
  server: httpServer,
  maxPayload: 16 * 1024, // 16 KB — no legitimate game message is larger
  perMessageDeflate: {
    zlibDeflateOptions: { level: 1 }, // fastest compression — server CPU is the budget, not bytes
    threshold: 128, // skip compression for tiny messages (ping/pong, small actions)
  },
  verifyClient: ({ origin }) => {
    if (!origin) return true; // server-to-server, health checks
    if (origin === `https://${CANONICAL_HOST}`) return true;
    // Parse and compare the hostname exactly — a substring check would let
    // e.g. https://localhost.evil.com through.
    try {
      const { hostname } = new URL(origin);
      return hostname === "localhost" || hostname === "127.0.0.1";
    } catch {
      return false; // malformed Origin header
    }
  },
});

// Send a WebSocket ping to every connected client every 25 seconds.
// This prevents Cloudflare Tunnel (and other proxies) from treating the
// connection as idle and silently closing it. If a client doesn't respond
// with a pong within one interval, it is terminated and cleaned up.
setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      // The "silent disconnect": a socket that stopped answering pings.
      logLifecycle("heartbeat_terminate", { player: ws.clientId });
      ws.terminate();
      return;
    }
    ws.isAlive = false;
    ws.ping();
  });
}, 15000);

wss.on("connection", (ws) => {
  ws.isAlive = true;
  ws.on("pong", () => { ws.isAlive = true; });

  const clientId = `p${nextClientId++}`;
  ws.clientId = clientId; // lets the heartbeat log which player it dropped
  // Secret proof that this socket owns the seat it takes, for a later resume.
  // Only its owner ever sees it: never in room/state/vote_state or the logs.
  ws.resumeToken = randomUUID();
  ws.send(JSON.stringify({ type: "welcome", id: clientId, resumeToken: ws.resumeToken }));

  ws.on("message", (raw) => {
    if (ws.replaced) return; // its seat was resumed on a newer socket; ignore stragglers
    if (isRateLimited(clientId)) return; // silently drop; don't reward flood with a response
    let message;
    try {
      message = JSON.parse(raw.toString());
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "Invalid JSON." }));
      return;
    }
    if (!message || typeof message !== "object" || Array.isArray(message)) {
      ws.send(JSON.stringify({ type: "error", message: "Invalid message." }));
      return;
    }
    // A throw escaping this listener lands inside the ws receiver, which then
    // stops parsing this socket's frames (pongs included) — the player freezes
    // and the heartbeat kicks them ~30s later. Contain it to this one message.
    try {
      handleMessage(ws, clientId, message);
    } catch (err) {
      logLimited("message_error", {
        player: clientId,
        type: String(message.type).slice(0, 32),
        ...errorFields(err),
      }, "error");
      captureError(err, { where: "message", type: String(message.type).slice(0, 32) });
      try {
        ws.send(JSON.stringify({ type: "error", message: "Action failed." }));
      } catch { /* socket already closed */ }
    }
  });

  ws.on("close", (code) => {
    rateLimits.delete(clientId);
    const playerId = playerIdFor(clientId);
    socketToPlayer.delete(clientId);
    handleSocketClose(ws, playerId, code);
  });
});

// ── Message routing ──────────────────────────────────────────────

function handleMessage(ws, clientId, message) {
  // The handlers act as the player this socket holds a seat for. Their parameter
  // is still called clientId: before Plan D the two ids were always the same.
  const playerId = playerIdFor(clientId);
  switch (message.type) {
    case "host":       handleHost(ws, playerId, message.name); break;
    case "join":       handleJoin(ws, playerId, message.code, message.name); break;
    case "resume":     handleResume(ws, clientId, message.token); break;
    case "start":      handleStart(playerId); break;
    case "restart":    handleRestart(playerId); break;
    case "endGame":    handleEndGame(playerId); break;
    case "skipPhase":  handleSkipPhase(playerId); break;
    case "input":      handleInput(playerId, message.dir); break;
    case "stopInput":  handleStopInput(playerId); break;
    case "vote":       handleVote(playerId, message.game); break;
    case "gameAction": handleGameAction(ws, playerId, message.action); break;
    default:
      ws.send(JSON.stringify({ type: "error", message: "Unknown message type." }));
  }
}

// ── Room lifecycle ───────────────────────────────────────────────

// Names arrive straight off the wire, so anything that isn't a non-blank string
// becomes the default rather than throwing on .slice().
function cleanName(name) {
  if (typeof name !== "string") return "Player";
  return name.trim().slice(0, 16) || "Player";
}

// First palette colour no current player is using. Indexing by player count
// hands out duplicates once someone leaves and a new player joins.
function pickColor(room) {
  const taken = new Set(Array.from(room.players.values(), (p) => p.color));
  return COLORS.find((c) => !taken.has(c)) || COLORS[room.players.size % COLORS.length];
}

function handleHost(ws, clientId, name) {
  // One room per socket. Without this a single client can create unlimited
  // rooms, and on disconnect only the first one found is cleaned — the rest
  // hold a dead-socket player forever and leak.
  if (findRoomByPlayer(clientId)) {
    ws.send(JSON.stringify({ type: "error", message: "You are already in a room." }));
    return;
  }
  if (rooms.size >= MAX_ROOMS && !reclaimIdleRoom()) {
    ws.send(JSON.stringify({ type: "error", message: "Server is at capacity right now — please try again in a few minutes." }));
    return;
  }
  const code = generateRoomCode();
  const player = { id: clientId, name: cleanName(name), ws, color: COLORS[0], connected: true, resumeToken: ws.resumeToken };
  const room = {
    code,
    hostId: clientId,
    players: new Map([[clientId, player]]),
    game: null,
    interval: null,
    status: "lobby",
    currentGame: null,
    votingState: null,
    roundWins: new Map(),
    gameWins: new Map(),
    // Lifetime stats, reported once in the room_closed log line.
    createdAt: Date.now(),
    peakPlayers: 1,
    gamesPlayed: 0,
  };
  rooms.set(code, room);
  sessions.set(ws.resumeToken, { playerId: clientId, roomCode: code });
  logLifecycle("room_created", { room: code, player: clientId, rooms: rooms.size });
  sendRoomUpdate(room);
}

// Every seat in its resume grace holds the room, so hosting and dropping in a
// loop could pin all MAX_ROOMS slots with no socket left open and lock out real
// hosts. At the cap, the oldest room nobody is connected to gives way; a room
// with anyone in it is never touched.
function reclaimIdleRoom() {
  let oldest = null;
  for (const room of rooms.values()) {
    if (Array.from(room.players.values()).some((p) => p.connected)) continue;
    if (!oldest || room.createdAt < oldest.createdAt) oldest = room;
  }
  if (!oldest) return false;
  closeRoom(oldest, "reclaimed");
  return true;
}

// Tear a room down whole: grace timers, sessions, the game loop, the room.
function closeRoom(room, reason) {
  room.players.forEach((player) => {
    clearTimeout(player.graceTimer);
    player.graceTimer = null;
    sessions.delete(player.resumeToken);
  });
  room.players.clear();
  stopLoop(room);
  rooms.delete(room.code);
  logLifecycle("room_closed", {
    room: room.code,
    reason,
    lifetimeSec: Math.round((Date.now() - room.createdAt) / 1000),
    peakPlayers: room.peakPlayers,
    gamesPlayed: room.gamesPlayed,
  });
}

function handleJoin(ws, clientId, code, name) {
  if (findRoomByPlayer(clientId)) {
    ws.send(JSON.stringify({ type: "error", message: "You are already in a room." }));
    return;
  }
  const room = typeof code === "string" || typeof code === "number"
    ? rooms.get(String(code).trim().toUpperCase())
    : null;
  if (!room) {
    ws.send(JSON.stringify({ type: "error", message: "Room not found." }));
    return;
  }
  if (room.players.size >= MAX_PLAYERS) {
    ws.send(JSON.stringify({ type: "error", message: "Room is full." }));
    return;
  }
  // Lobby and the game-vote screen are safe entry points: no engine is running,
  // and the vote threshold uses the live player count. This is also how a player
  // whose connection dropped gets back in. Mid-game joins stay closed because
  // every engine freezes its roster when the game starts.
  if (room.status !== "lobby" && room.status !== "voting") {
    ws.send(JSON.stringify({ type: "error", message: "A game is in progress. You can join when the next game vote starts." }));
    return;
  }

  room.players.set(clientId, {
    id: clientId, name: cleanName(name), ws, color: pickColor(room), connected: true, resumeToken: ws.resumeToken,
  });
  sessions.set(ws.resumeToken, { playerId: clientId, roomCode: room.code });
  if (!room.gameWins.has(clientId)) room.gameWins.set(clientId, 0);
  room.peakPlayers = Math.max(room.peakPlayers, room.players.size);
  logLifecycle("player_joined", { room: room.code, player: clientId, players: room.players.size, status: room.status });
  sendRoomUpdate(room);
  if (room.status === "voting") broadcastVotingState(room);
}

function handleStart(clientId) {
  const room = findRoomByPlayer(clientId);
  if (!room || room.hostId !== clientId) return;
  if (room.status !== "lobby") return;
  startVoting(room);
}

function handleRestart(clientId) {
  const room = findRoomByPlayer(clientId);
  if (!room || room.hostId !== clientId) return;

  if (room.status === "playing" && room.currentGame === "snake") {
    const players = Array.from(room.players.values());
    startSnake(room, players);
  }
}

function handleEndGame(clientId) {
  const room = findRoomByPlayer(clientId);
  if (!room || room.hostId !== clientId) return;
  if (room.status !== "playing") return;

  let roundWins = 0;
  room.roundWins.forEach((n) => { roundWins += n; });
  logLifecycle("game_ended", {
    room: room.code,
    game: room.currentGame,
    round: room.game?.round ?? room.game?.triviaRound ?? null, // snake has no rounds
    roundWins,
    durationSec: Math.round((Date.now() - room.gameStartedAt) / 1000),
  });

  // On a tie for the most round wins, every tied leader is a co-champion.
  topWinners(room.roundWins).forEach((id) => {
    room.gameWins.set(id, (room.gameWins.get(id) || 0) + 1);
  });

  room.roundWins = new Map();
  startVoting(room);
}

// Host skips the current phase (for games without timers)
function handleSkipPhase(clientId) {
  const room = findRoomByPlayer(clientId);
  if (!room || room.hostId !== clientId) return;
  if (room.status !== "playing") return;

  switch (room.currentGame) {
    case "truths":
      if (room.game.status === "submitting") {
        room.game = rotateToPresent(room, (g) => nextTruthsRound(g, Math.random), "presenterId");
        broadcastGameState(room);
      } else if (room.game.status === "voting") {
        triggerTruthsReveal(room);
      }
      break;
    case "emoji":
      if (room.game.status === "composing") {
        stopLoop(room);
        room.game = rotateToPresent(room, (g) => nextEmojiRound(g, Math.random), "storytellerId");
        broadcastGameState(room);
        startEmojiComposeTimer(room);
      } else if (room.game.status === "guessing") {
        triggerEmojiReveal(room);
      }
      break;
    case "sketch":
      if (room.game.status === "drawing") {
        triggerSketchReveal(room);
      }
      break;
    case "typeracer":
      if (room.game.status === "racing") {
        triggerTyperacerReveal(room);
      }
      break;
    case "wordchain":
      if (room.game.status === "round_end") {
        // The win was already awarded when the round entered round_end (here or
        // in the tick path); only fast-forward the pending auto-advance.
        stopLoop(room);
        room.game = nextWordChainRound(room.game, Math.random);
        broadcastGameState(room);
        startWordChainTick(room);
      } else if (room.game.status === "playing") {
        room.game = eliminateCurrentPlayer(room.game);
        broadcastGameState(room);
        if (room.game.status === "round_end") {
          stopLoop(room);
          awardRoundWin(room, room.game.roundWinnerId);
          sendRoomUpdate(room);
          startPendingAdvance(room, 3000, () => {
            if (!room || room.status !== "playing") return;
            stopLoop(room);
            room.game = nextWordChainRound(room.game, Math.random);
            broadcastGameState(room);
            startWordChainTick(room);
          });
        }
      }
      break;
    case "bomber":
      if (room.game.status === "round_end") {
        startNextBomberRound(room);
      }
      break;
    case "hottake":
      if (room.game.status === "voting") {
        triggerHotTakeReveal(room);
      }
      break;
  }
}

// A socket closed. On the start screen there is nothing to clean up. A player in
// a room keeps their seat for RESUME_GRACE_MS so a phone that locked or switched
// networks can resume it; if they don't, handleDisconnect runs exactly as it
// would have at the moment of the drop, just later.
function handleSocketClose(ws, playerId, code) {
  const room = findRoomByPlayer(playerId);
  const player = room?.players.get(playerId);
  if (!player || player.ws !== ws) return; // not in a room, or the seat moved to a newer socket
  if (RESUME_GRACE_MS <= 0) {
    handleDisconnect(playerId, code);
    return;
  }
  player.connected = false;
  player.disconnectedAt = Date.now();
  benchFromRealtimeRound(room, playerId);
  // An away host can't start, skip or end anything, and the phases with no
  // timer of their own (lobby, Snake game over, Trivia round_complete) have
  // nothing else to move them on. Lend the role to someone who is here; they
  // get it back the moment they resume.
  if (room.hostId === playerId) {
    const standIn = Array.from(room.players.values()).find((p) => p.connected);
    if (standIn) {
      room.hostId = standIn.id;
      room.hostReturnsTo = playerId;
      logLifecycle("host_lent", { room: room.code, from: playerId, to: standIn.id });
    }
  }
  player.graceTimer = setTimeout(() => {
    player.graceTimer = null;
    logLifecycle("grace_expired", {
      room: room.code, player: playerId, graceMs: RESUME_GRACE_MS,
      status: room.status, game: room.currentGame,
    });
    handleDisconnect(playerId, code);
  }, RESUME_GRACE_MS);
  sendRoomUpdate(room); // others see the seat as away, not gone
}

// Plan D resume: a new socket takes back a seat, proven by the token from the
// welcome its player first got. Last connection wins: if the seat's old socket
// is still open (a second tab, or a dead link the server hasn't noticed yet),
// it is closed with 4000 so that client knows not to reconnect and fight back.
function handleResume(ws, clientId, token) {
  if (findRoomByPlayer(playerIdFor(clientId))) {
    ws.send(JSON.stringify({ type: "error", message: "You are already in a room." }));
    return;
  }
  const session = typeof token === "string" ? sessions.get(token) : undefined;
  const room = session && rooms.get(session.roomCode);
  const player = room?.players.get(session.playerId);
  if (!player) {
    // Expired, never a seat, or from before a deploy. A client can send this
    // in a loop, so it is capped like the other abuse-prone events.
    logLimited("resume_failed", { conn: clientId });
    ws.send(JSON.stringify({ type: "resume_failed" }));
    return;
  }

  const old = player.ws;
  const replaced = old.readyState === old.OPEN;
  if (replaced) {
    old.replaced = true;
    old.close(4000, "replaced");
  }
  const awayMs = player.connected ? 0 : Date.now() - player.disconnectedAt;
  clearTimeout(player.graceTimer);
  player.graceTimer = null;
  player.ws = ws;
  player.connected = true;
  socketToPlayer.set(clientId, player.id);
  // Take the host role back from whoever was holding it (see handleSocketClose).
  if (room.hostReturnsTo === player.id) {
    room.hostId = player.id;
    room.hostReturnsTo = null;
  }
  logLifecycle("resume_ok", {
    room: room.code, player: player.id, conn: clientId, awayMs, replaced,
    status: room.status, game: room.currentGame,
  });

  // What a fresh join would see: identity first, then the room and the live
  // phase. Emoji/Sketch state goes out per player, so secrets stay private.
  ws.send(JSON.stringify({ type: "welcome", id: player.id, resumeToken: token, resumed: true }));
  sendRoomUpdate(room);
  if (room.status === "voting") broadcastVotingState(room);
  else if (room.status === "playing") broadcastGameState(room);
}

// `code` is the WebSocket close code: 1000/1001 for a normal leave, 1006 for a
// socket that dropped without a close frame (network loss, heartbeat terminate).
function handleDisconnect(clientId, code) {
  const room = findRoomByPlayer(clientId);
  if (!room) return;

  const leaver = room.players.get(clientId);
  clearTimeout(leaver.graceTimer);
  // They're not coming back for the host role they lent out.
  if (room.hostReturnsTo === clientId) room.hostReturnsTo = null;
  sessions.delete(leaver.resumeToken);
  room.players.delete(clientId);
  logLifecycle("player_left", {
    room: room.code, player: clientId, code,
    status: room.status, game: room.currentGame, players: room.players.size,
  });

  if (room.players.size === 0) {
    closeRoom(room, "empty");
    return;
  }

  if (room.hostId === clientId) {
    // Prefer someone connected: a host who is away can't start or skip anything.
    const players = Array.from(room.players.values());
    room.hostId = (players.find((p) => p.connected) || players[0]).id;
  }

  // A departed player's game vote must stop counting, or "everyone has voted"
  // fires early; and if they were the last one yet to vote, resolve it now.
  if (room.status === "voting" && room.votingState) {
    const votes = new Map(room.votingState.votes);
    votes.delete(clientId);
    room.votingState = { ...room.votingState, votes };
    sendRoomUpdate(room);
    if (allVotesIn(room.votingState, room.players.size)) {
      finishVoting(room);
    } else {
      broadcastVotingState(room);
    }
    return;
  }

  // Reconcile the active game's frozen roster with the player who just left,
  // and advance the phase if their departure now completes it. Without this,
  // every "everyone has voted/answered" check compares against a stale roster
  // and the round stalls until its timer (or, for emoji guessing, forever).
  if (room.status === "playing" && room.game) {
    reconcileDisconnect(room, clientId);
  }

  sendRoomUpdate(room);
  if (room.status === "playing") {
    broadcastGameState(room);
  }
}

// Prune a departed player from the active engine's frozen roster and, if their
// departure now completes the current phase, advance it immediately. One branch
// per game; games not handled here fall back to their phase timer as before.
function reconcileDisconnect(room, clientId) {
  const game = room.game;
  switch (room.currentGame) {
    case "snake":
      if (game.snakes?.has(clientId)) {
        game.snakes.set(clientId, { ...game.snakes.get(clientId), alive: false });
      }
      break;

    case "bomber":
      // Mark the leaver dead so the running 100ms loop's checkRoundEnd resolves
      // to the real last-man-standing instead of counting a phantom for 120s.
      if (game.players?.has(clientId)) {
        game.players.set(clientId, { ...game.players.get(clientId), alive: false });
      }
      break;

    case "trivia":
      pruneFromArray(game, "playerIds", clientId);
      game.answers?.delete(clientId);
      if (game.status === "question" && allAnswered(game)) {
        handleTriviaReveal(room);
      }
      break;

    case "hottake":
      pruneFromArray(game, "playerIds", clientId);
      game.votes?.delete(clientId);
      if (game.status === "voting" && allHotTakeVotesIn(game)) {
        triggerHotTakeReveal(room);
      }
      break;

    case "truths":
      pruneFromArray(game, "playerIds", clientId);
      pruneFromArray(game, "turnQueue", clientId);
      game.votes?.delete(clientId);
      if (game.status === "voting" && allTruthsVotesIn(game)) {
        triggerTruthsReveal(room);
      } else if (game.status === "submitting" && clientId === game.presenterId) {
        // The presenter left before submitting — reassign the presenter (next in
        // queue) and start a fresh submit instead of idling the 60s timer.
        stopLoop(room);
        room.game = rotateToPresent(room, (g) => nextTruthsRound(g, Math.random), "presenterId");
        broadcastGameState(room);
        startTruthsTick(room);
      }
      break;

    case "emoji":
      pruneFromArray(game, "playerIds", clientId);
      pruneFromArray(game, "correctGuessers", clientId);
      pruneFromArray(game, "turnQueue", clientId);
      game.guessAttempts?.delete(clientId);
      // The guessing phase has no timer of its own, so a drop here must be
      // resolved now: reveal if the storyteller left or no guesser remains.
      if (game.status === "guessing") {
        const guessers = game.playerIds.filter((id) => id !== game.storytellerId);
        if (clientId === game.storytellerId || guessers.length === 0) {
          triggerEmojiReveal(room);
        }
      } else if (game.status === "composing" && clientId === game.storytellerId) {
        // The composer left before submitting — reassign the storyteller (next in
        // queue) and start a fresh compose instead of idling the 45s timer.
        stopLoop(room);
        room.game = rotateToPresent(room, (g) => nextEmojiRound(g, Math.random), "storytellerId");
        broadcastGameState(room);
        startEmojiComposeTimer(room);
      }
      break;

    case "sketch":
      // Mirrors emoji: drawer ↔ storyteller, drawing ↔ guessing. The drawing
      // phase has a 45s timer, so a drop won't hang forever — but if the drawer
      // leaves (no one can draw) or the last guesser leaves (no one can win),
      // the round would idle out the full timer. Reveal now instead.
      pruneFromArray(game, "playerIds", clientId);
      pruneFromArray(game, "turnQueue", clientId);
      pruneFromArray(game, "correctGuessers", clientId);
      if (game.status === "drawing") {
        const guessers = game.playerIds.filter((id) => id !== game.drawerId);
        if (clientId === game.drawerId || guessers.length === 0) {
          triggerSketchReveal(room);
        }
      }
      break;

    case "wordchain":
      if (game.status === "round_end") {
        // Left during the reveal countdown — keep them out of the next round.
        pruneFromArray(game, "playerIds", clientId);
      } else if (game.status === "playing") {
        // removeWordChainPlayer drops the leaver, advances the turn if it was
        // theirs, and ends the round when one active player is left.
        room.game = removeWordChainPlayer(game, clientId);
        if (room.game.status === "round_end") {
          stopLoop(room);
          awardRoundWin(room, room.game.roundWinnerId);
          sendRoomUpdate(room);
          startPendingAdvance(room, room.game.timer * 1000, () => {
            if (!room || room.status !== "playing") return;
            stopLoop(room);
            room.game = nextWordChainRound(room.game, Math.random);
            broadcastGameState(room);
            startWordChainTick(room);
          });
        }
      }
      break;
  }
}

function pruneFromArray(obj, key, id) {
  if (Array.isArray(obj[key])) obj[key] = obj[key].filter((x) => x !== id);
}

// ── Round & game win tracking ────────────────────────────────────

function awardRoundWin(room, winnerId) {
  if (!winnerId) return;
  room.roundWins.set(winnerId, (room.roundWins.get(winnerId) || 0) + 1);
  sendRoomUpdate(room);
}

// A disconnected Bomber player stops dead — `moving` is false, so the body just
// stands there for the whole round and keeps counting as a live player. It can
// therefore outlast everyone actually playing and take the round.
// reconcileDisconnect already marks the leaver dead for exactly this reason
// ("instead of counting a phantom"), but it only runs once RESUME_GRACE_MS
// expires, and a round is far shorter than the grace. Bench them the moment the
// socket goes: they keep the seat and their scores, and respawn with everyone
// else next round. Losing a live round you dropped out of is the same rule as
// dying in it.
//
// Snake is deliberately NOT handled here: an away snake keeps its heading and
// dies on a wall on its own (Plan D, resume.test.js #14), which lets a quick
// reconnect resume a living snake. It is kept out of the round-win award
// instead — see getSnakeRoundWinner.
function benchFromRealtimeRound(room, clientId) {
  if (room.status !== "playing" || !room.game) return;
  if (room.currentGame !== "bomber") return;
  const roster = room.game.players;
  if (!roster?.has(clientId)) return;
  roster.set(clientId, { ...roster.get(clientId), alive: false });
}

// Is this seat occupied by someone actually here? A seat inside its resume
// grace is still a full member of the engine's frozen roster, so anything that
// picks a player must ask this rather than trusting the roster alone.
function isPresent(room, playerId) {
  const player = room.players.get(playerId);
  return !!player && player.connected !== false;
}

function anyonePresent(room) {
  return Array.from(room.players.values()).some((p) => p.connected !== false);
}

// Roll a role rotation forward until it lands on someone who is present.
// reconcileDisconnect would have pruned the absent player, but it only runs
// after RESUME_GRACE_MS, and a round is usually shorter than the grace — so
// without this the pencil (or the prompt) goes to an empty chair and the round
// is unplayable. If nobody at all is present, take the first result unchanged
// rather than spinning.
function rotateToPresent(room, advance, roleKey) {
  let next = advance(room.game);
  if (!anyonePresent(room)) return next;
  let guard = room.players.size + 1;
  while (guard-- > 0 && !isPresent(room, next[roleKey])) {
    next = advance(next);
  }
  return next;
}

// Games whose round can legitimately be co-won (a shared majority, an equal
// gain, an identical score) hand us every winner. Credit them all — picking one
// by Map iteration order gave the round, and with it the End Game "game win"
// via topWinners(), to whoever simply acted first. One room update for the lot,
// not one per winner.
function awardRoundWins(room, winnerIds) {
  const ids = (winnerIds || []).filter(Boolean);
  if (ids.length === 0) return;
  ids.forEach((id) => room.roundWins.set(id, (room.roundWins.get(id) || 0) + 1));
  sendRoomUpdate(room);
}

// An away snake keeps drifting until it hits something (Plan D keeps it on the
// board so a quick reconnect resumes a living snake), which means it can be the
// last one moving when everyone still playing has already crashed. It may keep
// the snake; it must not bank the round win for a round nobody was there for.
function getSnakeRoundWinner(room) {
  const game = room?.game;
  if (!game?.snakes) return null;
  const snakes = Array.from(game.snakes.values()).filter((s) => isPresent(room, s.id));
  if (snakes.length === 0) return null;
  const alive = snakes.filter((s) => s.alive);
  if (alive.length === 1) return alive[0].id;
  const sorted = [...snakes].sort((a, b) => b.score - a.score);
  return sorted[0]?.id || null;
}

// ── Voting phase ─────────────────────────────────────────────────

function handleVote(clientId, game) {
  const room = findRoomByPlayer(clientId);
  if (!room || room.status !== "voting") return;
  room.votingState = submitVote(room.votingState, clientId, game);
  broadcastVotingState(room);

  if (allVotesIn(room.votingState, room.players.size)) {
    finishVoting(room);
  }
}

function startVoting(room) {
  stopLoop(room);
  room.status = "voting";
  room.currentGame = null;
  room.game = null;
  room.votingState = createVotingState();
  sendRoomUpdate(room);
  broadcastVotingState(room);

  startLoop(room, 1000, () => {
    room.votingState = tickVoting(room.votingState);
    broadcastVotingState(room);
    if (room.votingState.timer <= 0) finishVoting(room);
  });
}

function finishVoting(room) {
  stopLoop(room);
  const winner = resolveVoting(room.votingState, Math.random);
  room.votingState = null;
  startSelectedGame(room, winner);
}

// ── Game dispatcher ──────────────────────────────────────────────

function startSelectedGame(room, gameName) {
  stopLoop(room);
  room.status = "playing";
  room.currentGame = gameName;
  room.roundWins = new Map();
  const players = Array.from(room.players.values());

  switch (gameName) {
    case "snake":     startSnake(room, players); break;
    case "truths":    startTruths(room, players); break;
    case "emoji":     startEmojiGame(room, players); break;
    case "sketch":    startSketchGame(room, players); break;
    case "trivia":    startTriviaGame(room, players); break;
    case "typeracer":  startTyperacerGame(room, players); break;
    case "wordchain":  startWordChainGame(room, players); break;
    case "bomber":     startBomberGame(room, players); break;
    case "hottake":    startHotTakeGame(room, players); break;
  }

  room.gamesPlayed++;
  room.gameStartedAt = Date.now();
  room.loopFailures = 0; // a game that starts cleanly clears the abort counter
  logLifecycle("game_started", { room: room.code, game: gameName, players: players.length });
  sendRoomUpdate(room);
}

function handleGameAction(ws, clientId, action) {
  const room = findRoomByPlayer(clientId);
  if (!room || room.status !== "playing" || !action) return;

  if (process.env.DEBUG_INTERNALS === "1" && action.kind === "__throwOnTick") {
    room.throwOnTick = true; // see withForcedFailure
    return;
  }

  try {
    switch (room.currentGame) {
      case "truths":
        if (action.kind === "revealNow" &&
            room.game.status === "voting" &&
            clientId === room.game.presenterId) {
          triggerTruthsReveal(room);
          break;
        }
        room.game = handleTruthsAction(room.game, clientId, action);
        if (room.game.status === "voting" && allTruthsVotesIn(room.game)) {
          triggerTruthsReveal(room);
        } else {
          broadcastGameState(room);
        }
        break;
      case "emoji": {
        room.game = handleEmojiAction(room.game, clientId, action);
        // The phase timer keeps running into the guessing phase (see
        // startEmojiComposeTimer) so the round self-resolves on timeout;
        // early-reveal still fires when everyone has guessed or run out of tries.
        if (room.game.status === "guessing" && (allEmojiGuessersCorrect(room.game) || allEmojiGuessersExhausted(room.game))) {
          triggerEmojiReveal(room);
        } else {
          broadcastGameState(room);
        }
        break;
      }
      case "sketch": {
        const before = room.game;
        room.game = handleSketchAction(before, clientId, action);
        // An action the engine refused (over a cap, wrong phase, not the
        // drawer) changes nothing, so it must not cost a broadcast either.
        if (room.game === before) break;
        if (action.kind === "draw" && room.game.strokes.length === before.strokes.length + 1) {
          // Just the new stroke: the whole canvas per stroke, per player, is
          // what let one drawer exhaust the server's heap.
          broadcast(room, { type: "sketch_stroke", stroke: room.game.strokes[room.game.strokes.length - 1] });
        } else if (action.kind === "clear") {
          broadcast(room, { type: "sketch_clear" });
        } else {
          // A guess moves scores, the feed and revealIn; the canvas is unchanged.
          // revealIn is started by the engine on the first correct guess and the
          // draw timer tick turns it into the reveal.
          broadcastGameState(room, { light: true });
        }
        break;
      }
      case "trivia":
        // Host starts the next set after round_complete
        if (action.kind === "nextSet" && clientId === room.hostId && room.game.status === "round_complete") {
          room.game = nextTriviaRound(room.game, Math.random);
          broadcastGameState(room);
          startTriviaTick(room);
          break;
        }
        room.game = handleTriviaAction(room.game, clientId, action);
        // Only the question phase can be completed by answers. Without the
        // status check, any action during `reveal` (or `round_complete`, where
        // the answers of the last question are still on the state) re-ran the
        // reveal: it re-awarded its points and restarted the reveal timer.
        if (room.game.status === "question" && allAnswered(room.game)) {
          handleTriviaReveal(room);
        } else {
          broadcastGameState(room);
        }
        break;
      case "typeracer":
        room.game = handleTyperacerAction(room.game, clientId, action);
        if (room.game.status === "racing" && allTyperacerFinished(room.game)) {
          triggerTyperacerReveal(room);
        } else {
          broadcastGameState(room);
        }
        break;
      case "wordchain":
        room.game = handleWordChainAction(room.game, clientId, action);
        broadcastGameState(room);
        break;
      case "bomber":
        room.game = handleBomberAction(room.game, clientId, action);
        // No broadcast here — state is broadcast on every tick
        break;
      case "hottake":
        room.game = handleHotTakeAction(room.game, clientId, action);
        if (room.game.status === "voting" && allHotTakeVotesIn(room.game)) {
          triggerHotTakeReveal(room);
        } else {
          broadcastGameState(room);
        }
        break;
    }
  } catch (err) {
    // Contain blast radius: a throw here would otherwise kill the entire Node
    // process and every active room, not just this player's session.
    logLimited("game_action_error", {
      room: room.code,
      game: room.currentGame,
      player: clientId,
      kind: typeof action.kind === "string" ? action.kind.slice(0, 32) : null,
      ...errorFields(err),
    }, "error");
    captureError(err, { where: "game_action", game: room.currentGame });
    try {
      ws.send(JSON.stringify({ type: "error", message: "Action failed." }));
    } catch { /* socket already closed */ }
  }
}

function handleInput(clientId, dir) {
  const room = findRoomByPlayer(clientId);
  if (!room || room.status !== "playing") return;
  if (room.currentGame === "bomber") {
    room.game = handleBomberAction(room.game, clientId, { kind: "move", dir });
    return;
  }
  if (room.currentGame !== "snake") return;
  room.game = setSnakeDirection(room.game, clientId, dir);
}

function handleStopInput(clientId) {
  const room = findRoomByPlayer(clientId);
  if (!room || room.status !== "playing") return;
  if (room.currentGame === "bomber") {
    room.game = handleBomberAction(room.game, clientId, { kind: "stop" });
    broadcastGameState(room);
  }
}

// ── Snake ────────────────────────────────────────────────────────

function startSnake(room, players) {
  stopLoop(room); // every other start* helper does this — without it a restart orphans the live 120ms loop
  room.game = createGameState({ rows: ROWS, cols: COLS, players, rng: Math.random });
  broadcastGameState(room);

  startLoop(room, SNAKE_TICK_MS, () => {
    room.game = stepGame(room.game, Math.random);
    broadcastGameState(room);

    if (room.game.status !== "running") {
      stopLoop(room);
      awardRoundWin(room, getSnakeRoundWinner(room));
      sendRoomUpdate(room);
    }
  });
}

function serializeSnake(game) {
  if (!game) return null;
  return {
    gameType: "snake",
    rows: game.rows, cols: game.cols, food: game.food ? [game.food.x, game.food.y] : null,
    status: game.status, winnerId: game.winnerId,
    snakes: Array.from(game.snakes.values()).map((snake) => ({
      id: snake.id, name: snake.name, color: snake.color,
      alive: snake.alive, score: snake.score,
      body: snake.body.map(({ x, y }) => [x, y]),
    })),
  };
}

// ── Two Truths & a Lie ───────────────────────────────────────────
// No interval during submitting/voting — phases advance on player action or host skip.
// Only the reveal phase uses a timed interval.

function startTruths(room, players) {
  room.game = createTruthsState({ players, rng: Math.random });
  broadcastGameState(room);
  startTruthsTick(room);
}

function startTruthsTick(room) {
  stopLoop(room);
  startLoop(room, 1000, () => {
    room.game = tickTruths(room.game);
    broadcastGameState(room);
    if (room.game.timer <= 0) {
      if (room.game.status === "submitting") {
        stopLoop(room);
        room.game = rotateToPresent(room, (g) => nextTruthsRound(g, Math.random), "presenterId");
        broadcastGameState(room);
        startTruthsTick(room);
      } else if (room.game.status === "voting") {
        triggerTruthsReveal(room);
      }
    }
  });
}

function triggerTruthsReveal(room) {
  stopLoop(room);
  room.game = revealTruths(room.game);
  broadcastGameState(room);
  startTruthsRevealTimer(room);
}

function startTruthsRevealTimer(room) {
  stopLoop(room);
  startLoop(room, 1000, () => {
    room.game = tickTruths(room.game);
    broadcastGameState(room);
    if (room.game.timer <= 0) {
      stopLoop(room);
      awardRoundWins(room, room.game.roundWinnerIds);
      room.game = rotateToPresent(room, (g) => nextTruthsRound(g, Math.random), "presenterId");
      broadcastGameState(room);
      startTruthsTick(room);
    }
  });
}

// ── Emoji Storytelling ───────────────────────────────────────────

function startEmojiGame(room, players) {
  room.game = createEmojiState({ players, rng: Math.random });
  broadcastGameState(room);
  startEmojiComposeTimer(room);
}

// Countdown that spans both the compose and guess phases. The storyteller has
// COMPOSE_DURATION to pick emojis; submitting resets the clock to GUESS_DURATION.
// Either phase running out of time goes straight to reveal so the round always
// resolves — the guessing phase used to have no clock and could hang forever.
function startEmojiComposeTimer(room) {
  stopLoop(room);
  startLoop(room, 1000, () => {
    room.game = tickEmoji(room.game);
    broadcastGameState(room);
    if ((room.game.status === "composing" || room.game.status === "guessing") && room.game.timer <= 0) {
      triggerEmojiReveal(room);
    }
  });
}

function triggerEmojiReveal(room) {
  stopLoop(room);
  room.game = revealEmoji(room.game);
  broadcastGameState(room);
  startEmojiRevealTimer(room);
}

function startEmojiRevealTimer(room) {
  stopLoop(room);
  startLoop(room, 1000, () => {
    room.game = tickEmoji(room.game);
    broadcastGameState(room);
    if (room.game.timer <= 0) {
      stopLoop(room);
      awardRoundWin(room, room.game.roundWinnerId);
      room.game = rotateToPresent(room, (g) => nextEmojiRound(g, Math.random), "storytellerId");
      broadcastGameState(room);
      startEmojiComposeTimer(room);
    }
  });
}

// ── Sketch & Guess ───────────────────────────────────────────────
// No interval during drawing. Only reveal uses a timer.

function startSketchGame(room, players) {
  room.game = createSketchState({ players, rng: Math.random });
  broadcastGameState(room);
  startSketchDrawTimer(room);
}

function startSketchDrawTimer(room) {
  startLoop(room, 1000, () => {
    room.game = tickSketch(room.game);
    broadcastGameState(room, { light: true });
    if (room.game.revealIn === 0) {
      // First correct guess countdown finished — transition to reveal
      triggerSketchReveal(room);
    } else if (room.game.timer <= 0) {
      // Time ran out with no correct guess
      triggerSketchReveal(room);
    }
  }, 1000);
}

function triggerSketchReveal(room) {
  stopLoop(room);
  room.game = revealSketch(room.game);
  broadcastGameState(room);
  startSketchRevealTimer(room);
}

function startSketchRevealTimer(room) {
  stopLoop(room);
  startLoop(room, 1000, () => {
    room.game = tickSketch(room.game);
    broadcastGameState(room);
    if (room.game.timer <= 0) {
      stopLoop(room);
      awardRoundWin(room, room.game.roundWinnerId);
      room.game = rotateToPresent(room, (g) => nextSketchRound(g, Math.random), "drawerId");
      broadcastGameState(room);
      startSketchDrawTimer(room);
    }
  });
}

// ── Speed Trivia ─────────────────────────────────────────────────
// Trivia keeps its per-question timer (speed is the core mechanic).

function startTriviaGame(room, players) {
  room.game = createTriviaState({ players, rng: Math.random });
  broadcastGameState(room);

  startLoop(room, 1000, () => {
    room.game = tickTrivia(room.game);
    broadcastGameState(room);
    if (room.game.timer <= 0) handleTriviaTimerEnd(room);
  });
}

function handleTriviaReveal(room) {
  stopLoop(room);
  room.game = revealTrivia(room.game);
  broadcastGameState(room);
  startTriviaTick(room);
}

function handleTriviaTimerEnd(room) {
  stopLoop(room);

  if (room.game.status === "question") {
    room.game = revealTrivia(room.game);
    broadcastGameState(room);
    startTriviaTick(room);
  } else if (room.game.status === "reveal") {
    room.game = nextTriviaQuestion(room.game);
    if (room.game.status === "round_complete") {
      // Award win(s) and stop — host must press "Start Next Set" to continue.
      // A top-score tie credits every co-winner (rewards are shared).
      awardRoundWins(room, room.game.roundWinnerIds);
      broadcastGameState(room);
    } else {
      broadcastGameState(room);
      startTriviaTick(room);
    }
  }
}

function startTriviaTick(room) {
  stopLoop(room);
  startLoop(room, 1000, () => {
    room.game = tickTrivia(room.game);
    broadcastGameState(room);
    if (room.game.timer <= 0) handleTriviaTimerEnd(room);
  });
}

// ── Typeracer ────────────────────────────────────────────────────

function startTyperacerGame(room, players) {
  room.game = createTyperacerState({ players, rng: Math.random });
  broadcastGameState(room);
  startTyperacerTick(room);
}

function startTyperacerTick(room) {
  stopLoop(room);
  startLoop(room, 1000, () => {
    room.game = tickTyperacer(room.game);
    broadcastGameState(room);
    if (room.game.status === "racing" && room.game.timer <= 0) {
      triggerTyperacerReveal(room);
    } else if (
      room.game.status === "racing" &&
      room.game.closingCountdown !== null &&
      room.game.closingCountdown <= 0
    ) {
      triggerTyperacerReveal(room);
    } else if (room.game.status === "reveal" && room.game.timer <= 0) {
      stopLoop(room);
      awardRoundWins(room, room.game.roundWinnerIds);
      room.game = nextTyperacerRound(room.game, Math.random);
      broadcastGameState(room);
      startTyperacerTick(room);
    }
  });
}

function triggerTyperacerReveal(room) {
  stopLoop(room);
  room.game = revealTyperacer(room.game);
  broadcastGameState(room);
  startTyperacerTick(room);
}

// ── Bomberman Arena ──────────────────────────────────────────────

function startBomberGame(room, players) {
  room.game = createBomberState({ players, rng: Math.random });
  broadcastGameState(room);
  startBomberLoop(room);
}

function startBomberLoop(room) {
  stopLoop(room);
  let secAccum = 0;
  startLoop(room, BOMBER_TICK_MS, () => {
    if (!room.game || room.game.status !== "playing") return;

    room.game = stepBomber(room.game, Math.random);
    broadcastGameState(room);

    // Tick 1-second timer separately
    secAccum += BOMBER_TICK_MS;
    if (secAccum >= 1000) {
      secAccum -= 1000;
      room.game = tickBomberTimer(room.game);
      broadcastGameState(room);
    }

    if (room.game.status === "round_end") {
      stopLoop(room);
      awardRoundWins(room, room.game.roundWinnerIds);
      sendRoomUpdate(room);
      broadcastGameState(room);
      // Auto-advance after round end delay (tracked so a host skip can cancel it)
      startPendingAdvance(room, room.game.timer * 1000, () => {
        if (!room || room.status !== "playing") return;
        startNextBomberRound(room);
      });
    }
  });
}

function startNextBomberRound(room) {
  stopLoop(room);
  room.game = nextBomberRound(room.game, Math.random);
  broadcastGameState(room);
  startBomberLoop(room);
}

// ── Hot Take Voting ──────────────────────────────────────────────

function startHotTakeGame(room, players) {
  room.game = createHotTakeState({ players, rng: Math.random });
  broadcastGameState(room);
  startHotTakeTick(room);
}

function startHotTakeTick(room) {
  stopLoop(room);
  startLoop(room, 1000, () => {
    room.game = tickHotTake(room.game);
    broadcastGameState(room);

    if (room.game.status === "voting" && room.game.timer <= 0) {
      triggerHotTakeReveal(room);
    } else if (room.game.status === "reveal" && room.game.timer <= 0) {
      stopLoop(room);
      awardRoundWins(room, room.game.roundWinnerIds);
      room.game = nextHotTakeRound(room.game, Math.random);
      broadcastGameState(room);
      startHotTakeTick(room);
    }
  });
}

function triggerHotTakeReveal(room) {
  stopLoop(room);
  room.game = revealHotTake(room.game);
  broadcastGameState(room);
  startHotTakeTick(room);
}

// ── Word Chain ───────────────────────────────────────────────────

function startWordChainGame(room, players) {
  room.game = createWordChainState({ players, rng: Math.random });
  broadcastGameState(room);
  startWordChainTick(room);
}

function startWordChainTick(room) {
  stopLoop(room);
  startLoop(room, 1000, () => {
    room.game = tickWordChain(room.game);
    broadcastGameState(room);
    if (room.game.status === "playing" && room.game.timer <= 0) {
      // Time's up — eliminate current player
      room.game = eliminateCurrentPlayer(room.game);
      broadcastGameState(room);
      if (room.game.status === "round_end") {
        awardRoundWin(room, room.game.roundWinnerId);
        sendRoomUpdate(room);
        // Auto-advance after reveal delay (tracked so a host skip can cancel it)
        startPendingAdvance(room, room.game.timer * 1000, () => {
          if (!room || room.status !== "playing") return;
          stopLoop(room);
          room.game = nextWordChainRound(room.game, Math.random);
          broadcastGameState(room);
          startWordChainTick(room);
        });
      }
    }
  });
}

// ── Shared helpers ───────────────────────────────────────────────

// Room timers, guarded (F10). A throw inside a tick keeps its interval
// scheduled in Node, so the same error used to repeat every tick forever with
// the room stuck on the state that caused it. Now one room's game is stopped
// and the room is handed back to the game vote; every other room plays on.
function startLoop(room, ms, tick) {
  stopLoop(room);
  const body = process.env.DEBUG_INTERNALS === "1" ? withForcedFailure(room, tick) : tick;
  room.interval = setInterval(guardedTick(body, (err) => abortRoomGame(room, err, "tick")), ms);
}

// Test-only (DEBUG_INTERNALS=1): lets a test arm one throwing tick, which is
// the only way to exercise the recovery path from outside.
function withForcedFailure(room, tick) {
  return () => {
    if (room.throwOnTick) {
      room.throwOnTick = false;
      throw new Error("forced tick failure (DEBUG_INTERNALS)");
    }
    tick();
  };
}

function startPendingAdvance(room, ms, fn) {
  room.pendingAdvance = setTimeout(guardedTick(fn, (err) => abortRoomGame(room, err, "advance")), ms);
}

function abortRoomGame(room, err, where) {
  logLimited("game_loop_error", {
    room: room.code, game: room.currentGame, where, status: room.status,
    ...errorFields(err),
  }, "error");
  captureError(err, { where: `game_loop_${where}`, game: room.currentGame });
  stopLoop(room);
  if (!rooms.has(room.code)) return;
  broadcast(room, { type: "error", message: "The game hit a problem and was stopped." });
  // One retry: if the voting loop itself is what's throwing, leave the room
  // idle rather than restarting a loop that fails again every second.
  room.loopFailures = (room.loopFailures || 0) + 1;
  if (room.loopFailures <= 2) startVoting(room);
}

function stopLoop(room) {
  if (room.interval) {
    clearInterval(room.interval);
    clearTimeout(room.interval);
    room.interval = null;
  }
  // Round-end auto-advance timers live here so a manual advance (host skip,
  // disconnect) cancels the pending one instead of letting it double-fire.
  if (room.pendingAdvance) {
    clearTimeout(room.pendingAdvance);
    room.pendingAdvance = null;
  }
}

// `light` leaves the Sketch canvas out of the payload: the client already has
// every stroke, because each one is sent once as it is drawn. The per-second
// timer broadcast and guess updates use it; anything that has to rebuild a
// client's view (phase change, resume) sends the full state.
function broadcastGameState(room, { light = false } = {}) {
  if (!room.game) return;

  switch (room.currentGame) {
    case "snake":
      broadcast(room, { type: "state", state: serializeSnake(room.game) });
      break;
    case "truths":
      broadcast(room, { type: "state", state: serializeTruths(room.game) });
      break;
    case "emoji":
      room.players.forEach((player) => {
        sendTo(player, { type: "state", state: serializeEmoji(room.game, player.id) });
      });
      break;
    case "sketch":
      room.players.forEach((player) => {
        sendTo(player, { type: "state", state: serializeSketch(room.game, player.id, { withStrokes: !light }) });
      });
      break;
    case "trivia":
      broadcast(room, { type: "state", state: serializeTrivia(room.game) });
      break;
    case "typeracer":
      broadcast(room, { type: "state", state: serializeTyperacer(room.game) });
      break;
    case "wordchain":
      broadcast(room, { type: "state", state: serializeWordChain(room.game) });
      break;
    case "bomber":
      broadcast(room, { type: "state", state: serializeBomber(room.game) });
      break;
    case "hottake":
      broadcast(room, { type: "state", state: serializeHotTake(room.game) });
      break;
  }
}

function broadcastVotingState(room) {
  if (!room.votingState) return;
  broadcast(room, { type: "vote_state", voting: serializeVoting(room.votingState) });
}

function sendRoomUpdate(room) {
  broadcast(room, {
    type: "room",
    room: {
      code: room.code,
      hostId: room.hostId,
      status: room.status,
      currentGame: room.currentGame,
      // `connected: false` marks a seat held in the resume grace window. Nobody
      // away means this payload is byte-for-byte what it was before Plan D.
      players: Array.from(room.players.values()).map((p) => (p.connected
        ? { id: p.id, name: p.name, color: p.color }
        : { id: p.id, name: p.name, color: p.color, connected: false })),
      roundWins: Object.fromEntries(room.roundWins),
      gameWins: Object.fromEntries(room.gameWins),
    },
  });
}

// Backpressure. ws queues anything a socket can't take yet, in memory, with no
// limit of its own — so a slow phone (or a client that stops reading) turns
// into server heap. Past SKIP we drop frames for that socket only; past DROP
// the link is gone in all but name, so close it and let them resume the seat.
const SLOW_SOCKET_SKIP_BYTES = Number(process.env.SLOW_SOCKET_SKIP_BYTES ?? 1024 * 1024);
const SLOW_SOCKET_DROP_BYTES = Number(process.env.SLOW_SOCKET_DROP_BYTES ?? 8 * 1024 * 1024);

function canSend(ws) {
  if (ws.readyState !== ws.OPEN) return false;
  const queued = ws.bufferedAmount;
  if (queued <= SLOW_SOCKET_SKIP_BYTES) return true;
  if (queued > SLOW_SOCKET_DROP_BYTES) {
    logLimited("slow_socket_dropped", { player: ws.clientId, queuedKB: Math.round(queued / 1024) }, "warn");
    ws.terminate();
  }
  return false;
}

function broadcast(room, payload) {
  const message = JSON.stringify(payload);
  room.players.forEach((player) => {
    if (canSend(player.ws)) player.ws.send(message);
  });
}

function sendTo(player, payload) {
  if (canSend(player.ws)) {
    player.ws.send(JSON.stringify(payload));
  }
}

function findRoomByPlayer(playerId) {
  for (const room of rooms.values()) {
    if (room.players.has(playerId)) return room;
  }
  return null;
}

function countPlayers() {
  let total = 0;
  for (const room of rooms.values()) total += room.players.size;
  return total;
}

function generateRoomCode() {
  const alphabet = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let code = "";
  do {
    code = Array.from({ length: 4 })
      .map(() => alphabet[Math.floor(Math.random() * alphabet.length)])
      .join("");
  } while (rooms.has(code));
  return code;
}

httpServer.listen(PORT, () => {
  console.log(`Game server running on http://localhost:${PORT}`);
  if (HAS_DIST) {
    console.log(`Open http://localhost:${PORT} in your browser to play.`);
  } else {
    console.log("No dist/ folder found — run 'npm run build' to enable the built-in web server.");
    console.log("For development, use 'npm run dev' in a separate terminal.");
  }
  // The plain-text lines above stay: the test harness waits for them.
  log("server_started", {
    version: APP_VERSION,
    port: PORT,
    region: process.env.RAILWAY_REPLICA_REGION || null,
    node: process.version,
  });
});

// ── Graceful shutdown ────────────────────────────────────────────
// Railway sends SIGTERM on redeploy. Notify connected players and
// drain connections instead of severing them mid-game.
function gracefulShutdown() {
  // How many players this shutdown (usually a deploy) is about to disconnect.
  log("server_shutdown", { rooms: rooms.size, players: countPlayers(), sockets: wss.clients.size });
  wss.clients.forEach((ws) => {
    try {
      ws.send(JSON.stringify({ type: "error", message: "Server is restarting — please refresh in a moment." }));
      ws.close();
    } catch { /* already closed */ }
  });
  wss.close();
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 5000);
}
process.on("SIGTERM", gracefulShutdown);
process.on("SIGINT", gracefulShutdown);

// Last-resort handlers — keep the process alive on stray errors so a single
// bug doesn't take every active room down with it. Restart-on-crash is fine
// in principle, but in-memory state means a restart = total session loss.
process.on("uncaughtException", (err) => {
  logLimited("uncaught_exception", errorFields(err), "error");
  captureError(err, { where: "uncaught_exception" });
});
process.on("unhandledRejection", (reason) => {
  logLimited("unhandled_rejection", errorFields(reason), "error");
  captureError(reason, { where: "unhandled_rejection" });
});
