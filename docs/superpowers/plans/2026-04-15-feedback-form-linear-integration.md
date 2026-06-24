# Feedback Form → Linear Integration — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an in-app feedback form that creates issues in Linear with correct project, labels, priority, and status.

**Architecture:** A `POST /api/feedback` route is added to `server/index.js` before the static file handler. It validates input, rate-limits by IP, and calls Linear's GraphQL API. On the frontend, a new `FeedbackModal.jsx` component handles form state, validation, screenshot encoding, and submission. A `💬 Feedback` button in the footer opens the modal.

**Tech Stack:** React 18 (existing), Node.js `http` (existing), Linear GraphQL API via `fetch`, no new dependencies.

**Spec:** `docs/superpowers/specs/2026-04-15-feedback-form-linear-integration.md`

---

### Task 1: Server — POST /api/feedback endpoint

**Files:**
- Modify: `server/index.js:84-125` (HTTP request handler)

This task adds the feedback API route, input validation, IP-based rate limiting, and the Linear GraphQL call. The route must be inserted **before** the static file handler so `/api/feedback` isn't caught by the SPA fallback.

- [ ] **Step 1: Add rate limiting state and helpers above the httpServer**

Insert after line 53 (the `COMPRESSIBLE_EXTS` line) in `server/index.js`:

```js
// ── Feedback rate limiting ──────────────────────────────────────
const feedbackLimits = new Map(); // ip -> { count, resetAt }
const FEEDBACK_MAX = 5;
const FEEDBACK_WINDOW_MS = 10 * 60 * 1000; // 10 minutes

function isFeedbackRateLimited(ip) {
  const now = Date.now();
  const entry = feedbackLimits.get(ip);
  if (!entry || now > entry.resetAt) {
    feedbackLimits.set(ip, { count: 1, resetAt: now + FEEDBACK_WINDOW_MS });
    return false;
  }
  entry.count++;
  return entry.count > FEEDBACK_MAX;
}

// Linear API config
const LINEAR_API_KEY = process.env.LINEAR_API_KEY || "";
const LINEAR_TEAM_ID = "82c6c2fb-00ab-4cc2-8bae-720d29295836";
const LINEAR_PROJECT_ID = "869ddd27-1864-4461-a9d4-b14f12eb367a";
const LINEAR_BACKLOG_STATE_ID = "da26d051-a623-493c-981c-32dab9139d2d";
const LINEAR_LABELS = {
  bug: "f40a5504-e74e-4c7d-8baa-436edf5e44d8",
  feature: "d9dc4752-1524-4dd1-bfc6-352073cded9d",
  other: "5cf99f15-350b-48b8-a81c-dd4ba0f14a36",
};
const LINEAR_PRIORITIES = { bug: 2, feature: 3, other: 4 };
const TYPE_DISPLAY = { bug: "Bug", feature: "Feature", other: "Other" };
```

- [ ] **Step 2: Add the JSON body parser helper and Linear API helper**

Insert directly after the code from Step 1:

```js
function readJsonBody(req, maxBytes = 4 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
        req.destroy();
        reject(new Error("Body too large"));
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        reject(new Error("Invalid JSON"));
      }
    });
    req.on("error", reject);
  });
}

async function createLinearIssue({ type, name, description, email, screenshot }) {
  const typeLabel = TYPE_DISPLAY[type];
  const titlePrefix = `[${typeLabel}]`;
  const titleDesc = description.length > 70 ? description.slice(0, 70) + "…" : description;
  const title = `${titlePrefix} ${titleDesc}`;

  const body = [
    "## Description\n",
    description,
    "\n---\n",
    `**Submitted by:** ${name}`,
    `**Email:** ${email || "Not provided"}`,
    `**Type:** ${typeLabel}`,
  ].join("\n");

  const mutation = `mutation CreateIssue($input: IssueCreateInput!) {
    issueCreate(input: $input) {
      success
      issue { id identifier url }
    }
  }`;

  const variables = {
    input: {
      teamId: LINEAR_TEAM_ID,
      projectId: LINEAR_PROJECT_ID,
      stateId: LINEAR_BACKLOG_STATE_ID,
      title,
      description: body,
      priority: LINEAR_PRIORITIES[type],
      labelIds: [LINEAR_LABELS[type]],
    },
  };

  const resp = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: LINEAR_API_KEY,
    },
    body: JSON.stringify({ query: mutation, variables }),
  });

  if (!resp.ok) throw new Error(`Linear API returned ${resp.status}`);
  const result = await resp.json();
  if (result.errors) throw new Error(result.errors[0].message);

  const issue = result.data.issueCreate.issue;

  // Attach screenshot if provided
  if (screenshot) {
    const attachMutation = `mutation AttachToIssue($issueId: String!, $url: String!, $title: String!) {
      attachmentCreate(input: { issueId: $issueId, url: $url, title: $title }) {
        success
      }
    }`;
    await fetch("https://api.linear.app/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: LINEAR_API_KEY,
      },
      body: JSON.stringify({
        query: attachMutation,
        variables: { issueId: issue.id, url: screenshot, title: "Screenshot" },
      }),
    });
  }

  return issue;
}
```

