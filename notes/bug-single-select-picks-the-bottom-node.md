---
title: SINGLE_ITEM_TOGGLE_SELECT picks the bottom node, and nothing sends it
type: bug
---

# SINGLE_ITEM_TOGGLE_SELECT picks the bottom node, and nothing sends it

Where two nodes overlap under the crosshairs, the select commands disagree
about which one they mean (inferred, 2026-09-23 — seen in the browser, with the
"basic" sample's Process node moved over Start and drawn on top of it):

| Handler | Picks |
|---|---|
| `singleItemSelect` (`SINGLE_ITEM_TOGGLE_SELECT`) | Start — the node *underneath* |
| `ensureTopItemSelected` (`MULTI_ITEM_SELECT`, the held select key) | Process — the node on top |
| `toggleTopItemSelection` (the quick tap of the select key) | Process |

`singleItemSelect` takes the first node (and edge) the crosshairs probe finds,
which is insertion order; the others take the topmost by z-index. Their
comments say they share one priority ("Same priority as singleItemSelect"), so
the code and its comments disagree. The same split applies to overlapping
edges.

It does not reach users today: no key sends `SINGLE_ITEM_TOGGLE_SELECT` any
more (`c` became Clear Selection), only `tools/qa/edges/waypoint-select.js`
does. Since 2026-09-23 the other three share one `topItemUnderCrosshairs()`;
`singleItemSelect` was left as it is, because routing it through that would
change which node it picks.

## Options

1. **Route it through `topItemUnderCrosshairs()`**, so every select means the
   same item. Small, and matches the comments.
2. **Retire the command**, since no key sends it: remove the case, its
   handler, and the script's use of it.

Ben's call.

Related: [`bug-node-target-filter-order.md`](bug-node-target-filter-order.md).
