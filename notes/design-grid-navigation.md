---
title: Spreadsheet-band navigation for move-by-node (viewport-relative, goal-column)
type: proposal
status: preserved as selectable adaptive band-grid strategy, 2026-07-22
---

# Grid navigation for move-by-node

The approach's short name is **adaptive band-grid navigation**. It is the
original graph-item navigation strategy and is explicitly selectable with
`g → e`, so it remains available as a known-good option while alternatives are
tested. The current default is
[Adaptive quadrant rings](design-quadrant-ring-navigation.md), selected with
`g → r`; [Adaptive quadrant grid](design-quadrant-grid-navigation.md) remains
available with `g → o`. The strategy choice is session state, not graph
content.

Ben's model (2026-07-21), replacing the cone / cycling / connected-neighbour
approaches. Supersedes the reachability analysis fixes for move-by-node
(`notes/analysis-move-by-node-reachability.md`) — **explicitly no edge
awareness**: navigation is purely spatial.

## Core idea

Treat the **visible** stops as a loose **spreadsheet grid**. On each axis,
sorted stop coordinates are collected into loose, bounded-span bands: the
distance from the first to last coordinate in one band cannot exceed tolerance
`T`. Boundaries lie halfway between neighboring band centers, so the bands
cover the viewport as variable-sized spreadsheet rows and columns. Pressing a
direction moves one fixed row/column that way and snaps to the **goal position**
on the perpendicular axis (the text-editor "goal column" idea, applied to both
axes).

- `g`+`j` (down): move to the next fixed row band and, within it, pick the
  stop nearest the remembered **goalX**. Symmetric for up / left / right.
- Bounded-span clustering intentionally avoids single-linkage chaining. With
  coordinates 0, 10, 20, 30 and `T=12`, the rows are `[0,10]` and `[20,30]`,
  not one 30-pixel-tall row.
- Rows and columns begin as those loose bands. If two spatially distinct stops
  would occupy the same cell, only that ambiguous row or column is split at
  the larger local gap. Refinement repeats until each occupied cell contains
  one stop. This preserves broad alignments elsewhere instead of shrinking the
  global tolerance to accommodate one close pair.
- **Goal memory:** `goalX` is preserved across vertical moves and reset on
  horizontal moves; `goalY` preserved across horizontal moves, reset on
  vertical. So moving down a "column" tracks your x even when a row has no
  stop exactly there, and returns to it when one does — for both axes. Reset
  entirely when the crosshairs move by anything other than a grid step.
- **Tolerance `T`** = the maximum coordinate span of one row/column. Depends
  on the visible stop count `N` (denser view → finer grid): current default
  `T = clamp(180 / sqrt(N), 12, 60)` px, tunable by feel.
- **Tiers unchanged:** the stop set is still nodes (default + labels; coarse
  = nodes only; fine = + waypoints). "No edges" means no connectivity in the
  *selection*, not removing label/waypoint stops.

Each stop belongs to exactly one visible row and column, and the overlay and
movement use the same membership. Each occupied cell has one stop, except for
truly co-located stops with identical centers: no purely spatial model can
distinguish those without inventing a non-spatial ordering.

## Viewport behaviour

- The grid is built from **visible** stops only.
- Moving past the grid edge **shifts the viewport**: if no visible stop lies
  in the pressed direction, pan toward the nearest off-screen stop in that
  direction and land on it (brings it into view). [core: basic pan]
- **Skip arrows** (stage 2): when stops are skipped because they're outside
  the viewport, draw a small arrow at the viewport edge pointing at them,
  fading after a few seconds.

## Grid overlay (stage 2)

While `g` is held, draw the inferred spreadsheet cells as a temporary overlay:
subtle alternating row/column fills, boundaries between bands, highlighted
current row and column, and a stronger current-cell intersection. Hide on
release. This replaces (and suppresses) the ordinary drawing grid rather than
being drawn as another set of centerlines over it. Coarse/default/fine tier
changes rebuild the overlay from the exact stop set used by navigation.

When a gap forces a temporary landing away from the remembered goal column
(during vertical travel) or goal row (during horizontal travel), a stronger
dashed guide appears at that axis. It shows where a later same-axis step will
try to return, then disappears once the crosshairs reacquire it; the existing
active-band highlight is enough while already on the goal.

Because midpoint boundaries can cross wide nodes and labels, every stop also
gets a small **band-membership crosshair**. Its horizontal arm uses the light
or dark cadence of the stop's row, while its vertical arm uses the cadence of
its column. The arms have a node-fill halo so they remain legible on top of an
item. This is static rather than blinking: it gives the same membership cue
without adding a viewport-wide animation or synchronisation burden.

## Build stages

1. **Core (done):** viewport-relative grid step + goal-column memory
   (both axes) + basic viewport pan to off-screen stops. Revert the
   connected-neighbour / cone / cycling selection.
2. **Spreadsheet-band overlay (done):** filled bands and midpoint boundaries
   shared with the navigation model while `g` is held.
3. **Cell disambiguation + goal guide (done):** locally split ambiguous cells
   to one stop each; draw the remembered return row/column.
4. **Strategy slot (done):** preserve this implementation as Adaptive band
   grid, selectable with `g → e`, before adding competing experiments.
5. **Per-item membership markers (done):** row/column-coded micro-crosshairs
   disambiguate wide items crossed by inferred boundaries.
6. Skip arrows with fade.
7. Tune `T` and the boundary construction by feel.

## Open questions / defaults chosen

- `T` formula: chose `clamp(180/sqrt(N), 12, 60)`; revisit by feel.
- "Same row" uses primary-axis proximity only (not 2-D cells); simpler and
  enough for initial grouping. Cell refinement adds the 2-D uniqueness
  constraint afterward.
- Midpoint boundaries remain an inferred visual aid rather than a claim that
  the diagram has literal rows and columns. Their intuitiveness is still under
  live evaluation.
- Grow-mode target hop keeps its own cone + cycling (a different flow that
  *is* about connecting) — unaffected by this.
