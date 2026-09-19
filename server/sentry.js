// Errors-only Sentry for the server (Plan E2 part 2). Nothing is automatic:
// no tracing, no auto-instrumentation, no ESM import hooks, and no Sentry
// process handlers (index.js keeps its own, which keep the process alive).
// Errors are sent only through captureError() in the existing error paths, and
// a gate caps them, because the org's 5k errors/month is shared with another
// project and the free plan has no per-key rate limit. The SDK is imported
// only when SENTRY_DSN is set, so tests and local dev never load it.

const DAY_MS = 24 * 60 * 60 * 1000;

let sdk = null;

// beforeSend filter: each distinct error once per dedupe window, and at most
// maxPerDay events per 24h (a window that starts at the first send).
export function createErrorGate({ maxPerDay = 50, dedupeMs = 10 * 60 * 1000, maxTracked = 500, now = Date.now } = {}) {
  const lastSent = new Map(); // fingerprint -> time sent
  let windowStart = null;
  let sentInWindow = 0;

  const allow = (event) => {
    const t = now();
    if (windowStart === null || t - windowStart >= DAY_MS) {
      windowStart = t;
      sentInWindow = 0;
    }
    const key = fingerprint(event);
    const last = lastSent.get(key);
    if (last !== undefined && t - last < dedupeMs) return false;
    if (sentInWindow >= maxPerDay) return false;

    if (lastSent.size >= maxTracked) {
      for (const [k, sentAt] of lastSent) if (t - sentAt >= dedupeMs) lastSent.delete(k);
      if (lastSent.size >= maxTracked) lastSent.delete(lastSent.keys().next().value);
    }
    lastSent.delete(key); // re-insert so Map order stays oldest-first
    lastSent.set(key, t);
    sentInWindow++;
    return true;
  };
  allow.trackedCount = () => lastSent.size;
  return allow;
}

function fingerprint(event) {
  const ex = event?.exception?.values?.[0];
  return ex ? `${ex.type}: ${ex.value}` : String(event?.message ?? "");
}

// Resolves true once the SDK is live; false (without loading it) when no DSN.
export async function initServerSentry({ dsn, release, environment, maxPerDay }) {
  if (!dsn) return false;
  const Sentry = await import("@sentry/node");
  const allow = createErrorGate({ maxPerDay });
  Sentry.init({
    dsn,
    release,
    environment,
    sendDefaultPii: false,
    sendClientReports: false,
    // Default is os.hostname(), which on a laptop is the owner's machine name.
    serverName: "huddle-play-room-server",
    defaultIntegrations: false,
    // err.cause chains (e.g. fetch failed -> ECONNREFUSED) and source lines.
    integrations: [Sentry.linkedErrorsIntegration(), Sentry.contextLinesIntegration()],
    skipOpenTelemetrySetup: true,
    registerEsmLoaderHooks: false,
    beforeSend: (event) => (allow(event) ? event : null),
  });
  sdk = Sentry;
  return true;
}

// Safe to call from any error path: a no-op when Sentry is off, and it never
// throws (reporting must not add a second failure to the first).
export function captureError(err, tags) {
  if (!sdk) return;
  try {
    sdk.captureException(err, tags ? { tags } : undefined);
  } catch {
    /* ignore */
  }
}
