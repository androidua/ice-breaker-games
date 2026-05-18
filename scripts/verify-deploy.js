#!/usr/bin/env node
/**
 * verify-deploy.js
 *
 * Polls Railway for the deployment of a specific commit, then verifies the
 * live site is serving it. Reports via stdout and a macOS notification.
 * Designed to be spawned in the background by the pre-push hook so the
 * developer doesn't have to babysit Railway after every push.
 *
 * Usage:
 *   node scripts/verify-deploy.js [<commit-sha>]
 *   npm run verify-deploy
 *
 * If no SHA is given, uses local HEAD.
 *
 * Exit codes:
 *   0  deploy succeeded and live URL serves the new code
 *   2  build succeeded but live URL check failed
 *   3  build failed (last 30 build log lines printed)
 *   4  timed out waiting for the deployment to finish
 *   99 verifier itself crashed
 */

import { execSync, spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { readFileSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, "..");
const PKG = JSON.parse(readFileSync(join(PROJECT_ROOT, "package.json"), "utf8"));

const EXPECTED_SHA = (
  process.argv[2] ||
  execSync("git rev-parse HEAD", { cwd: PROJECT_ROOT }).toString().trim()
);
const SHORT_SHA = EXPECTED_SHA.slice(0, 7);

const POLL_INTERVAL_MS = 5000;
const TOTAL_TIMEOUT_MS = 6 * 60 * 1000;
const LIVE_URL = "https://huddleplayroom.com";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function log(msg) {
  console.log(`[${new Date().toISOString()}] ${msg}`);
}

function notify(title, message) {
  const safeTitle = title.replace(/"/g, '\\"');
  const safeMsg = message.replace(/"/g, '\\"');
  try {
    spawnSync(
      "osascript",
      ["-e", `display notification "${safeMsg}" with title "${safeTitle}"`],
      { timeout: 3000 }
    );
  } catch {
    /* notifications optional */
  }
}

function railway(args) {
  try {
    return execSync(`railway ${args}`, {
      cwd: PROJECT_ROOT,
      stdio: ["ignore", "pipe", "pipe"],
    }).toString();
  } catch (err) {
    log(`railway ${args} failed: ${err.message}`);
    return null;
  }
}

function findDeployment(sha) {
  const out = railway("deployment list --json");
  if (!out) return null;
  try {
    const list = JSON.parse(out);
    return list.find((d) => d.meta && d.meta.commitHash === sha) || null;
  } catch (err) {
    log(`JSON parse failed: ${err.message}`);
    return null;
  }
}

function checkLive() {
  try {
    const html = execSync(`curl -s -L --max-time 10 ${LIVE_URL}/`, {
      stdio: ["ignore", "pipe", "pipe"],
    }).toString();
    if (!html.includes("Huddle Play Room")) {
      return { ok: false, reason: "page does not contain title" };
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

async function main() {
  log(`Verifying deploy of ${SHORT_SHA} (v${PKG.version})`);
  const t0 = Date.now();
  let announced = false;

  while (Date.now() - t0 < TOTAL_TIMEOUT_MS) {
    const d = findDeployment(EXPECTED_SHA);
    if (!d) {
      log(`Waiting for Railway to detect ${SHORT_SHA}...`);
      await sleep(POLL_INTERVAL_MS);
      continue;
    }
    if (!announced) {
      log(`Railway picked up the deploy: ${d.id.slice(0, 8)}... status=${d.status}`);
      announced = true;
    }
    if (d.status === "SUCCESS") {
      log("Build SUCCESS. Checking live URL...");
      await sleep(3000);
      const live = checkLive();
      if (live.ok) {
        log("Live URL is up and serving expected content.");
        notify(`HPR ${PKG.version} ✓`, `Deploy ${SHORT_SHA} live`);
        return 0;
      }
      log(`Live URL check FAILED: ${live.reason}`);
      notify(`HPR ${PKG.version} ⚠`, `Deploy SUCCESS, site check failed`);
      return 2;
    }
    if (d.status === "FAILED" || d.status === "CRASHED") {
      log(`Build ${d.status}. Last 30 build log lines:`);
      const logs = railway(`logs --build --lines 30 ${d.id}`);
      if (logs) console.log(logs);
      notify(`HPR ${PKG.version} ✗`, `Build ${d.status} for ${SHORT_SHA}`);
      return 3;
    }
    log(`Deploy in progress (status=${d.status}); polling in ${POLL_INTERVAL_MS / 1000}s`);
    await sleep(POLL_INTERVAL_MS);
  }

  log("Timed out before deployment completed.");
  notify(`HPR ${PKG.version} ⏱`, `Timeout waiting for ${SHORT_SHA}`);
  return 4;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    log(`Fatal: ${err.message}`);
    notify("HPR deploy ✗", "verify-deploy crashed");
    process.exit(99);
  });
