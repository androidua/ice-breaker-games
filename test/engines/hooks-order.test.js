// Every React component and custom hook must call its hooks on every render.
// TruthsGame called useMemo below `if (!game) return null`, so a player whose
// client rendered it once before the first `state` message arrived got
// "Rendered more hooks than during the previous render" and lost the game
// screen (Sentry HUDDLE-PLAY-ROOM-5, 2026-10-03). See test/helpers/hook-order.js
// for why this reads the source instead of rendering.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { checkHookOrder } from "../helpers/hook-order.js";

const SRC = fileURLToPath(new URL("../../src", import.meta.url));

function sourceFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return sourceFiles(path);
    return /\.jsx?$/.test(e.name) ? [path] : [];
  });
}

const FILES = sourceFiles(SRC);
const GAMES = ["Bomber", "Emoji", "HotTakeVoting", "Snake", "Sketch", "Trivia", "Truths", "Typeracer", "WordChain"];

test("no component or custom hook calls a hook after an early return or inside a condition", () => {
  const violations = FILES.flatMap((file) =>
    checkHookOrder(readFileSync(file, "utf8")).violations.map((v) => `${relative(SRC, file)}: ${v}`));
  assert.deepEqual(violations, []);
});

// Positive controls. Without them a parser that silently found nothing would
// make the test above pass for ever.
test("the check actually analyses every game component and finds its hooks", () => {
  for (const game of GAMES) {
    const file = FILES.find((f) => f.endsWith(`${game}Game.jsx`));
    assert.ok(file, `${game}Game.jsx not found under src/`);
    const { components } = checkHookOrder(readFileSync(file, "utf8"));
    const main = components.find((c) => c.name === `${game}Game`);
    assert.ok(main, `${game}Game: component not recognised`);
    assert.ok(main.hooks >= 2, `${game}Game: only ${main.hooks} hook call(s) seen`);
  }
});

test("flags the exact shape that broke Two Truths & a Lie", () => {
  const { violations } = checkHookOrder(`
    import { useMemo, useState } from "react";
    export default function TruthsGame({ game, me }) {
      const [lieIndex, setLieIndex] = useState(0);
      if (!game) return null;
      const order = useMemo(() => [2, 0, 1], [me.id, game.round]);
      return <main>{order}</main>;
    }
  `);
  assert.equal(violations.length, 1);
  assert.match(violations[0], /TruthsGame: useMemo\(\) on line 6 is below an early return/);
});

test("accepts the fix: every hook above the early return", () => {
  const { violations, components } = checkHookOrder(`
    import { useMemo, useState } from "react";
    export default function TruthsGame({ game, me }) {
      const [lieIndex, setLieIndex] = useState(0);
      const order = useMemo(() => [2, 0, 1], [me.id, game?.round]);
      if (!game) return null;
      return <main>{order}</main>;
    }
  `);
  assert.deepEqual(violations, []);
  assert.deepEqual(components, [{ name: "TruthsGame", hooks: 2 }]);
});

test("flags hooks inside conditions, ternaries, && and loops", () => {
  const { violations } = checkHookOrder(`
    function Panel({ a, items }) {
      if (a) { useState(0); }
      const b = a ? useRef(null) : null;
      a && useEffect(() => {});
      for (const i of items) useMemo(() => i, [i]);
      return null;
    }
    const useThing = (a) => { try { useState(1); } catch {} };
  `);
  assert.deepEqual(violations.map((v) => v.split(" on line")[0]), [
    "Panel: useState()", "Panel: useRef()", "Panel: useEffect()", "Panel: useMemo()", "useThing: useState()",
  ]);
});

test("does not flag hooks in other scopes or early returns inside callbacks", () => {
  const { violations } = checkHookOrder(`
    import * as React from "react";
    export function Clock({ game }) {
      const ref = React.useRef(null);
      const onTick = () => { if (!game) return; };
      React.useEffect(() => { if (!game) return; ref.current = 1; }, [game]);
      const [n, setN] = React.useState(0);
      return <span>{n}</span>;
    }
    function helper(x) { if (!x) return null; return useNotAHookHere; }
  `);
  assert.deepEqual(violations, []);
});
