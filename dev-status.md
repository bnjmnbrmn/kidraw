# kidraw — Development Status (2026-05-16)

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

### Multiple physics-based edge routing algorithms (`b` submenu)
- **Charged Spring** (`b→p`): Charged-spring physics sim in `charged-spring-edges.ts`. Nodes as charged obstacles, edges as spring chains. Parallel-edge separation. Sibling repulsion.
- **Bezier Route** (`b→;`): Pure Bezier curve routing in `bezier-route-edges.ts`.
- **Bezier Fit + Charged Spring** (`b→'`): Charged-spring sim first, then Bezier-fit post-process.
- **Flexible Wire** (`b→/`): Adaptive bead count via remeshing; rubber-band physics; tautness force.
- **Weighted Chain** (`b→.`): PBD rigid-segment constraints; endpoint weight toward node center.
- Tuning panel (slider panel accessible from header) with live re-run on slider change.
- A/B testing infrastructure: 📷 snapshot button, side-by-side compare, export JSON.
- Routing quality metrics overlay (crossings, clearance, curvature, composite score).
- All routing triggered by `APPLY_*_EDGES` commands; run on selected edges or all edges.

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

- **Bezier-route anti-parallel edges overlap** — in `bezier-route-edges.ts` (`b → ;`), A→B and B→A render as a single line because the lane-offset logic keys parallels by *ordered* (src, dest) pair. Fix: switch to the unordered `canonicalPairKey` used by charged-spring / flexible-wire / weighted-chain.

(The earlier waypoint / `routeEdgesAroundNodes` bugs are resolved — that
code was removed in Phase 1; charged-spring edges replaced it.)

### Known pre-existing failures (tests)
NG0100 fixed — `movementSpeed` now initialized to `50` in `AppComponent`. Current test counts unknown (no Chrome in CI environment; `npx ng test` requires a browser binary).

---

## Known UX issues

- **Quick settings panel idea** — switching between "move by node" / "graph move" modes requires holding a key; a persistent settings panel (sidebar or similar) might be preferable for mode-like settings (edge directedness, node shape, color, line style, font). Orthogonal to the keymenu, not a submenu.
- **Style submenu (`w` → `s`) UX unclear** — user is unsure how to use it; may need better discoverability or docs.
- **Grid lines too faint when zoomed out** — consider making grid opacity or thickness depend on zoom level.
- **Gather feature needs work** — should be recursive and push away nodes; relates to applying layouts more generally.
- **New graph confirmation** — ✅ done: prompts with `window.confirm()` when the graph is non-empty.

---

## Edge routing architecture

No external routing library. All routing is in-house physics / geometry.

`DAEdge` uses `_controlPoints: {x,y}[]` (internal bend points). Setting control points recomputes the `Konva.Arrow` polyline. Snapshot/restore round-trips control points.

Routing files in `src/app/drawing-area/`:
- `charged-spring-edges.ts` — spring-charge bead physics sim
- `bezier-route-edges.ts` — pure Bezier curve routing
- `bezier-fit-route-edges.ts` — charged-spring + Bezier-fit post-process
- `flexible-wire-edges.ts` — adaptive bead count, remeshing, tautness force
- `weighted-chain-edges.ts` — PBD rigid-segment constraints
- `edge-routing-metrics.ts` — quality metrics (crossings, clearance, curvature)

Tuning sliders panel auto-reruns the last-used routing on every slider change.

### Possible follow-ups
- Live re-routing as nodes move (not just on `b → *` commands).
- Distinguish user-placed vs. sim-placed control points (pin a bend).
- Export routing parameters as a reusable config preset.

See `graph-layout-research.md` for deeper analysis: `libavoid-js` (WASM) as a candidate near-term integration for obstacle-avoiding polyline routing, and the polyline-nudging R&D plan (endpoint propagation, iterative stability, dynamic angular spacing).

---

## TODO / planned work

### Current focus

**1. Serialization / file format.** Design is finalized in `kidraw-file-format.md` — HTML/CSS-style split: `*.kidraw.json` / `*.kidraw.yaml` carry graph semantics only; `*.kd-style.json` / `*.kd-style.yaml` carry presentation and compose via relative-path imports + CSS-like cascade. The graph document lists one or more top-level styles (path or inline object); only one is active at a time (first entry = default). Implementation plan in `serialization-plan.md` — command surface (`m → s/a/o/i/e/n/d`), save model, storage layers, v1→v2 localStorage migration, phased rollout.

