---
title: Delete over a highlighted label removes the whole edge
type: bug
status: open — Ben's call
---

# Delete over a highlighted label removes the whole edge

With nothing selected, Delete removes whatever is under the crosshairs. When
the crosshairs are on an edge's label, the hover trace is around the label,
but Delete removes the **edge**, label and all (inferred, 2026-09-24 — seen in
the browser: the basic sample, a label added on Start → Process at the
crosshairs, nothing selected; the hover target was the label, and Delete took
the edge count from 6 to 5).

## Why

Two orders for "what is under the crosshairs" disagree, and both are written
down in the code:

| Where | Order |
|---|---|
| The hover trace and selection (`topItemUnderCrosshairs`, `CrosshairsHover.target`) | label, waypoint, top node, top edge — "the hit priority matches selection" |
| Delete's fallback (`deleteSelected`) | waypoint, node, edge, label — "Priority: waypoints > nodes > edges > labels > crosshairs" |

A label added with the add key or Edit Text sits *on* its edge (anchor
`'on'`), so the crosshairs over it are over the edge too, and Delete reaches
the edge first. Selecting first gives the other answer: `v` on the label
selects the label, and Delete then removes only the label.

The same crosshairs rule already changed once for nodes: where nodes overlap,
Delete used to remove the one underneath, and since 2026-09-24 (`907fd833`)
it removes the one the trace is around.

## Options

1. **Delete what is highlighted:** take the fallback from
   `topItemUnderCrosshairs()`, so Delete agrees with the trace and with
   select-then-delete. A small change; to delete an edge through its label
   you would point at the edge beside it.
2. **Keep Delete's order,** and say so where the two orders meet: pointing at a
   label means the label for select and edit, and the edge for Delete.

Not changed overnight: Delete is destructive, and its own comment documents
the order it uses.

Related: [`bug-node-target-filter-order.md`](bug-node-target-filter-order.md)
(the other open questions about which item a command means).
