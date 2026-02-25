# Project Todos

## Interaction Redesign: Held-Key Modes + Waypoints vs Labels

### Concepts
- **Waypoint** = geometry-only bend point on an edge (no text, just changes edge path)
- **Label** = text annotation on an edge (has text, positioned along edge, visible box)
- **Held-key mode** = while a base-level key is held, a submenu or movement mode is active; releasing the key exits the mode

### Key Layout (base level, normal mode)
Three base-level held keys, all allowing opposite-hand movement + zoom while held:
- **Add+Drag key** — opens submenu to add node / waypoint / edge / label
  - Context-sensitive: grey out options that don't make sense (e.g. "edge" requires 2 selected nodes)
  - After adding, the new item is auto-selected and draggable while key is held
  - Releasing the key unselects the item and returns to normal mode
- **Select+Drag key** — selects item under crosshairs, then drag while held
  - Releasing the key unselects and returns to normal mode
- **Move key** — move crosshairs with opposite hand while held
  - Also allows zoom in/out with opposite hand
- **Delete key** — delete selected or item under crosshairs (already implemented as `x`)

While any of the three held keys are active, opposite-hand keys provide:
- **Movement**: jkli (right-hand) or fdse (left-hand), depending on handedness setting
- **Zoom**: m. or vx (TBD based on handedness)
- Handedness togglable under a "Basic Settings" menu (left-hand-dominant vs right-hand-dominant)

### Implementation Phases

#### Phase 1: Distinguish Waypoints vs Labels in Data Model
- [ ] Rename existing waypoint-with-text concept to "Label" (DALabel class)
- [ ] Simplify DAWaypoint to geometry-only (circle, no text/rect)
- [ ] DALabel: text annotation on edge, always-visible text, positioned along edge
- [ ] Both share: position on edge, selectable, draggable, deletable
- [ ] Update DAEdge to hold both waypoints[] and labels[]
- [ ] Unit tests for waypoint vs label creation, selection, deletion

#### Phase 2: Held-Key Mode Infrastructure in KeyMenu
- [ ] Add "held-key mode" concept to KeyMenu: keyDown enters mode, keyUp exits mode
  - Different from current submenu which waits for a second keypress
  - Need to track which base key is held and route opposite-hand keys as movement/zoom
- [ ] Define HeldKeyMode interface: onEnter, onMovement, onZoom, onExit
- [ ] Wire up app key repeat (suppress system repeat, use app-controlled repeat for movement)
- [ ] Unit tests for held-key mode enter/exit lifecycle

#### Phase 3: Move Mode
- [ ] Implement Move as simplest held-key mode (crosshair movement + zoom only)
- [ ] Opposite-hand movement keys (jkli or fdse) move crosshairs
- [ ] Opposite-hand zoom keys zoom in/out
- [ ] Crosshairs visible during move mode
- [ ] Unit tests + Puppeteer test: hold move key, press movement keys, verify crosshair position

#### Phase 4: Add+Drag Mode
- [ ] Add+Drag key enters held mode, shows submenu overlay (node / waypoint / edge / label)
- [ ] Submenu key press triggers creation at crosshairs position
  - Node: create node at crosshairs
  - Waypoint: create waypoint on edge under crosshairs
  - Edge: connect selected nodes (greyed if < 2 nodes selected)
  - Label: create label on edge under crosshairs
- [ ] After creation, auto-select new item
- [ ] While Add+Drag key still held, opposite-hand movement drags the new item
- [ ] Releasing Add+Drag key unselects and returns to normal mode
- [ ] Grey out inapplicable submenu options based on context
- [ ] Unit tests + Puppeteer tests for each add scenario

#### Phase 5: Select+Drag Mode
- [ ] Select+Drag key held: select item under crosshairs (node, edge, waypoint, or label)
- [ ] While held, opposite-hand movement drags the selected item
- [ ] Releasing unselects and returns to normal mode
- [ ] Support multi-select: crosshairs over additional items while held adds to selection
- [ ] Unit tests + Puppeteer tests for select+drag lifecycle

