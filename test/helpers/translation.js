// Reads react-dom/server output the way a browser translator sees the page:
// which text sits inside translate="no", and where React put two text nodes
// side by side (renderToString marks that boundary with <!-- -->).

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"]);
const TOKEN = /<!--([\s\S]*?)-->|<\/([a-zA-Z][\w-]*)\s*>|<([a-zA-Z][\w-]*)((?:[^>"']|"[^"]*"|'[^']*')*?)(\/?)>|([^<]+)/g;

const decode = (s) => s
  .replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
  .replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&");

function scan(html) {
  const texts = [];
  const separators = [];
  const stack = [{ tag: "#root", cls: "", noTranslate: false }];
  let lastText = null;
  for (const m of html.matchAll(TOKEN)) {
    const parent = stack[stack.length - 1];
    if (m[1] !== undefined) {
      // React's text-node boundary is an empty comment; Suspense markers are not.
      if (m[1] === " ") separators.push({ parent, before: lastText, translatable: !parent.noTranslate, at: texts.length });
    } else if (m[2]) {
      const tag = m[2].toLowerCase();
      for (let i = stack.length - 1; i > 0; i--) {
        if (stack[i].tag === tag) { stack.length = i; break; }
      }
      lastText = null;
    } else if (m[3]) {
      const tag = m[3].toLowerCase();
      const attrs = m[4];
      const el = {
        tag,
        cls: /\bclass="([^"]*)"/.exec(attrs)?.[1] ?? "",
        noTranslate: parent.noTranslate || /\btranslate="no"/.test(attrs),
      };
      if (!m[5] && !VOID.has(tag)) stack.push(el);
      lastText = null;
    } else {
      lastText = decode(m[6]);
      texts.push({ value: lastText, translatable: !parent.noTranslate, parentTag: parent.tag, parentClass: parent.cls });
    }
  }
  for (const s of separators) s.after = texts[s.at]?.value ?? "";
  return { texts, separators };
}

// Every text node, with whether a translator may rewrite it.
export function textNodes(html) {
  return scan(html).texts;
}

// Places a translator may rewrite where an element holds two text nodes side
// by side, described so a failure reads as a to-do list.
export function adjacentTextOutsideNoTranslate(html) {
  return scan(html).separators
    .filter((s) => s.translatable)
    .map((s) => `<${s.parent.tag}${s.parent.cls ? ` class="${s.parent.cls}"` : ""}> "${s.before}" + "${s.after}"`);
}
