// Who a request counts as, for the per-IP limits on /api/feedback and
// /api/sentry. Pure so it can be tested directly: the production bug it now
// pins was a wrong answer here, invisible through the endpoints themselves.
//
// Cloudflare sets cf-connecting-ip to the real client address, but the origin
// also answers requests that skip Cloudflare (Railway's edge routes on the Host
// header), and there every header is whatever the caller typed. With a secret
// configured — added to each request by a Cloudflare transform rule — only
// requests carrying it are believed.
export const UNTRUSTED_CLIENT = "untrusted";

export function createClientIp({ secret = "", header = "x-origin-secret" } = {}) {
  const headerName = header.toLowerCase();

  const trusted = (req) => {
    if (!secret) return true; // nothing configured: pre-existing behaviour
    return req.headers?.[headerName] === secret;
  };

  const clientIp = (req) => {
    // One shared bucket for everything we can't attribute. Not the socket
    // address: Railway's edge hands each request to the container from its own
    // internal address, so keying on it gives every request its own budget and
    // grows the limiter map by an entry per request.
    if (!trusted(req)) return UNTRUSTED_CLIENT;
    return (
      req.headers?.["cf-connecting-ip"] ||
      req.headers?.["x-forwarded-for"]?.split(",")[0]?.trim() ||
      req.socket?.remoteAddress
    );
  };
  clientIp.trusted = trusted;
  clientIp.configured = Boolean(secret);
  return clientIp;
}
