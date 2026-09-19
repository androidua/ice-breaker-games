// Errors-only Sentry for the browser (Plan E2): no tracing, no replay, no
// sessions. Events go to our own /api/sentry tunnel, which forwards only error
// events under one global daily cap. Only the live site reports.
//
// The SDK adds ~30 KB gzipped, so it is its own chunk, fetched after the page
// has loaded: the lobby renders first. Errors reported before it arrives are
// queued (a few at most); uncaught errors from that first moment are missed.
import { version } from "../package.json";
import { createEventGate } from "./sentry-gate.js";

const DSN = import.meta.env.VITE_SENTRY_DSN;
// Build-time switch for checking the whole pipeline against a local server.
const ALLOW_LOCAL = import.meta.env.VITE_SENTRY_ALLOW_LOCALHOST === "1";
const CANONICAL_HOST = "huddleplayroom.com";
const MAX_QUEUED = 5;

let sdk = null;
const queued = [];

export function initSentry() {
  const host = window.location.hostname;
  const local = host === "localhost" || host === "127.0.0.1";
  if (!DSN || !(host === CANONICAL_HOST || (ALLOW_LOCAL && local))) return;

  const load = () => {
    import("./sentry-sdk.js")
      .then((Sentry) => {
        const allow = createEventGate({ max: 10 });
        Sentry.init({
          dsn: DSN,
          tunnel: "/api/sentry",
          release: `huddle-play-room@${version}`,
          environment: local ? "local" : "production",
          sendDefaultPii: false,
          sendClientReports: false,
          // Release-health sessions would add an envelope per page load.
          integrations: (defaults) => defaults.filter((i) => i.name !== "BrowserSession"),
          beforeSend(event) {
            delete event.user;
            return allow(event) ? event : null;
          },
        });
        sdk = Sentry;
        queued.splice(0).forEach(([error, context]) => Sentry.captureException(error, context));
      })
      .catch(() => { /* reporting is best-effort; never break the game over it */ });
  };

  if (document.readyState === "complete") load();
  else window.addEventListener("load", load, { once: true });
}

export function reportError(error, extra) {
  const context = extra ? { extra } : undefined;
  if (sdk) sdk.captureException(error, context);
  else if (queued.length < MAX_QUEUED) queued.push([error, context]);
}
