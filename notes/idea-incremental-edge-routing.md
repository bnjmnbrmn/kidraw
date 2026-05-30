# Incremental edge routing

_Filed 2026-05-27. Worktree `worktree-agent-a48d88c39be377565`._

## Use case

The user has an existing graph with N already-routed edges. They add a new
edge X and want X to find a good route through the existing layout **without
disturbing the routes of the other N**.

Today, every keymenu Route Edges command (`applyBezierFitWeightedChainEdges`
in `drawing-area.component.ts` ~line 1060) re-routes the whole edge set (or
the whole selection). On a graph with five or ten settled edges this causes
all of them to twitch every time the user adds one more — a jarring visual
jump that erases the user's mental model of "where my existing edges go".

The desired behavior on incremental adds: edge X routes around the existing
edges + nodes as obstacles; edges 1..N stay frozen. Routing a single edge
through a fixed environment is also significantly cheaper than rerouting the
whole graph, so the live feedback loop on edge-create can be tighter.

## Where this slots into the codebase

The relevant invariants and shapes:

- `weighted-chain-edges.ts` simulates **all** edges' beads together in one
  `simulateAll(states, opts)` loop. Cross-edge bead repulsion is all-pairs
  over the visible beads of every other sim'd edge (`states[s2].beads` in
  the inner loop). This means "other edges" already participate as
  positions-in-space; they're just not currently fixed in place.
- `bezier-fit-weighted-chain-edges.ts` is a thin wrapper:
  - call `applyWeightedChainEdges(nodes, edges, wcOpts, log)` to fill the
    bead polylines;
  - then Douglas-Peucker each edge's bead list down to a few control points;
  - trim CPs that landed inside src/dst bboxes; mark `setSmoothRendering`.
- `EdgeControlPoint` already supports `pinned` (used today for user-placed
  waypoints). `DAEdge.setControlPoints` preserves pinned entries via
  `mergePinnedIntoSequence`. But the routers themselves don't read `pinned`
  on entry — only the post-route splice does. So "pin the existing edges'
  CPs" is a half-baked option without router-side support.
- `node` repulsion in weighted-chain comes from `Obstacle` bboxes built from
  the nodes. There is no analogous representation for **edges-as-obstacles**.

## Algorithmic options

### Option A — Treat other edges as polyline obstacles; bf-wc only the target edge

Add a new `Obstacle` type ("line obstacle") representing each non-target
edge's rendered polyline. The target edge's beads feel a charge from these
line obstacles the same way they currently feel a charge from node bboxes.
The existing all-pairs bead-bead repulsion already pushes beads on the
target edge away from beads on the other edges — but if those other edges
have already been Douglas-Peucker'd, their bead arrays are gone. We need to
re-densify them (or use the polyline directly).

**How:**

1. Re-densify each non-target edge's rendered polyline back to a bead-like
   sample (one sample every `segmentLength` along the chord, say). These
   samples are FIXED — they never move.
2. In `simulateAll`, the target edge's beads run their force update as
   normal; obstacle nodes contribute via `obstacleForce`; **fixed samples
   from other edges** contribute via the same all-pairs bead repulsion that
   already exists. Just put them in the "other state" slot with a flag
   `frozen: true` so they don't get integrated.
3. PBD only walks the target edge's chain.
4. After simulation, run the same DP simplify + interior strip on just the
   target edge.

**Pros:**

- Reuses the existing physics — bead-to-bead repulsion already knows how to
  push the target's beads away from other beads. The "other-edge bead
  positions are frozen" is a one-line change in the integration step.
- Compute cost: O(N_target_beads × M_other_samples) per iteration, where
  M = total samples across all other edges. For a 10-edge graph with ~50
  samples/edge, that's 500 samples — fine.
- Other edges literally don't change because we never write to their
  `controlPoints`.
- No new "line geometry" math; we already have bead-bead.

**Cons:**

