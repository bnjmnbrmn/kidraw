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
After snapping to a feature away from the goal line, the following same-axis
keypress visits the feature's perpendicular projection on the line before
continuing. This return can move perpendicular to the pressed direction by
design: the goal line remains a complete traversable backbone rather than
being silently skipped by magnetic snapping.

The dashed goal line renders above the ordinary grid but below graph content.
It disappears on the same five-second timeout as the grid. Fine and coarse
movement remain direct grid movement and clear the normal goal.

Current tuning:

- normal step: five minor-grid cells (the established half-major-cell step);
- snap corridor: `max(24 screen px, 2 minor-grid cells)`;
- same-progress precedence: node, waypoint, label, edge.
