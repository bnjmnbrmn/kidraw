# Design Notes & Ergonomic Goals

## Philosophy
- **Keyboard-First**: Primary interaction via keyboard; mouse is secondary or non-existent.
- **Home Row Centric**: High frequency actions should be on the home row or easily reachable without moving the hand.
- **Command-Execution Model**: Select -> Act -> Reset. Selection is ephemeral and clears after action.
- **Ergonomics**: 
    - Stronger fingers (Index, Middle) for frequent/critical actions.
    - Weaker fingers (Pinky) for less frequent or modifier-like states.
    - "Opposite Hand" principle for submenus to balance load.
- **Flexibility**: The codebase should support rapid iteration of key layouts to test ergonomic theories.

## Current Layout Experiment (Iterative)
| Key | Action | Context | Notes |
| :--- | :--- | :--- | :--- |
| `i`/`j`/`k`/`l` | Movement | Navigation | Vim-style (or inverted T) |
| `p` | Zoom Out | View | |
| `u` | Zoom In | View | **New Proposal**: Move to `y` |
| `s` | Select + Drag | Manipulation | **New Proposal**: Move to `v` |
| `c` | Clear Selection | Selection | |
| `z` | View Submenu | View | |
| `e` | Edit/Insert | Action | **New Proposal**: Context sensitive. Edit if item exists, else Insert submenu. |

## Feature Requests & Ideas
### Edit Mode
- Support Backspace/Delete.
- Support Newlines.
- Auto-sizing: Nodes should grow/shrink to fit text, or text scale to fit node (future).
- Standardization: Option to reset node sizes to default.

### Layout Refactoring
- Abstract key assignments into a configuration file/object to allow easy swapping of "Profiles" (e.g. "Left-Hand Heavy", "Vim Standard", "Dvorak", etc).

## Questions / Experiments
- How does `v` for Select feel compared to `s`? (Index vs Ring/Pinky dependence).
- Does context-sensitive `e` (Edit/Insert) reduce cognitive load or increase it (mode confusion)?

---

## Invariants

These are things we expect to **always** hold true. Violations are bugs.

1. **Single interaction profile**: Only "Classic Grid" exists. No profile tabs, no profile switching.
2. **Crosshairs always exist**: The crosshairs layer is always present and positioned on the stage.
3. **Crosshairs stay in bounds**: Movement clamps crosshairs within `edgeMargin` of the stage edges; overflow scrolls the drawing layer instead.
4. **Selection is visual**: A selected item always renders its selected visual state (stroke color, etc.).
5. **Unselect-all clears everything**: `UNSELECT_ALL` deselects all nodes, edges, waypoints, and labels.
6. **KeyMenu modes are exclusive**: Exactly one mode (`normal` or `labelEdit`) is active at any time.
7. **Label edit mode hides crosshairs**: Entering label edit hides the crosshairs; exiting restores them.
8. **Insert-node auto-connects**: Creating a new node with existing selected nodes creates edges from each selected node to the new node.
9. **Zoom preserves crosshairs position**: Zooming in/out scales around the crosshairs' current position.
10. **Key assignments are configurable**: All key bindings flow through `KeymenuKeyAssignments`; no hardcoded key literals in action logic.

## Non-Invariants (Explicitly Not Guaranteed)

These are things that may change and should **not** be relied upon by tests or design assumptions.

1. **Specific key assignments**: Which physical key maps to which action is experimental and will change.
2. **Number of submenu levels**: The depth of key-submenu nesting may change.
3. **Movement distance**: The `CROSSHAIRS_MOVEMENT_DISTANCE` value (currently 50) is tunable, not fixed.
4. **Zoom step factor**: Currently 2x per step, but this is a tuning parameter.
5. **Node/edge visual styling**: Colors, sizes, fonts are all subject to change.
6. **Tween durations**: Animation speeds are tuning parameters.
7. **Breadcrumb/hint UI layout**: The overlay showing active key path and hints is experimental.
8. **Label edit entry/exit triggers**: How you enter/exit label edit mode (double-shift, Escape, Ctrl-[, Shift-Enter) may be revised.
