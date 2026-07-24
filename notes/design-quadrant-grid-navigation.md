---
title: Adaptive quadrant-grid navigation for graph items
type: proposal
status: first rectangular-quadrant experiment implemented, 2026-07-24
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

The origin is fixed until `g` is released **or the viewport changes**. A pan,
zoom, or resize captures a new origin at the then-current crosshairs position
and resets the goal ray. This makes the diagonal regions screen-relative and
prevents an old off-screen origin from silently governing a new view.

Stops otherwise use the same visible adaptive rows and columns as the plain
band-grid strategy: bounded-span clustering, midpoint boundaries, and local
cell refinement. The overlay and movement consume that shared rectangular
model.

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
re-origins the grid by the viewport-change rule.

## Goal ray and `n` / `p`

A dashed goal ray is always drawn from the origin. It initially points east.
The first unadjusted `hjkl` move from the origin points it in that movement's
cardinal direction. It then stays fixed while `hjkl` moves through the grid.

`n` and `p` adjust the ray without moving the crosshairs:

- `n` chooses the angular direction that moves the ray's endpoint toward
  screen-south.
- `p` chooses the angular direction that moves it toward screen-north.

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

- Alternating rectangular row and column fills from the adaptive band model.
- Rectangular row/column boundaries and current-cell emphasis.
- Two stronger 45-degree diagonals through a marked origin.
- Per-item row/column membership crosshairs.
- One stronger dashed goal ray from the origin.

## Feel questions

- Whether both inward and outward main-axis moves should remain constrained,
  or only outward moves.
- Whether a perpendicular step should cross a diagonal immediately or require
  a second confirming step.
- Whether `n`/`p` should use the current adaptive 5°–15° increment, a fixed
  minimum, or snap to meaningful stop bearings.
- Whether the ray should point east initially or remain absent until the first
  `hjkl`/`n`/`p` input.
- Whether re-origining after an automatic navigation pan feels helpful or
  breaks an intended sequence.
