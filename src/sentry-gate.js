// Browser-side Sentry quota guard (Plan E2), used as the SDK's beforeSend
// filter. The server tunnel enforces the global daily cap; this stops one page
// from spending it: a bug that throws every render or every Snake frame sends
// each distinct error once, and at most `max` errors per page load.
export function createEventGate({ max = 10 } = {}) {
  const seen = new Set();
  return (event) => {
    const key = fingerprint(event);
    if (seen.has(key) || seen.size >= max) return false;
    seen.add(key);
    return true;
  };
}

function fingerprint(event) {
  const ex = event?.exception?.values?.[0];
  return ex ? `${ex.type}: ${ex.value}` : String(event?.message ?? "");
}
