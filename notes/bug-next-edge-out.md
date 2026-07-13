---
title: "Next edge out" doesn't seem to work
type: bug
status: resolved (superseded 2026-07-13)
---

# "Next edge out" doesn't seem to work

User report: the "next edge out" traversal action (in the graph-move submenu) doesn't appear to be working.

**Resolution (2026-07-13):** superseded by the move-by-graph traversal rework
(dev-status Current focus item 13). The suspect machinery — the per-node
traversal index maps (`outgoingTraversalIndexByNode`) and blind cycle logic —
was deleted wholesale. Traversal is now stop-based edge walking with explicit
edge selection (momentum entry pick + clockwise `j`/`k` cycling), pure
geometry in `graph-nav.ts` with unit tests, and end-to-end coverage in
`tools/repro-graph-nav.js` (17 checks including multi-edge cycling at a hub
node — the reported scenario).
