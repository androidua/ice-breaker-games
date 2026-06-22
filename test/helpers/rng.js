/**
 * Deterministic RNG helpers for tests.
 *
 * Engines take `rng` as a parameter (e.g. createTruthsState({ players, rng })),
 * so injecting a predictable function makes shuffles and draws reproducible.
 */

// Identity-order RNG: every engine shuffle here is `arr.sort(() => rng() - 0.5)`
// or a Fisher-Yates using `Math.floor(rng() * n)`. Returning a value just under 1
// keeps Fisher-Yates picks at the top index (a no-op-ish shuffle) and makes
// sort comparators consistently return ~0.5, so turnOrder / prompts stay in input order.
export const identityRng = () => 0.999999;

// Seeded sequence RNG for cases that need specific successive draws.
// Cycles through `vals` so callers can pin exact picks.
export function seqRng(vals) {
  let i = 0;
  return () => vals[i++ % vals.length];
}
