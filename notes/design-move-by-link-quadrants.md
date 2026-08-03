---
title: Move by Link — quadrant navigation
status: implemented
date: 2026-08-03
---

# Move by Link — quadrant navigation

Root `f` is a held submenu labeled **Move by Link...**. While it is held, the
active key profile's movement keys focus or traverse incident links directly
on the canvas. Releasing `f` exits and clears the focus. No popup, ghost copy,
or row-list navigation participates in this interaction.

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

Pure geometry lives in `drawing-area/graph-nav.ts`; the keymenu emits explicit
enter/move/exit commands for the held surface. Add-edge target selection reuses
the same quadrant cursor over candidate nodes, so its `hjkl` behavior matches
Move by Link. `tools/repro-next-five.js` covers the canonical West scan,
West→South corner transition, same-direction traversal, held-key exit, and
matching add-edge targeting in a real browser.

Related: [move-by-node reachability analysis](analysis-move-by-node-reachability.md),
[original nav popup idea](idea-nav-popup.md).