- [ ] **Step 3: Insert the /api/feedback route into the HTTP handler**

In the `createServer` callback (line 84), insert the feedback route **after** the security headers (line 92) and **before** the `if (!HAS_DIST)` check (line 93). Replace the line:

```js
  applySecurityHeaders(res);
  if (!HAS_DIST) {
```

with:

```js
  applySecurityHeaders(res);

  // ── Feedback API ────────────────────────────────────────────────
  if (req.method === "POST" && req.url === "/api/feedback") {
    if (!LINEAR_API_KEY) {
      res.writeHead(503, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Feedback is temporarily unavailable." }));
      return;
    }

    const ip = req.headers["x-forwarded-for"]?.split(",")[0]?.trim() || req.socket.remoteAddress;
    if (isFeedbackRateLimited(ip)) {
      res.writeHead(429, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Too many submissions. Please try again later." }));
      return;
    }

    readJsonBody(req)
      .then((data) => {
        // Validate required fields
        const { type, name, description, email, screenshot } = data;
        if (!["bug", "feature", "other"].includes(type)) {
          throw Object.assign(new Error("Invalid type."), { status: 400 });
        }
        if (!name || typeof name !== "string" || name.trim().length === 0 || name.length > 50) {
          throw Object.assign(new Error("Name is required (max 50 chars)."), { status: 400 });
        }
        if (!description || typeof description !== "string" || description.trim().length === 0 || description.length > 2000) {
          throw Object.assign(new Error("Description is required (max 2000 chars)."), { status: 400 });
        }
        if (email && (typeof email !== "string" || email.length > 100)) {
          throw Object.assign(new Error("Email must be under 100 chars."), { status: 400 });
        }
        if (screenshot && (typeof screenshot !== "string" || screenshot.length > 2.7 * 1024 * 1024)) {
          throw Object.assign(new Error("Screenshot must be under 2MB."), { status: 400 });
        }

        return createLinearIssue({
          type,
          name: name.trim(),
          description: description.trim(),
          email: email?.trim() || "",
          screenshot: screenshot || null,
        });
      })
      .then(() => {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ success: true }));
      })
      .catch((err) => {
        const status = err.status || 500;
        const message = status === 400 ? err.message : "Something went wrong.";
        res.writeHead(status, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ error: message }));
      });
    return;
  }

  if (!HAS_DIST) {
```

- [ ] **Step 4: Run the existing smoke tests to verify nothing is broken**

Run: `npm test`
Expected: All existing tests pass — the new route doesn't interfere with WebSocket or static file serving.

- [ ] **Step 5: Commit**

```bash
git add server/index.js
git commit -m "feat: add POST /api/feedback endpoint with Linear integration"
```

---

### Task 2: Server — CORS header for dev mode

**Files:**
- Modify: `server/index.js` (inside the `/api/feedback` route from Task 1)

In dev mode, the frontend runs on `:5173` and the server on `:3000`. The fetch to `/api/feedback` will be cross-origin. We need a CORS header on this route only.

- [ ] **Step 1: Add CORS handling at the top of the feedback route**

In the `/api/feedback` handler block (from Task 1 Step 3), add CORS handling right after the `if (req.method === "POST" && req.url === "/api/feedback")` line. Also add a preflight handler. Replace:

```js
  if (req.method === "POST" && req.url === "/api/feedback") {
    if (!LINEAR_API_KEY) {
```

with:

