# Feedback Form → Linear Integration

**Date:** 2026-04-15
**Status:** Phase 1 design (Phase 2: Claude automation — future, documented in memory)

## Context

Huddle Play Room has no way for players to report bugs, request features, or share feedback. The app is live on Railway and sees real users, but the only feedback channel is direct contact with the developer. This spec adds a lightweight, in-app feedback form that creates issues directly in Linear, closing the gap between players and the issue tracker.

## Overview

A "💬 Feedback" button in the footer opens a centered modal form. Users fill in what type of feedback they have, their name, and a description. Optionally they can provide an email and attach a screenshot. On submit, the app's server creates a Linear issue with the correct project, label, priority, and status — no manual triage needed to get it into the backlog.

## Feedback Button

- **Location:** Footer, right-aligned via `margin-left: auto`
- **Style:** Matches existing small buttons (End Game, Skip) — 11px uppercase monospace, bordered, transparent background
- **Label:** `💬 Feedback`
- **Color:** Blue accent (`#3d5a80`) border and text, matching the app's tertiary color
- **Hover:** Light blue background (`#eef3f8`)
- **Always visible** regardless of room/game state — feedback can come from any screen

## Modal Form

### Layout

- Centered modal over a semi-transparent dark backdrop (`rgba(0, 0, 0, 0.45)`)
- Clicking the backdrop closes the modal
- Close button (✕) in the top-right corner of the modal
- Max width: 400px, full width on mobile with 16px side padding
- Retro monospace theme consistent with the rest of the app

### Fields

| Field | Type | Required | UI Element |
|---|---|---|---|
| Type | Enum: Bug, Feature, Other | Yes | Three toggle buttons in a row |
| Name | Text, max 50 chars | Yes | Text input |
| Description | Text, max 2000 chars | Yes | Textarea, min 3 rows |
| Email | Email, max 100 chars | No | Text input, lighter styling |
| Screenshot | Image file, max 2MB | No | File picker + preview thumbnail |

### Type Toggle Buttons

Three equal-width buttons in a row. Selected state uses a colored border and tinted background matching the Linear label color:

| Type | Icon | Selected border | Selected background |
|---|---|---|---|
| Bug | 🐛 | `#c04b3a` (red) | `#fef0ee` |
| Feature | ✨ | `#bb87fc` (purple) | `#f5f0ff` |
| Other | 💬 | `#3d5a80` (blue) | `#eef3f8` |

Default selection: none (user must pick one).

### Screenshot Handling

- File input accepts `image/*`
- Client-side validation: max 2MB, must be an image MIME type
- On selection: read file as base64 data URL, show a small thumbnail preview with a remove (✕) button
- Base64 string sent in the JSON payload to the server
- If the file exceeds 2MB, show an inline error: "Image must be under 2MB"

### Validation

- All required fields validated on submit
- Missing fields highlighted with red border and inline error text
- Submit button disabled while a submission is in-flight (prevent double-submit)
- On success: show a brief "Thanks for your feedback!" confirmation, auto-close modal after 2 seconds
- On error: show "Something went wrong. Please try again." inline

### Mobile Considerations

- All inputs use `font-size: 16px` minimum (prevents iOS Safari auto-zoom)
- Modal is scrollable if it exceeds viewport height
- Touch targets are at least 44px tall
- Backdrop touch closes the modal

## Server Endpoint

### `POST /api/feedback`

New HTTP route added to `server/index.js` alongside the existing static file serving.

#### Request Body (JSON)

```json
{
  "type": "bug" | "feature" | "other",
  "name": "Jane Doe",
  "description": "The snake game freezes when...",
  "email": "jane@example.com",
  "screenshot": "data:image/png;base64,iVBOR..."
}
```

#### Validation

- `type` must be one of: `bug`, `feature`, `other`
- `name` must be a non-empty string, max 50 chars
- `description` must be a non-empty string, max 2000 chars
- `email` if provided, max 100 chars (basic format check, not strict validation)
- `screenshot` if provided, must be a base64 data URL, max ~2.7MB encoded (≈2MB decoded)
- Reject with 400 and a JSON error message if validation fails

#### Rate Limiting

Simple in-memory rate limit: max 5 submissions per IP per 10 minutes. Returns 429 if exceeded. This prevents spam without adding dependencies — the `rooms` Map pattern already exists for in-memory state.

#### Linear API Call

Uses Linear's GraphQL API via `fetch` (no SDK). The `LINEAR_API_KEY` environment variable authenticates requests.

**Issue creation mapping:**

| Form field | Linear field | Value |
|---|---|---|
| type | labels | `bug` → Bug (`#EB5757`), `feature` → Feature (`#BB87FC`), `other` → Improvement (`#4EA7FC`) |
| type | priority | `bug` → 2 (High), `feature` → 3 (Medium), `other` → 4 (Low) |
| — | state | Backlog (always) |
| — | project | Huddle-Play-Room (ice-breaker-games) — ID: `869ddd27-1864-4461-a9d4-b14f12eb367a` |
| — | team | Dmytro — ID: `82c6c2fb-00ab-4cc2-8bae-720d29295836` |
| name + type | title | `[Bug] First ~70 chars of description` (or `[Feature]` / `[Other]`) |
| description, name, email | description | Markdown body (see template below) |
| screenshot | attachment | Created via separate `attachmentCreate` mutation if present |

**Issue description template:**

```markdown
## Description

{description}

---

**Submitted by:** {name}
**Email:** {email or "Not provided"}
**Type:** {Bug / Feature / Other}
**Submitted from:** Huddle Play Room v{version}
```

**Label IDs (from current workspace):**
- Bug: `f40a5504-e74e-4c7d-8baa-436edf5e44d8`
- Feature: `d9dc4752-1524-4dd1-bfc6-352073cded9d`
- Improvement: `5cf99f15-350b-48b8-a81c-dd4ba0f14a36`

**Status ID (Backlog):** `da26d051-a623-493c-981c-32dab9139d2d`

#### Response

- 200 `{ "success": true }` on success
- 400 `{ "error": "..." }` on validation failure
- 429 `{ "error": "Too many submissions. Please try again later." }` on rate limit
- 500 `{ "error": "Something went wrong." }` if Linear API fails

#### Graceful degradation

If `LINEAR_API_KEY` is not set, the endpoint returns 503 with `{ "error": "Feedback is temporarily unavailable." }`. The feedback button still appears (so users know the feature exists) but the form shows the error on submit.

## Files Modified

| File | Change |
|---|---|
| `server/index.js` | Add `POST /api/feedback` HTTP route with validation, rate limiting, and Linear API call |
| `src/App.jsx` | Add feedback button to footer, add `FeedbackModal` component (inline or imported), manage open/close state |
| `src/index.css` | Add styles for `.feedback-btn`, `.feedback-modal`, `.feedback-backdrop`, `.feedback-form`, type toggle buttons, screenshot preview |

| `src/FeedbackModal.jsx` | New file — modal component with form state, validation, submission, and screenshot handling |

## What This Does NOT Include

- **Phase 2 automation** — Claude agent picking up issues and creating PRs (documented separately in memory)
- **Rich text editing** — description is plain text
- **Multiple screenshots** — single image only
- **User authentication** — submissions are anonymous (name is self-reported)
- **Offline queuing** — if the server is down, the submission fails
- **Analytics or tracking** — no telemetry on form opens/submissions
