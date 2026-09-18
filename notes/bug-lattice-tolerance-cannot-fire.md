---
title: The grow lattice's off-cell tolerance cannot reject anything
type: bug
---

# The grow lattice's off-cell tolerance cannot reject anything

`latticeCellOfNode` in `grow-lattice.ts` decides which cell of the placement
lattice a node is standing on, so that aiming at a node can carry on walking
the grid from there. It rounds to the nearest cell, then rejects the answer if
the node is more than `ON_CELL_TOLERANCE` (0.6) of a step off it:

```ts
const ix = Math.round((centre.x - anchorCentre.x) / step.x);
const iy = Math.round((centre.y - anchorCentre.y) / step.y);
const off = Math.max(
  Math.abs(centre.x - anchorCentre.x - ix * step.x) / step.x,
  Math.abs(centre.y - anchorCentre.y - iy * step.y) / step.y,
);
return off <= ON_CELL_TOLERANCE ? {ix, iy} : null;
```

The guard cannot fire. `Math.round` already bounds each axis's residual at half
a step, so `off` is at most 0.5 and never reaches 0.6 (inferred, 2026-09-18 —
from the arithmetic, checked numerically across several step sizes; carried over
unchanged from `drawing-area.component.ts`, where it was `growCellOfNode`).

The effect: a node is assigned its nearest lattice cell *however far off the
lattice it actually is*. A node adrift between cells is treated as standing on
one, and a hop from it steps as if it were.

The only rejection that does happen is the `if (!ix && !iy) return null` above
it — the anchor's own cell, which is where the walk started rather than a spot
it can step off again.

## Which is right?

Unknown — Ben's call.

A cut-off is arguably unnecessary: every node is *somewhere*, the nearest cell
is the least surprising answer, and treating an off-grid node as on-grid keeps
it reachable rather than stranding it. If that is the intent, the guard is dead
code and should go, so the next reader does not believe there is a cut-off
where there is none.

If a cut-off *is* wanted — so that a node clearly not on the lattice falls
through to Move by Node instead of pretending to be on it — then the threshold
has to be below 0.5, and what it should be is a feel question.

Left working exactly as it does, with the arithmetic written down at the
constant. `grow-lattice.spec.ts` pins the current behaviour explicitly as the
behaviour that *is*, not the behaviour that is wanted.

Related: [Drawing-area refactor](idea-drawing-area-refactor.md),
[move-by-node reachability analysis](analysis-move-by-node-reachability.md).
