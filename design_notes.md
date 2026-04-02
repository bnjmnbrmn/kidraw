# Design Notes & Ergonomic Goals

## Philosophy
- **Keyboard-First**: Primary interaction via keyboard; mouse is secondary or non-existent.
- **Home Row Centric**: High frequency actions on the home row or easily reachable without moving the hand.
- **Command-Execution Model**: Select → Act → Reset. Selection is ephemeral and clears after action.
- **Ergonomics**:
    - Stronger fingers (Index, Middle) for frequent/critical actions.
    - Weaker fingers (Pinky) for less frequent or modifier-like states.
    - "Opposite Hand" principle for submenus to balance load.
- **Flexibility**: The codebase should support rapid iteration of key layouts to test ergonomic theories.

## Movement Profiles

Key assignments are intentionally non-stable — see Non-Invariants. The goal is to support multiple named profiles selectable from settings.

### Tradeoff: Cardinal-only vs Diagonal movement
- **hjkl / jilk / fdse** profiles use one key per direction — clean and vim-familiar, but diagonal movement requires two simultaneous keypresses (awkward).
- **Future**: a profile using keys arranged in a 2×2 or diagonal cluster (e.g. `esdf`, or numpad-style) could allow diagonal movement more naturally.

---

### Profile: Vim (initial implementation target)

Natural for vim users; chosen as the first profile to implement since it enables comfortable testing.

| Key | Action | Notes |
| :--- | :--- | :--- |
| `h`/`j`/`k`/`l` | Move crosshairs ←↓↑→ | Standard vim directions |
| `i` | Insert/Add+Drag submenu | vim insert-mode analogy; held to keep submenu open |
| `v` | Select+Drag held mode | vim visual-mode analogy |
| `x` | Delete | Selected item or item under crosshairs |
| `u`/`o` | Zoom in / Zoom out | TBD |
| `z` | View submenu | TBD |

### Profile: Right-hand-dominant (current implementation)

| Key | Action | Notes |
| :--- | :--- | :--- |
| `j`/`i`/`l`/`k` | Move crosshairs ←↑→↓ | Right hand on home row |
| `f` | Insert/Add+Drag submenu | Left-hand trigger |
| `v` | Select+Drag held mode | |
| `p`/`u` | Zoom out / Zoom in | |
| `x` | Delete | |

### Profile: Left-hand-dominant (future)

| Key | Action | Notes |
| :--- | :--- | :--- |
| `f`/`d`/`s`/`e` | Move crosshairs | Left hand; right hand triggers submenus |
| TBD | Insert/Add+Drag submenu | Right-hand trigger |

### Open Questions
- Zoom key assignments for the vim profile (`u`/`o`? `-`/`+`? TBD)
- Does context-sensitive Edit/Insert (one key) reduce cognitive load or increase mode confusion?
- When in the vim profile's insert submenu (holding `i`), which keys should drive movement? The hjkl keys are on the same hand — may need a different movement set while `i` is held.

---

## Interaction Redesign: Held-Key Modes + Waypoints vs Labels

### Concepts
- **Waypoint** = geometry-only bend point on an edge (no text, just changes edge path)
- **Label** = text annotation on an edge (has text, positioned along edge, visible box)
- **Held-key mode** = while a base-level key is held, a submenu or movement mode is active; releasing the key exits the mode

### Base-Level Held Keys (normal mode)
Three base-level held keys, all allowing opposite-hand movement + zoom while held:
- **Add+Drag key** — opens submenu to add node / waypoint / edge / label
  - Context-sensitive: grey out options that don't make sense (e.g. "edge" requires 2 selected nodes)
  - After adding, the new item is auto-selected and draggable while key is held
  - Releasing the key unselects the item and returns to normal mode
- **Select+Drag key** — selects item under crosshairs, then drag while held
  - Releasing the key unselects and returns to normal mode
- **Move key** — move crosshairs with opposite hand while held; also allows zoom
- **Delete key** — delete selected or item under crosshairs (already implemented as `x`)

While any held key is active, opposite-hand keys provide:
- **Movement**: jkli (right-hand) or fdse (left-hand), depending on handedness setting
- **Zoom**: m./vx (TBD based on handedness)
- Handedness togglable under a "Basic Settings" menu

### Open Questions
- Exact key assignments for Add+Drag, Select+Drag, Move (depends on handedness default)
- How to visualize greyed-out submenu options
- Should multi-select persist across Select+Drag holds? (probably not initially)
- Edge label positioning algorithm details (defer to later)

---

