// Guards every room timer callback (Plan F1/F10).
//
// Node reschedules an interval whose callback throws, so before this an engine
// bug inside a tick threw on *every* tick — 8x/s for Snake, 10x/s for Bomber —
// while the room stayed frozen on the state that caused it. The process-level
// uncaughtException handler kept the server alive but could do nothing about
// the loop. Wrapping the callback lets the caller stop that one room instead.
export function guardedTick(fn, onError) {
  return (...args) => {
    try {
      return fn(...args);
    } catch (err) {
      onError(err);
      return undefined;
    }
  };
}
