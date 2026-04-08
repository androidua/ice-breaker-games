# Content Health Checklist

Use this checklist for static text asset maintenance in:
- `server/hottake-engine.js`
- `server/trivia-engine.js`
- `server/emoji-engine.js`
- `server/sketch-engine.js`
- `server/typeracer-engine.js`

Do not apply this to `server/wordchain-engine.js` dictionary unless explicitly requested.

## Cadence

- Monthly (light): triage low-quality or repetitive content.
- Quarterly (full): add curated assets in batches and rerun all checks.
- Immediate: patch any factual or problematic item reported by users.

## Quick Run Procedure (15-30 minutes)

1. Gather user feedback and repeated prompt complaints.
2. Review each content bank for:
   - duplicates (exact or near-duplicate)
   - awkward phrasing
   - stale or time-sensitive references
   - factual risk (especially trivia)
3. Add a small curated batch (25-100 items per game).
4. Keep all new items unique, valid, and game-appropriate.
5. Run `npm test`.
6. Manually spot-check one round of each edited game.

## Quality Rules By Game

### Hot Take
- Keep statements short, debatable, and playful.
- Avoid legal/medical/financial advice style wording.
- Avoid culture-war bait and offensive topics.

### Trivia
- Prefer evergreen facts.
- Avoid volatile claims (e.g., "most popular in year X", "current CEO", "all-time records that can change").
- Keep one clearly correct answer and three plausible distractors.

### Emoji
- Prompts should be guessable with emoji clues in 1-3 guesses.
- Avoid very obscure proper nouns.
- Keep category labels consistent.

### Sketch
- Favor drawable nouns/phrases.
- Avoid overly abstract words for casual rounds.
- Keep phrase length reasonable.

### Type Racer
- Paragraphs should be readable and fun.
- Keep lengths in a similar range for fair scoring.
- Avoid special symbols that make typing inconsistent.

## Verification Commands

Run smoke tests:

```bash
npm test
```

Check changed files:

```bash
git diff -- server/hottake-engine.js server/trivia-engine.js server/emoji-engine.js server/sketch-engine.js server/typeracer-engine.js
```

## How To Reference This Later

In a future AI session, use:

- "Run the content health checklist in `docs/content-health-checklist.md`."
- "Do a quarterly content refresh using `docs/content-health-checklist.md`."
- "Validate trivia/emoji/sketch/type racer assets with the checklist."

This makes the workflow repeatable without rewriting instructions each time.
