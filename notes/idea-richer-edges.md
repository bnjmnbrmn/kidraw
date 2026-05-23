---
title: Richer edge kinds (self-loops, parallels, dangling, grouping)
type: idea
---

# Richer edge kinds

Edge features that aren't yet supported but recur in real diagrams.

- **Self-linking edges.** An edge from a node back to itself. Needs ≥3 control points to form a visible loop.
- **Parallel edges.** Multiple edges between the same node pair. Routers (charged-spring, flexible-wire, weighted-chain) already group parallels by unordered pair; bezier-route still keys by ordered pair — see [bug-bezier-antiparallel-overlap](bug-bezier-antiparallel-overlap.md).
- **Dangling edges.** Links from / to nowhere. Useful for "this connects to something off-diagram" or for in-progress diagrams.
- **Grouping shapes.** Lines or boxes around sets of nodes (think "subsystem boundary"). Different from a node — not a vertex in the graph.
