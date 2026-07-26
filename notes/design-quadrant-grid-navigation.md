---
title: Adaptive quadrant-grid navigation for graph items
type: proposal
status: turn-sensitive rectangular-quadrant experiment implemented, 2026-07-26
---

# Adaptive quadrant-grid navigation

A diagonal-region sibling of [adaptive band-grid navigation](design-grid-navigation.md).
It is selected with `g → o`; `g → e` returns to the known-good plain adaptive
band grid. The strategy choice lasts for the app session and is not graph
content.

This supersedes the circular and concentric-box polar experiments. The useful
part of those experiments was the fixed origin and N/S/E/W regional model, not
radial rings.

## Coordinate model

The crosshairs position when `g` is held is the **origin**. Two 45-degree
diagonals through it divide the viewport according to the dominant offset:

- East/West when `abs(dx) >= abs(dy)`.
- South/North when `abs(dy) > abs(dx)`.

The origin is fixed for a run of the same `hjkl` direction. Pressing a
different direction captures a new origin at the current crosshairs **before**
executing that move. Thus `h h h j` makes three westward steps using the
original frame, then moves the origin to the third landing and evaluates `j`
as a southward step from there. Reversals such as `h l` count as direction
changes too; `n` and `p` do not.

Releasing `g` or changing the viewport also resets the origin. A pan, zoom, or
resize captures a new origin at the then-current crosshairs position and
resets the goal ray. This makes the diagonal regions screen-relative and
prevents an old off-screen origin from silently governing a new view.

Stops otherwise use the same visible adaptive rows and columns as the plain
band-grid strategy: bounded-span clustering, midpoint boundaries, and local
cell refinement. They remain the movement model, but the quadrant strategy no
longer renders their rectangular fills or boundaries.

## Movement

`hjkl` remain ordinary screen directions. A press searches successive
row/column bands in that direction. The diagonal quadrant constrains travel
parallel to its main axis:

| Current quadrant | Constrained keys | Keys allowed to cross a diagonal |
| --- | --- | --- |
| East / West | `h`, `l` | `j`, `k` |
| North / South | `j`, `k` | `h`, `l` |

For example, `l` in East skips a nearer column containing only North/South
stops and continues to the next column containing an East stop. Vertical
movement in East remains a normal row step and can eventually cross into
North or South. This prevents accidental radial-axis escapes without trapping
navigation inside a quadrant. The origin itself is always an allowed
main-axis destination; it acts as the gateway for continuing into the opposite
quadrant.

Within the destination band, the stop nearest the **goal ray** wins. Exact
ties fall back to the current perpendicular coordinate, which keeps a
horizontal ray from making vertical steps arbitrary (and vice versa).
Going to an off-screen stop may pan the viewport; the completed pan then
re-origins the grid by the viewport-change rule. Within a same-direction run,
the origin and goal ray otherwise remain stable.

## Transient goal ray and `n` / `p`

The goal ray still initially points east and still chooses landings, but it is
normally hidden. The first unadjusted `hjkl` move from the origin points it in
that movement's cardinal direction. It then stays fixed through the
same-direction run. A direction change re-origins first and resets the ray to
the new direction.

`n` and `p` adjust the ray without moving the crosshairs:

- `n` chooses the angular direction that moves the ray's endpoint toward
  screen-south.
- `p` chooses the angular direction that moves it toward screen-north.

Either key briefly reveals the dashed ray at its adjusted angle. It remains
fully visible for 650 ms, then fades over 800 ms. A repeated `n`/`p` press
restarts that reveal.

These are intentionally not global clockwise/counterclockwise commands. At
West, moving the endpoint south requires the opposite rotation from the same
operation at East.

The provisional angular step adapts to visible stop density:

`clamp(90° / sqrt(visible stops), 5°, 15°)`

Five degrees is the minimum visible change; sparse views use a larger step.
At due South, another `n` is a no-op; at due North, another `p` is a no-op.
When either rotation is equally good, the ray bends toward East for a stable
tie-break.

## Overlay

- No rectangular row/column fills, boundaries, or current-cell emphasis.
- A slightly darker wash marks the active N/S/E/W quadrant.
- One pronounced dashed set of diagonals follows the crosshairs, previewing
  the origin frame that a direction change would activate. It appears as soon
  as `g` is held with this strategy active, including while the crosshairs are
  at the active origin.
- No persistent diagonal lines through the active origin; the origin marker
  and quadrant wash carry that state.
- Per-item row/column membership crosshairs.
- A transient dashed goal ray from the origin only after `n` or `p`.

## Feel questions

- Whether both inward and outward main-axis moves should remain constrained,
  or only outward moves.
- Whether a perpendicular step should cross a diagonal immediately or require
  a second confirming step.
- Whether `n`/`p` should use the current adaptive 5°–15° increment, a fixed
  minimum, or snap to meaningful stop bearings.
- Whether re-origining after an automatic navigation pan feels helpful or
  breaks an intended sequence.
