// A small static check for React's "rules of hooks", for the one mistake that
// reached production: a hook called after an early `return`.
//
//   export default function TruthsGame({ game }) {
//     const [x, setX] = useState("");   // runs on every render
//     if (!game) return null;           // first render stops here...
//     const order = useMemo(...);       // ...so this hook only exists once `game` arrives
//
// React keeps hook state in a list ordered by call. A render that calls more
// hooks than the one before throws "Rendered more hooks than during the previous
// render" (Sentry HUDDLE-PLAY-ROOM-5, 2026-10-03), and the game is replaced by the
// error screen. The server sends `room` (status "playing") and `state` as two
// messages, so a component is briefly mounted with `game === null`.
//
// This can't be caught by rendering: react-dom/server renders once, and a
// browser-free test can't re-render the same instance. So it reads the source.
// It uses the parser Vite already ships (no new dependency). It flags a hook
// that is not reached on every render of a component or a custom hook:
//   - below a statement that can return early, or
//   - inside an if/else, ternary, `&&`/`||`, loop, switch or try.
// Hooks inside nested functions (effect callbacks, handlers) are separate scopes
// and are not checked here.

import { parseAst } from "vite";

const HOOK_NAME = /^use[A-Z0-9]/;
const COMPONENT_NAME = /^[A-Z]/;
const LOOPS = new Set(["ForStatement", "ForInStatement", "ForOfStatement", "WhileStatement", "DoWhileStatement"]);

const isFunction = (n) =>
  n.type === "FunctionDeclaration" || n.type === "FunctionExpression" || n.type === "ArrowFunctionExpression";

function hookName(call) {
  const c = call.callee;
  if (c.type === "Identifier" && HOOK_NAME.test(c.name)) return c.name;
  if (c.type === "MemberExpression" && !c.computed && c.property.type === "Identifier" && HOOK_NAME.test(c.property.name)) {
    return c.property.name; // React.useState(...)
  }
  return null;
}

function childNodes(node) {
  const out = [];
  for (const [key, value] of Object.entries(node)) {
    if (key === "type") continue;
    for (const v of Array.isArray(value) ? value : [value]) {
      if (v && typeof v === "object" && typeof v.type === "string") out.push(v);
    }
  }
  return out;
}

// The children of `node` that only run sometimes.
function conditionalChildren(node) {
  switch (node.type) {
    case "IfStatement":
    case "ConditionalExpression":
      return [node.consequent, node.alternate].filter(Boolean);
    case "LogicalExpression":
      return [node.right];
    case "SwitchStatement":
      return node.cases;
    case "TryStatement":
      return [node.block, node.handler, node.finalizer].filter(Boolean);
    default:
      return LOOPS.has(node.type) ? [node.body] : [];
  }
}

// Does running `node` possibly leave the function? (Nested functions return on
// their own, so they don't count.)
function canReturn(node) {
  if (isFunction(node)) return false;
  if (node.type === "ReturnStatement") return true;
  return childNodes(node).some(canReturn);
}

// Collect hook calls under `node`, recording whether each runs unconditionally.
function scan(node, conditional, hooks) {
  if (isFunction(node)) return;
  if (node.type === "CallExpression") {
    const name = hookName(node);
    if (name) hooks.push({ name, conditional, start: node.start });
  }
  const sometimes = new Set(conditionalChildren(node));
  for (const child of childNodes(node)) scan(child, conditional || sometimes.has(child), hooks);
}

function checkFunction(name, fn, lineOf, report) {
  if (fn.body.type !== "BlockStatement") return 0; // `() => <div/>`: nothing can return early
  let afterReturn = false;
  let hookCount = 0;
  for (const statement of fn.body.body) {
    const hooks = [];
    scan(statement, false, hooks);
    for (const h of hooks) {
      hookCount++;
      if (afterReturn) report(`${name}: ${h.name}() on line ${lineOf(h.start)} is below an early return`);
      else if (h.conditional) report(`${name}: ${h.name}() on line ${lineOf(h.start)} is inside a condition or loop`);
    }
    if (canReturn(statement)) afterReturn = true;
  }
  return hookCount;
}

// Components and custom hooks declared at the top level of a module.
function topLevelFunctions(program) {
  const found = [];
  const consider = (name, fn) => {
    if (name && (COMPONENT_NAME.test(name) || HOOK_NAME.test(name)) && fn) found.push([name, fn]);
  };
  for (const node of program.body) {
    const decl = node.type === "ExportNamedDeclaration" || node.type === "ExportDefaultDeclaration" ? node.declaration : node;
    if (!decl) continue;
    if (decl.type === "FunctionDeclaration") consider(decl.id?.name, decl);
    if (decl.type === "VariableDeclaration") {
      for (const d of decl.declarations) {
        if (d.id.type === "Identifier" && d.init && isFunction(d.init)) consider(d.id.name, d.init);
      }
    }
  }
  return found;
}

// -> { components: [{ name, hooks }], violations: [string] }
export function checkHookOrder(source) {
  const lineOf = (offset) => source.slice(0, offset).split("\n").length;
  const violations = [];
  const components = [];
  for (const [name, fn] of topLevelFunctions(parseAst(source, { jsx: true }))) {
    const hooks = checkFunction(name, fn, lineOf, (v) => violations.push(v));
    components.push({ name, hooks });
  }
  return { components, violations };
}
