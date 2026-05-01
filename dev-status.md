# kidraw — Development Status (2026-05-01)

> **For Claude Code:** Read this file at the start of every session to understand where development stands. It supersedes `next.txt`, `project-todos.md`, and `improvement-ideas.md` as the authoritative current-state document.

## What kidraw is

A keyboard-first diagramming tool (Angular 19 + Konva canvas). All primary interaction is keyboard-driven. The user navigates a crosshairs cursor to create and connect nodes in a directed graph. Mouse is secondary.

---

## Recently completed (all on `main`, pushed to both `origin` and `bot` remotes)

### Graph layout algorithms (`b` key)
- Six algorithms under a held submenu on `b`: Force-directed, Tree ↓, Tree →, Grid, Circular, Radial.
- Layout applies to selected nodes if any are selected; otherwise all nodes.
- Pinned nodes (`TOGGLE_PIN_SELECTED`) stay in place during layout.
- Keys are on the right hand (accounts for vim-layout `f`-key index-finger conflict).

### Edge routing after layout (buggy — see below)
- `routeEdgesAroundNodes()` in `graph-layout.ts` iteratively inserts `DAWaypoint`s to bypass obstacles.
- Algorithm: for each edge segment, find the first node whose bounding box it enters; insert a perpendicular bypass point clear of that node; repeat up to 8 times per edge.
- Routing is applied automatically every time a layout command runs.

### Selection highlight
- Selected nodes display a bright blue shadow (`#33aaff`, blur 22) plus a slow 2-second sinusoidal blink via `requestAnimationFrame`.
- Both shadow and animation are suppressed in test environments (detected via `globalThis['jasmine']`) to avoid Konva `bufferCanvas` errors and Zone.js leaks in Karma.

### Default node size +20%
- `DEFAULT_NODE_WIDTH` and `DEFAULT_NODE_HEIGHT` changed 100 → 120.
- `createNewNode` reads the actual node size so junction nodes center correctly too.

### Edge style & directedness
- Edges support `directed` / `undirected` / `bidirectional` and `solid` / `dashed` / `dotted`.
- Style submenu under `s` key.

### Adaptive two-level grid
- Grid adapts by decade (factors of 10) to keep ~10–20 major squares across the viewport.
- Minor sub-grid is always 1/10th of the major spacing.
- Crosshairs and drag snap to grid.

---

## Known bugs

(The earlier waypoint / `routeEdgesAroundNodes` bugs are resolved — that
code was removed in Phase 1; charged-spring edges replaced it.)

### Known pre-existing failures (tests)
Three `AppComponent` tests fail with `NG0100 ExpressionChangedAfterItHasBeenCheckedError` — `movementSpeed` initializes to `20` in `AppComponent` but `DrawingAreaComponent` emits `50` on first render. Not caused by recent changes. Current counts: **3 FAILED, 92 SUCCESS**.

---

## Known UX issues (from `next.txt`)

- **Quick settings panel idea** — switching between "move by node" / "graph move" modes requires holding a key; a persistent settings panel (sidebar or similar) might be preferable for mode-like settings (edge directedness, node shape, color, line style, font). Orthogonal to the keymenu, not a submenu.
- **Style submenu (`w` → `s`) UX unclear** — user is unsure how to use it; may need better discoverability or docs.
- **Double-shift timing too fast** — double-shift timeout should be lengthened to ~3 seconds.
- **Grid lines too faint when zoomed out** — consider making grid opacity or thickness depend on zoom level.
- **Labels not selectable / not editable via keyboard** — labels on edges appear to have broken selection. Also they should not show visible boxes by default.
- **"Next edge out" not working** — `TRAVERSE_OUTGOING_NEXT` appears broken; needs debugging.
- **Gather feature needs work** — should be recursive and push away nodes; relates to applying layouts more generally.

---

## Charged-spring edge routing (Phases 1–3 complete)

The earlier libavoid-js / ELK plan was abandoned in favor of an in-house
charged-spring physics simulation that lives in `charged-spring-edges.ts`.
No external routing library is used.

- **Phase 1** (commit `dd2c087`): Dropped the `DAWaypoint` concept, added
  `invisible` node shape (small dot, only visible with the grid), retired the
  segment-nudging / "elastic" routing experiments. `DAEdge` simplified to a
  plain `Konva.Arrow` between two nodes; reserved `b → p` as the future
  "Charged Spring Edges" key.
- **Phase 2** (commit `27b1f03`): Added `_controlPoints` to `DAEdge`. The
  rendered polyline now interleaves control points between the src and dest
  perimeter endpoints, with each endpoint projected toward its nearest
  control point so bent edges still meet the node perimeter cleanly.
  Snapshot/restore round-trips control points. New API:
  `controlPoints`, `setControlPoints`, `clearControlPoints`,
  `initializeStraightControlPoints(n)`, `refreshGeometry`.
- **Phase 3**: Wired up the physics simulation. Pressing `b → p`
  triggers `APPLY_CHARGED_SPRING_EDGES`, which calls
  `applyChargedSpringEdges(nodes, edges)` in `charged-spring-edges.ts`.
  - For each non-self-loop edge: seed N beads (default 8) evenly along
    the straight line, then run an iterative sim (default 240 iterations).
  - Per-bead forces: smoothing pull toward the midpoint of the two
    neighbors (springs), inverse-square repulsion from non-incident node
    bounding boxes (charges), and a perpendicular kick when a bead is
    inside an obstacle (symmetry-breaking — pushes the polyline off the
    line rather than along it). Velocity capped per step for stability.
  - After the sim, each edge's `controlPoints` is set to the surviving
    bead positions; near-collinear beads are pruned.
  - If any edges are selected, only those are routed; otherwise all edges.

