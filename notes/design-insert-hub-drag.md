# Insert hub: post-insert drag phase

**Status:** shipped 2026-07-18. Answers the dispatched think-task: *"Think
about how to actually insert nodes/edges/etc. I may need to move the i stuff
back to a, so that I can drag the newly created/linked node, or select where
the edge points."*

## The problem

The unified held-`i` hub (same day, see dev-status item 27) dropped a
capability the old held-`a` flow had: after inserting, movement keys dragged
the fresh node into place *before* the release dropped into labelEdit. With
the hub, an insert went straight to labelEdit on release — no positioning
step — which matters most for connected inserts, where the new node lands
wherever the crosshairs happen to be relative to its anchor.

## Decision: drag phase inside the hub, not a return to `a`

Moving insert back to `a` would re-split the edit/insert concept the hub had
just unified, and the drag phase was never intrinsically tied to `a` — it was
a submenu swap. So the swap now lives in the hub, confirmation-driven:

1. Any hub insert (plain `d/c/e/g/x` or connected `u/o`+shape) creates the
   node; the drawing area answers with `node-inserted {labelable}`.
2. On that confirmation the keymenu (a) arms labelEdit-on-release for
   labelable shapes, and (b) collapses any connect child submenu back to the
   hub level and swaps the hub for the **drag submenu** — movement keys now
   drag the fresh (selected) node, edges following live.
3. Releasing `i` ends the phase: labelEdit for labelable shapes, normal mode
   for junction/invisible (which still get the drag phase — positioning a
   junction is exactly when you want it).

Confirmation-driven matters: an anchorless connected insert creates nothing,
sends no confirmation, and therefore neither strands the user in labelEdit
nor swaps the submenu.

Rhythm: `hold i → (hold u) → d → release u → hjkl… → release i → type label`.

## Open: "select where the edge points"

The second half of the think-task. Today a connected insert anchors to the
single selected node, else the traversal's current node. Possible extensions,
deliberately not built yet:

- **Retarget during the drag phase** — while the drag submenu is up, `n`/`p`
  could cycle the edge's anchor among nearby nodes (the fresh node and its
  edge stay put; only the far endpoint moves).
- **Directional anchor pick** — inside the `u`/`o` submenu, movement keys
  pick the anchor by direction from the crosshairs before the shape key
  births the node.
- **Do nothing** — Go-to-node then insert may already cover the real
  workflow, since the traversal current node is the natural anchor.

Waiting on dogfood evidence before choosing.
