// Browser auto-translate (Chrome Translate, Safari's translator) and some
// extensions swap text nodes React rendered for copies of their own. React
// still holds the originals, so removing one, or inserting before one, threw
// NotFoundError and the error boundary replaced the whole game (Sentry
// HUDDLE-PLAY-ROOM-3/-4). When the node is no longer where React left it, skip
// the removal or append instead of throwing.
//
// This is the safety net. Text that is the only child of its element never
// reaches it (React replaces the whole content), and the game components keep
// to that; see test/engines/translate-safe-render.test.js.
export function installDomGuard(proto, { warn = console.warn } = {}) {
  let warned = false;
  // Once per page, so a Sentry event that follows carries the breadcrumb
  // without one console line per skipped call.
  const noteMismatch = () => {
    if (warned) return;
    warned = true;
    warn("dom-guard: a node React rendered was moved by something else (browser translation or an extension)");
  };

  const removeChild = proto.removeChild;
  proto.removeChild = function (child) {
    if (child && child.parentNode !== this) {
      noteMismatch();
      return child;
    }
    return removeChild.apply(this, arguments);
  };

  const insertBefore = proto.insertBefore;
  proto.insertBefore = function (node, ref) {
    if (ref && ref.parentNode !== this) {
      noteMismatch();
      return insertBefore.call(this, node, null);
    }
    return insertBefore.apply(this, arguments);
  };
}
