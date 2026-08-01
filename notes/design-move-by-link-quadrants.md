---
title: Move by Link — quadrant navigation
status: implemented
date: 2026-08-01
---

# Move by Link — quadrant navigation

Root `f` is labeled **Move by Link**. It opens the connected-edge popup as a
sticky interaction surface; releasing `f` does not commit the initially
highlighted row. This supersedes the tap-to-follow behavior of the original
Go popup.

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
  link and reopens Move by Link at the landing node.
- Pressing the opposite direction chooses a central link in that opposite
  quadrant.

The focus is `DAEdge.navFocused`, not graph selection, and is never serialized.
The popup's existing fuzzy filter, Enter jump, Tab walk, n/p list browsing,
Escape, source emphasis, ghost preview, and jumplist remain available.

Pure geometry lives in `drawing-area/graph-nav.ts`; profile-aware popup event
handling lives in `nav-popup/`. `tools/repro-next-five.js` covers the canonical
West scan, West→South corner transition, and same-direction traversal in a
real browser.

Related: [move-by-node reachability analysis](analysis-move-by-node-reachability.md),
[original nav popup idea](idea-nav-popup.md).
