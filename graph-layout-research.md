# Graph Layout Research — Edge Routing & Bend Minimization

_Researched: 2026-04-17 (async, while Ben slept)_

---

## Ben's Physical Model for Elastic Edge Routing (2026-04-22)

**The framing:** Each edge is a **charged wire spring**.
- **Spring** — elastic, wants to be short and straight; resists bending
- **Charged** — repels other edges and nearby unconnected nodes

Equilibrium is where spring tension and repulsion forces balance.

**Key implementation insight:** Repulsion should be computed between the geometrically nearest points on each edge (segment-to-segment distance), not between waypoints at matching indices. Waypoint-indexed repulsion causes asymmetries when edges have different numbers of waypoints or different parameterizations.

**Two-level routing:** Physics handles the free portions of edges; hard constraints (invisible obstacle nodes) handle routing around actual nodes and boundaries. Libavoid-js may be useful for the constraint layer.

---

## Your Questions, Answered Up Front

**What's the official term for KiDraw's "waypoints"?**
In graph drawing literature, they're called **bends** or **bend points**. The edges themselves are described as **polylines** (sequences of straight segments connected at bends). The problem of minimizing their count is called **bend minimization**. "Control points" is used specifically for Bezier/spline curves. "Waypoints" is a fine user-facing term; just know what to search for academically.

**Can edges route around nodes instead of through them?**
Yes — this is called **obstacle avoidance** or **node-obstacle routing** and is well-studied. It's the core feature of several libraries (especially libavoid). The formal requirement is that edges maintain a **clearance distance** from nodes they don't connect to.

**Can you minimize crossings and bends simultaneously?**
Yes, with caveats. Both problems are NP-hard in the general case, so algorithms use heuristics. You can tune tradeoffs: fewer crossings often means more bends, and vice versa. Most routing libraries let you configure penalty weights for each.

---

## The Two Distinct Problems

This is the most important framing distinction for KiDraw:

### Problem A: Auto-Layout
Rearrange node positions AND route edges to produce an optimal drawing. Used when you want to say "lay this graph out nicely from scratch." Libraries: ELK, dagre, cola.js, Graphviz.

### Problem B: Edge Routing Only (nodes fixed)
Nodes are already positioned (by the user, or previously). Route edges around them without moving nodes. Used in interactive editors where users place things manually. Library: **libavoid**.

**KiDraw is primarily a Problem B tool** — users place nodes by hand with the keyboard, and you want edges to route intelligently around them. This is different from most layout algorithm discussions, which assume you want to rearrange everything.

That said, KiDraw's `project-todos.md` mentions auto-layout (dagre/elkjs) as a future feature. Both problems will eventually be relevant.

---

## Edge Routing Types (Universal Terminology)

| Type | Description | Bends | Notes |
|------|-------------|-------|-------|
| **Straight** | Single straight line between endpoints | 0 | Simplest; passes through nodes |
| **Polyline** | Sequence of straight segments at bend points | N | Most flexible; what KiDraw uses |
| **Orthogonal** | Polyline restricted to 90° turns only | N | Clean, structured look; common in flowcharts |
| **Spline / Organic** | Smooth Bezier curves through control points | ~0 visible | Looks fluid; control points ≈ bends conceptually |

For KiDraw, **polyline** is the natural type (already how waypoints work). **Orthogonal** would be a distinct visual mode. **Spline** is a potential enhancement to make edges look smoother.

---

## Library Recommendations

### 1. libavoid / libavoid-js ⭐ (Best for Problem B)

**What it is:** A C++ library specifically built for interactive diagram editors, ported to JavaScript via WebAssembly. Used in Inkscape, JointJS, Sprotty, and others.

**Why it's the right fit for KiDraw:**
- Designed exactly for the "nodes are fixed, route edges around them" problem
- Supports both polyline and orthogonal routing
- Obstacle avoidance is the primary feature — edges won't pass through nodes
- Handles parallel edge separation (nudging)
- Interactive: can reroute specific edges incrementally when a node moves, without redoing everything

**Key configurable penalties:**
- `segmentPenalty` — penalizes each bend (minimizes bends)
- `anglePenalty` — penalizes non-orthogonal turns
- `crossingPenalty` — penalizes edge crossings
- `shapeBufferDistance` — minimum clearance around nodes

**JavaScript status:** `libavoid-js` on npm. WASM-based. 8-11× slower than C++ but fine for small/medium graphs. Actively maintained (latest release April 2025, v0.4.5). LGPL-2.1 license.

