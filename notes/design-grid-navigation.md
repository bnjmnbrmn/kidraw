---
title: Grid navigation for move-by-node (viewport-relative, goal-column)
type: proposal
status: building core, 2026-07-21
---

# Grid navigation for move-by-node

Ben's model (2026-07-21), replacing the cone / cycling / connected-neighbour
approaches. Supersedes the reachability analysis fixes for move-by-node
(`notes/analysis-move-by-node-reachability.md`) — **explicitly no edge
awareness**: navigation is purely spatial.

## Core idea

Treat the **visible** stops as a loose **grid**. Stops whose primary-axis
coordinate is within a tolerance `T` are the same row (or column). Pressing
a direction moves one row/column that way and snaps to the **goal position**
on the perpendicular axis (the text-editor "goal column" idea, applied to
both axes).

- `g`+`j` (down): among visible stops with `cy > cur.cy + T`, take the
  nearest lower **row band** (all within `T` of the smallest such `cy`), and
  within it pick the stop nearest the remembered **goalX**. Symmetric for
  up / left / right.
- **Goal memory:** `goalX` is preserved across vertical moves and reset on
  horizontal moves; `goalY` preserved across horizontal moves, reset on
  vertical. So moving down a "column" tracks your x even when a row has no
  stop exactly there, and returns to it when one does — for both axes. Reset
  entirely when the crosshairs move by anything other than a grid step.
- **Tolerance `T`** = "close enough to be the same row/column." Depends on
  the visible stop count `N` (denser view → finer grid): current default
  `T = clamp(300 / sqrt(N), 25, 150)` px, tunable by feel.
- **Tiers unchanged:** the stop set is still nodes (default + labels; coarse
  = nodes only; fine = + waypoints). "No edges" means no connectivity in the
  *selection*, not removing label/waypoint stops.

Reachability: every stop defines a row and a column; step vertically to its
row, then horizontally along that row to it. Fully reachable.

## Viewport behaviour

- The grid is built from **visible** stops only.
- Moving past the grid edge **shifts the viewport**: if no visible stop lies
  in the pressed direction, pan toward the nearest off-screen stop in that
  direction and land on it (brings it into view). [core: basic pan]
- **Skip arrows** (stage 2): when stops are skipped because they're outside
  the viewport, draw a small arrow at the viewport edge pointing at them,
  fading after a few seconds.

## Grid overlay (stage 2)

While `g` is held, draw the grid lines (row bands as horizontal lines, column
bands as vertical lines) as a temporary overlay so the navigation structure
is visible. Hide on release.

## Build stages

1. **Core (this pass):** viewport-relative grid step + goal-column memory
   (both axes) + basic viewport pan to off-screen stops. Revert the
   connected-neighbour / cone / cycling selection.
2. Grid overlay while `g` held.
3. Skip arrows with fade.
4. Tune `T` (criterion) by feel.

## Open questions / defaults chosen

- `T` formula: chose `clamp(300/sqrt(N), 25, 150)`; revisit by feel.
- "Same row" uses primary-axis proximity only (not 2-D cells); simpler and
  enough for row/column stepping.
- Grow-mode target hop keeps its own cone + cycling (a different flow that
  *is* about connecting) — unaffected by this.
