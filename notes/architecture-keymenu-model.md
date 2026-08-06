---
title: Keymenu system model — definitions, transitions, invariants
type: architecture
---

# Keymenu system model — definitions, transitions, invariants

This is the conceptual model for the keymenu system. Invariants I1–I3 are confirmed; I4–I7 are TBD.

The built-in **Keymenu States / Events** sample is the executable overview of
the current model. It shows physical key down/up and app-owned repeat events,
submenu stack transitions, the three graph-text modes and their Caps variants,
and drawing-area surfaces that suspend ordinary keymenu handling. Edge labels
are events or guards, not shortcut descriptions; keep this sample synchronized
when a state or transition changes.

## Definitions

- **Key Menu System** — top-level container (`KeyMenu` class). Owns modes, tracks the current mode.
- **Mode** — e.g. `normal`, `labelEdit`. Has exactly one root submenu. A mode may have a validity condition on data state; if the condition becomes false, the system reverts to a default mode.
- **Submenu** — a set of key menu items within a mode. Every submenu has exactly one key path. The root submenu of a mode has an empty key path. Exactly one submenu is active at any time.
- **Key path** — an ordered sequence of keys associated with a submenu. Represents the keys that must be physically held (in order) to reach that submenu. A key path `[f, d, s]` means `f` was pressed-and-held, then `d` (while `f` remained held), then `s` (while both remained held). The root submenu's key path is `[]`.
- **Key menu item** — an entry in a submenu, associated with a specific physical key. Exists in exactly one submenu. The same physical key can appear in different submenus.
- **Containing submenu** — the submenu a key menu item sits in (always exactly one).
- **Triggered submenu** — the submenu a key menu item opens when held (optional, via submenu binding).
- **Action binding** — maps a key menu item to an action (+ optional repeater). Optional per item.
- **Submenu binding** — maps a key menu item to a triggered submenu. Optional per item.
- A key menu item can have zero or one of each binding type independently. A key menu item with both is a "SubmenuAction" key.
- **Action** (or **unit action**) — a single discrete invocation of a function (e.g. "move crosshairs left by one step").
- **Repeater** — optional mechanism that re-fires the unit action on an interval while the key is held.
- **Fresh press** — a `keyDown` event where **both**: (1) the key was not physically held immediately before the event, and (2) the key has a binding in the currently active submenu.
- **Stale key** — a key that is already physically held when a submenu becomes active. Must not trigger any action until released and pressed again.
- **Physical key state** — per physical key: `held` or `not held`. Ground truth from the OS.

## Transition types

The active submenu can change via four mechanisms:

- **Hold-transition** — pressing and holding a submenu-trigger key. Active submenu changes to the triggered submenu; key path grows by one. Releasing the key reverses the transition (see I1d).
- **Action-transition** — pressing and releasing an action key causes the active submenu to be replaced by a different submenu with the same key path. (Sometimes called an "indirect" submenu.)
- **Mode switch** — the active mode changes entirely (e.g. `normal` → `labelEdit`). Resets to the new mode's root submenu.
- **Key-path release** — releasing a key in the active submenu's key path (see I1d).

## Invariants

**I1a.** Every submenu has exactly one key path. The root submenu of a mode has an empty key path.

**I1b.** There is exactly one active submenu at any given time.

**I1c.** Every key in the active submenu's key path must be physically held for that submenu to remain active.

**I1d.** When a key in the active submenu's key path is released, the new active submenu's key path is the **prefix** of the old key path up to (but not including) the released key. Keys after the released key in the path are ignored, even if still physically held.

Examples:
- Path `[f, d, s, a]`, `d` released → new path `[f]`. (`s` and `a` still held but ignored.)
- Path `[f, d, s, a]`, `a` released → new path `[f, d, s]`.
- Path `[f, d, s, a]`, `f` released → new path `[]` (root submenu).
- Path `[i]`, `i` released → new path `[]` (root submenu).

**I2. Fresh press only.** An action fires only on a fresh press:

1. The key was not physically held immediately before the `keyDown` event.
2. The key has a binding in the submenu that is active at the time of the event.

A stale key (already held when a submenu becomes active) must not trigger any action until released and pressed again.

Examples:
- Root submenu active, `f` not held. User presses `f` → fresh press, action fires.
- Key path `[i]` (insert submenu). `f` was already held before `i` was pressed → `f` is stale. The insert submenu's `f` action must NOT fire until `f` is released and pressed again.

**I3. Repeater lifetime.** *(Under revision.)*

A repeater is active only while **both**:

1. Its key was freshly pressed (not stale).
2. The submenu that owns the key menu item is **in the stack** (the active submenu or an ancestor of it).

If either condition becomes false, the repeater stops immediately. A repeater can continue even when its submenu is not the active submenu, as long as it's still in the stack (supports SubmenuAction keys that both fire a repeating action and open a child submenu).

**I4–I7** — TBD. Candidate invariants: one active mode at a time; action-transitions preserve key path; mode validity rules; key-release ordering.

## Non-invariants (WIP)

- A key physically held that has no binding in the active submenu is ignored.
- Keys from a previous submenu that are still held do not auto-fire in a new submenu (the stale-hold rule, I2).
- The set of disabled/enabled key menu items can change at any time based on data state without changing the active submenu.

## Discussion notes

- **Key-path coloring.** Plan to visualize the key path at the bottom of the keymenu component. Keys in the path colored progressively (blue → green → yellow → orange → red as depth increases). Should be color-blind accessible.
- **Keyboard card stack.** Original visualization concept (10+ years ago): submenus as a stack of colored "keyboard cards" with holes punched out where keys are pressed. Cards offset to show held keys in the stack. May revisit.
- **Indirect (action-transitioned) submenus.** Multiple submenus can share the same key path within a mode. The active submenu is not uniquely determined by the held-key sequence alone — it also depends on which action-transitions have occurred. The starting submenu for a given key path (with no prior action-transitions) is unique per mode.