#### Phase 6: Handedness Toggle + Basic Settings
- [ ] Add "Basic Settings" menu accessible from a key (TBD)
- [ ] Handedness setting: left-hand-dominant vs right-hand-dominant
  - Left-hand: base keys on left (f/d/s area), movement on right (jkli)
  - Right-hand: base keys on right (j/k/l area), movement on left (fdse)
- [ ] Persist setting in localStorage
- [ ] Movement/zoom key assignments update based on handedness
- [ ] Unit tests for key mapping based on handedness setting

### Open Questions
- Exact key assignments for Add+Drag, Select+Drag, Move (depends on handedness default)
- How to visualize greyed-out submenu options
- Should multi-select persist across Select+Drag holds? (probably not initially)
- Edge label positioning algorithm details (defer to later)

---

## Other Remaining Work

### Core Features
- [ ] Editable text on nodes
   - What sorts of keybindings to support when editing text?  Vim/Emacs/Ctrl-c etc + arrow keys?
   - How to make this configurable?
   - Change node size to allow for more/less text?  Change text size?  Max text length?
- [ ] Figure out how to deal with overlapping nodes
  - Z-cycle?
  - Blocking insertion of overlapping nodes?
  - Pushing nodes away when too close?
- [ ] Allow edges to be non-directed or bidirectional
- [ ] Allow connecting nodes to themselves
- [ ] Undo/Redo
- [ ] Graph Navigation
- [ ] Shortcut to create a new node connected to the currently selected one
- [ ] Panning
   - Maybe have combined pan/zoom mode, where the crosshairs follow the view area
- [ ] Fast/accelerating and slow/decelerating movement/zooming/panning
- [ ] Savable/loadable diagrams (local storage or file system)

### Polish & Infrastructure
- [ ] Introduce App Key Repeat / Ignore System Key Repeat
- [ ] Make pretty (animate node add, etc.)
- [ ] Separate edges when they are too close
- [ ] Make keymenu keybindings configurable
- [ ] Update keymenu to optionally use "cards"
- [ ] Create entity-relation diagram to help understand system
- [ ] Deploy using S3/Route 53
- [ ] Set up analytics
- [ ] Set up as libraries
- [ ] Add CI/CD pipeline for automated testing

## Key Menu System: Model & Invariants (WIP)

This section documents the evolving conceptual model for the key menu system.
Invariants I3–I7 and non-invariants are still under discussion.

### Definitions

- **Key Menu System** — the top-level container (currently the `KeyMenu` class). Owns modes, tracks the current mode.
- **Mode** — e.g., `normal`, `labelEdit`. Has exactly one root submenu. A mode may have a validity condition on data state (e.g., `labelEdit` requires a node in editing state). If the condition becomes false, the system reverts to a default mode.
- **Submenu** — a set of key menu items within a mode. Every submenu has exactly one key path. The root submenu of a mode has an empty key path. There is exactly one active submenu at any given time.
- **Key path** — an ordered sequence of keys associated with a submenu. Represents the keys that must be physically held (in order) to reach that submenu. A key path `[f, d, s]` means: first `f` was pressed and held, then `d` was pressed and held (while `f` remained held), then `s` was pressed and held (while `f` and `d` remained held). The root submenu's key path is `[]`.
- **Key menu item** — an entry in a submenu, associated with a specific physical key. A key menu item exists in exactly one submenu (its containing submenu). The same physical key can appear as key menu items in different submenus.
- **Containing submenu** — the submenu a key menu item sits in (always exactly one, non-optional).
- **Triggered submenu** — the submenu a key menu item opens when held (optional, via submenu binding).
- **Action binding** — maps a key menu item to an action (+ optional repeater). Optional per key menu item.
- **Submenu binding** — maps a key menu item to a triggered submenu. Optional per key menu item.
- A key menu item can have zero or one of each binding type independently. A key menu item with both an action binding and a submenu binding is a "SubmenuAction" key.
- **Action** (or **unit action** when emphasis on discreteness is needed) — a single discrete invocation of a function. Always one unit of work (e.g., "move crosshairs left by one step").
- **Repeater** — optional mechanism that re-fires the (unit) action on an interval while the key is held.
- **Fresh press** — a `keyDown` event where **both** of the following are true: (1) the key was not physically held immediately before the event, and (2) the key has a binding in the submenu that is active at the time of the event.
- **Stale key** — a key that is already physically held when a submenu becomes active. A stale key must not trigger any action until it is released and pressed again.
- **Physical key state** — per physical key: `held` or `not held`. This is ground truth from the OS.

