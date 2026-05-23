---
title: Vim is the canonical key profile
type: decision
---

# Vim is the canonical key profile

Kidraw ships two key-assignment profiles, but **vim is the canonical default** — the fallback when no localStorage preference is set, and the profile the user wants to keep tuning against. The other profile is now called `ijkl` (after its movement keys); it was named `default` until the 2026-05-23 rename, and that old name caused recurring confusion.

In code: `VIM_KEYMENU_KEY_ASSIGNMENTS` (default) and `IJKL_KEYMENU_KEY_ASSIGNMENTS`, both in `src/app/keymenu/config/key-assignments.ts`. `KeyProfile = 'vim' | 'ijkl'` in `keyboard-config.service.ts`; the service still migrates any legacy `'default'` localStorage value to `'ijkl'`.

## Why

The user said "concentrate on the vim profile" and is willing to drop the second profile if it muddles design decisions. The rename + dropdown reorder happened in commit `3050cdb` after we'd been confusing the two profiles when wiring waypoint-selection fixes.

## How to apply

- When asked to "change the keybinding for X," default to editing the vim profile only. Confirm before also touching `IJKL_KEYMENU_KEY_ASSIGNMENTS`.
- When describing key bindings in commit messages, docs, or status messages, lead with the vim binding (e.g. "vim `i → p`, ijkl `e → p`") rather than the other order.
- When a new feature is hard to design against both profiles, propose dropping ijkl rather than fighting both — the user has explicitly considered removing it.
- Never reintroduce the name `default` for a key profile — that ambiguity is what we just fixed.
