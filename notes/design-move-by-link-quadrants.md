---
title: Move by Link — quadrant navigation
status: implemented
date: 2026-08-04
---

# Move by Link — quadrant navigation

Root `f` is a held submenu labeled **Move by Link...**. While it is held, the
active key profile's movement keys focus or traverse incident links directly
on the canvas. Releasing `f` traverses the focused link and then exits; with no
focus it simply exits. No popup, ghost copy, or row-list navigation
participates in this interaction.

Entry always has a concrete node anchor. If the crosshairs are not already on
a node, they jump to the nearest node before navigation starts. An incident
edge is highlighted immediately: continued journeys prefer the edge best
aligned with their incoming momentum, while cold starts choose the first edge
clockwise from North. That entry highlight is a release-to-walk preview; the
first NSEW key still chooses its requested quadrant independently.

## Direction model

The active key profile's movement keys address four 45° NSEW quadrants. An
incident edge is classified by its rendered tangent leaving the current node:
the source tangent as-is, or the destination tangent reversed. Bearing to the
other node is the fallback for a degenerate path.

- With no directional focus, a key focuses the link closest to that
  quadrant's center ray.
- Pressing a perpendicular direction scans links in that screen direction
  within the current quadrant.
- At the end of a quadrant it crosses the corner into the requested quadrant:
  for example, moving down from the bottom West link chooses the leftmost
  South link.
- Pressing the direction that matches the focused link's quadrant walks that
  link, moves the crosshairs to the landing node, and starts a fresh quadrant
  choice there while `f` remains held.
- Pressing the opposite direction chooses a central link in that opposite
  quadrant.

The focus is `DAEdge.navFocused`, not graph selection, and is never serialized.
Vim-style `Ctrl+O` / `Ctrl+I` jump history continues to record landings.
Four dashed 45° rays through the current source show the exact boundaries of
the North, East, South, and West quadrants. A translucent wash marks the
quadrant containing the focused link. Both use screen-stable crosshair styling,
move to each landing while the mode remains held, and disappear on release.

Pure geometry lives in `drawing-area/graph-nav.ts`; the keymenu emits explicit
enter/move/release commands for the held surface. Add-edge target selection reuses
the same quadrant cursor over candidate nodes, so its `hjkl` behavior matches
Move by Link. `tools/repro-next-five.js` covers the canonical West scan,
West→South corner transition, same-direction traversal, release traversal, and
matching add-edge targeting in a real browser.

Related: [move-by-node reachability analysis](analysis-move-by-node-reachability.md),
[original nav popup idea](idea-nav-popup.md).
