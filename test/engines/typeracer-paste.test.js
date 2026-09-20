// Type Racer: a DELAYED paste must not win.
//
// The existing min-time gate (typeracer.test.js, resolved decision #3) rejects a
// paste at t≈0, and that fix assumed it "removes the cheat's advantage at the
// source". It does not: the gate only sets a FLOOR on elapsed time. Waiting
// paragraph.length / MAX_CPS seconds and then pasting clears the floor and
// finishes with zero mistakes at the fastest legal time. Measured live at
// v1.22.2: the pasting racer scored 931 and won the round against honest
// typists on 901/876/851/811.
//
// The fix stays content-blind (so "mistakes don't block finishing" and
// backspacing both still hold) and limits the RATE instead: progress may grow
// no faster than MAX_CPS chars/sec, with a small burst allowance for IME and
// autocorrect. Typing is unaffected; a paste is clamped to the burst.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createTyperacerState, handleTyperacerAction } from "../../server/typeracer-engine.js";
import { identityRng } from "../helpers/rng.js";

const players = [{ id: "p1" }, { id: "p2" }];
const progressOf = (s) => s.progress.get("p1");

// Simulate `ms` of wall clock passing for p1 without sleeping: pull both the
// race start and this player's last-update stamp backwards.
function rewind(s, ms) {
  s.raceStartTime -= ms;
  const p = s.progress.get("p1");
  if (p.lastUpdateAt) s.progress.set("p1", { ...p, lastUpdateAt: p.lastUpdateAt - ms });
  return s;
}

test("a delayed full-paragraph paste cannot finish", () => {
  let s = createTyperacerState({ players, rng: identityRng });
  // Wait out the min-time gate, then paste the whole thing in one message.
  s = rewind(s, 60000);
  s = handleTyperacerAction(s, "p1", { kind: "progress", typed: s.paragraph });

  assert.equal(
    progressOf(s).finished,
    false,
    "RED: the min-time gate alone lets a delayed paste finish; GREEN: the rate cap clamps it"
  );
  assert.ok(
    progressOf(s).typed.length < s.paragraph.length,
    "a single paste must be clamped well short of the full paragraph"
  );
});

test("a chunked paste cannot outrun the human rate cap", () => {
  let s = createTyperacerState({ players, rng: identityRng });
  s = rewind(s, 60000);
  // Fire the whole paragraph as back-to-back messages with no time passing —
  // the obvious way to defeat a naive per-message character cap.
  for (let i = 0; i < 20; i++) {
    s = handleTyperacerAction(s, "p1", { kind: "progress", typed: s.paragraph });
  }
  assert.equal(
    progressOf(s).finished,
    false,
    "spamming full-length updates with no elapsed time must not finish the race"
  );
});

test("typing at human speed is never clamped", () => {
  let s = createTyperacerState({ players, rng: identityRng });
  const target = s.paragraph;
  let typed = "";
  // 4 chars every 250ms = 16 chars/sec, comfortably under MAX_CPS.
  while (typed.length < target.length) {
    typed = target.slice(0, Math.min(typed.length + 4, target.length));
    s = rewind(s, 250);
    s = handleTyperacerAction(s, "p1", { kind: "progress", typed });
    assert.equal(
      progressOf(s).typed,
      typed,
      `a human-speed update must be recorded verbatim (at length ${typed.length})`
    );
  }
  assert.equal(progressOf(s).finished, true, "typing the whole paragraph at human speed must finish");
  assert.equal(progressOf(s).mistakes, 0);
});

test("a mistake is still penalised but does not block finishing", () => {
  // Guard rail for resolved decision #3: the rate cap must not become a
  // content check. A typo must still finish, still counting the mistake.
  let s = createTyperacerState({ players, rng: identityRng });
  const target = s.paragraph;
  const withTypo = target.slice(0, 5) + (target[5] === "x" ? "y" : "x") + target.slice(6);
  let typed = "";
  while (typed.length < withTypo.length) {
    typed = withTypo.slice(0, Math.min(typed.length + 4, withTypo.length));
    s = rewind(s, 250);
    s = handleTyperacerAction(s, "p1", { kind: "progress", typed });
  }
  assert.equal(progressOf(s).finished, true, "finishing with mistakes is allowed by the game's rules");
  assert.ok(progressOf(s).mistakes >= 1, "the mistake is still counted for scoring");
});

test("backspacing is never clamped", () => {
  let s = createTyperacerState({ players, rng: identityRng });
  const target = s.paragraph;
  let typed = "";
  for (let i = 0; i < 5; i++) {
    typed = target.slice(0, typed.length + 4);
    s = rewind(s, 250);
    s = handleTyperacerAction(s, "p1", { kind: "progress", typed });
  }
  const before = progressOf(s).typed.length;
  // Delete almost everything in one go — shrinking is not growth and must pass.
  s = handleTyperacerAction(s, "p1", { kind: "progress", typed: target.slice(0, 2) });
  assert.equal(progressOf(s).typed.length, 2, `backspacing from ${before} to 2 chars must be recorded exactly`);
});