### Transition Types

The active submenu can change via four mechanisms:

- **Hold-transition** — pressing and holding a submenu-trigger key. The active submenu changes to the triggered submenu; the key path grows by one. Releasing the key reverses the transition (see I1d).
- **Action-transition** — pressing and releasing an action key causes the active submenu to be replaced by a different submenu with the same key path. (Sometimes called an "indirect" submenu.)
- **Mode switch** — the active mode changes entirely (e.g., `normal` → `labelEdit`). Resets to the new mode's root submenu.
- **Key-path release** — releasing a key in the active submenu's key path (see I1d).

### Invariants

**I1a.** Every submenu has exactly one key path — an ordered sequence of keys. The root submenu of a mode has an empty key path.

**I1b.** There is exactly one active submenu at any given time.

**I1c.** Every key in the active submenu's key path must be physically held for that submenu to remain active.

**I1d.** When a key in the active submenu's key path is released, the new active submenu's key path must be the **prefix** of the old key path up to (but not including) the released key. Keys that appear after the released key in the path are ignored, even if still physically held.

  - Examples:
    - Key path is `[f, d, s, a]`. Key `d` is released → new key path is `[f]`. Even though `s` and `a` are still physically held, they are past the released key in the path.
    - Key path is `[f, d, s, a]`. Key `s` is released → new key path is `[f, d]`. Even though `a` is still physically held, it is past the released key in the path.
    - Key path is `[f, d, s, a]`. Key `a` is released → new key path is `[f, d, s]`.
    - Key path is `[f, d, s, a]`. Key `f` is released → new key path is `[]` (root submenu).
    - Key path is `[i]`. Key `i` is released → new key path is `[]` (root submenu).

**I2. Fresh press only.** An action fires only on a fresh press. A fresh press is a `keyDown` event where **both** of the following are true:
  1. The key was not physically held immediately before the `keyDown` event.
  2. The key has a binding in the submenu that is active at the time of the event.

  A key that is already physically held when a submenu becomes active (e.g., via hold-transition, action-transition, or mode switch) is stale in that submenu. A stale key must not trigger any action until it is released and pressed again.

  - Examples:
    - Root submenu is active. `f` is not held. User presses `f` → fresh press, action fires.
    - Key path is `[i]` (Insert submenu). `f` was already held before `i` was pressed (e.g., user was holding Move Right). Insert submenu becomes active → `f` is stale. The Insert submenu's `f` action (create node) must NOT fire until `f` is released and pressed again.
    - User is in submenu `[i]`, presses `f` (creates node), releases `f` → action-transitions to drag submenu `[i]*`. Drag submenu also has `f` (drag right). Since `f` was just released, it's not held → no issue. If user presses `f` again, it's a fresh press.

**I3. Repeater lifetime.** *(Under revision — see discussion notes below.)*

A repeater is active only while **both** of the following are true:
  1. Its key was freshly pressed (not stale).
  2. The submenu that owns the key menu item is **in the stack** (i.e., is the active submenu or an ancestor of the active submenu).

  If either condition becomes false, the repeater stops immediately. Note: a repeater can continue even when its submenu is not the active submenu, as long as the submenu is still in the stack. This supports cases like holding a SubmenuAction key (e.g., move-left) that both fires a repeating action and opens a child submenu — the movement should continue while the child submenu is active.

**I4–I7** — TBD (one active mode, action-transitions preserve key path, mode validity, key release ordering). Discussion ongoing.

### Non-Invariants (WIP)

- A key can be physically held that has no binding in the active submenu. It is ignored.
- Keys from a previous submenu that are still held do not auto-fire in a new submenu (the stale-hold rule, I2).
- The set of disabled/enabled key menu items can change at any time based on data state, without changing which submenu is active.

