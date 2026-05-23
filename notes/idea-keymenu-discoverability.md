---
title: Keymenu discoverability
type: idea
---

# Keymenu discoverability

How users find what they can do.

- **Which-key style hints** (emacs-inspired): on-demand binding overlay.
- **Auto-show on idle hold.** If a key is held ~1.5 s with no action, surface the relevant submenu.
- **Delay before menu update.** If the user is exploring, hold updates back so transient holds don't churn the UI.
- **Hide/show toggle on shift-shift** (if not eaten by mode-reset).
- **Label-edit exit hint.** The "LABEL EDIT" header badge doesn't say how to exit; consider a tooltip or "(double-Shift to exit)" hint, or add a visible Escape key to the keymenu card layout.
- **Style submenu (`w`) discoverability.** The `w` submenu works but users may not realise they need an edge selected (or crosshairs over an edge) for directedness/line-style changes to take effect. A toast or status message when a style command has no target would help.
- **Canvas pan when menu opens** so the menu doesn't occlude the diagram area the user is working in.
