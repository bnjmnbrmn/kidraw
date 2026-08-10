---
title: Edge-label dragging follows screen direction
type: decision
status: implemented 2026-08-09
---

# Edge-label dragging follows screen direction

An edge label is stored as an arc-length position `t` plus a discrete side
(`above`, `on`, or `below`), but its movement keys describe screen directions.
Pressing left must never move the label right merely because the edge was
drawn destination-to-source; the same invariant applies to all four cardinal
directions.

For each keypress, the label considers motion both ways along the rendered
path and placement on each side. Candidates whose actual screen displacement
opposes the requested direction, or is mostly perpendicular to it, are
discarded. The remaining candidate with the greatest progress in the requested
direction wins. Side changes are adjacent (`above ↔ on ↔ below`), so a single
step never skips across the edge. When an outer-side label is pushed toward
the path, the `on` candidate takes precedence over a longer diagonal
along-path move; this keeps the on-edge placement reachable at every angle.
Along-path candidates otherwise win exact ties, preserving the familiar slide
behavior when the edge and key are aligned.

This means left/right on a horizontal edge normally changes `t`, independent
of edge direction. On a vertical edge, left/right can instead move the label
to the corresponding side of the edge. At an endpoint or another geometry
boundary where no valid candidate exists, the keypress is a no-op rather than
moving in the opposite direction. Coarse movement evaluates the canonical
start/middle/end anchors; fine and normal movement retain their established
distances.

Every candidate must also keep the label's complete axis-aligned box outside
both endpoint-node boxes, with a four-unit gap. The rule uses the rendered
label dimensions, so a long label stops sooner than a short label. Repeated
dragging therefore saturates at the last safe anchor instead of allowing the
edge's lower z-order to carry any part of the label behind an endpoint node.

Related: [path-anchored edge labels](../dev-status.md),
[held-key interaction model](decision-interaction-model.md).