- The discretization is coarse near sharp bends in other edges — if an
  existing edge has a tight bend, our samples may miss the "wall" between
  two adjacent samples, letting the target's bead slip through the gap.
  Mitigated by sampling at `segmentLength = 4` (matches bf-wc's WC default);
  beads on the target are ~4 px apart, samples on others are ~4 px apart,
  so the gap is at most ~4 px. Acceptable for typical layouts; the
  short-range repulsion (`edgeRepulsionMaxDist = 60`) will kick in well
  before bead-touching.
- A bead on the target sandwiched between two adjacent fixed samples on the
  same other edge will get pushed perpendicular to that edge — but if both
  samples are roughly equidistant, the perpendicular components mostly
  cancel and only the tangential (along-other-edge) component remains.
  That's the desired behavior ("slide along the obstacle until you're
  past it"), so the dynamics work out.

### Option B — Run full bf-wc, but treat non-target edges as pinned

Currently `EdgeControlPoint.pinned` is only honored by the splicing step in
`DAEdge.setControlPoints`. To make this option work, the router itself
would have to:

1. On entry, if an edge has any pinned control points, lock its bead
   positions at the rendered-polyline positions.
2. Skip force integration for those beads; skip PBD constraint enforcement.
3. After simulation, `setControlPoints` is still called with fresh beads
   (matching the locked positions, since they never moved) — `mergePinned`
   re-inserts the user waypoints, no-op.

**Pros:**

- Reuses the existing pinned flag on `EdgeControlPoint`. Semantically
  clean: "pin every CP on every non-target edge" is the API.
- Future-friendly: the user-pinned-waypoint case becomes a degenerate
  version of this (pin one specific bead, route around it). One mechanism.

**Cons:**

- Touches the inner loop of `weighted-chain-edges.ts`'s force integration
  for every bead, every iteration. Even with a `if (bead.frozen) continue`
  the cache footprint and iteration count grow with N. The frozen edges
  still participate in PBD (or have to be explicitly skipped). More
  surface area to maintain.
- For a target edge with 200 beads in a graph with 10 other edges of 200
  beads each, we run the full-graph sim (~2000 beads) when we only care
  about updating 200. ~10× CPU vs option A for the same outcome.
- Requires changes to `weighted-chain-edges.ts` (a hot inner loop), where
  Option A only adds a "fixed obstacles" array passed through alongside
  the existing nodes-as-obstacles.

### Option C — Constrained single-edge sim with a "force field" baked from the others

Skip per-bead repulsion entirely. Precompute a static 2D scalar potential
field over the canvas where each non-target edge's polyline adds a 1/r²
contribution. Run the target edge's bead sim against this potential field
+ the node obstacles. Cross-edge bead-bead repulsion goes away.

**Pros:**

- Maximally cheap per iteration: O(N_target_beads) per iteration for the
  field lookup. The field precompute is a one-time cost.
- The field shape is deterministic and visualizable; useful for debugging.

**Cons:**

- Building the field is annoying. Either a grid (memory + interpolation +
  resolution tradeoffs) or a closed-form sum (per-iteration cost ~equal to
  Option A's anyway).
- Loses the "two beads, two charges" symmetry of the existing physics —
  the target's beads now feel a different kind of force than they would
  in the all-edges sim. Risk of routing asymmetries (e.g., target edge
  finds a different home than it would in a full re-route from scratch).
- Bigger semantic gap from the existing model. Hard to argue equivalence
  with the production router.

## Recommended approach

**Option A.** It's the smallest, cleanest change that gives the right
outcome and it reuses the existing bead-bead repulsion exactly. The fixed
samples are conceptually just "external beads that don't integrate" — a
two-line addition to the sim loop and a new `frozen` flag on the EdgeSim
struct. Compute cost is bounded and obvious. No changes to the inner force
formulas, no new force kinds, no field math.

Concretely, the new entry point:

```ts
export function applyBezierFitWeightedChainEdgesForOne(
  nodes: DANode[],
  edges: DAEdge[],          // all edges in the graph (for context)
  targetEdge: DAEdge,        // the one we route
  fitOpts: BezierFitWeightedChainOptions,
  wcOpts: WeightedChainOptions,
  log?: (msg: string) => void,
): void;
```

Internally it:

1. Builds the node-obstacle map exactly like `applyWeightedChainEdges`.
2. Samples each non-target edge's `getPathPoints()` polyline into bead-like
   point arrays at spacing `wcOpts.segmentLength`. These are wrapped in a
   `frozen: true` flag on the EdgeSim.
3. Builds an active EdgeSim only for `targetEdge` (initial slack chain,
   beads in the lane).
4. Runs `simulateAll` over **[targetEdgeSim, ...frozenSims]**. The sim loop
   already iterates per-state for force integration and PBD; we add a
   `if (st.frozen) continue;` at the start of those steps. The all-pairs
   bead-bead repulsion uses the frozen states' beads as **sources** (others
   push the target), but skipping the integration step on the frozen sims
   means their bead positions never change.
5. After sim, run DP + interior strip on the target edge only. Call
   `targetEdge.setControlPoints(...)`. Leave every other edge untouched.

This requires modifying `applyWeightedChainEdges` (or building a sibling
internal function `simulateChainsWithFrozen`) to:

- accept a `frozen?: boolean` flag per EdgeSim,
- skip Step 1 (force + velocity), Step 2 (position update), and Step 4
  (drain) for frozen sims,
- skip the frozen sim in the PBD pass (Step 3),
- in Step 1's all-pairs loop, still iterate other states' beads as
  repulsion sources (already happens; the `s2 === s` skip means each
  state only avoids self-repulsion).

The most surgical implementation: extract a helper
`simulateAllWithFrozen(states, opts)` from the existing `simulateAll`,
guarded by per-state `frozen` flags. Have `applyWeightedChainEdges`
construct states with `frozen=false` for all and pass through unchanged.

## Open questions

- **How to sample non-target edge polylines.** I'll use uniform arc-length
  sampling at `wcOpts.segmentLength` along each polyline segment. Trade-off
  vs picking up smooth-rendering's actual curve geometry: the polyline
  control points are the underlying "skeleton"; smooth rendering is a
  display affordance and shouldn't be what we collision-detect against.
  Defer "sample the smooth render" until visual feedback says we need it.
- **When does this get wired into the live app?** Out of scope for this
  ticket. The most likely entry point is `INSERT_EDGE`'s post-handler: if
  the new edge is going from a node A to a node B and there are existing
  routed edges in the graph, call `applyBezierFitWeightedChainEdgesForOne`
  on just the new edge. The user (or sibling agent) can wire that later.
- **What if the target edge is part of a parallel-edge group?** Other
  parallel siblings get sampled as frozen polylines and the target naturally
  finds its lane. This is identical to the current behavior since
  `groupEdgesByUnorderedPair` runs on the target edge's group lookup —
  except now the siblings' positions are fixed, so the lane offset for the
  target may be off. I think for V1 we just trust the sibling's frozen
  position to "be the lane it's already in" and let the target's lane
  offset bias it to the next available slot. Punt the parallel-edge
  question until it bites in practice.
- **Visual gap if the target edge's start/end are also moving.** Not in
  scope here — we assume the target edge already has src/dest pinned.
- **Edge dragging / live preview.** If we want this to run on every
  pointer-tick during an edge-create-drag operation, 400 iterations × 200
  beads × a few thousand frozen samples is ~80k ops/iter → ~32M ops/run.
  At ~10 Mops/ms (rough JS), that's 3 ms; should be fast enough for live
  feedback, but if not, lower `iterations` to 100-150 for the preview pass
  and one full 400-iter pass on commit. Defer until measured.
- **Edge crossing avoidance vs. clearance.** Frozen samples currently
  repel via the same `edgeRepulsionK / dsq` law as live beads. If we want
  the target edge to be **especially** reluctant to cross an existing
  edge (vs merely "stay clear of it"), we could bump K specifically for
  frozen samples. Punt: try the symmetric setting first.
- **Pinned-waypoint interaction.** If the target edge already has user-
  pinned waypoints, they get spliced back into the result by
  `mergePinnedIntoSequence`. The bead sim doesn't know about them — the
  beads can pass through their absolute positions. That's the current
  behavior for the full-graph router too. Not a regression.

## Implementation plan

1. Refactor `weighted-chain-edges.ts`:
   - Add an optional `frozen?: boolean` to the `EdgeSim` interface (file-
     private, so no external API change).
   - In `simulateAll`, gate Step 1/2/3/4 on `!st.frozen`. (PBD loop already
     iterates over states; just `if (st.frozen) continue;`.)
   - Export a new helper `applyWeightedChainEdgesForOne(nodes, edges,
     targetEdge, opts, log)` that builds the EdgeSims with everything but
     `targetEdge` marked frozen, sampling those edges' `getPathPoints()`
     polylines into bead arrays.
2. Add `applyBezierFitWeightedChainEdgesForOne` to
   `bezier-fit-weighted-chain-edges.ts`: same wrapper pattern as the
   existing entrypoint but routes one edge.
3. Add a `tools/routing-eval/scenarios/incremental-add.mjs` scenario with
   4 corner nodes + 2 diagonal edges + 1 center node + 1 incremental edge.
4. Add a one-off verification script (also under `tools/routing-eval/`)
   that:
   - Pre-routes the two diagonals via the full bf-wc router.
   - Snapshots their control points.
   - Calls the incremental router on the new edge.
   - Asserts the two diagonals' control points are unchanged
     (deep-equal) and the new edge has a non-trivial polyline that does
     not cross the diagonals.
5. Confirm `npx ng build` + `npx ng test --watch=false
   --browsers=ChromeHeadless` are clean.

## Decisions made without user input (sandbox/judgment)

- **Sampling spacing for frozen edges**: `wcOpts.segmentLength` (4 px in
  bf-wc defaults). Rationale: same scale as the live beads, no new tuning
  knob to argue about.
- **Frozen samples participate in bead-bead repulsion at the same K** as
  live-live bead repulsion. Avoids introducing a new tuning knob; can be
  bumped later if the target edge under-respects existing edges.
- **No node-clearance change**: the new edge still treats nodes as
  obstacles via the existing bbox mechanism. Other edges' endpoints sit
  inside their incident nodes' bboxes — those bbox-interior samples are
  filtered out (don't contribute) so the target doesn't get pushed away
  from a sample that's already inside a node bbox it's also being repelled
  from.
- **API named `applyBezierFitWeightedChainEdgesForOne`**: matches existing
  naming pattern. Single new entry point in the same file as the all-edges
  version, so consumers can pick whichever they need.
- **Not wiring into the live app**: per the task scope, just deliver the
  routing primitive + a verification scenario. Live-app integration is for
  a follow-up ticket (likely owned by drawing-area or plumbing agent to
  decide where in `INSERT_EDGE` handling the call goes).
