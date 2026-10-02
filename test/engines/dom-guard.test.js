// Browser auto-translate (Chrome Translate, Safari's translator) swaps the text
// nodes React rendered for copies of its own. React still holds the originals,
// so removing one threw NotFoundError and the error boundary replaced the whole
// game with "Something went wrong" (Sentry HUDDLE-PLAY-ROOM-3/-4, 2026-10-01:
// Trivia's "Start Next Set" and Word Chain's turn change). The guard makes the
// two DOM calls React uses tolerate a node that something else already moved.

import { test } from "node:test";
import assert from "node:assert/strict";
import { installDomGuard } from "../../src/dom-guard.js";

// Stand-in for the slice of the DOM the guard wraps, with the browser's
// contract: both calls throw NotFoundError when the node named is not a child
// of `this`. A fresh class per test, because the guard patches the prototype.
function makeNode() {
  const notFound = () =>
    Object.assign(new Error("The node to be removed is not a child of this node."), { name: "NotFoundError" });

  class Node {
    constructor(name) {
      this.name = name;
      this.parentNode = null;
      this.childNodes = [];
    }
    removeChild(child) {
      const i = this.childNodes.indexOf(child);
      if (i === -1) throw notFound();
      this.childNodes.splice(i, 1);
      child.parentNode = null;
      return child;
    }
    insertBefore(node, ref) {
      if (node.parentNode) node.parentNode.removeChild(node);
      const i = ref == null ? this.childNodes.length : this.childNodes.indexOf(ref);
      if (i === -1) throw notFound();
      this.childNodes.splice(i, 0, node);
      node.parentNode = this;
      return node;
    }
  }
  return Node;
}

// What Chrome Translate does to one text node: <font><font>…</font></font> takes
// its place and the original is left detached.
function translate(Node, parent, textNode) {
  const font = new Node("font");
  parent.insertBefore(font, textNode);
  parent.removeChild(textNode);
  return font;
}

test("without the guard, removing a translated text node throws NotFoundError (the Sentry crash)", () => {
  const Node = makeNode();
  const chip = new Node("div");
  const timer = new Node("#text (12s)");
  chip.insertBefore(timer, null);
  translate(Node, chip, timer);

  assert.throws(() => chip.removeChild(timer), { name: "NotFoundError" });
});

test("with the guard, removing a node something else already moved is skipped instead of throwing", () => {
  const Node = makeNode();
  installDomGuard(Node.prototype, { warn: () => {} });
  const chip = new Node("div");
  const timer = new Node("#text (12s)");
  chip.insertBefore(timer, null);
  const font = translate(Node, chip, timer);

  assert.equal(chip.removeChild(timer), timer);
  assert.deepEqual(chip.childNodes, [font], "the translator's copy is left alone");
});

test("with the guard, an ordinary removal still removes", () => {
  const Node = makeNode();
  installDomGuard(Node.prototype, { warn: () => {} });
  const list = new Node("ul");
  const a = new Node("li a");
  const b = new Node("li b");
  list.insertBefore(a, null);
  list.insertBefore(b, null);

  list.removeChild(a);
  assert.deepEqual(list.childNodes, [b]);
  assert.equal(a.parentNode, null);
});

test("with the guard, inserting before a moved node still inserts the new node (at the end)", () => {
  const Node = makeNode();
  installDomGuard(Node.prototype, { warn: () => {} });
  const panel = new Node("div");
  const text = new Node("#text Waiting…");
  panel.insertBefore(text, null);
  const font = translate(Node, panel, text);
  const button = new Node("button");

  assert.equal(panel.insertBefore(button, text), button);
  assert.deepEqual(panel.childNodes, [font, button]);
});

test("with the guard, an ordinary insertBefore keeps its position", () => {
  const Node = makeNode();
  installDomGuard(Node.prototype, { warn: () => {} });
  const list = new Node("ul");
  const a = new Node("li a");
  const c = new Node("li c");
  list.insertBefore(a, null);
  list.insertBefore(c, null);
  const b = new Node("li b");

  list.insertBefore(b, c);
  assert.deepEqual(list.childNodes, [a, b, c]);
});

test("the guard warns once per page, not once per skipped call", () => {
  const Node = makeNode();
  const warnings = [];
  installDomGuard(Node.prototype, { warn: (msg) => warnings.push(msg) });
  const panel = new Node("div");
  const t1 = new Node("#text one");
  const t2 = new Node("#text two");
  panel.insertBefore(t1, null);
  panel.insertBefore(t2, null);
  translate(Node, panel, t1);
  translate(Node, panel, t2);

  panel.removeChild(t1);
  panel.removeChild(t2);
  panel.insertBefore(new Node("span"), t1);
  assert.equal(warnings.length, 1);
});