## Key Menu System: Model & Invariants

This section documents the conceptual model for the key menu system. Invariants I1–I3 are confirmed; I4–I7 are TBD.

### Definitions

- **Key Menu System** — top-level container (`KeyMenu` class). Owns modes, tracks the current mode.
- **Mode** — e.g., `normal`, `labelEdit`. Has exactly one root submenu. A mode may have a validity condition on data state; if the condition becomes false, the system reverts to a default mode.
- **Submenu** — a set of key menu items within a mode. Every submenu has exactly one key path. The root submenu of a mode has an empty key path. There is exactly one active submenu at any given time.
- **Key path** — an ordered sequence of keys associated with a submenu. Represents the keys that must be physically held (in order) to reach that submenu. A key path `[f, d, s]` means `f` was pressed-and-held, then `d` (while `f` remained held), then `s` (while both remained held). The root submenu's key path is `[]`.
- **Key menu item** — an entry in a submenu, associated with a specific physical key. Exists in exactly one submenu (its containing submenu). The same physical key can appear in different submenus.
- **Containing submenu** — the submenu a key menu item sits in (always exactly one, non-optional).
- **Triggered submenu** — the submenu a key menu item opens when held (optional, via submenu binding).
- **Action binding** — maps a key menu item to an action (+ optional repeater). Optional per item.
- **Submenu binding** — maps a key menu item to a triggered submenu. Optional per item.
- A key menu item can have zero or one of each binding type independently. A key menu item with both is a "SubmenuAction" key.
- **Action** (or **unit action**) — a single discrete invocation of a function (e.g., "move crosshairs left by one step").
- **Repeater** — optional mechanism that re-fires the unit action on an interval while the key is held.
- **Fresh press** — a `keyDown` event where **both**: (1) the key was not physically held immediately before the event, and (2) the key has a binding in the currently active submenu.
- **Stale key** — a key that is already physically held when a submenu becomes active. Must not trigger any action until released and pressed again.
- **Physical key state** — per physical key: `held` or `not held`. This is ground truth from the OS.

### Transition Types

The active submenu can change via four mechanisms:

- **Hold-transition** — pressing and holding a submenu-trigger key. Active submenu changes to the triggered submenu; key path grows by one. Releasing the key reverses the transition (see I1d).
- **Action-transition** — pressing and releasing an action key causes the active submenu to be replaced by a different submenu with the same key path. (Sometimes called an "indirect" submenu.)
- **Mode switch** — the active mode changes entirely (e.g., `normal` → `labelEdit`). Resets to the new mode's root submenu.
- **Key-path release** — releasing a key in the active submenu's key path (see I1d).

### Invariants

**I1a.** Every submenu has exactly one key path. The root submenu of a mode has an empty key path.

**I1b.** There is exactly one active submenu at any given time.

**I1c.** Every key in the active submenu's key path must be physically held for that submenu to remain active.

**I1d.** When a key in the active submenu's key path is released, the new active submenu's key path must be the **prefix** of the old key path up to (but not including) the released key. Keys after the released key in the path are ignored, even if still physically held.

  - Examples:
    - Path `[f, d, s, a]`, `d` released → new path `[f]`. (`s` and `a` still held but ignored.)
    - Path `[f, d, s, a]`, `a` released → new path `[f, d, s]`.
    - Path `[f, d, s, a]`, `f` released → new path `[]` (root submenu).
    - Path `[i]`, `i` released → new path `[]` (root submenu).

**I2. Fresh press only.** An action fires only on a fresh press:
  1. The key was not physically held immediately before the `keyDown` event.
  2. The key has a binding in the submenu that is active at the time of the event.

  A stale key (already held when a submenu becomes active) must not trigger any action until released and pressed again.

  - Examples:
    - Root submenu active, `f` not held. User presses `f` → fresh press, action fires.
    - Key path `[i]` (Insert submenu). `f` was already held before `i` was pressed → `f` is stale. Insert submenu's `f` action must NOT fire until `f` is released and pressed again.

**I3. Repeater lifetime.** *(Under revision.)*

A repeater is active only while **both**:
  1. Its key was freshly pressed (not stale).
  2. The submenu that owns the key menu item is **in the stack** (is the active submenu or an ancestor of the active submenu).

  If either condition becomes false, the repeater stops immediately. A repeater can continue even when its submenu is not the active submenu, as long as it's still in the stack (supports SubmenuAction keys that both fire a repeating action and open a child submenu).

**I4–I7** — TBD (one active mode, action-transitions preserve key path, mode validity, key release ordering).

