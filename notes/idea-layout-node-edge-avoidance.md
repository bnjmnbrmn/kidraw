---
title: Layout-side guarantees — no straight edge through a node, fewer crossings
type: idea
status: partially implemented 2026-07-14 (post-pass + force term + tree/force -clear variants shipped f0c5a5d; tree geometry-exact repair + circular ordering still open)
---

# Layout-side node-edge avoidance + crossing minimization

**Question (Ben, 2026-07-14):** should the node layout algorithms themselves
be adjusted so straight-line edges never pass through non-endpoint nodes, and
maybe minimize edge crossings — instead of leaving both to the router?

**Answer: yes**, and it's the natural counterpart to
[idea-routing-post-layout-quality](idea-routing-post-layout-quality.md): if
layouts *guarantee* pierce-free straight edges, the post-layout routing
profile degenerates to "leave edges straight, detour only for the rare
crossing worth removing" — the two compose into straight, clean diagrams by
default.

## What already exists

- `applyLayout` runs `resolveBoxOverlaps` (`overlap-resolution.ts`, 69-line
  pure pass) after **every** layout — the established contract "no layout
  leaves overlapping nodes". This is the template to extend.
- The tree layout's ordering optimizer already scores
  `(crossings + pierces) · 1e9 + span` — but at the **slot level** (clearance
  circles around slot positions), not against final box geometry with real
  box widths. Residual pierces come from geometry, not ordering.
- Force-directed simulates box centers with box-edge *node-node* repulsion;
  there is no node-vs-edge term.

## Per-family mechanisms

1. **Layout-agnostic post-pass (highest leverage — do this first).** A
   `resolveEdgeNodeOverlaps` sibling to `resolveBoxOverlaps`: for each
   straight edge whose segment intersects a non-incident node's (inflated)
   box, push the node perpendicular off the chord by the least-penetration
   vector (pinned/anchored immovable, same as the box pass), then re-run box
   overlap resolution; iterate with a sweep budget. Gives the invariant
   "after every layout, no straight edge pierces a non-endpoint node" for
   *all* current and future layouts, in one place. Non-convergence on dense
   graphs degrades gracefully (budget) and the router still exists as the
   backstop. `lineSegmentIntersectsRect` (utils) is already there.
2. **Force-directed: node↔edge repulsion term.** Standard technique: for
   each (node, non-incident edge) pair within a cutoff, apply a perpendicular
   force pushing the node off the segment (and reaction onto the endpoints).
   O(N·E) per iteration with a cutoff grid — fine at current scales. Makes
   force layouts *converge toward* pierce-free rather than relying on the
   post-pass to fix a bad basin.
3. **Tree layouts: geometry-exact pierce repair.** Ordering already
   minimizes slot-level pierces; add a final pass over real boxes: for each
   parent→child chord clipping a sibling box, widen the sibling gap or the
   level separation just enough to clear (both are existing knobs: slot
   widths, content-aware depth spacing). Deterministic, no search. Tree
   *crossings* among tree edges are already impossible by construction;
   non-tree edges stay the router's problem.
4. **Circular/radial: ordering, then radius.** Crossing minimization on a
   circle is a pure vertex-ordering problem (barycenter/adjacency-sort
   heuristics — same machinery style as the tree's sweeps). Chord-through-
   node cases resolve by rotating the order or bumping the ring radius.
5. **Grid: out of scope.** Straight edges between distant cells inherently
   cross intermediate cells; that's routing territory by design.

## Crossing minimization honestly stated

Exact minimization is NP-hard everywhere; the aim is heuristic parity with
what the tree layout already does: barycenter-style sweeps + greedy repair
under a `crossings + pierces` objective, applied to circular ordering (4) and
implicitly improved in force by the repulsion term (2). Don't chase optimal.

## Suggested order

(1) post-pass → invariant established for everything; then (3) tree geometry
repair (Ben's primary graph is a pure tree); then (2) force term; then (4).
Measure on `next.kidraw.yaml` + the routing-eval scenario battery: straight-
edge pierce count and crossing count before/after each stage.

## Progress (2026-07-14, `f0c5a5d`)

Done: (1) `resolveEdgeNodeOverlaps` post-pass and (2) force node↔edge
repulsion, wired into three `-clear` layout variants (`force-clear`,
`tree-down-clear`, `tree-right-clear`) kept alongside the originals for
comparison; the clear variants skip the router so the straight result shows.
Measured on the wide-fan tree: straight-edge pierces tree-down 14→0, force
5→0. `dev-status` Current-focus item 14.

Still open:
- (3) **Tree geometry-exact pierce repair** — right now the tree clear
  variant relies on the generic post-pass; a deterministic
  widen-sibling-gap/level-separation repair would move fewer nodes and keep
  the tidy structure truer than the greedy push.
- (4) **Circular/radial ordering** for crossing minimization (no clear
  variants yet).
- **Crossing minimization** generally — the post-pass targets pierces, not
  crossings; a clear variant could add the straight-line-crossing count to
  what it repairs.
- Grid stays out of scope (and is now unbound in the menu).
