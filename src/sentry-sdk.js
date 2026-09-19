// The only place that imports the Sentry SDK, loaded lazily by sentry.js.
// Named imports let the bundler drop the parts we don't use (tracing, replay,
// feedback); a dynamic import("@sentry/react") would pull in all of it.
export { init, captureException } from "@sentry/react";
