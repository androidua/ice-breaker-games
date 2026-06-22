// B3 · Type Racer paste-to-win (audit finding #8).
//
// updateProgress marks a player finished as soon as the submitted string is as
// long as the paragraph — no timing check — so a single paste of the full text
// is an instant max-score win. The fix gates a finish on a minimum plausible
// time (no human clears the paragraph faster than ~MAX_CPS chars/sec), which
// removes the cheat's advantage at the source without inspecting content (so
// the game's "mistakes won't block you from finishing" rule and backspacing
// both still work). Resolved decision #3 in the fix plan.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createTyperacerState, handleTyperacerAction } from "../../server/typeracer-engine.js";
import { identityRng } from "../helpers/rng.js";

const players = [{ id: "p1" }, { id: "p2" }];

// — the red→green gate —
test("an instant full-paragraph paste cannot finish", () => {
  let s = createTyperacerState({ players, rng: identityRng });
  const full = s.paragraph;
  s = handleTyperacerAction(s, "p1", { kind: "progress", typed: full }); // 0 → full in one jump
  assert.equal(
    s.progress.get("p1").finished,
    false,
    "RED: length-only finish lets a paste win instantly; GREEN: the min-time gate rejects it"
  );
});

// — guard rails: the fix must stay narrow —
test("legitimate typing still finishes once enough time has elapsed", () => {
  let s = createTyperacerState({ players, rng: identityRng });
  s.raceStartTime = Date.now() - 60000; // unit tests can't type for real seconds
  s = handleTyperacerAction(s, "p1", { kind: "progress", typed: s.paragraph });
  assert.equal(s.progress.get("p1").finished, true, "a full entry after real time must finish");
});

test("a mistake is penalised but does not block finishing", () => {
  let s = createTyperacerState({ players, rng: identityRng });
  s.raceStartTime = Date.now() - 60000;
  const full = s.paragraph;
  const withTypo = full.slice(0, 5) + (full[5] === "x" ? "y" : "x") + full.slice(6);
  s = handleTyperacerAction(s, "p1", { kind: "progress", typed: withTypo });
  const p = s.progress.get("p1");
  assert.equal(p.finished, true, "finishing with mistakes is allowed by the game's rules");
  assert.ok(p.mistakes >= 1, "the mistake is still counted for scoring");
});