```js
  // CORS preflight for /api/feedback (dev mode: frontend on :5173, server on :3000)
  if (req.method === "OPTIONS" && req.url === "/api/feedback") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    });
    res.end();
    return;
  }

  if (req.method === "POST" && req.url === "/api/feedback") {
    res.setHeader("Access-Control-Allow-Origin", "*");

    if (!LINEAR_API_KEY) {
```

- [ ] **Step 2: Run smoke tests**

Run: `npm test`
Expected: PASS — CORS headers don't affect existing tests.

- [ ] **Step 3: Commit**

```bash
git add server/index.js
git commit -m "feat: add CORS support for /api/feedback in dev mode"
```

---

### Task 3: Frontend — FeedbackModal component

**Files:**
- Create: `ice-breaker-games/src/FeedbackModal.jsx`

This component handles the entire form: type selection, text inputs, screenshot picker with preview, client-side validation, submission, success/error states.

- [ ] **Step 1: Create FeedbackModal.jsx**

```jsx
import { useState, useRef } from "react";

const MAX_SCREENSHOT_BYTES = 2 * 1024 * 1024; // 2MB

function getApiUrl() {
  const isDev = window.location.port === "5173";
  const host = window.location.hostname;
  return isDev ? `http://${host}:3000` : "";
}

