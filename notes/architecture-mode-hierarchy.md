---
title: Mode hierarchy and CapsLock transitions
type: architecture
---

# Mode hierarchy and CapsLock transitions

Modes have a parent/child relationship. The mode label uses `/` to separate parent modes from child modes (e.g. `capslock / normal`, `capslock / edit`).

## The four modes

- **normal** — default navigation mode.
- **capslock / normal** (`normalCaps` internally) — CapsLock is active; only the CapsLock key works (to return to `normal`).
- **edit** (`labelEdit`) — text editing with lowercase characters.
- **capslock / edit** (`labelEditCaps`) — text editing with uppercase characters.

## Transition rules

In general, you return to a parent mode from a submode by pressing Escape, Ctrl-[, or double-Shift. CapsLock is the exception: if CapsLock is on, exiting an edit mode goes to `capslock / normal` (not `normal`). Concretely:

- `normal` → press CapsLock → `capslock / normal`
- `capslock / normal` → press CapsLock → `normal`
- `edit` → press CapsLock → `capslock / edit`
- `capslock / edit` → press CapsLock → `edit`
- `capslock / edit` → Escape / Ctrl-[ / Shift+Enter / double-Shift → `capslock / normal` (preserves caps state)
- `edit` → Escape / Ctrl-[ / Shift+Enter / double-Shift → `normal`

The invariant: exiting a mode via Escape / Ctrl-[ / double-Shift returns to the parent mode at the same CapsLock level. CapsLock toggles between the caps and non-caps variant of the current mode category.

See [architecture-invariants](architecture-invariants.md) for the full invariant list, including the CapsLock-state-preservation rule.