**Links:**
- [libavoid-js GitHub](https://github.com/Aksem/libavoid-js)
- [libavoid-js npm](https://www.npmjs.com/package/libavoid-js)
- [libavoid overview (Adaptagrams)](https://www.adaptagrams.org/documentation/libavoid.html)
- [JointJS libavoid demo](https://www.jointjs.com/demos/libavoid-standalone-link-routing)
- [ELK blog post on libavoid integration](https://eclipse.dev/elk/blog/posts/2022/22-11-17-libavoid.html)

---

### 2. ELK / elkjs ⭐ (Best for Problem A)

**What it is:** Eclipse Layout Kernel — a comprehensive Java layout system ported to JavaScript. The most configurable open-source graph layout library.

**Why it's relevant:**
- Supports ORTHOGONAL, POLYLINE, and SPLINE edge routing
- The layered algorithm (Sugiyama-style) is good for DAGs and hierarchical graphs
- Handles crossing minimization, bend minimization, and node overlap removal
- Already in KiDraw's `project-todos.md` as a candidate

**Edge routing options:**
- `ORTHOGONAL` — 90° turns only
- `POLYLINE` — straight segments, any angle
- `SPLINES` — Bezier curves with configurable control point assembly
  - `CONSERVATIVE` mode: proper node avoidance but feels stiff
  - `SLOPPY` mode: curvier, may occasionally clip nodes

**Limitation for KiDraw's current use:** ELK moves nodes too — it's a full layout engine. For the "user positioned nodes, just route edges" use case, libavoid is better. ELK becomes relevant when you add the "auto-arrange" feature.

**Links:**
- [elkjs GitHub](https://github.com/kieler/elkjs)
- [ELK edge routing reference](https://eclipse.dev/elk/reference/options/org-eclipse-elk-edgeRouting.html)
- [ELK layered algorithm](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html)

---

### 3. cola.js / WebCola (Good for organic/non-hierarchical Problem A)

**What it is:** Constraint-based layout engine for JavaScript. Unlike ELK/dagre which impose hierarchy, cola.js uses force-directed simulation with hard constraints.

**Why it's relevant:**
- Good for non-hierarchical graphs (KiDraw doesn't force hierarchy)
- `avoidOverlaps: true` prevents nodes from sliding over each other
- Supports alignment and separation constraints
- Works well with D3.js and Cytoscape.js

**Limitation:** Doesn't do sophisticated edge routing on its own — you'd combine it with libavoid or manual routing. It positions nodes well; edge routing is separate.

**Links:**
- [WebCola GitHub](https://github.com/tgdwyer/WebCola)

---

### 4. Graphviz (via viz.js or @hpcc-js/wasm) (Good for directed graphs)

**What it is:** The classic graph drawing system. `neato` and `fdp` engines do force-directed layout; `dot` does hierarchical.

**Relevant features:**
- `splines=true` routes edges as splines around nodes
- `overlap=prism` removes node overlaps (Prism algorithm)
- `sep` and `esep` control clearance margin around nodes for edge routing

**Limitation:** Graphviz takes full control of layout — not suitable for "keep user-positioned nodes, just route edges." It's all-or-nothing.

---

### 5. dagre — Not recommended

Unmaintained (last development 2018). Makes occasional inexplicable edge routing decisions. No obstacle avoidance. ELK is strictly better.

---

### 6. yFiles — Not recommended for KiDraw

Comprehensive commercial library with excellent routing. Very expensive licensing. Not suitable for an open/indie project.

---

## Crossing Minimization — What's Feasible

**The math:** Minimizing edge crossings is NP-hard in general. All real-world tools use heuristics.

**Practical approaches:**
1. **Layered layout crossing minimization (Sugiyama method):** Reorders nodes within layers to minimize crossings. Used by ELK, Graphviz DOT. Only applicable to hierarchical layouts.
2. **Force-directed nudging:** Repulsive forces between edges push them apart. Reduces crossings indirectly. Used in cola.js and organic layouts.
3. **libavoid's crossing penalty:** Charges a penalty per crossing during routing; router tries to minimize. Works for fixed-node routing.
4. **Edge bundling:** Groups parallel/similar edges together into bundles. Reduces visual clutter but doesn't eliminate crossings — trades crossings for bundles.

**For KiDraw:** libavoid's crossing penalty is the most directly applicable. Set `crossingPenalty` to a high value and the router will prefer routes with fewer crossings, at the cost of more bends.

---

## Bend Minimization — What's Feasible

**The math:** For planar orthogonal graphs, bend minimization can be solved in polynomial time (Tamassia 1987, via min-cost network flow). For general graphs or if the planar embedding can change, it's NP-hard.

**Practical approaches:**
1. **Penalty-based routing (libavoid):** `segmentPenalty` charges per bend. The A* router finds routes that minimize total penalty.
2. **Orthogonal layout algorithms:** Some ELK algorithms explicitly minimize bends as an objective.
3. **Visibility graph routing:** Route through the visibility graph (lines of sight between node corners), which naturally finds low-bend paths.

**For KiDraw:** libavoid handles this automatically with `segmentPenalty`. Tuning it relative to `crossingPenalty` lets you control the crossings-vs-bends tradeoff.

---

## Recommended Path for KiDraw

### Near-term: Add libavoid-js for edge routing

When a user triggers "auto-route edges" (or when an edge is created/a node moves), use libavoid-js to compute obstacle-avoiding polyline routes. The output is a set of bend points — which map directly to KiDraw's existing waypoint concept.

**Integration sketch:**
1. Register all nodes as obstacles with their bounding boxes
2. Register all edges as connectors (source node → target node)
3. Call `router.processTransaction()` — libavoid computes routes
4. Read back bend points for each connector
5. Update KiDraw's `DAWaypoint` positions accordingly

This is entirely compatible with KiDraw's current architecture — waypoints already exist as bend points on edges.

**Considerations:**
- WASM loading is async — handle gracefully
- Need to keep libavoid's obstacle registry in sync as nodes are added/moved/deleted
- Can configure penalties to control the crossings-vs-bends tradeoff
- LGPL license means you can use it in a proprietary app as long as you don't modify the library itself

### Medium-term: Add ELK for auto-layout mode

When the user wants "lay this out automatically," use ELK to compute both node positions and edge routes. Offer as a command in the key menu. ELK's POLYLINE or SPLINE routing would be used here.

### Later: Smooth edges (splines)

Once polyline routing works well, add a visual option to render edges as smooth Bezier curves. ELK produces spline control points directly; libavoid produces polyline bends that can be converted to Bezier curves using standard smoothing.

---

## Polyline Segment Nudging — KiDraw Research Plan

_Added: 2026-04-17, based on conversation with Ben_

libavoid's nudging (spacing apart parallel/overlapping connectors) is orthogonal-only. For KiDraw's polyline routing, we'll need to implement this ourselves. This is viewed as a potential differentiator. Three hard sub-problems, each with a specific exploration plan:

### Hard Part 1: Endpoint propagation

When you shift a segment perpendicularly, both its endpoints move, deforming adjacent segments at the bends. For orthogonal routing this is clean (just extends a perpendicular segment); for arbitrary angles you have choices: slide the bend point along the adjacent segment's direction, insert a new short connector segment, etc.

**Plan:** Try a wide variety of approaches on a wide variety of graph shapes and see empirically which feels right visually. No predetermined winner — let the experiments drive the decision.

### Hard Part 2: Iterative instability

Nudging one segment can cause a formerly non-overlapping neighbor to now overlap something else. Naive single-pass nudging doesn't converge.

**Plan:** Explore both approaches:
- **Multi-pass:** Repeatedly detect-and-nudge until stable (or max iterations reached)
- **Constraint-solver:** Model segment positions as variables with minimum-separation constraints; solve globally (e.g. via a simple 1D constraint solver per direction)

### Hard Part 3: Threshold and dynamic spacing

True collinear overlap is rare; more often you have near-parallel visually-cluttered segments. Need to decide what counts as "close enough to nudge."

**Plan:**
- Ensure a reasonable maximum distance between any two segments (hard upper bound on crowding)
- **Dynamic spacing in navigate-by-graph mode:** When an edge is selected, angular neighbors (edges adjacent in clockwise order around the shared node) get more space, distant edges get compressed — a focus+context distortion applied to angular spacing. Example: 10 edges numbered 0–9 clockwise; edge 3 selected → spread 2/3/4 apart more, compress 7/8/9 together. This prioritizes legibility where the user's attention is, at the cost of compressing the far side.

### Performance

All of the above is potentially expensive for large graphs, especially dynamic recomputation on every selection change.

**Plan:** Look into:
- Precomputing nudged layouts and invalidating only affected regions on change
- Incremental updates (only re-nudge edges that share a node with the changed edge)
- Approximations or LOD strategies for large graphs

---

## Key Papers (If You Want to Go Deep)

- [Tamassia 1987 — bend minimization via network flow](https://epubs.siam.org/doi/10.1137/040614086)
- [Gansner et al. — Graphviz/DOT edge routing](https://www.graphviz.org/documentation/TSE93.pdf)
- [Orthogonal Connector Routing (Wybrow et al.)](https://people.eng.unimelb.edu.au/pstuckey/papers/gd09.pdf)
- [Edge Crossing Minimization Survey](https://aftabhussain.github.io/documents/pubs/tech-report10-cross-min.pdf)
- [Bend minimization — Wikipedia](https://en.wikipedia.org/wiki/Bend_minimization)