export default function FeedbackModal({ onClose }) {
  const [type, setType] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [screenshot, setScreenshot] = useState(null); // base64 data URL
  const [screenshotName, setScreenshotName] = useState("");
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [serverError, setServerError] = useState("");
  const fileRef = useRef(null);

  function handleScreenshot(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setErrors((prev) => ({ ...prev, screenshot: "File must be an image." }));
      return;
    }
    if (file.size > MAX_SCREENSHOT_BYTES) {
      setErrors((prev) => ({ ...prev, screenshot: "Image must be under 2MB." }));
      return;
    }
    setErrors((prev) => ({ ...prev, screenshot: undefined }));
    setScreenshotName(file.name);
    const reader = new FileReader();
    reader.onload = () => setScreenshot(reader.result);
    reader.readAsDataURL(file);
  }

  function removeScreenshot() {
    setScreenshot(null);
    setScreenshotName("");
    if (fileRef.current) fileRef.current.value = "";
  }

  function validate() {
    const errs = {};
    if (!type) errs.type = "Pick a type.";
    if (!name.trim()) errs.name = "Name is required.";
    else if (name.length > 50) errs.name = "Max 50 characters.";
    if (!description.trim()) errs.description = "Description is required.";
    else if (description.length > 2000) errs.description = "Max 2000 characters.";
    if (email && email.length > 100) errs.email = "Max 100 characters.";
    return errs;
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setServerError("");
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setSubmitting(true);
    try {
      const resp = await fetch(`${getApiUrl()}/api/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type,
          name: name.trim(),
          description: description.trim(),
          email: email.trim() || undefined,
          screenshot: screenshot || undefined,
        }),
      });
      const data = await resp.json();
      if (!resp.ok) {
        setServerError(data.error || "Something went wrong. Please try again.");
        setSubmitting(false);
        return;
      }
      setSubmitted(true);
      setTimeout(() => onClose(), 2000);
    } catch {
      setServerError("Something went wrong. Please try again.");
      setSubmitting(false);
    }
  }

  if (submitted) {
    return (
      <div className="feedback-backdrop" onClick={onClose}>
        <div className="feedback-modal" onClick={(e) => e.stopPropagation()}>
          <div className="feedback-success">Thanks for your feedback!</div>
        </div>
      </div>
    );
  }

  const types = [
    { key: "bug", icon: "🐛", label: "Bug" },
    { key: "feature", icon: "✨", label: "Feature" },
    { key: "other", icon: "💬", label: "Other" },
  ];

  return (
    <div className="feedback-backdrop" onClick={onClose}>
      <div className="feedback-modal" onClick={(e) => e.stopPropagation()}>
        <div className="feedback-header">
          <span className="feedback-title">Send Feedback</span>
          <button type="button" className="feedback-close" onClick={onClose}>✕</button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="feedback-field">
            <label className="feedback-label">Type *</label>
            <div className="feedback-types">
              {types.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  className={`feedback-type-btn${type === t.key ? ` selected ${t.key}` : ""}`}
                  onClick={() => { setType(t.key); setErrors((prev) => ({ ...prev, type: undefined })); }}
                >
                  {t.icon} {t.label}
                </button>
              ))}
            </div>
            {errors.type && <div className="feedback-error">{errors.type}</div>}
          </div>

          <div className="feedback-field">
            <label className="feedback-label">Your Name *</label>
            <input
              type="text"
              className={`feedback-input${errors.name ? " invalid" : ""}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={50}
              placeholder="Jane Doe"
            />
            {errors.name && <div className="feedback-error">{errors.name}</div>}
          </div>

          <div className="feedback-field">
            <label className="feedback-label">Description *</label>
            <textarea
              className={`feedback-input feedback-textarea${errors.description ? " invalid" : ""}`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              placeholder="Describe the issue or idea..."
              rows={3}
            />
            {errors.description && <div className="feedback-error">{errors.description}</div>}
          </div>

          <div className="feedback-field">
            <label className="feedback-label feedback-optional">Email <span>(optional)</span></label>
            <input
              type="email"
              className={`feedback-input${errors.email ? " invalid" : ""}`}
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={100}
              placeholder="you@example.com"
            />
            {errors.email && <div className="feedback-error">{errors.email}</div>}
          </div>

          <div className="feedback-field">
            <label className="feedback-label feedback-optional">Screenshot <span>(optional)</span></label>
            {screenshot ? (
              <div className="feedback-screenshot-preview">
                <img src={screenshot} alt="Screenshot preview" />
                <button type="button" className="feedback-screenshot-remove" onClick={removeScreenshot}>✕</button>
                <span className="feedback-screenshot-name">{screenshotName}</span>
              </div>
            ) : (
              <label className="feedback-file-label">
                📎 Tap to attach image
                <input
                  ref={fileRef}
                  type="file"
                  accept="image/*"
                  onChange={handleScreenshot}
                  style={{ display: "none" }}
                />
              </label>
            )}
            {errors.screenshot && <div className="feedback-error">{errors.screenshot}</div>}
          </div>

          {serverError && <div className="feedback-error feedback-server-error">{serverError}</div>}

          <button type="submit" className="feedback-submit" disabled={submitting}>
            {submitting ? "Sending..." : "Submit"}
          </button>
        </form>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add ice-breaker-games/src/FeedbackModal.jsx
git commit -m "feat: add FeedbackModal component with form, validation, and screenshot support"
```

---

### Task 4: Frontend — Wire feedback button into App.jsx

**Files:**
- Modify: `ice-breaker-games/src/App.jsx:1-165`

- [ ] **Step 1: Add import and state**

At the top of `App.jsx`, add the import after the existing imports (after line 8):

```js
import FeedbackModal from "./FeedbackModal.jsx";
```

Inside the `App` component, add state after line 40 (`const [error, setError] = useState("");`):

```js
const [feedbackOpen, setFeedbackOpen] = useState(false);
```

- [ ] **Step 2: Add the feedback button to the footer and render the modal**

Replace the entire footer block (lines 151-162):

```jsx
      <footer className="footer">
        {room && isHost && room.status === "playing" && (
          <button type="button" className="end-game-btn" onClick={() => send({ type: "endGame" })}>
            End Game
          </button>
        )}
        <div>
          {room?.currentGame === "snake"
            ? "WASD / Arrows to move"
            : "Game Arena — Multiplayer Party Games"}
        </div>
      </footer>
```

with:

```jsx
      <footer className="footer">
        {room && isHost && room.status === "playing" && (
          <button type="button" className="end-game-btn" onClick={() => send({ type: "endGame" })}>
            End Game
          </button>
        )}
        <div>
          {room?.currentGame === "snake"
            ? "WASD / Arrows to move"
            : "Game Arena — Multiplayer Party Games"}
        </div>
        <button type="button" className="feedback-btn" onClick={() => setFeedbackOpen(true)}>
          💬 Feedback
        </button>
      </footer>

      {feedbackOpen && <FeedbackModal onClose={() => setFeedbackOpen(false)} />}
```

- [ ] **Step 3: Run smoke tests**

Run: `npm test`
Expected: PASS — the footer change doesn't affect server-side tests.

- [ ] **Step 4: Commit**

```bash
git add ice-breaker-games/src/App.jsx
git commit -m "feat: add feedback button to footer and wire up FeedbackModal"
```

---

### Task 5: Frontend — CSS styles for feedback modal

**Files:**
- Modify: `ice-breaker-games/src/index.css`

All styles go at the end of the file, before the media query section.

- [ ] **Step 1: Add feedback CSS**

Add the following block before the `/* ── Mobile ──` media query section at the end of `index.css`:

```css
/* ── Feedback Modal ──────────────────────────────────────────── */

.feedback-btn {
  margin-left: auto;
  font-size: 11px;
  padding: 4px 10px;
  border-color: #3d5a80;
  color: #3d5a80;
}

.feedback-btn:hover {
  background: #eef3f8;
}

.feedback-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 16px;
}

.feedback-modal {
  background: #f4f1ea;
  border: 2px solid #b6a88f;
  padding: 24px;
  width: 100%;
  max-width: 400px;
  max-height: 90vh;
  overflow-y: auto;
  font-size: 13px;
}

.feedback-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}

.feedback-title {
  font-size: 15px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.feedback-close {
  border: none;
  background: none;
  font-size: 18px;
  color: #888;
  cursor: pointer;
  padding: 0 4px;
  text-transform: none;
}

.feedback-close:hover {
  color: #141414;
  background: none;
}

.feedback-field {
  margin-bottom: 12px;
}

.feedback-label {
  display: block;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-bottom: 4px;
  color: #666;
}

.feedback-optional {
  color: #888;
}

.feedback-optional span {
  font-size: 10px;
  text-transform: none;
  letter-spacing: 0;
  opacity: 0.7;
}

.feedback-types {
  display: flex;
  gap: 6px;
}

.feedback-type-btn {
  flex: 1;
  padding: 6px 4px;
  text-align: center;
  font-size: 11px;
  border: 1px solid #b6a88f;
  background: transparent;
}

.feedback-type-btn:hover {
  background: #ebe3d2;
}

.feedback-type-btn.selected.bug {
  border: 2px solid #c04b3a;
  background: #fef0ee;
  color: #c04b3a;
}

.feedback-type-btn.selected.feature {
  border: 2px solid #bb87fc;
  background: #f5f0ff;
  color: #7c4dff;
}

.feedback-type-btn.selected.other {
  border: 2px solid #3d5a80;
  background: #eef3f8;
  color: #3d5a80;
}

.feedback-input {
  width: 100%;
  padding: 8px;
  border: 1px solid #b6a88f;
  background: #fffdf7;
  font-family: inherit;
  font-size: 16px;
  color: #141414;
}

.feedback-input:focus {
  outline: none;
  border-color: #3d5a80;
}

.feedback-input.invalid {
  border-color: #c04b3a;
}

.feedback-textarea {
  resize: vertical;
  min-height: 64px;
}

.feedback-error {
  color: #c04b3a;
  font-size: 11px;
  margin-top: 3px;
}

.feedback-server-error {
  margin-bottom: 12px;
  font-size: 12px;
}

.feedback-file-label {
  display: block;
  padding: 12px;
  border: 1px dashed #d4cbb8;
  background: #fffdf7;
  text-align: center;
  font-size: 12px;
  color: #999;
  cursor: pointer;
  text-transform: none;
  letter-spacing: 0;
}

.feedback-file-label:hover {
  border-color: #b6a88f;
  color: #666;
}

.feedback-screenshot-preview {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px;
  border: 1px solid #b6a88f;
  background: #fffdf7;
}

.feedback-screenshot-preview img {
  width: 48px;
  height: 48px;
  object-fit: cover;
  border: 1px solid #d4cbb8;
}

.feedback-screenshot-remove {
  border: none;
  background: none;
  color: #c04b3a;
  cursor: pointer;
  font-size: 14px;
  padding: 2px 6px;
  text-transform: none;
}

.feedback-screenshot-remove:hover {
  background: #fef0ee;
}

.feedback-screenshot-name {
  font-size: 11px;
  color: #888;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.feedback-submit {
  width: 100%;
  padding: 10px;
  background: #3d5a80;
  color: #f4f1ea;
  border: none;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
}

.feedback-submit:hover {
  background: #34506e;
}

.feedback-submit:disabled {
  opacity: 0.6;
  cursor: default;
}

.feedback-success {
  text-align: center;
  padding: 32px 16px;
  font-size: 15px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #5a7d3a;
}
```

- [ ] **Step 2: Run smoke tests**

Run: `npm test`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add ice-breaker-games/src/index.css
git commit -m "feat: add feedback modal CSS matching retro monospace theme"
```

---

### Task 6: Smoke test — feedback endpoint

**Files:**
- Modify: `test/smoke-test.js`

Add a test section that hits the `POST /api/feedback` endpoint to verify the server handles it (validation errors and rate limiting can be tested without a real Linear API key).

- [ ] **Step 1: Add feedback endpoint tests**

Insert before the `// ── Summary ──` section (line 273) in `smoke-test.js`:

```js
    // ── Test: Feedback endpoint ────────────────────────────────────

    console.log(colours.bold("\nTest: Feedback endpoint"));

    const feedbackUrl = `http://localhost:${PORT}/api/feedback`;

    // OPTIONS preflight → 204
    const preflightResp = await fetch(feedbackUrl, { method: "OPTIONS" });
    assert(preflightResp.status === 204, "OPTIONS preflight returns 204");
    assert(
      preflightResp.headers.get("access-control-allow-methods") === "POST",
      "Preflight includes correct Allow-Methods header"
    );

    // Without LINEAR_API_KEY, the server returns 503 before validation.
    // The test server runs without LINEAR_API_KEY, so all POSTs get 503.
    const noKeyResp = await fetch(feedbackUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "bug", name: "Tester", description: "Something broke" }),
    });
    assert(noKeyResp.status === 503, "Request without API key returns 503");
    const noKeyBody = await noKeyResp.json();
    assert(noKeyBody.error === "Feedback is temporarily unavailable.", "503 returns correct message");

    // Also verify 503 for invalid payloads (API key check comes first)
    const badResp = await fetch(feedbackUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type: "bug" }),
    });
    assert(badResp.status === 503, "Missing fields still returns 503 when no API key");
