# dev-status

_Updated 2026-06-24. Branch: `main`._

> Read this at the start of every session for **where work currently stands**. Everything historical, topical, or design-rationale lives in [`notes/`](notes/) — see [`notes/README.md`](notes/README.md) for the Map of Content. Canonical instructions are in [`AGENTS.md`](AGENTS.md).

## Current focus

1. **Edge routing — three routers now user-selectable from the Layout submenu.** After the May consolidation to `bezier-fit-weighted-chain` (bf-wc), production routing moved to the `desiderata` pipeline, and an `incremental-desiderata-v2` curve router was built (initially harness-only). As of `84ee750` the Layout submenu offers all three as a picker — **`p` Route: BF-WC**, **`d` Route: Desiderata**, **`i` Route: Incr v2** (both vim and ijkl profiles). The command is now the parameterized `APPLY_EDGE_ROUTING {algorithm}` (was the single-purpose `APPLY_BEZIER_FIT_WEIGHTED_CHAIN_EDGES`); the worker + sync fallback dispatch on `algorithm`. `incremental-desiderata-v2` reports `uncleanEdgeIds` / `budgetHit`, surfaced as a "N edges could not be routed cleanly" status message. The 5 older routers (charged-spring, bezier-route, bezier-fit-charged-spring, flexible-wire, weighted-chain) remain removed; tag [`pre-routing-consolidation`](#) (901c28d) preserves their state, resurrection notes at [`notes/algo-deprecated-routers.md`](notes/algo-deprecated-routers.md). All routers use their `DEFAULT_OPTIONS` (no runtime tuning panel). Next: continue hardening `incremental-desiderata-v2` (see `notes/idea-incremental-edge-routing.md`); longer term, a metric explorer + pairwise weight calibration tool, then a per-graph optimizer.
2. **Routing-eval harness** (`tools/routing-eval/`) — same infrastructure as before, now exposes only bf-wc. `run.mjs` for default-options runs (rate per cell); `sweep.mjs` for the dpTolerance sweep on dense+sparse; `tune-bf-wc.mjs` for the 2D dp × seg grid with zoom-on-double-click.
3. **Serialization.** Phases 1–4 + 6–9 of [`docs/serialization-plan.md`](docs/serialization-plan.md) shipped. Phase 5 (FSA API for persistent file handles) and Phase 10 (dirty indicator + `beforeunload` polish) remain.

## Routing-eval harness

The white-box harness runs bf-wc against a 12-scenario battery and dumps SVG + metrics + geometry per cell. Routers are called as pure functions via an esbuild alias for `./da-node` and `./da-edge` (the Konva-bound DA layer) → harness-local fakes; no runtime modification of the routers themselves.

- Harness: `node tools/routing-eval/run.mjs` (or `npm run routing-eval`).
- Sweep: `node tools/routing-eval/sweep.mjs` (single-knob bracketed values, grid viewer).
- 2D tune: `node tools/routing-eval/tune-bf-wc.mjs` (dp × seg grid, double-click any cell to zoom).
- Viewer: `python3 -m http.server -d tools/routing-eval 8765`, then open `http://localhost:8765/viewer/`.
- Output / metric definitions / scenario list: [`tools/routing-eval/README.md`](tools/routing-eval/README.md).

## Recent commits (10 most recent)

| Commit | Subject |
| :--- | :--- |
| `84ee750` | Layout submenu: select edge router (BF-WC / Desiderata / Incr v2) |
| `7a94e5a` | Unify npm start: run log server + dev server together |
| `e1af7e2` | v2 routing: obstacle-bypass move (fix tangent-grazing + converge) |
| `5b87e21` | v2 routing: robust crossings, curve-clip gate, fan separation |
| `326f8bc` | routing-eval: waypoint markers + generation times in comparison |
| `341efd2` | Add incremental-desiderata-v2 curve router (harness-only) |
| `30ec680` | Add adaptive navigation prototype |
| `d9fdb57` | Default waypoint edges to curves |
| `47be917` | Run edge routing in a worker |
| `2be41a6` | drawing-area: route production edges through desiderata |

---

## Known bugs

### Key-handling bugs (keymenu state machine) — *active focus*

These are the next things to fix. Both are about how held-key chords drive
the keymenu, and both point at the same gap: the chord state machine doesn't
robustly handle keys pressed/released in arbitrary order. See
[`notes/architecture-keymenu-model.md`](notes/architecture-keymenu-model.md)
and `keymenu.component.ts` (held-key / keyup handling).

- **Key repeat fails to turn off on an out-of-order release.** When keys are
  released in an unusual sequence, the auto-repeat (continuous movement /
  edit repeat) keeps firing after the triggering key is physically up — the
  repeat timer isn't cancelled because the keyup bookkeeping assumes a
  particular release order. Repro: hold a movement/repeat key, press a second
  key, then release them in the "wrong" order. **Not yet started** — was
  mis-remembered as in-progress; it lives nowhere in the working tree yet.

- **Chord into submenu is order-sensitive / doesn't fire.** Pressing a
  movement key together with a coarse/fine key (no releases between) should
  enter the corresponding submenu/modifier regardless of which key lands
  first. Today, only one order works (or neither). Both `[left][fine]` and
  `[fine][left]` (both held, no release) should be equivalent. This is the
  same root cause as above: order-dependent chord resolution.

> **Notation.** Held-key chords are written with the `↓`/`↑` event notation in
> [`notes/reference-key-event-notation.md`](notes/reference-key-event-notation.md),
> which states both bugs above precisely (Bug A `↓m ↓x ↑m ↑x`; Bug B
> `left∥fine`). Use it when reproducing/fixing.

### Routing

- **Bezier-route anti-parallel edges overlap** — in `bezier-route-edges.ts` (`b → ;`), A→B and B→A render as a single line because the lane-offset logic keys parallels by *ordered* (src, dest) pair. Fix: switch to the unordered `canonicalPairKey` used by charged-spring / flexible-wire / weighted-chain. *(Historical — bezier-route is no longer a production router; relevant only if resurrected.)*

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

**1. Serialization / file format.** Design + implementation substantially complete (see Recently Completed for Phase 1–4, 6–9 of the `serialization-plan.md` rollout). The user can now Open / Save As / Export Zip / Cycle Display through the keymenu (`m → o`, `m → a`, `m → z`, `m → d`); single-file and zip-bundle multi-file workflows both work; cascade resolver drives display composition; `localStorage` draft schema v2 with v1 auto-migration is live. **Remaining**: Phase 5 (FSA API for persistent file handles on Chromium) and Phase 10 (dirty indicator + `beforeunload` + minor UX polish).

**2. Edge routing — auto-layout quality.** Five custom physics-based routers already work (`b → *`); the next push is making auto-routing genuinely good. Near-term option (`graph-layout-research.md`): integrate `libavoid-js` (WASM, obstacle-avoiding polyline routing) — maps directly to existing waypoints. Longer-term R&D: polyline nudging — endpoint propagation, iterative stability, dynamic angular spacing (a potential KiDraw differentiator since libavoid's nudging is orthogonal-only). Also queued: auto-tuning parameter sweeps on benchmark graphs, and an incremental desiderata-first router that lays down edges one by one before an optional weighted-chain/bezier-fit cleanup pass (see [`notes/idea-incremental-edge-routing.md`](notes/idea-incremental-edge-routing.md)).

### Other queued items

- **Command surface plan** — see `docs/command-surface-plan.md` for the emerging design: one command registry feeding key menu, command palette / Vim Ex-style command-line mode, graphical panels, and future agent APIs.
- **Quick settings panel** — persistent sidebar for mode-like settings (shape, directedness, color, line style, font). Orthogonal to keymenu modes.
- **Style submenu (`w → s`) UX** — user unsure how to use it; needs discoverability work or docs.
- **Shift-shift timing** — slow to ~3 seconds; current value feels too aggressive.
- **Self-linking edges** — need control points forming a loop.
- **Parallel edges** — multiple edges between same pair of nodes.
- **Gather feature** — should be recursive and push away nodes; relates to applying layouts more generally.
- **Crosshair visual treatment** — make the crosshairs feel like interaction chrome rather than part of the diagram; explore distinct color, animation/pulse, transparency, and less distracting adaptive hit-radius visuals (see [`notes/idea-crosshair-visual-treatment.md`](notes/idea-crosshair-visual-treatment.md)).
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
>>>>>>> d0a8c04 (Update drawing area, command model, header, and dev status)

## Dev commands

```bash
npm start                                              # log server + dev server at localhost:4200
npm start -- --port "$(tools/worktree-port.sh)"        # log server + worktree-safe dev server port
npx ng test --watch=false --browsers=ChromeHeadless   # run tests (do NOT use npm test)
npx ng build                                          # production build / type-check
```

**Test note:** `npm test` can hang. Always use `npx ng test --watch=false --browsers=ChromeHeadless`. Tests are at 152/152 after the consolidation (was 159; the deleted `charged-spring-edges.spec.ts` accounted for the difference).

---

## Where to read next

- [`AGENTS.md`](AGENTS.md) — canonical project / agent instructions.
- [`notes/README.md`](notes/README.md) — Map of Content for the project zettelkasten.
- [`docs/`](docs/) — stable long-form specs (file format, serialization plan, diagrams).
