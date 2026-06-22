/**
 * Smoke Test for Huddle Play Room
 *
 * Starts the game server, connects two WebSocket clients, and runs
 * through the core flow: host a room, join it, start voting, both
 * players vote, and verify a game starts.
 *
 * Usage:
 *   node test/smoke-test.js
 *
 * Exit codes:
 *   0 = all tests passed
 *   1 = one or more tests failed
 */

import { spawn } from "child_process";
import { fileURLToPath } from "url";
import { join, dirname } from "path";
import { createClient } from "./helpers/ws-client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const SERVER_PATH = join(__dirname, "..", "server", "index.js");
const PORT = 9876; // Use a non-standard port to avoid conflicts
const WS_URL = `ws://localhost:${PORT}`;
const TIMEOUT_MS = 15000; // 15 seconds max for the entire test run

// ── Helpers ──────────────────────────────────────────────────────

const colours = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

let passed = 0;
let failed = 0;

function assert(condition, label) {
  if (condition) {
    console.log(`  ${colours.green("PASS")} ${label}`);
    passed++;
  } else {
    console.log(`  ${colours.red("FAIL")} ${label}`);
    failed++;
  }
}

/**
 * From a "playing" state, end the current game, vote for the next, and
 * assert the next game actually starts with the correct gameType. Used to
 * smoke-test all game engines end-to-end via the real WebSocket flow.
 */
async function endAndStart(host, player2, gameName) {
  host.send({ type: "endGame" });

  // Server transitions back to voting; both clients get room + vote_state
  await host.waitFor("room");
  await host.waitFor("vote_state");
  await player2.waitFor("room");
  await player2.waitFor("vote_state");

  // Drain any leftover game-state messages from the previous game so we
  // don't accidentally read one as the new game's first broadcast
  host.messages.length = 0;
  player2.messages.length = 0;

  // Both players vote — voting resolves immediately when all votes are in
  host.send({ type: "vote", game: gameName });
  await host.waitFor("vote_state");
  player2.send({ type: "vote", game: gameName });

  const playingRoom = await host.waitFor("room");
  assert(
    playingRoom.room.currentGame === gameName,
    `${gameName}: room.currentGame === "${gameName}"`
  );
  assert(
    playingRoom.room.status === "playing",
    `${gameName}: room.status === "playing"`
  );

  const state = await host.waitFor("state");
  assert(
    state.state && state.state.gameType === gameName,
    `${gameName}: state.gameType === "${gameName}"`
  );
}

// ── Main test flow ───────────────────────────────────────────────

