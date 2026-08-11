---
title: Normal crosshair movement — distance-based travel on a visible goal line
type: decision
---

# Normal crosshair movement goal line

Ordinary `hjkl` movement now treats its first direction as a goal axis. The
horizontal or vertical line through the starting crosshairs is held until the
movement axis changes, another command interrupts the gesture, or the movement
grid times out.

Each normal step advances by its configured grid-relative distance. Nodes,
edges, waypoints, and labels neither shorten nor lengthen a step and never pull
the crosshairs off-axis. Item-aware movement remains available through the
dedicated Move by Node (`g`) and Move by Link (`f`) modes.

Normal-mode held movement fires once immediately, then uses Cursor → Repeat
delay and Repeat interval for its app-owned timer. The defaults remain 250 ms
and 100 ms. Other repeating normal-mode cards use the same pair; Insert,
Vim-normal, and Vim-visual text editing use the separate Edit repeat pair.

Cursor settings expose Fine, Normal, and Coarse movement as grid-square
counts, not fixed drawing-unit or screen-pixel distances. Fine and Normal
count minor-grid squares (defaults 1 and 5); Coarse counts major-grid squares
(default 10). Because the drawing grid adapts to zoom, the same setting can
cover a different logical distance at another zoom level while retaining the
same visible grid relationship.

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

The dashed goal line renders above the ordinary grid but below graph content.
It disappears on the same five-second timeout as the grid and crosshairs.
The next crosshairs movement restores all movement UI. Fine and coarse
movement remain direct grid movement and clear the normal goal. Direct movement
snaps only the requested axis to its tier grid; the perpendicular coordinate is
preserved exactly, so a horizontal coarse step can never introduce a vertical
step (or vice versa).

Current tuning:

- fine / normal / coarse steps: 1 minor / 5 minor / 10 major grid squares,
  independently editable in Cursor settings.
