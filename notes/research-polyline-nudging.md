---
title: Polyline segment nudging — kidraw R&D plan
type: research
---

# Polyline segment nudging — kidraw R&D plan

_Added 2026-04-17, based on conversation with Ben._

libavoid's nudging (spacing apart parallel / overlapping connectors) is **orthogonal-only**. For kidraw's polyline routing, we'd need to implement nudging ourselves. This is viewed as a potential differentiator.

Three hard sub-problems, each with a specific exploration plan.

## Hard part 1 — endpoint propagation

When you shift a segment perpendicularly, both its endpoints move, deforming adjacent segments at the bends. For orthogonal routing this is clean (just extends a perpendicular segment); for arbitrary angles you have choices:

- Slide the bend point along the adjacent segment's direction.
- Insert a new short connector segment.
- Other ad hoc options.

**Plan.** Try a wide variety of approaches on a wide variety of graph shapes and see empirically which feels right visually. No predetermined winner — let the experiments drive the decision.

## Hard part 2 — iterative instability

Nudging one segment can cause a formerly non-overlapping neighbour to now overlap something else. Naive single-pass nudging doesn't converge.

**Plan.** Explore both:

- **Multi-pass.** Repeatedly detect-and-nudge until stable (or max iterations reached).
- **Constraint solver.** Model segment positions as variables with minimum-separation constraints; solve globally (e.g. via a simple 1D constraint solver per direction).

## Hard part 3 — threshold and dynamic spacing

True collinear overlap is rare; more often you have near-parallel visually-cluttered segments. Need to decide what counts as "close enough to nudge."

**Plan:**

- Ensure a reasonable maximum distance between any two segments (hard upper bound on crowding).
- **Dynamic spacing in navigate-by-graph mode.** When an edge is selected, angular neighbours (edges adjacent in clockwise order around the shared node) get more space; distant edges get compressed — a focus + context distortion applied to angular spacing. Example: 10 edges numbered 0–9 clockwise; edge 3 selected → spread 2 / 3 / 4 apart, compress 7 / 8 / 9 together. Prioritises legibility where the user's attention is at the cost of compressing the far side.

## Performance

All of the above is potentially expensive for large graphs, especially dynamic recomputation on every selection change.

**Plan.** Look into:

- Precomputing nudged layouts and invalidating only affected regions on change.
- Incremental updates (only re-nudge edges that share a node with the changed edge).
- Approximations or LOD strategies for large graphs.
