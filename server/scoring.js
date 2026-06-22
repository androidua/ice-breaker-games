// Shared scoring / tie policy (pure, no side effects).
//
// Unifying rule from the June 2026 fix plan: *rewards are shared*. On a tie for
// the most wins, every tied leader is credited rather than just the first one
// encountered in Map-iteration order.

// Given a Map<id, wins>, return every id tied for the highest win count.
// Returns [] when nobody has a positive win count.
export function topWinners(winsMap) {
  let max = 0;
  winsMap.forEach((wins) => { if (wins > max) max = wins; });
  if (max <= 0) return [];
  const leaders = [];
  winsMap.forEach((wins, id) => { if (wins === max) leaders.push(id); });
  return leaders;
}
