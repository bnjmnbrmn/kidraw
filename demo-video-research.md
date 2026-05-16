# Demo Video Creation for KiDraw — Research

_Researched: 2026-04-19 (async)_

## TL;DR Recommendation

**Two-track approach:**
1. **Short term (manual):** Use **FocuSee** ($69.99 lifetime, Mac+Windows) to record a polished demo yourself. It automatically visualizes keyboard shortcuts on screen — perfect for a keyboard-first tool — and handles auto-zoom and editing polish.
2. **Medium term (automated):** Switch KiDraw's existing Puppeteer e2e test infrastructure to **Playwright**, add video recording, and write scripted demo scenarios. This enables bot-generated demos without Ben doing anything.

---

## The KiDraw-Specific Situation

KiDraw is keyboard-driven — the whole point is that you use the keyboard for everything. This creates a specific demo challenge: viewers need to see what keys are being pressed, not just the canvas output. Any demo tool needs to solve this.

KiDraw also already has Puppeteer-based e2e tests (`test-e2e-workflows.js`) that simulate keyboard input and interact with the canvas. This is a huge head start for automated demo generation.

---

## Option 1: Manual Recording with Keyboard Visualization (FocuSee / Screen Studio)

### FocuSee
- **Price:** $69.99 lifetime (Mac + Windows)
- **Keyboard visualization:** Automatically captures and displays every keypress on screen, with customizable style/color/position
- **Auto-zoom:** Zooms into areas of activity automatically
- **Editing:** Adds zoom effects, spotlight, captions, backgrounds
- **Platform:** Mac and Windows
- **Best for:** Ben records himself using KiDraw, FocuSee handles the production polish

### Screen Studio
- **Price:** $229 one-time or $108/year
- **Keyboard visualization:** Yes, displays shortcuts in video
- **Platform:** macOS only
- **Best for:** Mac users who want the highest quality output; overkill for initial demos

### Verdict for KiDraw
FocuSee is the right choice for manual demos. The keyboard visualization feature is essential for KiDraw. Start here for the first demo — Ben records a 2-3 minute walkthrough, FocuSee makes it look polished.

**What to record:**
1. Create a few nodes with keyboard (show `i`+`n` chord, label edit)
2. Create edges between nodes
3. Move nodes around
4. Zoom in/out
5. Delete and undo

---

## Option 2: Automated / Scripted Video Generation (Playwright + ffmpeg)

### Why This Fits KiDraw

KiDraw already has Puppeteer-based e2e tests that:
- Launch the app in a browser
- Simulate keyboard events
- Interact with the Konva canvas
- Verify behavior programmatically

Switching to **Playwright** (or adding a Playwright layer alongside Puppeteer) unlocks native video recording via the `recordVideo` option. A "demo script" is just an e2e test with a good camera angle and no assertions — it's a choreographed walkthrough.

### How It Would Work

```javascript
// demo-node-creation.js (Playwright)
const { chromium } = require('playwright');

const browser = await chromium.launch({ headless: false });
const context = await browser.newContext({
  recordVideo: { dir: 'demo-output/', size: { width: 1280, height: 720 } }
});
const page = await context.newPage();
await page.goto('http://localhost:4200');

// Pause for title card (could overlay in post)
await page.waitForTimeout(1000);

// Create first node
await page.keyboard.down('f'); // hold insert key
await page.keyboard.press('n'); // node
await page.keyboard.up('f');
await page.keyboard.type('My First Node');
await page.keyboard.press('Escape');

// ... etc
await context.close(); // saves video
```

The output is a `.webm` video file. Can be converted to MP4 with ffmpeg.

### Keyboard Overlay Problem

The one gap: Playwright records the browser but doesn't automatically show what keys were pressed on screen. Solutions:

1. **Build a keystroke overlay into KiDraw itself** (a `?showKeys=true` URL param that renders pressed keys in a corner). This is the cleanest approach and also useful for live presentations.
2. **Post-process with ffmpeg** — generate a caption track of key events and burn it in
3. **Use FocuSee on top of the Playwright recording** — run in headed mode, let FocuSee record the screen

Option 1 (in-app overlay) is the best long-term investment. Ben could add a simple dev-mode component that logs and displays recent keypresses. This doubles as useful for users learning the interface.

### Claude Code Video Toolkit

Discovered a tool called `claude-code-video-toolkit` (GitHub: digitalsamba/claude-code-video-toolkit) — described as "AI-native video production toolkit for Claude Code to autonomously generate explainer videos, product demos, walkthroughs." This is worth investigating — it may automate the full pipeline including narration and editing.

---

## Option 3: AI-Generated Demo (No Screen Recording)

Tools like HeyGen, Synthesia, and Pictory can take a script and generate a video with AI narration, screen recording clips, and branding. These are most useful once you have polished screen recordings to feed in, or for narrated explainer videos rather than live demos.

Not the right starting point for KiDraw — you want to show the actual app in action.

---

## Recommended Path

### Phase 1 (this week / next week): Manual Demo with FocuSee
1. Ben downloads FocuSee ($69.99)
2. Records a 2-3 minute demo showing core KiDraw workflow
3. FocuSee handles keyboard visualization + polish
4. Upload to YouTube (can be unlisted initially)

### Phase 2 (after elastic edge layout lands): Automated Playwright Demo Script
1. Add `?showKeys=true` overlay mode to KiDraw (simple component)
2. Write a Playwright demo script for core workflows (reuse e2e test patterns)
3. Bot can run and update these scripts as features change
4. Output: video files committed to repo or uploaded via YouTube Data API

### Phase 3 (longer term): YouTube Data API Integration
The YouTube Data API v3 allows programmatic video upload. Combined with Phase 2, the bot could:
- Run the demo script overnight
- Upload the resulting video to YouTube
- Post as unlisted or update a playlist

---

## Links
- [FocuSee](https://focusee.imobie.com/)
- [Screen Studio](https://screen.studio/)
- [Playwright video recording docs](https://playwright.dev/docs/videos)
- [claude-code-video-toolkit](https://github.com/digitalsamba/claude-code-video-toolkit)
- [Shotstack (video automation API)](https://shotstack.io/)
