---
title: Other layout libraries (ELK, cola.js, Graphviz, dagre, yFiles)
type: research
---

# Other layout libraries

For context beyond [libavoid](research-libavoid-integration.md). Most relevant once kidraw adds an auto-arrange mode (Problem A in [research-edge-routing-overview](research-edge-routing-overview.md)).

## ELK / elkjs ⭐ best for Problem A

Eclipse Layout Kernel — the most configurable open-source layout system. Java original, ported to JavaScript.

- Supports `ORTHOGONAL`, `POLYLINE`, and `SPLINES` edge routing.
- Layered Sugiyama-style algorithm good for DAGs and hierarchical graphs.
- Handles crossing minimisation, bend minimisation, node-overlap removal.

`SPLINES` has two modes: `CONSERVATIVE` (proper node avoidance, slightly stiff) and `SLOPPY` (curvier, may occasionally clip nodes).

**Limitation for kidraw's current use.** ELK moves nodes too — it's a full layout engine. For the "user-positioned nodes, just route edges" case, libavoid is better. ELK becomes relevant when kidraw adds an "auto-arrange" command.

- [elkjs GitHub](https://github.com/kieler/elkjs)
- [ELK edge-routing reference](https://eclipse.dev/elk/reference/options/org-eclipse-elk-edgeRouting.html)
- [ELK layered algorithm](https://eclipse.dev/elk/reference/algorithms/org-eclipse-elk-layered.html)

## cola.js / WebCola

Constraint-based layout. Force-directed simulation with hard constraints.

- Good for non-hierarchical graphs (kidraw doesn't force hierarchy).
- `avoidOverlaps: true` keeps nodes from sliding over each other.
- Supports alignment and separation constraints.

**Limitation.** Doesn't do sophisticated edge routing on its own — combine with libavoid or manual routing. It positions nodes; routing is separate.

- [WebCola GitHub](https://github.com/tgdwyer/WebCola)

## Graphviz (via viz.js or @hpcc-js/wasm)

The classic graph-drawing system. `dot` for hierarchical, `neato` / `fdp` for force-directed.

- `splines=true` routes edges as splines around nodes.
- `overlap=prism` removes node overlaps (Prism algorithm).
- `sep` / `esep` control clearance margins for edge routing.

**Limitation.** Graphviz takes full control of layout — not suitable for "keep user-positioned nodes, just route edges." It's all-or-nothing.

## dagre — not recommended

Unmaintained (last development 2018). Occasional inexplicable routing decisions. No obstacle avoidance. ELK is strictly better.

## yFiles — not recommended

Comprehensive commercial library with excellent routing. Very expensive licensing. Not suitable for an open / indie project.

## Crossing minimisation

NP-hard in general. Practical approaches in active use:

- **Sugiyama layered crossing minimisation** — reorder nodes within layers. ELK, Graphviz DOT.
- **Force-directed nudging** — repulsive forces push edges apart. cola.js, organic layouts.
- **libavoid's `crossingPenalty`** — penalty per crossing during routing; router tries to minimise. Directly applicable to kidraw.
- **Edge bundling** — group similar edges into bundles. Reduces clutter; trades crossings for bundles.

## Bend minimisation

NP-hard in general; polynomial-time only for planar orthogonal with a fixed embedding (Tamassia 1987, network flow). Practical approaches:

- **libavoid's `segmentPenalty`** — A* router finds routes minimising total penalty.
- **Orthogonal layout algorithms** — some ELK algorithms explicitly minimise bends.
- **Visibility graph routing** — route through the visibility graph (lines of sight between node corners); naturally low-bend.

For kidraw, libavoid handles this automatically. Tuning `segmentPenalty` against `crossingPenalty` gives the bends-vs-crossings knob.
