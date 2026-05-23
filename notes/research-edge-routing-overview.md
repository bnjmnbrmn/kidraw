---
title: Edge routing — terminology and two-problem framing
type: research
---

# Edge routing — terminology and two-problem framing

_Original research: 2026-04-17 (async)._

## Terminology

What kidraw calls **waypoints** is **bends** or **bend points** in graph-drawing literature. Edges are described as **polylines** (sequences of straight segments connected at bends). Minimising bend count is **bend minimisation**. "Control points" is reserved for Bezier / spline curves.

**Obstacle avoidance** or **node-obstacle routing** is the formal name for routing edges around nodes they don't connect to, maintaining a **clearance distance**. Well-studied; the core feature of libavoid.

Both bend minimisation and crossing minimisation are NP-hard in the general case. Real-world tools use heuristics with tunable penalty weights for each.

## Edge routing types

| Type | Description | Bends | Notes |
| :--- | :--- | :--- | :--- |
| **Straight** | Single line between endpoints | 0 | Simplest; passes through nodes |
| **Polyline** | Straight segments at bend points | N | Most flexible; what kidraw uses |
| **Orthogonal** | Polyline restricted to 90° turns | N | Clean, structured look; flowcharts |
| **Spline / organic** | Smooth Bezier curves through control points | ~0 visible | Looks fluid; control points ≈ bends |

For kidraw, **polyline** is the natural type (already how waypoints work). **Orthogonal** would be a distinct visual mode. **Spline** is an enhancement for smoother edges.

## The two distinct problems

This is the most important framing distinction:

- **Problem A — Auto-layout.** Rearrange node positions AND route edges. "Lay this graph out nicely from scratch." Libraries: ELK, dagre, cola.js, Graphviz.
- **Problem B — Edge routing only.** Nodes are already positioned (by the user, or previously). Route edges without moving nodes. Library: **libavoid**.

**Kidraw is primarily a Problem B tool** — users place nodes by hand and want edges to route intelligently around them. This is different from most layout-algorithm discussions, which assume rearranging everything.

The `b` submenu does mix both: some entries (force-directed, tree, grid, circular, radial) move nodes (Problem A); others (charged-spring, bezier-route, flexible-wire, weighted-chain) only adjust edges (Problem B).

## Ben's physical model (2026-04-22)

The framing the current physics routers use:

**Each edge is a charged wire spring.**

- **Spring** — elastic, wants to be short and straight; resists bending.
- **Charged** — repels other edges and nearby unconnected nodes.

Equilibrium is where spring tension and repulsion forces balance.

**Implementation insight:** repulsion should be computed between the *geometrically nearest points* on each edge (segment-to-segment distance), not between waypoints at matching indices. Waypoint-indexed repulsion causes asymmetries when edges have different numbers of waypoints or different parameterisations.

**Two-level routing:** physics handles the free portions of edges; hard constraints (invisible obstacle nodes) handle routing around actual nodes and boundaries. Libavoid-js may be useful for the constraint layer.

## Recommended path

- **Near-term.** Integrate libavoid-js for proper obstacle-avoiding polyline routing. See [research-libavoid-integration](research-libavoid-integration.md). Output bend points map directly to `DAWaypoint`.
- **Medium-term.** Add ELK for an "auto-arrange" mode. See [research-other-layout-libraries](research-other-layout-libraries.md).
- **Differentiator R&D.** Implement non-orthogonal polyline nudging — libavoid's nudging is orthogonal-only. See [research-polyline-nudging](research-polyline-nudging.md).
- **Smoothing.** Once polyline routing is solid, render edges as Bezier curves via standard smoothing of the bend sequence.

## Key papers

- [Tamassia 1987 — bend minimization via network flow](https://epubs.siam.org/doi/10.1137/040614086)
- [Gansner et al. — Graphviz/DOT edge routing](https://www.graphviz.org/documentation/TSE93.pdf)
- [Orthogonal Connector Routing (Wybrow et al.)](https://people.eng.unimelb.edu.au/pstuckey/papers/gd09.pdf)
- [Edge Crossing Minimization Survey](https://aftabhussain.github.io/documents/pubs/tech-report10-cross-min.pdf)
- [Bend minimization — Wikipedia](https://en.wikipedia.org/wiki/Bend_minimization)
