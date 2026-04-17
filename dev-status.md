# kidraw — Development Status (2026-04-17)

## What kidraw is

A keyboard-first diagramming tool (Angular 19 + Konva canvas). All primary interaction is keyboard-driven. The user navigates a crosshairs cursor to create and connect nodes in a directed graph. Mouse is secondary.

---

## Recently completed (unpushed, on `main`)

### Graph layout algorithms (`b` key)
- Six algorithms under a held submenu on `b`: Force-directed, Tree ↓, Tree →, Grid, Circular, Radial.
- Layout applies to selected nodes if any are selected; otherwise all nodes.
- Pinned nodes (`TOGGLE_PIN_SELECTED`) stay in place during layout.
- Keys are on the right hand (accounts for vim-layout `f`-key index-finger conflict).
- After layout, edges are automatically re-routed using waypoints to avoid passing under intermediate nodes.

### Edge routing after layout
- `routeEdgesAroundNodes()` in `graph-layout.ts` iteratively inserts `DAWaypoint`s to bypass obstacles.
- Algorithm: for each edge segment, find the first node whose bounding box it enters; insert a perpendicular bypass point clear of that node; repeat up to 8 times per edge.
- Routing is applied automatically every time a layout command runs.

### Selection highlight
- Selected nodes display a bright blue shadow (`#33aaff`, blur 22) plus a slow 2-second sinusoidal blink animation via `requestAnimationFrame`.
- Both shadow and animation are suppressed in test environments (detected via `globalThis['jasmine']`) to avoid Konva `bufferCanvas` errors and Zone.js zone-leak issues in Karma.

### Default node size +20%
- `DEFAULT_NODE_WIDTH` and `DEFAULT_NODE_HEIGHT` changed from 100 → 120.
- `createNewNode` in `drawing.layer.ts` now reads the actual node size instead of hardcoding 100, so junction nodes center correctly too.

### Edge style & directedness (earlier)
- Edges support `directed` / `undirected` / `bidirectional` and `solid` / `dashed` / `dotted` line styles.
- Style submenu reorganized under `s` key.

### Adaptive two-level grid
- Grid adapts by decade (factors of 10) to keep ~10–20 major squares across the viewport.
- Minor sub-grid is always 1/10th of the major spacing.
- Crosshairs and drag snap to grid.

---

## Known failing tests (pre-existing, not caused by recent work)

Three `AppComponent` tests fail with `NG0100 ExpressionChangedAfterItHasBeenCheckedError`:
`movementSpeed` is initialized to `20` in `AppComponent` but `DrawingAreaComponent` emits `50` on first render. Not related to any recent change.

Current test counts: **3 FAILED, 94 SUCCESS**.

---

## TODO / planned work

### Label edit mode overhaul
- Render label-edit mode like normal mode: card-based layout showing all keys (number row, modifiers, Backspace, Enter, etc.) not just letter keys.
- Vim keybindings: Escape/Ctrl-[ once → vim normal mode; twice → kidraw normal mode.
- Emacs keybindings option.
- Vim command bar (`:` in vim-normal mode) — placement in card layout TBD.
- Use the same `cardRenderer` infrastructure as `USQwertyMode`.

### Node type system (partially done)
- Node shapes are implemented: `box`, `circle`, `diamond`, `junction`.
- `junction` is a filled dot used for T-junctions / edges from nowhere.
- **Still TODO**: insert-time node type selection submenu (currently only box is created on insert; shape can be changed after the fact via the style submenu).

### Real-world test cases
- Design and navigate a vim commit-history diagram.
- Design and navigate an org chart.
- These are acceptance tests for the keyboard UX, not automated tests.

---

## Key files

| File | Purpose |
|------|---------|
| `src/app/drawing-area/drawing-area.component.ts` | Main command handler (`switch` on `DACommandType`) |
| `src/app/drawing-area/drawing.layer.ts` | Konva layer holding nodes and edges |
| `src/app/drawing-area/da-node.ts` | Node domain object (shape, label, selection, shadow) |
| `src/app/drawing-area/da-edge.ts` | Edge domain object (line, waypoints, labels) |
| `src/app/drawing-area/graph-layout.ts` | Layout algorithms + edge routing |
| `src/app/drawing-area/command.model.ts` | `DACommand` discriminated union + `DACommandType` enum |
| `src/app/keymenu/keymenu.component.ts` | Wires key assignments → `DACommand` emissions |
| `src/app/keymenu/config/key-assignments.ts` | Default and VIM key assignment configs |

---

## Architecture notes

- `KeymenuComponent` emits `DACommand` → `AppComponent` → `DrawingAreaComponent` via an RxJS `Subject<DACommand>`.
- `DrawingAreaComponent` emits `DANotification` back up; `AppComponent` calls keymenu methods directly (e.g., mode switches).
- Two Konva layers: `DrawingLayer` (nodes + edges) and `CrosshairsLayer` (always on top).
- Undo/redo via full graph snapshot serialization (`graph-snapshot.ts` + `undo-redo.service.ts`).
- All key bindings flow through `KeymenuKeyAssignments`; no hardcoded key literals in action logic.

---

## Dev commands

```bash
npm start                                              # dev server at localhost:4200
npx ng test --watch=false --browsers=ChromeHeadless   # run tests (use this, not npm test)
npx ng build                                          # production build / type-check
```