```

- [ ] **Step 2: Run tests**

Run: `npm test`
Expected: All existing tests pass + new feedback tests pass. Note: the valid-request test expects 503 because the smoke test server runs without `LINEAR_API_KEY`.

- [ ] **Step 3: Commit**

```bash
git add test/smoke-test.js
git commit -m "test: add smoke tests for feedback endpoint validation and CORS"
```

---

### Task 7: Manual verification — end-to-end with real Linear

**Files:** None (manual testing)

- [ ] **Step 1: Start both servers**

Terminal 1: `npm run server` (starts on :3000 — make sure `LINEAR_API_KEY` is set in your shell: `export LINEAR_API_KEY=lin_api_...`)
Terminal 2: `npm run dev` (starts Vite on :5173)

- [ ] **Step 2: Open the app and test the form**

Open `http://localhost:5173` in a browser. Verify:
- 💬 Feedback button appears in the footer, right-aligned
- Clicking it opens the centered modal with dark backdrop
- Clicking backdrop closes the modal
- Clicking ✕ closes the modal
- Type toggles show colored states when selected
- Submitting with empty fields shows validation errors
- Attaching a >2MB image shows the size error
- Attaching a valid image shows the thumbnail preview

- [ ] **Step 3: Submit real feedback to Linear**

Fill the form:
- Type: Bug
- Name: Test User
- Description: "This is a test submission from the feedback form"
- Email: (leave blank)
- Screenshot: attach a small image

