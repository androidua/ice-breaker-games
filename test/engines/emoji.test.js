// A4 (engine layer) · The Emoji guessing phase must have a countdown timer.
//
// Today submitEmojis sets timer:null, so the guessing phase runs with no clock
// and (combined with no server interval) can hang forever. The fix gives the
// guessing phase a finite countdown so it always self-resolves.

import { test } from "node:test";
import assert from "node:assert/strict";
import { createEmojiState, handleEmojiAction } from "../../server/emoji-engine.js";
import { identityRng } from "../helpers/rng.js";

test("submitting emojis starts a guessing-phase countdown (not a null timer)", () => {
  let s = createEmojiState({ players: [{ id: "a" }, { id: "b" }], rng: identityRng });
  s = handleEmojiAction(s, s.storytellerId, { kind: "submitEmojis", emojis: "🎬🦖" });

  assert.equal(s.status, "guessing", "submitting advances composing → guessing");
  assert.equal(typeof s.timer, "number", "RED: guessing timer is null; GREEN: a numeric countdown");
  assert.ok(s.timer > 0, "the guessing countdown starts positive");
});
