// Who a request counts as for the per-IP limits. This was wrong in production
// in a way no endpoint test could see: with a secret configured, requests that
// didn't carry it were keyed on the socket address, and Railway's edge gives
// each request its own internal source address — so every request got a fresh
// budget and the limits never fired.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createClientIp, UNTRUSTED_CLIENT } from "../../server/client-ip.js";

const req = (headers = {}, remoteAddress = "10.0.0.1") => ({ headers, socket: { remoteAddress } });

test("with no secret configured, the forwarded client IP is used as before", () => {
  const clientIp = createClientIp({});
  assert.equal(clientIp.configured, false);
  assert.equal(clientIp(req({ "cf-connecting-ip": "1.2.3.4" })), "1.2.3.4");
  assert.equal(clientIp(req({ "x-forwarded-for": "5.6.7.8, 9.9.9.9" })), "5.6.7.8");
  assert.equal(clientIp(req({})), "10.0.0.1", "falls back to the socket");
});

test("with a secret configured, only a request carrying it is believed", () => {
  const clientIp = createClientIp({ secret: "s3cret" });
  assert.equal(clientIp.configured, true);
  assert.equal(clientIp(req({ "cf-connecting-ip": "1.2.3.4", "x-origin-secret": "s3cret" })), "1.2.3.4");
  assert.equal(clientIp(req({ "cf-connecting-ip": "1.2.3.4" })), UNTRUSTED_CLIENT);
  assert.equal(clientIp(req({ "cf-connecting-ip": "1.2.3.4", "x-origin-secret": "wrong" })), UNTRUSTED_CLIENT);
});

test("untrusted requests share one identity, whatever their socket address", () => {
  const clientIp = createClientIp({ secret: "s3cret" });
  // Railway's edge: a different internal source address per request.
  const seen = new Set([
    clientIp(req({ "cf-connecting-ip": "1.1.1.1" }, "fd12::a")),
    clientIp(req({ "cf-connecting-ip": "2.2.2.2" }, "fd12::b")),
    clientIp(req({}, "fd12::c")),
  ]);
  assert.deepEqual([...seen], [UNTRUSTED_CLIENT], "each proxy address got its own budget");
});

test("the header name can be changed, and matching is case-insensitive on the name", () => {
  const clientIp = createClientIp({ secret: "s3cret", header: "X-Edge-Token" });
  assert.equal(clientIp(req({ "cf-connecting-ip": "1.2.3.4", "x-edge-token": "s3cret" })), "1.2.3.4");
  assert.equal(clientIp(req({ "cf-connecting-ip": "1.2.3.4", "x-origin-secret": "s3cret" })), UNTRUSTED_CLIENT);
});

test("trusted() answers the question /health reports", () => {
  const clientIp = createClientIp({ secret: "s3cret" });
  assert.equal(clientIp.trusted(req({ "x-origin-secret": "s3cret" })), true);
  assert.equal(clientIp.trusted(req({})), false);
  assert.equal(createClientIp({}).trusted(req({})), true, "unconfigured: nothing is rejected");
});
