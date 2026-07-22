---
title: Adaptive polar-grid navigation for graph items
type: proposal
status: first selectable experiment implemented, 2026-07-22
---

# Adaptive polar-grid navigation

A polar-coordinate sibling of [adaptive band-grid navigation](design-grid-navigation.md).
It is selected with `g → o` (**o**rbit/origin); `g → e` returns to the
editor-style Cartesian band grid. The strategy selection lasts for the app
session and is not graph content.

## Coordinate model

The crosshairs position when `g` is first held is the polar **origin**. It is
stored in drawing-layer coordinates and remains the same diagram point for the
entire hold; viewport panning can move that point on screen without changing
the coordinate system. Releasing `g` clears the origin. The next hold captures
the then-current crosshairs position.

All graph-item stops in the active tier participate, including off-screen
stops. Their distance and screen-space angle around the fixed origin form loose
radial bands and angular bands. Radial tolerance is the Cartesian grid's
adaptive pixel tolerance; angular tolerance is separately adapted and clamped
to 8–35 degrees. The angular seam goes through the largest empty gap so a
coherent spoke is not split at 0/360 degrees. As in the Cartesian strategy,
ambiguous polar cells split locally until every spatially distinct stop has a
unique ring/sector address.

## Movement

At the origin, a screen-direction key enters the innermost ring at the stop
nearest that bearing. Away from the origin, the four screen directions always
cover the four polar moves exactly once. Their roles rotate in the quadrant
whose cardinal axis is nearest the current stop:

| Current quadrant | Outward | Inward | Clockwise | Counterclockwise |
| --- | --- | --- | --- | --- |
| East | → | ← | ↓ | ↑ |
| South | ↓ | ↑ | ← | → |
| West | ← | → | ↑ | ↓ |
| North | ↑ | ↓ | → | ← |

The profile's normal directional keys produce those arrows (`hjkl` in Vim,
`ijkl` in the secondary profile). `n` always moves one angular band clockwise;
`p` always moves one counterclockwise, independent of quadrant. At the origin,
`n`/`p` ask for an outward move first because angle is undefined there.

Radial moves preserve a **goal angle**; angular moves preserve a **goal
radius**. Selection first looks for the exact goal-band intersection in the
destination band, then falls back to the nearest stop across a sparse gap.
This is the polar equivalent of re-acquiring a text editor's goal column.

## Why the origin is fixed for a hold

Re-origining after every landing turns the same key sequence into a path-
dependent nearest-neighbour walk. Rings and sectors change underneath the
user, short cycles become easy, and previously available targets can disappear
from the local topology. A direction-change trigger has the same discontinuity
but makes it harder to predict.

A fixed origin makes one finite coordinate frame. Radial bands form a line,
angular bands form a cycle, `n`/`p` expose that cycle directly, and every
spatially distinct item owns one cell. That is the strongest practical
reachability story without inventing an ordering for exactly co-located items.
Releasing and re-holding `g` is the explicit, ergonomic re-origin action.

## Overlay

- Alternating translucent rings and sectors, with the current ring/sector/cell
  emphasized.
- Faint circular and radial boundaries.
- A marked polar origin.
- Per-item radial/tangential membership crosshairs: radial-arm opacity encodes
  ring cadence; tangential-arm opacity encodes sector cadence.
- A dashed goal ray when a radial step is displaced from its goal angle, or a
  dashed goal circle when an angular step is displaced from its goal radius.

## Feel questions

- Whether quadrant-relative `hjkl` feels spatially natural near diagonal
  boundaries, where a small angular change swaps the mapping.
- Whether `n`/`p` are sufficient as the stable fallback or should become the
  primary angular controls.
- Whether all-stop construction produces too many rings/spokes on large
  graphs; viewport-only rendering with an off-screen index is the fallback.
- Whether the origin marker needs a stronger label or a temporary pulse when
  captured.
