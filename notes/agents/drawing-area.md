# drawing-area agent

## Mandate

Owns the canvas — the largest domain. Nodes, edges, waypoints, labels, the crosshairs, selection logic, drag flows, label-edit entry / exit, mode transitions on the drawing side, the big `handleCommands` switch.

## Scope

- `src/app/drawing-area/**` — everything in the directory:
  - `drawing-area.component.ts` (~2000 lines), spec files, integration spec.
  - `drawing.layer.ts`, `crosshairs.layer.ts`.
  - `da-node.ts`, `da-edge.ts`, `da-waypoint.ts`, `da-label.ts`, `da-crosshairs.group.ts`.
  - `command.model.ts`, `da-notification.model.ts`.
  - `graph-snapshot.ts`, `undo-redo.service.ts`.

Excluded (own region):

- The routing / layout algorithm files (`*-edges.ts`, `graph-layout.ts`, `edge-routing-metrics.ts`) — those belong to **graph-auto-layout**. Drawing-area calls into them but doesn't own the math.

## Out of scope

- Key-to-command mapping. Drawing-area consumes `DACommand`s; **keymenu** decides which key fires which command.
- File format. Drawing-area emits / restores `GraphSnapshot`; **serialization** maps that to / from disk.
- Shared services (debug-log, theme, visual-config, keyboard-config). Owned by **plumbing**.

## Invariants

The full list lives in [`architecture-invariants.md`](../architecture-invariants.md). The drawing-area-specific ones to never break:

1. Crosshairs always exist and stay in bounds; overflow scrolls the drawing layer.
2. A selected item always renders its selected visual state.
3. `UNSELECT_ALL` deselects everything (nodes, edges, waypoints, labels).
4. Label-edit hides crosshairs; exiting restores them.
5. Insert-node auto-connects edges from currently-selected nodes.
6. Zoom scales around the crosshairs' current position.
7. **Every waypoint hit-test goes through `getWaypointUnderCrosshairs()`** — invariant #11. Don't reach into individual edges' control points to look up "is a waypoint here." See [`vim-is-canonical-profile.md`](../vim-is-canonical-profile.md) for the analogous "always go through the config" rule on the keymenu side.

## Typical workflows

### Adding a new command

1. Add the `DACommandType` enum value + discriminated-union case in `command.model.ts`.
2. Add a `case` in `handleCommands` calling a new private method on `DrawingAreaComponent`.
3. If the command mutates the graph, list it in `MUTATING_COMMANDS` so undo snapshots fire.
4. If the command affects context (selection, defaults, undo state), list it in `CONTEXT_AFFECTING_COMMANDS` so `emitContextState` fires.
5. Coordinate with **keymenu** to wire the command to a key.
6. Write a unit / integration spec.

### Bug in interaction flow (e.g. selection, drag, mode transitions)

1. Reproduce. Often a `tools/repro-*.js` Playwright script via `window.ng.getComponent` is fastest — see existing ones for the pattern.
2. Suspect tween lifecycle (`finishTweens`) and the `hasDragged` / `dragSnapshotCaptured` flags first; they're behind several past bugs.
3. Fix with a minimal change. Update / add specs.

## Notes I read

- All `architecture-*` notes ([`architecture-invariants`](../architecture-invariants.md) chiefly).
- [`decision-interaction-model.md`](../decision-interaction-model.md) — the held-key model + waypoint vs label.
- [`idea-drawing-area-refactor.md`](../idea-drawing-area-refactor.md) — the planned service extractions. Keep in mind when adding new state.
- [`idea-test-coverage-gaps.md`](../idea-test-coverage-gaps.md) — what to remember to test.
- [`process-workflow-lessons.md`](../process-workflow-lessons.md) — especially "write a state-machine test before implementing an animation."

## Notes I own

- Decisions about the drawing-area's command surface and interaction flows. Add `notes/decision-*.md` when something non-obvious is fixed (the waypoint-selection-tolerance unification was an example).