### Discussion Notes

- **Key path coloring.** Plan to visualize the key path at the bottom of the keymenu component. Keys in the path would be colored progressively: blue → green → yellow → orange → red as the path deepens. Should be accessible for color-blindness.
- **Keyboard card stack.** Original visualization concept (10+ years ago): submenus as a stack of colored "keyboard cards" with holes punched out where keys are pressed. Cards offset to show held keys in the stack. May revisit this or a similar visualization.
- **Indirect (action-transitioned) submenus.** Multiple submenus can share the same key path within a mode. The active submenu is not uniquely determined by the held-key sequence alone — it also depends on which action-transitions have occurred. The starting submenu for a given key path (with no prior action-transitions) is unique per mode.

### Immediate Experiment Buildout (in progress)

- [x] Add UI tabs to switch interaction profiles (Classic / Steering / Traverse / Typography)
- [x] Wire active profile into keymenu + drawing area behavior
- [x] Implement steering commands (forward/back/strafe/rotate/speed up/down)
- [x] Add heading indicator to crosshairs for steering profile
- [x] Implement semantic graph traversal commands (next outgoing / next incoming)
- [x] Implement self-loop edge support (source == destination)
- [x] Implement selected-node size controls (increase/decrease)
- [x] Implement selected-node text size controls (increase/decrease)
- [x] Build and test all profiles

### Interaction Profile Follow-ups (requested 2026-02-19)

- [x] Move directional/movement controls to the right-hand side by default; make handedness configurable later
- [x] Keep rotation controls grouped with the rest of movement controls
- [x] Convert Select+Drag to held-key behavior (hold to drag with movement keys, release to exit) without a second keypress
- [x] Consolidate recenter actions into a dedicated submenu
- [x] Use only one zoom-in key and one zoom-out key
- [x] Add double-Shift as the default shortcut to return to normal mode (keep Ctrl-[ and Escape)
- [x] Add a graph-navigation submenu; entering it should snap to the nearest node
- [x] Add an Edit action that enters the same edit mode used after inserting nodes/labels
- [x] Investigate waypoint selection reliability and add regression coverage
- [x] Show a movement-speed dial with visible min/max bounds
- [x] Add a breadcrumb trail for the active anchor/key-path stack

---

## Key Menu Refactoring 
- [ ] Add command registry layer to hide command details
- [ ] Add pluggable visualization layer (different renderers)
- [x] Add key assignment configuration layer
- [x] Create reusable KeyMenuConfig interface
- [ ] Support different keyboard layouts and visualizations
- [ ] Make keymenu reusable for other applications
- [ ] Rename: Remove Config suffix from config classes, add "Renderer" suffix to Konva implementation classes

## Alternative Approaches to Try Later for Key Menu Code organization
- [ ] Try ActionKey/SubmenuKey inheritance (SubmenuKey extends ActionKey)
- [ ] Try mixins approach for flexible behavior composition
- [ ] Try factory methods + type guards/casts instead of Default classes

---

## Completed
- [x] Drag-able nodes
  - Have a submenukey on the left side, maybe r, for "drag selected"
  - The submenu continues to have left/right/up/down options
  - Crosshairs disappear during the drag
  - When your leftmost selected item goes off screen (or partially off), you start to auto-pan left (same logic for other directions)
  - **Known Issues:**
    - ~~Edge alignment during drag needs fine-tuning - edges move but may not align perfectly with node centers during animation~~ ✅ **FIXED**
    - ~~Edge points update after animation rather than smoothly during movement~~ ✅ **FIXED**
- [x] Deletion
   - If one or more nodes are selected, delete them and any edges connected to them
   - If one or more edges are selected (and no nodes), delete them
   - If a waypoint is selected, remove it and join the edges it connects with
   - If nothing is selected, delete the node/edge/waypoint under the crosshairs, if any
- [x] Basic waypoints on edges
  - Key to add waypoint to edge under crosshairs (`w`)
  - Waypoints visible when selected
  - Waypoints draggable
  - Waypoints deletable (`x` key)
  - Auto-enable waypoint visibility when adding waypoint
