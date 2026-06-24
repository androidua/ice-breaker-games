// Region diagnostic endpoint (deferred [low]). GET /health returns JSON with the
// app version and the Railway replica region (process.env.RAILWAY_REPLICA_REGION),
// so the live hosting region is provable with a plain curl instead of the Railway
// API. The `region` field is null when not running on Railway (e.g. in tests).

import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { startServer } from "../helpers/ws-client.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "..", "..", "package.json"), "utf8"));

const PORT = 9891;
let server;

before(async () => { server = await startServer(PORT); });
after(async () => { await server.stop(); });

test("GET /health returns ok JSON with the current version and a region field", async () => {
  const res = await fetch(`http://localhost:${PORT}/health`);
  assert.equal(res.status, 200);
  assert.match(res.headers.get("content-type") || "", /application\/json/);

  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.version, pkg.version, "reports the package.json version");
  assert.ok("region" in body, "always includes a region field (null off Railway)");
  assert.equal(body.region, null, "region is null when RAILWAY_REPLICA_REGION is unset");
});