Tunables live in `DEFAULT_OPTIONS` in `charged-spring-edges.ts`:
`beadsPerEdge`, `iterations`, `smoothingK`, `chargeK`, `insideKickK`,
`damping`, `dt`, `clearance`, `pruneEpsilon`, `maxVelocity`.

### Possible follow-ups
- Smooth the bent polyline as a Bezier curve (post-process control points).
- Apply the sim live as nodes move/are created, not just on `b → p`.
- Distinguish user-placed vs. sim-placed control points so a user can pin
  a bend that the next sim run won't override.
- Parallel-edge nudging when multiple edges share the same node pair.

---

## TODO / planned work

### Label edit mode overhaul (high priority)
- Render label-edit mode like normal mode: card-based layout showing all keys (number row, modifiers, Backspace, Enter, etc.) not just letter keys.
- Vim keybindings: Escape/Ctrl-[ once → vim normal mode; twice → kidraw normal mode.
- Emacs keybindings option.
- Vim command bar (`:` in vim-normal mode) — placement in card layout TBD.
- Use the same `cardRenderer` infrastructure as `USQwertyMode`.

### Node type submenu at insert time (partially done)
- Node shapes `box`, `circle`, `diamond`, `junction` are implemented.
- `junction` is a filled dot for T-junctions / edges from nowhere.
- **Still TODO**: insert-time node type selection submenu. Currently only `box` is created on insert; shape can be changed afterward via the style submenu.

### Other queued items
- **Quick settings panel** — persistent sidebar for mode-like settings (shape, directedness, color).
- **Labels selectable/editable** — fix keyboard-driven label selection and ensure no visible boxes by default.
- **"Next edge out" traversal bug** — debug `TRAVERSE_OUTGOING_NEXT`.
- **Double-shift timeout** — lengthen to ~3 seconds.
- **Grid line visibility at low zoom** — investigate opacity / thickness scaling.
- **Save/load graphs** — serialization to localStorage.
- **Bezier / smooth-bend edges** — currently only straight segments.
- **Self-linking edges** — need 3 waypoints.
- **Parallel edges** — multiple edges between same pair of nodes.

### Real-world acceptance tests (not automated)
- Build a vim commit-history diagram (test graph navigation + labeling).
- Build an org chart (test tree layout + node sizing).
- These are the primary UX acceptance criteria.

---

## Key files

| File | Purpose |
|------|---------|
| `src/app/drawing-area/drawing-area.component.ts` | Main command handler (`switch` on `DACommandType`), ~2000 lines |
| `src/app/drawing-area/drawing.layer.ts` | Konva layer holding nodes and edges |
| `src/app/drawing-area/da-node.ts` | Node domain object (shape, label, selection, shadow/blink) |
| `src/app/drawing-area/da-edge.ts` | Edge domain object (line, waypoints, labels) |
| `src/app/drawing-area/graph-layout.ts` | Node-positioning layout algorithms (force-directed, tree, grid, circular, radial) |
| `src/app/drawing-area/charged-spring-edges.ts` | Charged-spring physics sim that routes edges around node obstacles |
| `src/app/drawing-area/command.model.ts` | `DACommand` discriminated union + `DACommandType` enum |
| `src/app/keymenu/keymenu.component.ts` | Wires key assignments → `DACommand` emissions |
| `src/app/keymenu/config/key-assignments.ts` | Default and VIM key assignment configs |
| `dev-status.md` | **This file** — authoritative current-state document |
| `design_notes.md` | Architecture invariants and design rationale |
| `project-todos.md` | Backlog (partially superseded by this file) |
| `improvement-ideas.md` | UX and architecture ideas from review session |
| `next.txt` | User's running notes (items not yet in dev-status) |

---

## Architecture quick-reference

- `KeymenuComponent` emits `DACommand` → `AppComponent` → `DrawingAreaComponent` via RxJS `Subject<DACommand>`.
- `DrawingAreaComponent` emits `DANotification` back up; `AppComponent` calls keymenu methods directly (mode switches).
- Two Konva layers: `DrawingLayer` (nodes + edges) and `CrosshairsLayer` (always on top).
- Undo/redo via full graph snapshot serialization (`graph-snapshot.ts` + `undo-redo.service.ts`).
- All key bindings flow through `KeymenuKeyAssignments`; no hardcoded key literals in action logic.
- Key assignments interface: `KeymenuKeyAssignments` in `key-assignments.ts`. Two configs: `DEFAULT_KEYMENU_KEY_ASSIGNMENTS` (vim-ish: `hjkl` movement, `f` insert, `v` select+drag) and `VIM_KEYMENU_KEY_ASSIGNMENTS`.

---

## Dev commands

```bash
npm start                                              # dev server at localhost:4200
npx ng test --watch=false --browsers=ChromeHeadless   # run tests (use this, not npm test)
npx ng build                                          # production build / type-check
```

**Test note:** `npm test` can hang. Always use `npx ng test --watch=false --browsers=ChromeHeadless`.
**Key test note:** Keymenu spec tests check specific key-to-label mappings — update tests when changing key assignments.
