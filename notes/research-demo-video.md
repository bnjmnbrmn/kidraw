---
title: Demo video creation (manual + automated paths)
type: research
---

# Demo video creation

_Original research 2026-04-19 (async)._

Kidraw is keyboard-driven, so a demo needs to show *which keys are being pressed* alongside the canvas. Two complementary tracks:

## Short-term: manual recording with keyboard visualisation

**FocuSee.** $69.99 lifetime, Mac + Windows. Automatically captures and displays every keypress on screen with customisable style. Adds auto-zoom into areas of activity, plus general editing polish (spotlight, captions, backgrounds). The right pick for a first demo — Ben records 2–3 minutes; FocuSee handles production.

**Screen Studio.** $229 one-time or $108/year. macOS only. Higher-quality output but overkill for initial demos.

**What to record for v1.** Create a few nodes via keyboard chords; create edges; move nodes around; zoom in/out; delete and undo. 2–3 minutes total.

## Medium-term: automated / scripted with Playwright

Kidraw already has Puppeteer-based e2e tooling. Switching to (or adding) Playwright unlocks native video recording via `recordVideo`. A "demo script" is just an e2e test with a good camera angle and no assertions — a choreographed walkthrough.

Sketch:

```javascript
const { chromium } = require('playwright');

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({
  recordVideo: { dir: 'demo-output/', size: { width: 1280, height: 720 } }
});
const page = await context.newPage();
await page.goto('http://localhost:4200');

await page.waitForTimeout(1000);

// Create first node
await page.keyboard.down('f');
await page.keyboard.press('n');
await page.keyboard.up('f');
await page.keyboard.type('My First Node');
await page.keyboard.press('Escape');

// ...
await context.close(); // saves video
```

Output: `.webm`. Convert to MP4 with ffmpeg.

### Keyboard overlay gap

Playwright records the browser but doesn't automatically show pressed keys on screen. Three solutions:

1. **In-app keystroke overlay** (a `?showKeys=true` URL param that renders pressed keys in a corner). Cleanest long-term; also useful for live presentations and learning. See [idea-keystroke-overlay](idea-keystroke-overlay.md).
2. **Post-process with ffmpeg** — generate a caption track of key events and burn it in.
3. **FocuSee on top of headed Playwright** — run Playwright with `headless: false`; let FocuSee record the screen.

Option 1 is the best long-term investment.

### Possible toolkit

`claude-code-video-toolkit` (github.com/digitalsamba/claude-code-video-toolkit) — described as an AI-native video-production toolkit for Claude Code. Worth investigating; may automate the full pipeline including narration and editing.

## AI-generated demos (not the right starting point)

HeyGen, Synthesia, Pictory take a script and generate a video with AI narration. Useful once you have polished screen recordings to feed in, or for narrated explainer videos rather than live demos.

## Recommended path

**Phase 1.** FocuSee, ~3-minute manual walkthrough. Upload unlisted to YouTube.
**Phase 2** (after polyline-nudging lands). Add in-app keystroke overlay + Playwright demo script. Bot can run and update as features change.
**Phase 3** (longer term). YouTube Data API integration — bot runs the script overnight and uploads as unlisted / updates a playlist.

## Links

- [FocuSee](https://focusee.imobie.com/)
- [Screen Studio](https://screen.studio/)
- [Playwright video recording docs](https://playwright.dev/docs/videos)
- [claude-code-video-toolkit](https://github.com/digitalsamba/claude-code-video-toolkit)
- [Shotstack (video automation API)](https://shotstack.io/)
