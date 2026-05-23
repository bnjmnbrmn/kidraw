---
title: Keymenu as a reusable library
type: idea
---

# Keymenu as a reusable library

The keymenu's core abstractions (modes, submenus, key paths, action / submenu bindings, the fresh-press rule) are kidraw-specific in name only — they generalise to any keyboard-driven app. Worth extracting:

- **Command registry layer.** Decouple command details from the keymenu. The keymenu would dispatch opaque command identifiers; the host app resolves them.
- **Pluggable visualization layer.** Different renderers — Konva today, DOM/CSS, terminal-UI, etc.
- **Different keyboard layouts.** Already partially done (US Mac / US Windows); should generalise.
- **Naming cleanup.** Remove `Config` suffix from config classes; add `Renderer` suffix to Konva-specific implementations so the layer boundary is obvious.
- Make the keymenu installable as its own npm package.

Big undertaking; defer until kidraw's own design is more settled.
