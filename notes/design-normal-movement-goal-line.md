---
title: Normal crosshair movement — nearby-item snapping on a visible goal line
type: decision
---

# Normal crosshair movement goal line

Ordinary `hjkl` movement now treats its first direction as a goal axis. The
horizontal or vertical line through the starting crosshairs is held until the
movement axis changes, another command interrupts the gesture, or the movement
grid times out.

Each normal step considers graph features within a screen-stable snap corridor:

- node centers, when the goal line crosses or comes near the node box;
- user waypoints;
- edge-label centers, using the label box for proximity;
- exact crossings of rendered edge segments, or a nearby segment endpoint.

The next feature ahead takes precedence over the ordinary half-grid step.
There are now two deliberately different cases:

- When the goal line crosses a node or label box, movement stops at the first
  boundary it encounters and stays on the line. Starting inside stops at the
  exit boundary. It does not pull to the item's center.
- When the line only passes near an item, movement may still snap to its
  center. The following same-axis keypress visits the feature's perpendicular
  projection on the line before continuing.

The latter return can move perpendicular to the pressed direction by design:
the goal line remains a complete traversable backbone rather than being
silently skipped by magnetic snapping. Equal-position ambiguity is resolved
by the existing priority order, so a waypoint on an edge wins over the edge.

Normal-mode held movement fires once immediately, pauses for 250 ms, and then
repeats every 100 ms. This is local to the root movement keys; repeat settings
used by other continuous controls are unchanged.

The graph item under the crosshairs gets a non-semantic dashed hover trace in
the crosshairs color. It never changes selection and follows selection's hit
priority: label, waypoint, top node, top edge. This makes the active target
visible while keeping it distinct from the blue selection glow. The trace is
removed while the crosshairs themselves are hidden.

When the active navigation landing is a node that cannot be read in place, the
crosshairs layer also shows a natural-scale clone of the actual node, including
its shape, text, badges, and selection treatment. A landing qualifies when any
part is outside the viewport, a higher-z node overlaps it, or its rendered font
is smaller than 12 screen pixels. The clone stays aligned with the real node
when possible and clamps wholly inside the viewport otherwise. It is
non-interactive, non-serialized, and is destroyed with the hover landing; a
fully visible readable node is never duplicated.

When normal movement deliberately snaps to an item, that semantic landing
temporarily overrides geometric hit priority. This matters at a busy hub: an
edge endpoint can overlap the hub's crosshair hit area, but the edge that was
actually visited is the thing traced. The trace is drawn immediately when the
landing is chosen, before the movement tween: a held key's 100 ms repeat must
not clear a thin-edge trace before the delayed geometric hover refresh can
paint it. The perpendicular return step after an
off-line snap has no item trace, so it does not misleadingly repaint an
already-visited node.

Visits are direction-qualified for the lifetime of the goal. A feature may be
visited once northbound and once southbound (or once eastbound and once
westbound), but changing direction does not erase the visit in the earlier
direction. This prevents a small alternating gesture at one node boundary from
repeatedly reporting the same node without ever making progress. Changing the
movement axis or letting the indicators time out still starts a fresh goal.

The dashed goal line renders above the ordinary grid but below graph content.
It disappears on the same five-second timeout as the grid and crosshairs.
The next crosshairs movement restores all movement UI. Fine and coarse
movement remain direct grid movement and clear the normal goal.

Current tuning:

- normal step: five minor-grid cells (the established half-major-cell step);
- snap corridor: `max(24 screen px, 2 minor-grid cells)`;
- same-progress precedence: node, waypoint, label, edge.
