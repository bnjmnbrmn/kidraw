---
title: Design invariants and non-invariants
type: architecture
---

# Design invariants and non-invariants

## Invariants — things that must always hold; violations are bugs

1. **Crosshairs always exist.** The crosshairs layer is always present and positioned on the stage.
2. **Crosshairs stay in bounds.** Movement clamps the crosshairs within `edgeMargin` of stage edges; overflow scrolls the drawing layer instead.
3. **Selection is visual.** A selected item always renders its selected visual state (stroke color, etc.).
4. **Unselect-all clears everything.** `UNSELECT_ALL` deselects all nodes, edges, waypoints, and labels.
5. **Keymenu modes are exclusive.** Exactly one mode (`normal`, `normalCaps`, `labelEdit`, or `labelEditCaps`) is active at any time. See [architecture-mode-hierarchy](architecture-mode-hierarchy.md).
6. **Label-edit hides crosshairs.** Entering label edit hides the crosshairs; exiting restores them.
7. **Insert-node auto-connects.** Creating a new node with existing selected nodes creates edges from each selected node to the new node.
8. **Zoom preserves crosshairs position.** Zooming in/out scales around the crosshairs' current position.
9. **Key assignments are configurable.** All bindings flow through `KeymenuKeyAssignments`; no hardcoded key literals in action logic. See [architecture-key-profiles](architecture-key-profiles.md).
10. **CapsLock state is preserved across mode transitions.** Exiting edit mode returns to the caps-matching normal mode (`edit` → `normal`, `capslock / edit` → `capslock / normal`).
11. **Waypoint hit-tests share one tolerance.** Any code path that asks "what waypoint is under the crosshairs?" uses `getWaypointUnderCrosshairs()`, whose tolerance is the crosshairs' selection-circle radius (in layer coords). A waypoint is targetable whenever it even partially overlaps that circle — select, select+drag, pin, and delete all share this rule.

## Non-invariants — explicitly not guaranteed

These are tuning parameters; tests and design assumptions should not depend on specific values.

1. **Specific key assignments.** Which physical key maps to which action is experimental and will change. See [architecture-key-profiles](architecture-key-profiles.md).
2. **Number of submenu levels.** Depth of key-submenu nesting may change.
3. **Movement distance.** `CROSSHAIRS_MOVEMENT_DISTANCE` (currently 50) is tunable, not fixed.
4. **Zoom step factor.** Currently 2× per step; tunable.
5. **Node/edge visual styling.** Colors, sizes, fonts are all subject to change.
6. **Tween durations.** Animation speeds are tuning parameters.
7. **Breadcrumb / hint UI layout.** The overlay showing the active key path is experimental.
8. **Label-edit entry/exit triggers.** How you enter/exit label-edit mode (double-Shift, Escape, Ctrl-[, Shift-Enter) may be revised.
