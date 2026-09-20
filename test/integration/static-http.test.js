// Static-file HTTP behaviour (Sept 2026 review: SEO + Railway healthcheck).
//
// - /health must answer 200 whatever the Host header: Railway's healthcheck
//   probe uses its own host, and the canonical-host 301 used to run first.
// - robots.txt / sitemap.xml / the web manifest were served as
//   application/octet-stream because their extensions had no MIME type.
// - Only Vite's content-hashed /assets/* may be cached as immutable; other
//   public files (favicon, icons, share image) keep stable names, so a year-long
//   immutable cache would pin stale copies after a change.
// - 127.0.0.1 is a local dev host and must not bounce to production.
//
// Uses a throwaway DIST_DIR fixture so the test does not depend on `npm run build`
// (CI runs the suite without building).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { startServer } from "../helpers/ws-client.js";

const PORT = 9898;
let server;
let dist;

before(async () => {
  dist = mkdtempSync(join(tmpdir(), "hpr-dist-"));
  mkdirSync(join(dist, "assets"));
  mkdirSync(join(dist, "logos"));
  writeFileSync(join(dist, "index.html"), "<!doctype html><title>t</title>");
  writeFileSync(join(dist, "robots.txt"), "User-agent: *\nAllow: /\n");
  writeFileSync(join(dist, "sitemap.xml"), "<?xml version=\"1.0\"?><urlset/>");
  writeFileSync(join(dist, "manifest.webmanifest"), "{}");
  writeFileSync(join(dist, "favicon.ico"), Buffer.from([0, 0, 1, 0]));
  writeFileSync(join(dist, "assets", "index-abc123.js"), "console.log(1)");
  writeFileSync(join(dist, "assets", "index-abc123.js.map"), '{"version":3,"sources":[],"mappings":""}');
  writeFileSync(join(dist, "logos", "logo.png"), Buffer.from([137, 80, 78, 71]));
  server = await startServer(PORT, { DIST_DIR: dist });
});
after(async () => {
  await server.stop();
  rmSync(dist, { recursive: true, force: true });
});

function get(path, host = "localhost") {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port: PORT, path, headers: { Host: host } }, (res) => {
      res.resume();
      res.on("end", () => resolve(res));
    });
    req.on("error", reject);
    req.end();
  });
}

test("/health answers 200 for a non-canonical Host (Railway healthcheck probe)", async () => {
  const res = await get("/health", "healthcheck.railway.app");
  assert.equal(res.statusCode, 200);
  assert.match(res.headers["content-type"], /application\/json/);
});

test("other paths on a non-canonical Host still redirect to the canonical domain", async () => {
  const res = await get("/", "ice-breaker-games-production.up.railway.app");
  assert.equal(res.statusCode, 301);
  assert.equal(res.headers.location, "https://huddleplayroom.com/");
});

test("127.0.0.1 is treated as a local host, not redirected to production", async () => {
  const res = await get("/", "127.0.0.1");
  assert.equal(res.statusCode, 200);
});

test("an IPv6 loopback Host is local too, not a foreign host", async () => {
  // "[::1]:3000" split on the first colon is "[", which matched neither the
  // canonical host nor the local list, so dev over IPv6 bounced to production.
  for (const host of ["[::1]", "[::1]:3000"]) {
    const res = await get("/", host);
    assert.equal(res.statusCode, 200, `${host} was redirected to production`);
  }
  // A bracketed host that isn't loopback still redirects.
  assert.equal((await get("/", "[2001:db8::1]:8080")).statusCode, 301);
});

test("SEO files are served with their proper content types", async () => {
  assert.match((await get("/robots.txt")).headers["content-type"], /^text\/plain/);
  assert.match((await get("/sitemap.xml")).headers["content-type"], /^application\/xml/);
  assert.match((await get("/manifest.webmanifest")).headers["content-type"], /^application\/manifest\+json/);
  assert.equal((await get("/favicon.ico")).headers["content-type"], "image/x-icon");
});

test("a query string does not break static file lookup", async () => {
  const res = await get("/robots.txt?utm_source=x");
  assert.match(res.headers["content-type"], /^text\/plain/);
});

test("only hashed /assets/* files are cached as immutable", async () => {
  assert.match((await get("/assets/index-abc123.js")).headers["cache-control"], /immutable/);
  const logo = (await get("/logos/logo.png")).headers["cache-control"];
  assert.doesNotMatch(logo, /immutable/);
  assert.match(logo, /max-age=\d+/);
});

// Source maps are public on purpose (the repo is public): Sentry fetches them to
// turn minified browser stack frames back into source lines, with no upload
// step or auth token. They must be served as JSON and cached like their bundle.
test("source maps under /assets are served as JSON with the immutable cache", async () => {
  const res = await get("/assets/index-abc123.js.map");
  assert.equal(res.statusCode, 200);
  assert.match(res.headers["content-type"], /application\/json/);
  assert.match(res.headers["cache-control"], /immutable/);
});

// The CSP is the page's main XSS guard, so pin it exactly. Beyond 'self', the
// only script origin is Cloudflare Web Analytics, which Cloudflare injects at
// the edge (the user keeps it on), and its beacon reports to cloudflareinsights.com.
test("the CSP allows exactly our own origin plus Cloudflare Web Analytics", async () => {
  const res = await get("/");
  const csp = Object.fromEntries(
    res.headers["content-security-policy"].split(";").map((d) => d.trim().split(/\s+/)).map(([k, ...v]) => [k, v])
  );
  assert.deepEqual(csp["default-src"], ["'self'"]);
  assert.deepEqual(csp["script-src"], ["'self'", "https://static.cloudflareinsights.com"]);
  assert.deepEqual(csp["connect-src"], ["'self'", "wss://huddleplayroom.com", "ws://localhost:*", "https://cloudflareinsights.com"]);
  assert.deepEqual(csp["img-src"], ["'self'", "data:"]);
});

