// Structured logging (Plan E1). One JSON object per line on stdout, in the shape
// Railway's Log Explorer parses: `message` becomes the line text, `level` its
// severity, and every other field a filterable attribute (e.g. @room:SW5R).
//
// Lifecycle events only. Never call this from a game tick loop (Snake 120ms,
// Bomber 100ms): Railway drops lines past 500/s per replica, and a stringify +
// write per tick would cost the loop players feel. Never pass player names or
// IP addresses; room codes and player ids (p12) are enough to correlate.

export function formatLog(event, fields = {}, level = "info") {
  const entry = { message: event, level, ...fields };
  // Re-assert after the spread so a field can't relabel the line.
  entry.message = event;
  entry.level = level;
  try {
    return JSON.stringify(entry);
  } catch {
    // A circular or BigInt field must not turn a log call into a crash.
    return JSON.stringify({ message: event, level, logError: "unserializable fields" });
  }
}

export function log(event, fields, level) {
  process.stdout.write(formatLog(event, fields, level) + "\n");
}

// For events a client or a bug can fire in a loop (feedback floods, a throw
// inside a timer). Railway drops lines past 500/s per replica, so an uncapped
// flood would also drop the lines that matter. Each event gets `max` lines per
// window; the first line of the next window carries how many were suppressed.
// Keyed by event name only, so the map stays as small as the set of events.
export function createLimitedLog(emit = log, { max = 10, windowMs = 60 * 1000, now = Date.now } = {}) {
  const windows = new Map(); // event -> { start, count, suppressed }
  return (event, fields = {}, level) => {
    const t = now();
    let w = windows.get(event);
    if (!w || t - w.start >= windowMs) {
      const suppressed = w ? w.suppressed : 0;
      w = { start: t, count: 0, suppressed: 0 };
      windows.set(event, w);
      if (suppressed > 0) fields = { ...fields, suppressed };
    }
    if (w.count >= max) {
      w.suppressed++;
      return;
    }
    w.count++;
    emit(event, fields, level);
  };
}

export const logLimited = createLimitedLog();

// Error details for error-level events. The stack is what makes a production
// error fixable; cap it so one line stays well inside Railway's limits.
// Called from the last-resort process handlers, so it must never throw itself.
export function errorFields(err) {
  if (err instanceof Error) {
    return { err: safeString(err.message).slice(0, 500), stack: safeString(err.stack).slice(0, 2000) };
  }
  return { err: safeString(err).slice(0, 500) };
}

// String() throws on e.g. a null-prototype object used as a rejection reason.
function safeString(value) {
  try {
    return String(value);
  } catch {
    return "[unprintable]";
  }
}
