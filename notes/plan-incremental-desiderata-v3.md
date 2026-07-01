---
title: incremental-desiderata-v3 — case-driven successor to IDv2
type: plan
---

# incremental-desiderata-v3

Harness-only experimental router (`incremental-desiderata-v3-route-edges.ts`),
successor to [IDv2](idea-incremental-edge-routing.md). Same per-edge,
curve-scored, budgeted hill-climb; four targeted changes driven by a case
review of IDv2 output (see the compare page,
`tools/routing-eval/compare-latest.html`). Registered in
`tools/routing-eval/harness/bundle-entry.ts` as `incremental-desiderata-v3`, so
the compare page shows **bf-wc · desiderata · IDv2 · IDv3** side by side. Not
wired into the app.

## The four changes

1. **Relaxation sweeps.** IDv2 routes each edge once against the already-placed
   edges and freezes it; an edge placed early never sees edges placed later
   (converge-circular: S3→In was bowed across S1/S2→In). IDv3 follows the
   initial pass with up to `relaxationPasses` (default 2) Gauss-Seidel sweeps
   that re-route every edge against **all** the others, seeding from the edge's
   current route so a sweep can only improve it. Budgets raised accordingly
   (`maxTotalScoreCalls` 20k→60k, `maxElapsedMs` 4s→8s).

2. **Fan interior separation** (in `routing-local-score.ts`, gated by
   `fanSeparationEnabled`, default **off** so IDv2 is byte-identical). Two edges
   that share ONE endpoint must now also run `satisfiedFanSeparation` (28px)
   apart in their interiors — measured outside a `fanHubExclusion` (90px) zone
   around the shared hub, where they must converge. IDv2 only rewarded distinct
   *approach angle at the hub*, so fan-out arcs could graze along their length
   (converge-circular Out→D3/D4). New comparator tier sits just below
   incident-angle, above aesthetics.

3. **Symmetric-arc collapse.** After an edge converges, a one-sided detour
   (all waypoints on one side of the chord) is replaced by a single centred
   waypoint at the shallowest clearing depth, kept only if it compares no-worse.
   Fewer bends rank above length/curvature, so an equally-clear single waypoint
   wins — escaping the greedy plateau where IDv2's one-at-a-time REMOVE left
   multi-waypoint wiggles (bypass-obstacle's 3-point kink). Ported from
   `bezier-fit-weighted-chain-edges.ts`'s `collapseToSymmetricArc`.

4. **Cluster-aware bypass.** IDv2's bypass offsets around each clipped node
   independently, which threads tight gaps between obstacles. IDv3 also routes
   around the **union** of obstacle clusters (nodes whose box-gap < `clusterGap`,
   default 72 ≈ 2×satisfiedNodeClearance), on each perpendicular side, so it goes
   around a tight pair instead of between them (tangent-grazing B→D vs the
   OBS/C gap).

5. **Whole-path node clearance** (in `routing-local-score.ts`, gated by
   `wholePathClearance`, default **off** for IDv2 parity). IDv2 measured node
   clearance only at a path's interior *waypoints*; a STRAIGHT edge has none, so
   its clearance was reported as the cap (36 = perfectly clear) even when it
   grazed a non-incident node — a near-miss that reads as "does this edge connect
   to that node?" went unpenalised (dense n8→n10 skimming n9 by 1.6px). IDv3
   samples clearance along the whole rendered path at 8px spacing, skipping a
   55px radius (`endpointClearanceRadius`) around each endpoint so an edge isn't
   dinged for leaving its own perimeter beside a neighbour. Because node
   clearance already outranks crossings in the comparator, seeing the graze is
   enough: the router pulls the edge clear of the node even at the cost of a bend
   or a crossing — the priority the user asked for (visible separation from a
   near-touched node > overall node distance > avoiding a crossing).

## Per-case results (run 20260701-072723-ud2)

| # | Case | IDv2 | IDv3 | Fix |
| - | ---- | ---- | ---- | --- |
| 1 | converge-circular Out→D3/D4 grazing | arcs bunch | fanned, separated | fan separation |
| 2 | converge-circular S3→In crosses S2→In | crosses | clean fan-in | relaxation |
| 3 | dense n8→n10 grazes n9 | 1.6px | **~20px, bowed clear** | whole-path clearance |
| 4 | tangent-grazing B→D grazes OBS | threads OBS/C gap | routes below C | cluster bypass |
| 5/6 | bypass-obstacle wiggle | 3 waypoints | 1 symmetric waypoint | symmetric collapse |

All 6 addressed. #3's root cause was a measurement blind spot, not a genuine
tradeoff: the interior-vertex-only clearance metric never saw a straight edge's
graze (see change 5). Fixing the measurement made the existing clearance>crossing
ranking do the right thing — and dense's crossing count dropped 29→26 as a bonus.

## Open follow-ups

- tangent-grazing B→D keeps 4 waypoints (a minor mid-arc wiggle) because a
  single arc would cross the deep A→D detour — collapse correctly declines it.
  A collapse that also tries the *other* side of the chord might do better.
  (Second caveat, under discussion.)
- If IDv3 wins broadly on the compare page, promote it into the app the same way
  IDv2 was (parameterized `APPLY_EDGE_ROUTING`, worker + sync dispatch).
