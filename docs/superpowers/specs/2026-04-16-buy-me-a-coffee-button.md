# Buy Me a Coffee Button

**Date:** 2026-04-16
**Status:** Approved

## Context

The developer wants to accept donations via Buy Me a Coffee. The button should be persistent across all screens, fit the existing design palette and monospace aesthetic, and work well on mobile, tablet, and desktop. It must not feel out of place or overly promotional — it should blend naturally into the existing footer UI alongside the Feedback button.

## Design Decision

**Placement:** Footer right column (`footer-right` in `App.jsx`), stacked above the existing Feedback button.

**Rationale:** The footer-right already contains "meta" actions (Feedback, version). The coffee button belongs in that same cluster — it's a quiet, always-available action that doesn't compete with gameplay. Since `footer-right` is already `flex-direction: column`, adding the button requires zero layout changes. The existing `@media (max-width: 720px)` rule already reflows the footer to a centered vertical stack on mobile, so responsive behavior is free.

## Element Specification

```html
<a
  href="https://buymeacoffee.com/huddleplayroom"
  target="_blank"
  rel="noopener noreferrer"
  className="coffee-btn"
>
  ☕ Buy me a coffee
</a>
```

- Rendered as an `<a>` tag (not a `<button>`) since it navigates to an external URL.
- Opens in a new tab with `rel="noopener noreferrer"` for security.
- Placed as the first child of `.footer-right`, above `.feedback-btn`.

## CSS Specification

```css
.coffee-btn {
  font-size: 11px;
  padding: 4px 10px;
  border-color: #8b6914;
  color: #7a5c10;
  text-decoration: none;
}

.coffee-btn:hover {
  background: #fef8e8;
}
```

The amber color (`#8b6914`) is a saturated step of the app's existing warm neutral border palette (`#b6a88f`, `#c8bca7`). It introduces no new hue — only deepens an existing one. No mobile-specific CSS is needed; the footer's existing responsive rules handle it automatically.

The base `button` rule in `index.css` provides: `font-family`, `text-transform: uppercase`, `letter-spacing`, `background: #f7f3ea`, `border: 1px solid`, and `cursor: pointer`. The `.coffee-btn` class only overrides color and padding — matching the pattern of `.feedback-btn`.

## Files to Modify

| File | Change |
|---|---|
| `src/App.jsx` | Add `<a className="coffee-btn" ...>` as first child of `.footer-right` |
| `src/index.css` | Add `.coffee-btn` and `.coffee-btn:hover` rules after `.feedback-btn:hover` |

## Verification

1. Run `npm run dev`, open `http://localhost:5173`
2. Confirm the coffee button appears in the footer right, above the Feedback button
3. Confirm clicking it opens `https://buymeacoffee.com/huddleplayroom` in a new tab
4. Confirm it does not open in the same tab (check `target="_blank"` is working)
5. Check desktop: button should be right-aligned in a vertical column
6. Check mobile (Chrome DevTools device mode, ~375px): footer should stack vertically, buttons should be centered in a row
7. Confirm hover state shows warm amber background (`#fef8e8`)
8. Confirm it looks visually consistent with the Feedback button (same size, same font, complementary color)
