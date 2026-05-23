---
title: Label-edit mode overhaul
type: idea
---

# Label-edit mode overhaul

Today `labelEdit` mode uses `PrintedInstructionKeyMenuModeConfig`: a text-instruction-plus-handler stub. Visually it doesn't match the rich card-based renderer that `normal` mode uses.

What we want:

- **Render label-edit like normal mode** — card-based with all keys visible, not just the lowercase letter row. Show the number row, modifier keys, Backspace, Enter, `\`, etc.
- **Support vim-style keybindings.** Escape / Ctrl-[ once → vim-style normal-inside-label-edit; twice → kidraw normal mode. Need to design the vim command bar (`:`) — figure out placement in the card layout.
- **Support emacs-style keybindings** as an alternative profile.
- The mode reuses the same card renderer infrastructure as `USQwertyMode` instead of being its own thing.

Deprioritised earlier ("design needs revisiting"); pick up after serialization and routing work settle.
