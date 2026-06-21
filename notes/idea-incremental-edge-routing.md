---
title: Incremental desiderata-first edge routing
status: idea
---

# Incremental desiderata-first edge routing

Explore an alternative to the current whole-graph weighted-chain-first routing.
The idea is to route edges one at a time in a deterministic order, improving each
edge against already-routed edges and node obstacles as it is laid down.

## Proposed flow

1. Order edges deterministically, initially by source-node position: top to
   bottom, then left to right, then edge id as a stable tie-breaker.
2. For each edge, generate an initial Bezier/polyline route from source to
   destination.
3. Apply desiderata refinements immediately for that edge, treating previously
   routed edges as frozen obstacles/context:
   - preserve clearance from nodes,
   - avoid or thin crossings,
   - separate bunched fans,
   - prune redundant bend clusters,
   - keep clear stars straight where possible.
4. Continue edge by edge, so later routes adapt to earlier routes instead of
   all edges fighting in one global physics pass.
5. Optional final pass: convert the current Bezier/control-point layout into
   weighted-chain links, run the existing weighted-chain physics as a smoothing
   / relaxation step, fit Bezier control points again, then apply additional
   desiderata cleanup.

## Questions

- Does deterministic edge order introduce visible bias? If so, compare source
  order, longest-edge-first, high-degree-source-first, and random-seeded orders.
- Should the final weighted-chain pass be opt-in, automatic only for dense
  graphs, or skipped when the incremental pass already scores well?
- How should pinned/user waypoints constrain the per-edge initial route?
- Can the routing-eval harness compare incremental-only vs incremental plus
  final weighted-chain pass against the current bf-wc/desiderata pipeline?

## Why try it

The current whole-graph physics approach can be expensive and sometimes produces
global compromises that are hard to tune. An incremental pass may give clearer
local control, easier debugging, and a natural place to apply desiderata as
construction rules rather than only post-processing rules.
