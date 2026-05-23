---
title: In-app keystroke overlay (`?showKeys=true`)
type: idea
---

# In-app keystroke overlay

A simple dev/demo mode that renders the most recent keypresses in a corner of the screen. Triggered by `?showKeys=true` in the URL.

Two payoffs:

- **Demo videos.** Solves the "viewers can't see what was pressed" gap when recording with Playwright or any screencast tool that doesn't visualise keys. See [research-demo-video](research-demo-video.md).
- **Live presentations / teaching.** Useful when showing kidraw to someone in person — they see the chord that was pressed alongside its effect on the canvas.

Likely a small standalone component that subscribes to the same keydown events the keymenu listens to. Show the last ~5 keys with a fade-out after ~1.5 s.