Submit. Verify:
- Form shows "Thanks for your feedback!" success message
- Modal auto-closes after 2 seconds
- Check Linear — a new issue should appear in the "Huddle-Play-Room" project with:
  - Title: `[Bug] This is a test submission from the feedback form`
  - Label: Bug
  - Priority: High
  - Status: Backlog
  - Screenshot attached

- [ ] **Step 4: Test on mobile**

Open on a phone (or Chrome DevTools device mode). Verify:
- Form is scrollable within the modal
- Inputs don't trigger iOS zoom (16px font)
- Type buttons are tappable
- File picker opens the camera/gallery chooser

- [ ] **Step 5: Clean up test issue**

Delete or archive the test issue in Linear.

---

### Task 8: Version bump and final commit

**Files:**
- Modify: `package.json` — bump version
- Modify: `package-lock.json` — sync lockfile

- [ ] **Step 1: Bump patch version**

In `package.json`, change `"version": "1.10.2"` to `"version": "1.11.0"` (minor bump — new feature).

- [ ] **Step 2: Sync lockfile**

Run: `npm install --package-lock-only`

- [ ] **Step 3: Final commit and tag**

```bash
git add package.json package-lock.json
git commit -m "chore: bump version to v1.11.0"
git tag -a v1.11.0 -m "v1.11.0 — feedback form with Linear integration"
```
