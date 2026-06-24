---
name: pre-push-review
description: Run a full pre-push review before pushing to GitHub. This skill runs three automated checks in sequence - smoke tests, cross-file impact analysis, and code review. Use this skill whenever the user says "pre-push", "ready to push", "review before push", "check before push", "run the pre-push checks", or mentions pushing code to GitHub for the Huddle Play Room project. Also trigger when the user asks to review their changes before deploying, since Railway auto-deploys on push.
---

# Pre-Push Review

This skill runs three checks before code is pushed to GitHub. Since Railway auto-deploys on every push, these checks are the last line of defence against broken code going live.

## How to use

When this skill triggers, run all three checks in order. Stop at the first failure and report it. If all three pass, tell the user they're good to push.

## Check 1: Smoke Tests

Run the automated smoke test that starts the server, connects WebSocket clients, and verifies the core game flow (host, join, vote, game start).

```bash
cd <project-root>
node test/smoke-test.js
```

If the exit code is non-zero, the smoke tests failed. Report which specific tests failed and help the user understand what broke. Do not proceed to Check 2.

## Check 2: Cross-File Impact Analysis

This check catches mismatches between the three layers: engine modules, server dispatch (index.js), and React components.

Steps:

1. Run `git diff --cached --name-only` and `git diff --name-only` to get the list of changed files since the last commit. Also run `git diff main...HEAD --name-only` (or the equivalent base branch) to see all files changed in the current branch.

2. For each changed file, identify which layer it belongs to:
   - **Engine layer**: `server/*-engine.js` - pure game logic modules
   - **Server layer**: `server/index.js` - message routing, timer orchestration, state broadcasting
   - **Frontend layer**: `src/games/*Game.jsx` - React components, `src/App.jsx` - component registry

3. Check for cross-layer consistency:
   - If an engine's exported function signature changed, verify `server/index.js` calls it with the correct arguments
   - If an engine's state shape changed (fields added/removed/renamed), verify the corresponding `serialize*()` function reflects this, and the React component reads the correct field names
   - If a new game was added, verify all five steps from the "Adding a New Game" checklist in CLAUDE.md are complete
   - If `GAME_COMPONENTS` or `GAME_LABELS` in `App.jsx` changed, verify `voting-engine.js` has the matching game key in `AVAILABLE_GAMES`
   - If WebSocket message types changed in `index.js`, verify the frontend sends the matching type strings

4. Report any mismatches found. Be specific: name the files, the functions, and what doesn't match.

## Check 3: Code Review

Review all staged and unstaged changes against the project's patterns and constraints. Focus on:

**Architecture rules:**
- Engine modules must be pure (no imports from index.js, no WebSocket access, no timers, no side effects)
- Game components must receive `{ game, room, me, send }` as props
- Host-only actions (start, endGame, skipPhase) must check `room.hostId === clientId`

**Security checks:**
- No file system writes added to the server
- No external API calls added
- Player text inputs are JSON-serialised, not rendered as raw HTML
- No secrets or API keys in any file

**Performance checks:**
- Nothing expensive added to Snake's 120ms tick loop (stepGame must stay fast)
- No unnecessary allocations in hot paths
- If broadcastGameState was modified, check it still handles per-player serialisation for Emoji and Sketch

**Mobile compatibility:**
- All new inputs use `font-size: 16px` minimum
- Touch handlers use `passive: false` where needed
- No hover-only interactions added without touch alternatives

**Constraints:**
- Max 8 players per room
- Player names clamped to 16 characters
- Room codes use the correct alphabet (no 0/O/I/L)
- Dependencies not added without discussion

Report findings grouped by severity: blockers (must fix before push), warnings (should fix but not critical), and notes (suggestions for later).

## Output Format

After all three checks complete, give a clear summary:

```
Pre-Push Review Summary
-----------------------
Smoke Tests:      PASS / FAIL
Impact Analysis:  PASS / FAIL (N issues found)
Code Review:      PASS / FAIL (N blockers, N warnings, N notes)

Verdict: GOOD TO PUSH / FIX BEFORE PUSHING
```

If the verdict is "FIX BEFORE PUSHING", list the specific things that need fixing.