**2. Edge routing — auto-layout quality.** Five custom physics-based routers already work (`b → *`); the next push is making auto-routing genuinely good. Near-term option (`graph-layout-research.md`): integrate `libavoid-js` (WASM, obstacle-avoiding polyline routing) — maps directly to existing waypoints. Longer-term R&D: polyline nudging — endpoint propagation, iterative stability, dynamic angular spacing (a potential KiDraw differentiator since libavoid's nudging is orthogonal-only). Also queued: auto-tuning parameter sweeps on benchmark graphs (per memory notes), and fixing the bezier anti-parallel overlap bug.

### Other queued items

- **Quick settings panel** — persistent sidebar for mode-like settings (shape, directedness, color, line style, font). Orthogonal to keymenu modes.
- **Style submenu (`w → s`) UX** — user unsure how to use it; needs discoverability work or docs.
- **Shift-shift timing** — slow to ~3 seconds; current value feels too aggressive.
- **Self-linking edges** — need control points forming a loop.
- **Parallel edges** — multiple edges between same pair of nodes.
- **Gather feature** — should be recursive and push away nodes; relates to applying layouts more generally.
- **Label edit mode overhaul** *(deprioritized — design needs revisiting)*. Earlier idea was a card-based renderer with vim/emacs keybindings and a vim command bar. Revisit once serialization and routing land.

### Recently completed (2026-05-16 session)
- **File format design finalized** — HTML/CSS-style split documented in `kidraw-file-format.md`. Graph documents (`*.kidraw.json` / `.yaml`) carry semantics only; style sets (`*.kd-style.json` / `.yaml`) carry all presentation and compose via relative-path `imports` + cascade. One top-level style active at a time; first in `styles` array is the default display. Path resolution via prompt-on-miss; zip bundle for distribution; optional File System Access API on Chromium.
- **Serialization plan written** — `serialization-plan.md` locks in YAML default, inline styles allowed, prompt-for-both on first save, v1→v2 localStorage migration, Open + Import both supported. 10-phase rollout.
- **Phase 1: Format primitives implemented** — `src/app/lib/file-format/` with `types.ts` (KidrawGraphDoc, KidrawStyleSet, InlineStyleSet, StyleRef union, StyleProps/Node/Edge variants, ParseResult), `parser.ts` (parse + serialize for JSON, full structural validation), and `parser.spec.ts` (16/16 tests passing). Pure functions — no Angular deps; safely additive. Includes cross-reference validation (edges reject unknown node IDs).
- **Phase 2: In-memory ↔ file mapping** — `snapshot-mapping.ts` with `snapshotToFiles()` and `filesToSnapshot()`. Splits the runtime `GraphSnapshot` into a semantic `KidrawGraphDoc` + a presentation `KidrawStyleSet`. Runtime-only fields (`isSelected`, `baseWidth/Height/FontSize`, `pinned`) excluded. Format types extended with `invisible` shape and `textOverflow` mode so all current node attributes round-trip. 8 more tests, 24/24 passing overall.
- **Phase 3: localStorage migration to v2** — `DraftStorageService` (`src/app/services/draft-storage.service.ts`) encapsulates the localStorage draft. New schema: `{version: 2, doc, style, filePath, dirty, savedAt}`. Old `kidraw_graph_v1` payloads are silently migrated on first load (converted via `snapshotToFiles()`, written to `kidraw_draft_v2`, original v1 key cleared). `DrawingAreaComponent` now delegates auto-load and beforeunload-save through this service. 9 new service tests + still-passing existing tests (130 total, 1 pre-existing mock failure in `drawing-area.component.selection.spec.ts` unrelated to this work).
- **Phase 4: Open / Save As UI (basic)** — first user-visible win. New commands `OPEN_FILE` (`m → o`) and `SAVE_FILE_AS` (`m → a`) wired through `FileIoService` (browser file picker + download-blob; no FSA API yet so it works in all browsers). YAML support added to the parser via `js-yaml` (now an explicit dependency); extension-based dispatch through `parseGraphDocByFilename` / `serializeGraphDocByFilename`. Save defaults to `.kidraw.yaml` with the style embedded inline (single-file save). Open parses the picked file, resolves the first inline style (external paths warned and skipped — prompt-on-miss comes later). 5 new YAML tests; 135/136 total (same single pre-existing failure).
- **Phase 6: Cascade resolver** — `resolver.ts` with `resolveStyleCascade()` (walks the import graph depth-first, applies rules in source order, top-level wins on conflicts, detects cycles, loads each import at most once) and `resolveAndApplyToGraph()` (after cascade, flattens matching `tagStyles` onto per-element rules using the graph's tag declarations, then per-element rules override). `tagStyles` type widened to `TagStyleProps = NodeStyleProps & EdgeStyleProps` so a single tag rule can carry both node and edge fields. 16 new tests covering empty/linear/diamond import shapes, direct + indirect cycles, missing imports, view-replacement, inline-root acceptance, and tag flattening. 151/152 total.
- **Phase 9: Zip bundle export + import** — `zip-bundle.ts` (pack/unpack/findManifest via `fflate`, now an explicit dep) and a new `m → z` command "Export Zip…". The export produces a `.kidraw.zip` containing a `graph.kidraw.yaml` manifest + a sibling `graph.kd-style.yaml`. `OPEN_FILE` now uses the binary picker and transparently handles `.zip` archives: unpack, find the `.kidraw.{json,yaml}` manifest, build a zip-internal import resolver, cascade-resolve styles, then load. 7 new zip tests; 158/159 total.
- **Phase 8: Prompt-on-miss for external styles** — when opening a plain (non-zip) `.kidraw.{json,yaml}` that references external `.kd-style.*` files, kidraw recursively walks the styles + their transitive imports and prompts the user (`window.confirm` + style file picker) for each unresolved path. Resolved files are cached by normalized request path; declined paths are remembered for the open so the same prompt isn't asked twice. Enables the multi-file workflow on plain disk (in addition to the zip path). Implementation entirely in `DrawingAreaComponent.gatherExternalStyles()` — no new commands, no new keybinds.
- **Phase 7: Display switching** — new `CYCLE_DISPLAY` command (`m → d`) cycles through the entries in the open graph's `styles[]`. The `DrawingAreaComponent` remembers the opened doc + the style resolver from the original Open (zip-internal lookup or prompt-on-miss cache) so subsequent cycles re-resolve cleanly. Switching re-runs `resolveAndApplyToGraph` for the newly-active style, re-applies via `filesToSnapshot`, and emits a `status-message` notification (`Display: <name> (i/N)`). When only one display exists or nothing is open, the user gets an informative status message instead. End-to-end use of the cascade resolver in a UI flow.
- **Docs relocated from `meta-project`** — `kidraw-file-format.md`, `graph-layout-research.md`, and `demo-video-research.md` moved into the kidraw repo so the project is self-contained.

### Recently completed (2026-05-10 session, third pass)
- **Header context strip** — New chips in the header always show: active defaults (node shape, edge direction, line style) and undo/redo availability indicators. When something is selected, a blue chip shows the selection summary (e.g. "2 nodes, 1 edge"). When nothing is selected, a subtle chip shows total graph size ("3n 5e" or "empty"). Emitted via `context-state-update` DANotification on any context-affecting command.
- **DALabel theme-aware selection** — Selected label border now uses the theme-aware `_strokeColor` (set by `applyColors`) instead of hardcoded `'darkblue'`.

### Recently completed (2026-05-10 session, second pass)
- **New-graph confirmation** — `m→n` now prompts before clearing a non-empty graph.
- **Insert-time shape selection** — Insert submenu (`f →`) now shows Box/Circle/Diamond/Junction. Each opens the directional insert sub-submenu with the chosen shape pre-set.
- **Label Edit mode indicator in header** — A purple "LABEL EDIT" badge appears in the header when in label-edit mode.
- **Grid visibility at low zoom** — Minor grid lines are suppressed when screen-space spacing < 8 px; major opacity bumps from 0.4 → 0.55. Minor opacity increased 0.15 → 0.20.
- **Keyboard profile switcher** — Settings panel now has a "Key Profile" dropdown (Vim / Default), persisted to localStorage. Live rebuild; no page reload needed.
- **NG0100 fix** — `movementSpeed` in AppComponent initialized to 50 (matching DrawingAreaComponent's first emission), eliminating ExpressionChangedAfterItHasBeenCheckedError in tests.

### Recently completed (2026-05-10 session, first pass)
- **Graph save/load to localStorage** — `m→s` save, `m→l` load, `m→n` new graph. Auto-saves on page unload; auto-loads on startup. (`kidraw_graph_v1` localStorage key.)
- **Edge style persisted in snapshots** — `directedness` and `lineStyle` now serialized in `DAEdgeSnapshot`. Previously lost on undo/redo.
- **Graph traversal fixed** — `g→n` and `g→p` now emit `TRAVERSE_OUTGOING_NEXT` and `TRAVERSE_INCOMING_NEXT` (direct node jump), replacing broken `SELECT_NEXT_EDGE` calls.
- **Label/edge selection render fix** — `batchDraw()` was missing after selecting a label or edge; the canvas silently didn't redraw.

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
| `kidraw-file-format.md` | Graph document + style-set file format spec (HTML/CSS-style split) |
| `serialization-plan.md` | Serialization/I/O implementation plan — command surface, save model, storage, phases |
| `graph-layout-research.md` | Edge routing research; recommends `libavoid-js` + polyline-nudging R&D plan |
| `demo-video-research.md` | Demo video tooling research (FocuSee for manual, Playwright for scripted) |
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