async function runTests() {
  let server;

  // Global timeout
  const killTimer = setTimeout(() => {
    console.log(colours.red("\nTest run timed out!"));
    cleanup(server, 1);
  }, TIMEOUT_MS);

  try {
    // 1. Start the server
    console.log(colours.bold("\nStarting game server..."));
    server = spawn("node", [SERVER_PATH], {
      env: { ...process.env, PORT: String(PORT) },
      stdio: ["ignore", "pipe", "pipe"],
    });

    // Wait for server to be ready
    await new Promise((resolve, reject) => {
      let ready = false;
      server.stdout.on("data", (chunk) => {
        const text = chunk.toString();
        if (!ready && text.includes("Game server running")) {
          ready = true;
          resolve();
        }
      });
      server.stderr.on("data", (chunk) => {
        // Log server errors but don't reject immediately,
        // the server might still start
        const text = chunk.toString().trim();
        if (text) console.log(colours.dim(`  server stderr: ${text}`));
      });
      server.on("error", reject);
      server.on("exit", (code) => {
        if (!ready) reject(new Error(`Server exited with code ${code} before starting`));
      });
      // Timeout for server start
      setTimeout(() => {
        if (!ready) reject(new Error("Server did not start within 5 seconds"));
      }, 5000);
    });
    console.log(colours.dim(`  Server running on port ${PORT}\n`));

    // ── Test: Welcome messages ──────────────────────────────────

    console.log(colours.bold("Test: Client connections"));

    const host = await createClient(WS_URL, "host");
    const welcome1 = await host.waitFor("welcome");
    host.id = welcome1.id;
    assert(!!host.id, "Host receives a welcome message with an ID");

    const player2 = await createClient(WS_URL, "player2");
    const welcome2 = await player2.waitFor("welcome");
    player2.id = welcome2.id;
    assert(!!player2.id, "Player 2 receives a welcome message with an ID");
    assert(host.id !== player2.id, "Each player gets a unique ID");

    // ── Test: Host a room ───────────────────────────────────────

    console.log(colours.bold("\nTest: Host a room"));

    host.send({ type: "host", name: "TestHost" });
    const hostRoom = await host.waitFor("room");
    const roomCode = hostRoom.room.code;
    assert(!!roomCode && roomCode.length === 4, `Room code is 4 characters: ${roomCode}`);
    assert(hostRoom.room.hostId === host.id, "Host is marked as the host");
    assert(hostRoom.room.players.length === 1, "Room has 1 player after hosting");
    assert(hostRoom.room.status === "lobby", "Room status is 'lobby'");

    // ── Test: Join a room ───────────────────────────────────────

    console.log(colours.bold("\nTest: Join a room"));

    player2.send({ type: "join", code: roomCode, name: "TestPlayer2" });
    const joinRoom = await player2.waitFor("room");
    assert(joinRoom.room.players.length === 2, "Room has 2 players after join");
    assert(
      joinRoom.room.players.some((p) => p.name === "TestPlayer2"),
      "Player 2's name appears in the player list"
    );

    // Host also gets the updated room state
    const hostUpdatedRoom = await host.waitFor("room");
    assert(hostUpdatedRoom.room.players.length === 2, "Host sees 2 players");

    // ── Test: Start voting ──────────────────────────────────────

    console.log(colours.bold("\nTest: Start voting"));

    host.send({ type: "start" });

    // Both players should get a room update (status: voting) and a vote_state
    const hostVotingRoom = await host.waitFor("room");
    assert(hostVotingRoom.room.status === "voting", "Room status changes to 'voting'");

    const hostVoteState = await host.waitFor("vote_state");
    assert(!!hostVoteState.voting, "Host receives initial voting state");
    assert(
      hostVoteState.voting.availableGames.length === 9,
      "9 games are available for voting"
    );

    // Player 2 also gets vote_state
    await player2.waitFor("room"); // consume room update
    const p2VoteState = await player2.waitFor("vote_state");
    assert(!!p2VoteState.voting, "Player 2 receives initial voting state");

    // ── Test: Both players vote ─────────────────────────────────

    console.log(colours.bold("\nTest: Vote for a game"));

    host.send({ type: "vote", game: "snake" });
    // After host votes, both get updated vote_state
    const afterHostVote = await host.waitFor("vote_state");
    assert(afterHostVote.voting.totalVotes === 1, "Vote count is 1 after host votes");

    player2.send({ type: "vote", game: "snake" });

    // When all votes are in, voting resolves immediately.
    // We should get a room update with status: playing and a game state.
    const playingRoom = await host.waitFor("room");
    assert(playingRoom.room.status === "playing", "Room status changes to 'playing'");
    assert(playingRoom.room.currentGame === "snake", "Selected game is 'snake'");

    const gameState = await host.waitFor("state");
    assert(!!gameState.state, "Host receives initial game state");
    assert(gameState.state.gameType === "snake", "Game state confirms snake is running");

    // Player 2 should also be in the game
    const p2PlayingRoom = await player2.waitFor("room");
    assert(p2PlayingRoom.room.status === "playing", "Player 2 sees status 'playing'");

    // ── Test: Each remaining game starts via the full voting flow ───
    // Snake is already running; cycle through the other eight engines.

    console.log(colours.bold("\nTest: Remaining games start cleanly"));

    for (const game of [
      "truths",
      "emoji",
      "sketch",
      "trivia",
      "typeracer",
      "wordchain",
      "bomber",
      "hottake",
    ]) {
      await endAndStart(host, player2, game);
    }

    // ── Test: Error handling ────────────────────────────────────

    console.log(colours.bold("\nTest: Error handling"));

    // Try joining a non-existent room
    const errorClient = await createClient(WS_URL, "error-test");
    await errorClient.waitFor("welcome");
    errorClient.send({ type: "join", code: "ZZZZ", name: "Ghost" });
    const errorMsg = await errorClient.waitFor("error");
    assert(errorMsg.message === "Room not found.", "Joining invalid room returns error");
    errorClient.close();

    // ── Test: Disconnect cleanup ────────────────────────────────

    console.log(colours.bold("\nTest: Disconnect cleanup"));

    player2.close();
    // Give the server a moment to process the disconnect
    await new Promise((r) => setTimeout(r, 200));

    // Host should get a room update showing only 1 player
    const afterDisconnect = await host.waitFor("room", 2000);
    assert(
      afterDisconnect.room.players.length === 1,
      "Room has 1 player after disconnect"
    );

    // ── Test: Feedback endpoint ────────────────────────────────────

    console.log(colours.bold("\nTest: Feedback endpoint"));

    const feedbackUrl = `http://localhost:${PORT}/api/feedback`;

    // OPTIONS preflight → 204
    const preflightResp = await fetch(feedbackUrl, { method: "OPTIONS" });
    assert(preflightResp.status === 204, "OPTIONS preflight returns 204");
    assert(
      preflightResp.headers.get("access-control-allow-methods") === "POST",
      "Preflight includes correct Allow-Methods header"
    );

    // Without LINEAR_API_KEY, the server returns 503 before validation.
    // The test server runs without LINEAR_API_KEY, so all POSTs get 503.
    const noKeyResp = await fetch(feedbackUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "bug", name: "Tester", description: "Something broke" }),
    });
    assert(noKeyResp.status === 503, "Request without API key returns 503");
    const noKeyBody = await noKeyResp.json();
    assert(noKeyBody.error === "Feedback is temporarily unavailable.", "503 returns correct message");

    // Also verify 503 for invalid payloads (API key check comes first)
    const badResp = await fetch(feedbackUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "bug" }),
    });
    assert(badResp.status === 503, "Missing fields still returns 503 when no API key");

    // ── Summary ─────────────────────────────────────────────────

    host.close();
    clearTimeout(killTimer);

    console.log(colours.bold("\n────────────────────────────────────"));
    console.log(
      `  ${colours.green(`${passed} passed`)}, ${
        failed > 0 ? colours.red(`${failed} failed`) : `${failed} failed`
      }`
    );
    console.log(colours.bold("────────────────────────────────────\n"));

    cleanup(server, failed > 0 ? 1 : 0);
  } catch (err) {
    clearTimeout(killTimer);
    console.log(colours.red(`\nTest error: ${err.message}`));
    cleanup(server, 1);
  }
}

function cleanup(server, exitCode) {
  if (server) {
    server.kill("SIGTERM");
    // Give it a moment then force kill
    setTimeout(() => {
      try { server.kill("SIGKILL"); } catch {}
      process.exit(exitCode);
    }, 500);
  } else {
    process.exit(exitCode);
  }
}

runTests();
