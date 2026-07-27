---
title: Adaptive quadrant-ring navigation for graph items
type: proposal
status: one-item-per-quarter-ring experiment implemented, 2026-07-26
---

# Adaptive quadrant-ring navigation

A radial sibling of both the known-good [adaptive band grid](design-grid-navigation.md)
and the [rectangular quadrant grid](design-quadrant-grid-navigation.md). It is
selected with `g → r`; `g → e` and `g → o` return to those two preserved
strategies. As of 2026-07-27 it is the default graph-item navigation strategy.
The strategy choice is session state, not graph content.

## Coordinate model

Holding `g` captures the crosshairs as the origin. The same 45-degree
diagonals classify every graph-item stop into North, South, East, or West by
its dominant offset from that origin.

Each quadrant sorts its stops independently by Euclidean distance from the
origin. Every stop receives its own ordinal **quarter-ring**—nearby distances
are never clustered. A boundary between neighboring rings is halfway between
their stop radii. The innermost ring begins at the origin and the outermost
continues to the viewport edge.

Consequently, the radial spacings in East have no effect on those in North,
South, or West. Two stops at exactly the same radius still receive stable
separate ranks (the stop closer to the quadrant's cardinal axis comes first),
although no circular boundary can geometrically separate two identical
radii; this is an acknowledged degenerate case.

All stops in the active tier participate, including off-screen stops:
nodes-only for coarse, nodes and labels by default, and nodes, labels, and
waypoints for fine.

## Movement

A run of one repeated `hjkl` direction walks outward through the corresponding
quadrant, one occupied quarter-ring per press:

| Key direction | Quarter-rings traversed |
| --- | --- |
| right (`l` in Vim) | East, nearest to farthest |
| down (`j` in Vim) | South, nearest to farthest |
| left (`h` in Vim) | West, nearest to farthest |
| up (`k` in Vim) | North, nearest to farthest |

The origin follows the same turn-sensitive rule as the rectangular quadrant
experiment. The first different `hjkl` direction captures a new origin at the
current stop before executing its move. Thus `l l l j` walks three East rings,
then establishes the third landing as a new origin and enters its nearest
South ring. Releasing `g`, or changing the viewport through pan, zoom, or
resize, also clears or resets the origin.

There is deliberately no inward or angular movement inside one frame in this
first experiment. Reversing direction is a turn and therefore re-origins. The
`n`/`p` goal-ray controls remain specific to the rectangular quadrant-grid
strategy; a one-stop ring needs no within-ring landing choice.

## Overlay

- Four dashed diagonal rays show the actual boundaries of the active frame.
- Each quadrant has independently positioned quarter-circle boundaries.
- Alternating low-opacity quarter-ring fills expose the radial bands.
- The occupied ring under the crosshairs is emphasized.
- A very faint wash marks its active quadrant.
- A small origin marker identifies the center of the current frame.

Unlike the rectangular experiment's ghost diagonals, these diagonals stay
attached to the active origin because they are the edges of the rendered
quarter-rings.

## Feel questions

- Whether strict radius ordering makes a direction key feel insufficiently
  directional for nodes near a quadrant diagonal.
- Whether the last ring should visibly end near its item instead of extending
  to the viewport edge.
- Whether equal or nearly equal radii need a visual tie treatment.
- Whether turns should continue re-origining, or perpendicular keys should
  eventually move between quadrants while preserving a radial goal.
- Whether default navigation should really include edge labels in the same
  one-item radial ordering, or this strategy should initially be node-only.
