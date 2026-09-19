// Sentry tunnel helpers (Plan E2). The browser SDK posts error envelopes to our
// own /api/sentry (option `tunnel`) and index.js forwards them to Sentry. That
// makes one server-side counter the quota guard for every browser at once: the
// free Sentry plan has no per-key rate limits and its 5k errors/month is shared
// with another project in the org. Pure functions; index.js does the I/O.

// "https://<publicKey>@<host>/<projectId>" -> parts, or null if not a DSN.
export function parseDsn(dsn) {
  if (typeof dsn !== "string" || dsn === "") return null;
  let url;
  try {
    url = new URL(dsn);
  } catch {
    return null;
  }
  const projectId = url.pathname.replace(/^\/+|\/+$/g, "");
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  if (!url.username || !/^\d+$/.test(projectId)) return null;
  return { protocol: url.protocol, host: url.host, projectId, publicKey: url.username };
}

// Reads an envelope's header DSN and the type of every item, or returns null for
// anything malformed. Format: a JSON header line, then per item a JSON item
// header line followed by its payload, which is `length` bytes when the header
// says so (and may then contain newlines) or else runs to the next newline.
export function inspectEnvelope(buf) {
  try {
    let lineEnd = buf.indexOf(0x0a);
    if (lineEnd === -1) lineEnd = buf.length;
    const header = JSON.parse(buf.subarray(0, lineEnd).toString("utf8"));
    if (!header || typeof header !== "object" || Array.isArray(header) || typeof header.dsn !== "string") {
      return null;
    }

    const types = [];
    let pos = lineEnd + 1;
    while (pos < buf.length) {
      let end = buf.indexOf(0x0a, pos);
      if (end === -1) end = buf.length;
      const line = buf.subarray(pos, end).toString("utf8");
      pos = end + 1;
      if (line.trim() === "") continue; // trailing newline
      const item = JSON.parse(line);
      if (!item || typeof item !== "object" || typeof item.type !== "string") return null;
      types.push(item.type);
      if (Number.isInteger(item.length) && item.length >= 0) {
        pos += item.length;
        if (buf[pos] === 0x0a) pos++;
      } else {
        const payloadEnd = buf.indexOf(0x0a, pos);
        pos = payloadEnd === -1 ? buf.length : payloadEnd + 1;
      }
    }
    return { dsn: header.dsn, types };
  } catch {
    return null;
  }
}

// At most `max` takes per window; the window starts at the first take after the
// previous one ended. In memory, so a deploy resets it (deploys are rare).
export function createDailyCap({ max, windowMs = 24 * 60 * 60 * 1000, now = Date.now }) {
  let start = null;
  let count = 0;
  const roll = () => {
    const t = now();
    if (start === null || t - start >= windowMs) {
      start = t;
      count = 0;
    }
    return t;
  };
  return {
    take() {
      roll();
      if (count >= max) return false;
      count++;
      return true;
    },
    retryAfterSec() {
      const t = roll();
      return Math.max(1, Math.ceil((start + windowMs - t) / 1000));
    },
  };
}

// Per-client request counter so one IP cannot spend the whole daily budget.
export function createIpLimiter({ max, windowMs, now = Date.now }) {
  const hits = new Map(); // ip -> { count, resetAt }
  return {
    // true when this request is over the limit
    hit(ip) {
      const t = now();
      const entry = hits.get(ip);
      if (!entry || t > entry.resetAt) {
        hits.set(ip, { count: 1, resetAt: t + windowMs });
        return false;
      }
      entry.count++;
      return entry.count > max;
    },
    sweep() {
      const t = now();
      for (const [ip, entry] of hits) if (t > entry.resetAt) hits.delete(ip);
    },
  };
}
