/**
 * WebSocket test harness — extracted from smoke-test.js so both the smoke test
 * and the node:test integration suites can share one client implementation.
 *
 * Exports:
 *   - createClient(wsUrl, name): connect a client; returns { send, waitFor, waitForMatch, close, ... }
 *   - startServer(port): spawn server/index.js on a port; resolves once it's listening
 *   - sleep(ms): small await helper
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { join, dirname } from "node:path";
import WebSocket from "ws";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = join(__dirname, "..", "..", "server", "index.js");

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Connect a WebSocket client and return a helper object with:
 *   - ws: the raw WebSocket
 *   - messages: array of received messages not yet consumed by a waiter (parsed JSON)
 *   - send(obj): send a JSON message
 *   - waitFor(type, timeout): resolve with the next message of `type`
 *   - waitForMatch(type, predicate, timeout): resolve with the next `type` message
 *       for which predicate(msg) is true (intermediate non-matching messages are buffered)
 *   - close(): close the connection
 */
export function createClient(wsUrl, name = "client") {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const messages = [];
    const waiters = []; // { type, predicate, resolve, timer }

    ws.on("open", () => {
      resolve({
        name,
        ws,
        messages,
        id: null,
        send(obj) {
          ws.send(JSON.stringify(obj));
        },
        waitForMatch(type, predicate = () => true, timeoutMs = 5000) {
          const idx = messages.findIndex((m) => m.type === type && predicate(m));
          if (idx !== -1) {
            const [m] = messages.splice(idx, 1);
            return Promise.resolve(m);
          }
          return new Promise((res, rej) => {
            const timer = setTimeout(() => {
              const i = waiters.findIndex((w) => w.timer === timer);
              if (i !== -1) waiters.splice(i, 1);
              rej(new Error(`${name}: timed out waiting for "${type}" message`));
            }, timeoutMs);
            waiters.push({ type, predicate, resolve: res, timer });
          });
        },
        waitFor(type, timeoutMs = 5000) {
          return this.waitForMatch(type, () => true, timeoutMs);
        },
        close() {
          ws.close();
        },
      });
    });

    ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString());
      const idx = waiters.findIndex((w) => w.type === msg.type && w.predicate(msg));
      if (idx !== -1) {
        const waiter = waiters.splice(idx, 1)[0];
        clearTimeout(waiter.timer);
        waiter.resolve(msg);
      } else {
        messages.push(msg);
      }
    });

    ws.on("error", reject);
  });
}

/**
 * Spawn the real game server on `port` and resolve once it logs that it's
 * running. Returns { proc, stop } where stop() force-kills it and waits for exit.
 * `extraEnv` lets a test override server config (e.g. { MAX_ROOMS: "1" }).
 */
export function startServer(port, extraEnv = {}) {
  return new Promise((resolve, reject) => {
    const proc = spawn("node", [SERVER_PATH], {
      env: { ...process.env, PORT: String(port), ...extraEnv },
      stdio: ["ignore", "pipe", "pipe"],
    });
    let ready = false;

    proc.stdout.on("data", (chunk) => {
      if (!ready && chunk.toString().includes("Game server running")) {
        ready = true;
        resolve({
          proc,
          stop() {
            return new Promise((res) => {
              proc.once("exit", () => res());
              proc.kill("SIGKILL");
            });
          },
        });
      }
    });
    proc.stderr.on("data", () => {}); // swallow; surfaced via exit code if it dies
    proc.on("error", reject);
    proc.on("exit", (code) => {
      if (!ready) reject(new Error(`server exited with code ${code} before starting`));
    });
    setTimeout(() => {
      if (!ready) reject(new Error("server did not start within 5 seconds"));
    }, 5000);
  });
}

/**
 * Drive a fresh room from lobby to a specific game in the "playing" phase.
 * `clients` are already-connected createClient() objects (each has had its
 * welcome consumed and `.id` set). The first client hosts; the rest join.
 * Returns the room code.
 */
export async function setupGameRoom(clients, gameName) {
  const [host, ...rest] = clients;

  host.send({ type: "host", name: host.name });
  const hosted = await host.waitFor("room");
  const code = hosted.room.code;

  for (const c of rest) {
    c.send({ type: "join", code, name: c.name });
    await c.waitForMatch("room", (m) => m.room.players.some((p) => p.id === c.id));
  }

  host.send({ type: "start" });
  for (const c of clients) {
    await c.waitForMatch("room", (m) => m.room.status === "voting");
  }

  for (const c of clients) {
    c.send({ type: "vote", game: gameName });
  }
  for (const c of clients) {
    await c.waitForMatch("room", (m) => m.room.status === "playing" && m.room.currentGame === gameName);
  }

  return code;
}