### Non-Invariants (WIP)

- A key physically held that has no binding in the active submenu is ignored.
- Keys from a previous submenu that are still held do not auto-fire in a new submenu (stale-hold rule, I2).
- The set of disabled/enabled key menu items can change at any time based on data state without changing the active submenu.

### Discussion Notes

- **Key path coloring**: Plan to visualize the key path at the bottom of the keymenu component. Keys in the path colored progressively (blue → green → yellow → orange → red as depth increases). Should be color-blind accessible.
- **Keyboard card stack**: Original visualization concept (10+ years ago): submenus as a stack of colored "keyboard cards" with holes punched out where keys are pressed. Cards offset to show held keys in the stack. May revisit.
- **Indirect (action-transitioned) submenus**: Multiple submenus can share the same key path within a mode. The active submenu is not uniquely determined by the held-key sequence alone — it also depends on which action-transitions have occurred. The starting submenu for a given key path (with no prior action-transitions) is unique per mode.

---

## Mode Hierarchy & CapsLock

Modes have a parent/child relationship. The mode label uses "/" to separate parent modes from child modes (e.g., "capslock / normal", "capslock / edit").

The four modes are:
- **normal** — default navigation mode
- **capslock / normal** (`normalCaps`) — CapsLock is active; only CapsLock key works (to return to normal)
- **edit** (`labelEdit`) — text editing with lowercase characters
- **capslock / edit** (`labelEditCaps`) — text editing with uppercase characters

### CapsLock Mode Transitions

In general, you can return to parent modes from submodes by pressing Escape, Ctrl-[, or double-Shift. The exception is CapsLock: if CapsLock is on, exiting an edit mode goes to "capslock / normal" (not "normal"). Specifically:

- **normal** → press CapsLock → **capslock / normal**
- **capslock / normal** → press CapsLock → **normal**
- **edit** → press CapsLock → **capslock / edit**
- **capslock / edit** → press CapsLock → **edit**
- **capslock / edit** → Escape / Ctrl-[ / Shift+Enter / double-Shift → **capslock / normal** (preserves caps state)
- **edit** → Escape / Ctrl-[ / Shift+Enter / double-Shift → **normal**

The invariant: exiting a mode via Escape/Ctrl-[/double-Shift always returns to the parent mode at the same CapsLock level. CapsLock itself toggles between the caps and non-caps variant of the current mode category.

## Invariants

Things that must **always** hold. Violations are bugs.

1. **Crosshairs always exist**: The crosshairs layer is always present and positioned on the stage.
2. **Crosshairs stay in bounds**: Movement clamps crosshairs within `edgeMargin` of stage edges; overflow scrolls the drawing layer instead.
3. **Selection is visual**: A selected item always renders its selected visual state (stroke color, etc.).
4. **Unselect-all clears everything**: `UNSELECT_ALL` deselects all nodes, edges, waypoints, and labels.
5. **KeyMenu modes are exclusive**: Exactly one mode (`normal`, `normalCaps`, `labelEdit`, or `labelEditCaps`) is active at any time.
6. **Label edit mode hides crosshairs**: Entering label edit hides the crosshairs; exiting restores them.
7. **Insert-node auto-connects**: Creating a new node with existing selected nodes creates edges from each selected node to the new node.
8. **Zoom preserves crosshairs position**: Zooming in/out scales around the crosshairs' current position.
9. **Key assignments are configurable**: All bindings flow through `KeymenuKeyAssignments`; no hardcoded key literals in action logic.
10. **CapsLock state is preserved across mode transitions**: Exiting edit mode returns to the caps-matching normal mode (edit→normal, capslock/edit→capslock/normal).

## Non-Invariants (Explicitly Not Guaranteed)

These may change and should not be relied upon by tests or design assumptions.

1. **Specific key assignments**: Which physical key maps to which action is experimental and will change.
2. **Number of submenu levels**: Depth of key-submenu nesting may change.
3. **Movement distance**: `CROSSHAIRS_MOVEMENT_DISTANCE` (currently 50) is tunable, not fixed.
4. **Zoom step factor**: Currently 2× per step; tunable.
5. **Node/edge visual styling**: Colors, sizes, fonts are all subject to change.
6. **Tween durations**: Animation speeds are tuning parameters.
7. **Breadcrumb/hint UI layout**: The overlay showing active key path and hints is experimental.
8. **Label edit entry/exit triggers**: How you enter/exit label edit mode (double-shift, Escape, Ctrl-[, Shift-Enter) may be revised.
