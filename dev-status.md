# dev-status

_Updated 2026-07-13. Branch: `main`._

> Read this at the start of every session for **where work currently stands**. Everything historical, topical, or design-rationale lives in [`notes/`](notes/) — see [`notes/README.md`](notes/README.md) for the Map of Content. Canonical instructions are in [`AGENTS.md`](AGENTS.md).

## Current focus

1. **Edge routing — three routers now user-selectable from the Layout submenu.** After the May consolidation to `bezier-fit-weighted-chain` (bf-wc), production routing moved to the `desiderata` pipeline, and an `incremental-desiderata-v2` curve router was built (initially harness-only). As of `84ee750` the Layout submenu offers all three as a picker — **`p` Route: BF-WC**, **`d` Route: Desiderata**, **`i` Route: Incr v2** (both vim and ijkl profiles). The command is now the parameterized `APPLY_EDGE_ROUTING {algorithm}` (was the single-purpose `APPLY_BEZIER_FIT_WEIGHTED_CHAIN_EDGES`); the worker + sync fallback dispatch on `algorithm`. `incremental-desiderata-v2` reports `uncleanEdgeIds` / `budgetHit`, surfaced as a "N edges could not be routed cleanly" status message. The 5 older routers (charged-spring, bezier-route, bezier-fit-charged-spring, flexible-wire, weighted-chain) remain removed; tag [`pre-routing-consolidation`](#) (901c28d) preserves their state, resurrection notes at [`notes/algo-deprecated-routers.md`](notes/algo-deprecated-routers.md). All routers use their `DEFAULT_OPTIONS` (no runtime tuning panel). **`incremental-desiderata-v3`** (harness-only, `incremental-desiderata-v3-route-edges.ts`, registered in `bundle-entry.ts`) is a case-driven successor to IDv2 adding relaxation sweeps, fan-interior separation, symmetric-arc collapse, and cluster-aware bypass — see [`notes/plan-incremental-desiderata-v3.md`](notes/plan-incremental-desiderata-v3.md). It fixes all 6 reviewed cases (converge-circular fan crowding + crossing, tangent-grazing OBS graze, bypass-obstacle wiggle, dense n8→n10 graze). The new scorer terms (fan-interior separation, whole-path node clearance) live in the shared `routing-local-score.ts` behind default-off flags (`fanSeparationEnabled`, `wholePathClearance`), so IDv2 output is byte-identical. The compare page now shows bf-wc · desiderata · IDv2 · IDv3. **New edges are now auto-routed in the app**: every add-edge flow (connect, directed-edge picker, insert-with-edges) calls `routeNewEdgeIncrementally` (IDv3's single-edge pipeline, synchronous, ms per edge) against the existing graph held fixed; verified live via a puppeteer smoke test. The two routers share their seed/hill-climb machinery via `incremental-routing-common.ts`. Full-graph IDv3 is now in the Layout submenu too (`v` — Route: Incr v3, both profiles, worker + sync dispatch).
2. **Routing-eval harness** (`tools/routing-eval/`) — same infrastructure as before, now exposes only bf-wc. `run.mjs` for default-options runs (rate per cell); `sweep.mjs` for the dpTolerance sweep on dense+sparse; `tune-bf-wc.mjs` for the 2D dp × seg grid with zoom-on-double-click.
3. **Serialization.** Phases 1–9 of [`docs/serialization-plan.md`](docs/serialization-plan.md) shipped. Phase 5 landed (`b3e025b`) as the **vault** ([`notes/decision-vault-model.md`](notes/decision-vault-model.md)): one-time `showDirectoryPicker` grant (handle persisted in IndexedDB) behind a `Vault` interface, then no native dialog in any flow. Keymenu: `m → v` Connect, `m → o` Open (numbered listing), `m → w` Save As — the latter two use `window.prompt` as placeholders until the trad/large-menu overlay lands. Silent debounced (1 s) auto-save on every mutation/undo/redo; a 1.5 s `lastModified` poll reloads external edits (the LLM round-trip; dirty session keeps local changes). Non-vault loads detach the vault file. Verified end-to-end via Playwright with a faked FSA layer (9/9 checks). Phase 10 (dirty indicator + `beforeunload` polish) remains.
4. **Extensions with an identity slot** (`eab8642`, supersedes plugin v0 `945a03e`; design: [`notes/idea-diagram-types.md`](notes/idea-diagram-types.md)). One concept — a `KidrawExtension` (`src/app/extensions/`) — declaring contributions to typed slots. Shipped slots: **identity** (a graph is bound to exactly one diagram type, `type: todo-graph` in the doc header, implicit `default`; `m→t` binds Todo Graph, restyling undoably; legacy `plugins: ['todo-graph']` migrates on load) and **style defaults + persistence policy** (node `w`/`h`/`fontSize`/`shape`/`textOverflow` resolve through the cascade app → identity → per-node file props; props equal to their cascade value are omitted on save; files store **base** values — fit's max width — never derived rendered sizes, which fixed a latent bug where saving a fit graph collapsed every card's max width to its rendered width). The user's `next.kidraw.yaml` migrated: 901 → 667 lines, per-node styles now just `x`/`y` (backup: `next.kidraw.yaml.pre-type-migration.bak`). Future slots (commands, keymenu entries, node/edge kinds like todo `depends-on`, tags, validation) extend the same interface. Decided roadmap after this: edge labels → move-by-graph fix → gathering/collapse rework. Applying restyles existing nodes (undoable) and records the id on the graph (`KidrawGraphDoc.plugins` ↔ `GraphSnapshot.plugins`), so new nodes follow the defaults and the plugin survives save/reopen. Explicit insert-with-shape wins over the plugin's default shape; junction/invisible keep fixed geometry. Applied to the user's vault `next.kidraw.yaml` (original backed up as `next.kidraw.yaml.pre-todo-plugin.bak`). Design + why-not-a-style-set-import in [`notes/design-plugin-v0.md`](notes/design-plugin-v0.md); the file-based path is blocked until multi-file save preserves style imports.
5. **Tree layouts are now tidy trees with crossing minimisation.** `treeLayout` (tree-down `b→j` / tree-right `b→l`) was rewritten from the old level-based spread (children placed with no relation to their parent → gratuitous edge crossings) to a tidy-tree algorithm: BFS spanning forest, each subtree owns a contiguous breadth interval (tree-edge crossings impossible by construction), parents centered on the midpoint of their children (by box center, so mixed-width boxes align), slots widen for wide node boxes, cycle members adopted into the tree instead of dumped at level 0. On top of that, non-tree edges (multi-parent nodes, cross-links) are handled by ordering optimization: barycenter sweeps with keep-best (mean sweeps oscillate on mutually-attracting subtrees), then greedy scored refinement — subtree re-insertion within sibling lists plus re-parenting multi-parent nodes to an alternative parent — under an objective of `crossings + node-pierces` (edges grazing an unrelated node's slot) weighted above total edge span, with a trial budget so dense graphs degrade gracefully instead of freezing. On a seeded 30-node/41-edge random DAG: 28 → 11 straight-line crossings, edge span −31%; bundled samples all lay out at 0 crossings. Unit tests in `graph-layout.spec.ts`; verified live via Playwright (parent-centering exact, stable on re-application). **Layouts now auto-route edges** (`d9a2037`): applying a node layout drops stale *unpinned* waypoints on affected edges (pinned survive) and re-runs the last-used router (default Incr v3) — previously a laid-out tree kept old waypoints at absolute positions (the user's `next.kidraw.yaml`: 79 rendered crossings from 29 stale waypoints; now 0 crossings straight after layout, then routed). Depth spacing is content-aware (levels separated by their tallest box + spacing/2 corridor; boxes centered on the level line). **Routing commands are node-selection-aware**: with node(s) selected, `b→p/d/i/v` route the edges leaving the selection recursively through descendants (subtree wiring) while all other edges stay frozen as obstacles; selected edges still take precedence; no selection = whole graph. Verified on `next.kidraw.yaml`: 27/27 subtree edges re-routed, 0/33 outside edges touched. Known: IDv3 can *introduce* a few crossings on long fan edges where straight lines had none (4 on the 61-node tree) — router tuning, tracked for the routing workstream (consider crossing-aware detour scoring and routing order). Note: applying a layout does not yet fit-to-view — a wide tree lands partly off-screen until `r→h` Recenter.
6. **In-graph search** (`93c71aa`). Vim-style: root `/` prompts for a query (`window.prompt` placeholder until the trad/large-menu overlay), jumps to + selects the first match; root `n` / `p` cycle with wraparound. Matches node labels and edge labels, case-insensitive substring, recomputed each step so the query survives graph edits; failed searches overwrite the stored query (vim semantics). Same keys in both profiles. Verified via Playwright (13 checks incl. edge-label focus).
7. **Mixed-size node support (dogfooding batch, 2026-07-11).** Building `next.kidraw.yaml` as a todo graph surfaced that everything downstream of the tree layouts assumed uniform node sizes. Four commits fix that end to end: **(a)** `resolveBoxOverlaps` (`overlap-resolution.ts`, unit-tested) — a pure push-apart pass over node boxes (least-penetration axis, pinned/anchored boxes immovable) that `applyLayout` now runs after *every* layout, guaranteeing no layout leaves overlapping nodes; **(b)** the point-based layouts got direct size awareness (force-directed simulates box centers and repels from box edges; grid cells size to the largest box; circular/radial ring radii and angular shares come from actual box footprints) (`6dbf05e`); **(c)** **Increase/Decrease Node Size now reflows**: growing a node pushes overlapping neighbors (and chains) aside, anchored on the resized node, and re-routes edges of everything that moved (`b8d55d1`); **(d)** new **`fit` text-overflow mode** — base size acts as max-width/minimum instead of a fixed box, so short labels get snug cards and long ones wrap and grow downward; overflow submenu key `v` (both profiles), file-format value `fit`, and now the todo-graph plugin default (`0bed763`). Not done yet: layout/reflow still doesn't fit-to-view afterwards, and label/waypoint positions aren't part of the overlap pass.
8. **Gather Descendants + Ungather** (`1f6b43a`). Traversal submenu grew `a` **Gather All** — pulls every descendant (transitive outgoing edges) of the anchor node into a radial tree around it (BFS, wedges split by subtree leaf counts, ring radii box-aware) — and `u` **Ungather**, which restores the saved layout. Unlike the plain Gather toggle the view persists until explicitly ungathered; original positions live in `gatheredNodePositions`, so it's a temporary view, not a mutation.
9. **Context-sensitive `i` key (edit/insert).** Tapping the edit key (`i` vim / `e` ijkl) now acts on context: single selection → recenter + jump crosshairs to it + deselect; multi-selection → status warning; over a node/label → edit it; over an edge → status hint; over a waypoint/empty canvas → insert node + label edit. Holding it swaps in context options (Insert Node over items/empty; Add Label / Add Waypoint over edges); with a selection the static Edit submenu (Overflow, Toggle Pin) is kept. Plumbing: keymenu sends `QUERY_EDIT_CONTEXT` on keydown, drawing area answers synchronously with an `edit-context` notification; tap emits `EDIT_OR_INSERT`, decided entirely in the drawing area (`computeEditContext` / `handleEditOrInsert`). Verified end-to-end via Playwright (23-check script driving real key events).
10. **Edge labels are path-anchored.** A label's position is no longer absolute x/y but an anchor — arc-length fraction `t` (0..1) along the edge's rendered polyline plus a discrete `side` (`above`/`on`/`below`; "above" is screen-stable, independent of edge direction). `DAEdge.refreshGeometry()` re-derives every label's x/y from its anchor, so labels follow node moves, waypoint drags, and re-routing for free. Pure geometry in `edge-label-anchor.ts` (unit-tested): `pointAtT`, `projectPointToPath`, `anchorPosition`, canonical stops at t = 0.1/0.5/0.9. Label-only movement keys: left/right slide `t` by grid spacing (fine tier = subgrid), coarse tier snaps between the start/middle/end stops, up/down cycle above → on → below. Add Label anchors at the projected crosshairs `t` on the line. Persistence: snapshots carry `edgeT`/`side`; the file format gains `labelAnchors` (`{t, side?}`, index-aligned with semantic labels) replacing `labelOffsets`, which is still read for migration — legacy absolute positions restore by projecting onto the path (`adoptLabelPosition`). Degenerate paths (overlapping nodes → zero length) leave the label in place until geometry recovers. Verified end-to-end via `tools/repro-edge-label-anchors.js` (15 checks: add flow, node-move/re-route following, slide/snap/side keys, serialize round trip, legacy projection). Remaining from the [`notes/decision-interaction-model.md`](notes/decision-interaction-model.md) roadmap: move-by-graph fix → gathering/collapse rework.
11. **Label add/edit/move interaction fixes (2026-07-13).** Dogfooding the path-anchored labels surfaced three defects, all fixed:
    - **Select+Drag couldn't target labels.** The hold-`v` selection helpers (`ensureTopItemSelected` / `isTopItemSelected` / `toggleTopItemSelection`) hit-tested waypoint → node → edge only, and nothing in the keymenu emits `SINGLE_ITEM_SELECT` (the one selector that did check labels), so the label slide/side-cycle machinery shipped in item 10 was unreachable except through in-graph search. The three helpers now check `getLabelUnderCrosshairs()` first, matching `singleItemSelect` / `computeEditContext` priority. Hover a label + hold `v`: `h`/`l` slide its `t` (coarse snaps stops), `j`/`k` cycle above/on/below.
    - **New labels were born with literal text `label`.** Label-edit is append-only, so the default text had to be backspaced away, and Add Label deselected afterwards, leaving the user to navigate back onto the label to edit it. `addLabel` now creates the label **empty and selected**, and releasing the held submenu key (`f` insert or `i` edit-context) drops straight into label-edit mode — confirmation-driven via the new `label-added` DANotification (armed only on success, so Add Label over empty canvas doesn't strand you in labelEdit). Labels still empty on exit are pruned rather than left as invisible hit-targets.
    - **Held Add Label auto-repeated**, silently stacking identical labels on the same anchor — you'd edit the top one while the one underneath kept showing "label" (the reported "label doesn't go away" bug). The insert-submenu Label, Waypoint, and Invisible-node actions are now `repeat: false` one-shots (`LabeledAction` repeat flag).
    - **Labels had a de-facto size limit.** The box was a fixed 50×30 with the text clamped inside it, so anything beyond a couple of words clipped into invisibility. `DALabel` now sizes its box to the text (explicit `\n` makes multi-line; 50×30 remains the *minimum* so short/empty labels stay targetable). `width`/`height` getters replaced the `RECT_WIDTH`/`RECT_HEIGHT` constants at every consumer — crosshairs hit-test, search bbox, and the edge's above/below side-clearance, which now re-places the label per keystroke so a growing box keeps clearing the line. Label max font size raised 36 → 48 (parity with nodes).

    Verified end-to-end via `tools/repro-label-edit-flow.js` (19 checks driving real key events: single label from a held key, empty+selected creation, labelEdit on release, typed text with no prefix, empty-label pruning, select+drag slide/side, long-text box growth + far-edge selectability, failure over empty canvas); `repro-edge-label-anchors.js` still 15/15; 235/235 unit tests.

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
| `3e85d36` | Labels auto-size to their text: no more 50x30 clipping limit |
| `49cf542` | Label add/edit/move fixes: selectable via v, born empty into edit mode, no repeat-stacking |
| `26d39dd` | Path-anchored edge labels: (t, side) anchors follow moves and re-routing |
| `fa4d975` | dev-server: allow kidraw.dev.bnjmnbrmn.com as a serve host |
| `c1e9674` | next: reorganize planning notes into pre/post-MVP |
| `49c265a` | dev-status: record extensions identity slot + persistence cascade |
| `eab8642` | Extensions with identity slot; node styles cascade, derived sizes stop persisting |
| `e2889f9` | notes: record extension decisions + post-persistence roadmap |
| `03075fd` | notes: rework diagram-types idea into extensions + contribution points |
| `5294ea0` | notes: record custom-color persistence bug |

---

## Known bugs

### Fixed 2026-07-07, second batch (`ed9a847`)

- **Opened graphs landed off-screen** — no load path positioned the viewport, and crosshairs-anchored zoom can't find distant content. All load paths now call `fitViewToContent()` (pan to bbox center + zoom out to fit, floor 0.02, ceiling 100%) + recenter crosshairs (`ddbaccc`; plain centering shipped first in `ed9a847` but failed on cluster+outlier files where the bbox center is empty space). Selection-less `r→h` Recenter View is the same fit-rescue; with a selection it centers without rescaling. (Rejected alternative — normalizing coordinates to (0,0) on save — recorded in `notes/idea-origin-centering.md`.)
- **Header now shows the open file** — `file-state-update` notification → monospace chip ("vaultDir/path" for vault files); clears when the graph loses file backing.

### Fixed 2026-07-07 (`25a873a`)

- **Dialog-stacking auto-repeat** — one-shot actions (misc/file submenu, root Search) fired 4–5× per press because blocking dialogs swallow the keyup and the repeat timer kept firing. `RepeatConfig.enabled: false` (submenu-wide) + per-key `LabeledAction repeat` flag. This was the real cause of "can't open from vault."
- **Search crosshairs stranded between matches** — rapid/held `n`/`p` computed the jump delta from a mid-tween crosshairs position. `focusSearchMatch` now finishes tweens first.
- Status messages + vault operations now log to `tools/debug.log` (`[status]` / `[vault]` prefixes) for diagnosis.

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

> **Notation.** Held-key chords are written with the `\K`/`/K` (down/up) event
> notation in
> [`notes/reference-key-event-notation.md`](notes/reference-key-event-notation.md),
> which states both bugs above precisely (Bug A `\m \x /m /x`; Bug B compares
> `\fine \left` vs `\left \fine`). That note also tracks open design questions —
> escape sequences, named action/submenu sequences, menu-hierarchy notation, and
> whether two specific keys should ever commute (order matters by design).

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

### Next up: "Move by graph…" rework (spec'd 2026-07-13, not started)

User-specified behavior for the next session. This is the "move-by-graph fix" step of the interaction-model roadmap (edge labels ✅ → **move-by-graph** → gathering/collapse rework).

**Entry.** Opening "Move by graph…" (hold `g`) with a **single** node, edge, or label selected: move the crosshairs to that item and recenter the view on the crosshairs (skip both if the crosshairs are already there), in addition to bringing up the submenu as usual.

**Edge selection from a node.** With the crosshairs over a node:

- Tap **Jump Outgoing** → select one of the node's *outgoing edges* (today it jumps straight to the neighbor node).
- **`j` "Next Edge"** (relabel) → cycle the selection through the outgoing edges.
- Tap **Jump Incoming** → deselect any selected outgoing edge and select one of the *incoming* edges, if one exists.
- **`k` "Previous Edge"** → cycle backwards.

**Traversal along the selected edge.** Continuing with Jump Outgoing / Jump Incoming while an edge is selected moves to the next *stop* along it, which can be a node, a label, or a waypoint. For navigation purposes labels and waypoints are pseudo-nodes that split the edge — each has exactly one incoming and one outgoing side, so the same Jump Outgoing/Incoming vocabulary applies while standing on one.

**Granularity via the move-speed tiers.**

- **Coarse** movement held: node → node only (skip labels and waypoints).
- **Neither** fine nor coarse: nodes **and labels**.
- **Fine** held: nodes, labels, **and waypoints**.

**Implementation findings (current state of the code):**

- Submenu: `buildMoveByGraphSubmenuConfig` (`keymenu.component.ts`) — Jump Outgoing → `TRAVERSE_OUTGOING_NEXT`, Jump Incoming → `TRAVERSE_INCOMING_NEXT`, plus Forwards (`FOLLOW_SELECTED_EDGE`), Backwards (`NAVIGATE_BACK`), Gather/Gather All/Ungather. `j`/`k` are currently unbound in this submenu in the vim profile; the `moveByGraph` block in `key-assignments.ts` needs `nextEdge`/`prevEdge` keys added to **both** profiles (no hardcoded key literals).
- Traversal today is node-to-node via `traverseFromAnchorNode(direction, sign)` (`drawing-area.component.ts`); it will need a stop-based walk instead. Stops on an edge can be ordered by arc-length `t` along the rendered polyline: labels already carry `edgeT`; waypoints can be projected with `projectPointToPath` (`edge-label-anchor.ts`).
- Entry behavior: the submenu opener is a plain `LabeledSubmenuConfig`; switching it to `LabeledActionSubmenuConfig` (the Select+Drag pattern) lets it fire a command on entry — e.g. a new `FOCUS_SELECTED_FOR_GRAPH_NAV` handled by the drawing area only when exactly one node/edge/label is selected. `focusAndReleaseSelectedItem` (the tap-`i` single-select flow) already implements recenter + move-crosshairs-to-item and is mostly reusable; note it must *not* deselect in this flow, and must no-op when the crosshairs are already on the item.
- Grid tier: `GridTier` (`fine`/`normal`/`coarse`) already flows through move/drag commands; the traversal commands need to carry it too. **Open design question:** how the tier is expressed while the `g` submenu is held — the coarse/fine speed keys are themselves held-key submenus, and multi-held-key chords are the known-buggy area of the keymenu state machine (see "Key-handling bugs" above). May be worth fixing bug B there first, or defining tier as a sticky mode inside the submenu.
**Decisions (2026-07-13):**

- **Q1 — first edge pick: momentum.** Score the candidate edges by angular alignment with the direction of travel (the tangent of the last traversal step as it arrived at this node) and select the best-aligned one first. Momentum only chooses the *entry point*; `j`/`k` Next/Previous Edge then cycle the candidates in fixed clockwise/counterclockwise order around the node, so a wrong guess costs one keystroke and the cycle order is always visible on screen. Jump Incoming picks the incoming edge whose flow through the node best aligns with the same momentum vector. **Cold start** (no traversal momentum — fresh selection, free crosshairs movement): start at 12 o'clock and go clockwise; possible later refinement, seed weak momentum from the last free crosshairs movement. File order was considered and rejected (invisible, unstable under edits).
  - *Held open, low stakes:* whether an edge's direction is measured by its **departure tangent** (first path segment leaving the node) or the **bearing to its far endpoint**. Tangent matches what the eye follows on routed edges; but once the gathering/collapse rework lands, jumping toward a sucked-in node may want endpoint bearing. Implement the direction metric as one small swappable function so this can be changed without touching the traversal logic.
- **Q2 — Jump Incoming mid-edge: reverse course** along the same edge (momentum rotated 180°), not a jump back to the originating node's incoming set. The whole system reduces to "keep going the way you're facing."
- **Q3 — tier while `g` is held: still open** (interacts with the keymenu held-chord bugs; see "Key-handling bugs" above).

### Current focus

**1. Serialization / file format.** Design + implementation substantially complete (see Recently Completed for Phase 1–9 of the `serialization-plan.md` rollout, Phase 5 = the vault). Open / Save As / Export Zip / Cycle Display through the keymenu (`m → f`, `m → a`, `m → z`, `m → d`), plus the vault flows (`m → v` / `m → o` / `m → w`) with silent auto-save and external-change reload. **Remaining**: Phase 10 (dirty indicator + `beforeunload` + minor UX polish), and the trad/large-menu fuzzy-finder overlay to replace the `window.prompt` placeholders in Vault Open / Save As.

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
