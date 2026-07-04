// Origin allowlist bypass (security audit: substring match).
//
// verifyClient used origin.includes("localhost"), which accepts any origin
// merely containing the substring — e.g. https://localhost.evil.com, where an
// attacker controls the subdomain. The check must parse the origin URL and
// compare the hostname exactly (localhost or 127.0.0.1), keep the exact match
// for the canonical production origin, and keep allowing origin-less
// connections (server-to-server clients like these tests).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";
import { startServer } from "../helpers/ws-client.js";

const PORT = 9894;
const WS_URL = `ws://localhost:${PORT}`;
let server;

before(async () => { server = await startServer(PORT); });
after(async () => { await server.stop(); });

// Resolves true if the handshake completes, false if the server rejects it.
function tryConnect(origin) {
  return new Promise((resolve) => {
    const ws = new WebSocket(WS_URL, origin ? { origin } : {});
    ws.on("open", () => { ws.close(); resolve(true); });
    ws.on("error", () => resolve(false));
  });
}

test("rejects origins that merely contain 'localhost' as a substring", async () => {
  assert.equal(await tryConnect("https://localhost.evil.com"), false);
  assert.equal(await tryConnect("https://evil-localhost.com"), false);
});

test("accepts real localhost dev origins", async () => {
  assert.equal(await tryConnect("http://localhost:5173"), true);
  assert.equal(await tryConnect("http://127.0.0.1:5173"), true);
});

test("accepts the canonical production origin", async () => {
  assert.equal(await tryConnect("https://huddleplayroom.com"), true);
});

test("rejects unrelated or malformed origins", async () => {
  assert.equal(await tryConnect("https://evil.com"), false);
  assert.equal(await tryConnect("not-a-url"), false);
});

test("accepts connections with no Origin header (server-to-server)", async () => {
  assert.equal(await tryConnect(null), true);
});
