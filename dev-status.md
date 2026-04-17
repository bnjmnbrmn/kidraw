# kidraw — Development Status (2026-04-17)

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

### Layout / edge routing bugs (introduced in recent session)
1. **Too many waypoints on some edges** — the iterative bypass algorithm sometimes inserts excessive waypoints (e.g., 8+ on a single edge) rather than finding a clean path.
2. **Waypoints not cleared on redo layout** — `routeEdgesAroundNodes()` clears existing waypoints at the start of each call, but this only affects the subset of edges passed in. If `routeEdgesAroundNodes` is called with a filtered edge set (e.g., edges between selected nodes only), waypoints on other edges are not cleared. On repeated layout calls the stale waypoints remain.
3. **Unpinned waypoints survive across layout calls** — user-placed waypoints on edges should probably be removed (or flagged as auto-placed) before auto-routing re-runs. There is currently no distinction between user-placed and auto-placed waypoints.

### Known pre-existing failures (tests)
Three `AppComponent` tests fail with `NG0100 ExpressionChangedAfterItHasBeenCheckedError` — `movementSpeed` initializes to `20` in `AppComponent` but `DrawingAreaComponent` emits `50` on first render. Not caused by recent changes. Current counts: **3 FAILED, 94 SUCCESS**.

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

## Plan: Proper edge routing (replacing current buggy approach)

### Context
The current hand-rolled routing in `graph-layout.ts` is producing incorrect results (too many waypoints, stale waypoints on redo). The right approach is to use a well-tested graph layout library.

### Research summary (from `meta-project/notes/graph-layout-research.md`, 2026-04-17)

**Terminology:** KiDraw's "waypoints" are called **bends** or **bend points** in the literature. Edges with them are **polylines**. The problem of minimizing their count is **bend minimization**.

**Two distinct problems — KiDraw is Problem B:**
- **Problem A (Auto-layout):** Rearrange node positions AND route edges. Libraries: ELK, cola.js, Graphviz.
- **Problem B (Edge routing only, nodes fixed):** Nodes already placed by the user; route edges around them without moving nodes. Library: **libavoid**.

KiDraw is primarily Problem B — users place nodes manually and want edges to route intelligently around them.

**Library decisions:**

| Library | Fit | Notes |
|---------|-----|-------|
| **libavoid-js** ⭐ | Problem B (edge routing) | WASM port of C++ libavoid. Obstacle avoidance, bend minimization, crossing minimization, parallel edge nudging. `segmentPenalty`, `crossingPenalty`, `shapeBufferDistance` are configurable. LGPL-2.1. Actively maintained (v0.4.5, April 2025). |
| **elkjs** ⭐ | Problem A (auto-layout) | Eclipse Layout Kernel. Full layout + routing (orthogonal, polyline, spline). Good for future "arrange everything" feature. |
| **dagre** ✗ | — | Unmaintained since 2018. ELK is strictly better. Do not use. |
| **cola.js** | Problem A (organic) | Constraint-based, non-hierarchical. Good for overlap removal; combine with libavoid for routing. |
| **Graphviz** | All-or-nothing | Takes full control; not suitable for fixed-node routing. |

**libavoid-js integration sketch:**
1. Register all nodes as obstacles (bounding boxes + `shapeBufferDistance` clearance)
2. Register all edges as connectors (src node → dest node)
3. Call `router.processTransaction()` — libavoid computes routes
4. Read back bend points per connector → create `DAWaypoint`s
5. Supports incremental rerouting when a node moves (no full recompute needed)

**Crossing vs. bends tradeoff:** tune `crossingPenalty` vs. `segmentPenalty` — more weight on crossing penalty = fewer crossings, more bends; vice versa.

### Proposed plan

**Phase 1: Remove broken routing, keep layout only** _(do first)_
- Remove the `routeEdgesAroundNodes()` call from `applyGraphLayout`.
- Layout algorithms (force-directed, tree, grid, etc.) are fine; only the routing is broken.
- Leaves edges as straight lines after layout — correct, no obstacle avoidance.

**Phase 2: Distinguish auto-placed vs. user-placed waypoints**
- Add `DAWaypoint.autoPlaced: boolean` flag.
- Auto-placed waypoints are cleared and re-generated each layout run.
- User-placed waypoints are preserved.
- Required regardless of which routing library is used.

**Phase 3: Integrate libavoid-js for edge routing (Problem B)**
- `npm install libavoid-js`
- After layout, call libavoid to route all edges around node obstacles.
- Map libavoid bend points → auto-placed `DAWaypoint`s.
- Also call on node move/create/delete to keep routing live.
- Assess WASM loading (async init), bundle size, and routing quality.

**Phase 4: Integrate ELK for auto-layout mode (Problem A)**
- `npm install elkjs`
- When user triggers a layout command, use ELK to compute node positions + edge routes together.
- ELK's POLYLINE or SPLINE routing gives cleaner results than the hand-rolled algorithms.
- Replace/augment the existing 6 layout algorithms.

**Phase 5: Smooth edges (splines)**
- Optionally render polyline bends as Bezier curves (standard smoothing of control points).
- ELK can emit spline control points directly; libavoid polylines can be post-processed.

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

### Fix layout bugs (see Known bugs above)
- Fix waypoint accumulation on repeated layout runs.
- Implement `autoPlaced` flag on waypoints.
- Decide on routing library (elkjs vs. WASM) per the plan above.

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
| `src/app/drawing-area/graph-layout.ts` | Layout algorithms + (buggy) edge routing |
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
