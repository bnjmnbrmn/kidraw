# graph-auto-layout agent

## Mandate

Owns the math and physics of auto-layout and edge routing. Node-positioning algorithms (force-directed, tree, grid, circular, radial) and edge-routing algorithms (charged-spring, bezier-route, bezier-fit hybrid, flexible-wire, weighted-chain), plus the tuning panel and routing metrics.

## Scope

- `src/app/drawing-area/graph-layout.ts` — node layout algorithms.
- `src/app/drawing-area/charged-spring-edges.ts`, `bezier-route-edges.ts`, `bezier-fit-route-edges.ts`, `flexible-wire-edges.ts`, `weighted-chain-edges.ts` — edge-routing algorithms.
- `src/app/drawing-area/edge-routing-metrics.ts` — quality metrics (crossings, clearance, curvature, composite score).
- `src/app/tuning-panel/**` — live tuning sliders + A/B snapshot infrastructure.

## Out of scope

- How edges store control points (`DAEdge._controlPoints`). That's owned by **drawing-area**. Routing functions output bend-point sequences; drawing-area wires them in.
- Pinned-waypoint preservation. Drawing-area does the splicing via `mergePinnedIntoSequence`; routing just produces fresh bead sequences.
- Selection / interaction with waypoints. Owned by **drawing-area**.

## Invariants

- **Pinned nodes don't move.** Layout algorithms must preserve `node.pinned` positions exactly.
- **Selection scoping.** When a layout / routing command runs with selected nodes / edges, apply only to the selection; otherwise to the whole graph. Drawing-area passes the right set; routing just respects the input.
- **Output is deterministic given (input, seed)** — RNG-dependent algorithms must accept and respect a seed so A/B comparisons reproduce.
- **Parallel-edge grouping uses an unordered canonical pair key.** This is the fix for [`bug-bezier-antiparallel-overlap`](../bug-bezier-antiparallel-overlap.md). Charged-spring, flexible-wire, and weighted-chain already do this; bezier-route is the outlier.

## Typical workflows

### Tuning an existing algorithm

1. Open the tuning panel in the live app. Drag sliders; observe the metric overlay.
2. When a setting feels right, capture it in the algorithm's `DEFAULT_OPTIONS`.
3. Or run a parameter sweep — see [`idea-routing-auto-tune`](../idea-routing-auto-tune.md). Output a per-graph × per-algorithm table.

### Adding a new routing algorithm

1. Create `src/app/drawing-area/<name>-edges.ts` with an `apply<Name>Edges(allNodes, edges, options, log)` entry point matching the existing pattern.
2. Add a `DACommandType.APPLY_<NAME>_EDGES` command + drawing-area dispatch in `handleCommands`. Coordinate with **drawing-area** + **keymenu** for the binding.
3. Add the algorithm to the tuning panel's algorithm dropdown.
4. Add quality metrics to the algorithm's output where applicable.
5. Document trade-offs in a `notes/research-*.md` if non-obvious.

### Investigating a routing bug

1. Reproduce on a small sample graph (try `nudge-multi` or `multi-edge`).
2. Use `tools/playwright-screenshot.js --sample <id> --keys "[b <key>]"` for visual diffs.
3. Inspect metric overlay for crossings / clearance / curvature anomalies.

## Notes I read

- [`research-edge-routing-overview.md`](../research-edge-routing-overview.md) — terminology, two-problem framing, charged-wire-spring model.
- [`research-libavoid-integration.md`](../research-libavoid-integration.md) — the near-term integration target.
- [`research-polyline-nudging.md`](../research-polyline-nudging.md) — the potential differentiator R&D.
- [`research-other-layout-libraries.md`](../research-other-layout-libraries.md) — ELK / cola.js / Graphviz catalog for when "auto-arrange" lands.
- [`idea-routing-auto-tune.md`](../idea-routing-auto-tune.md) — sweep methodology + A/B snapshot fixes.
- [`bug-bezier-antiparallel-overlap.md`](../bug-bezier-antiparallel-overlap.md) — open bug in bezier-route.

## Notes I own

- Routing decisions (one note per algorithm if needed: `notes/decision-routing-<alg>.md`).
- Parameter-sweep results — propose new `notes/research-routing-sweep-*.md` per benchmark graph.
