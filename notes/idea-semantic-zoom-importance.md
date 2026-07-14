---
title: Semantic zoom — keep important nodes/edges visible when zoomed out
type: idea
---

# Semantic zoom / importance-aware level of detail

**Ben (2026-07-14):** "when zoomed out, I still want important nodes and
edges visible, which maybe means enlarging/thickening them."

At fit-zoom on the 61-node next graph everything shrinks uniformly and the
structure disappears into a thin band of unreadable boxes. The information
should degrade *by importance*, not uniformly.

## Mechanism sketch

The nav-focus band already proves the technique:
`strokeScaleEnabled(false)` gives a Konva stroke constant *screen* width at
any zoom. Generalize to a **screen-size floor**:

- **Important nodes** (categories, goals — by type tag; or high-degree as a
  fallback heuristic) get a minimum on-screen size: when
  `zoom < floor / baseSize`, scale the node's rendered box and font up by
  `floor / (baseSize · zoom)` so it never drops below ~e.g. 60px on screen.
  Konva-side this is a per-node compensating scale on the group, applied on
  zoom change; positions unchanged.
- **Important edges** (e.g. category spines, critical path later) get
  `strokeScaleEnabled(false)` with a modest width so they read at any zoom.
- **Unimportant content culls**: note-type nodes and labels below a
  readable screen size fade out entirely (cheaper than rendering unreadable
  4px text — and less noise). Related: the existing "grid lines too faint
  when zoomed out" UX item is the same zoom-adaptive rendering family.

## Design cautions

- Enlarged nodes overlap when their *screen* footprint exceeds their layout
  spacing at low zoom — cap the compensation (floor, not constant size) and
  accept overlap beyond it, or thin the unimportant neighbors first (cull
  order = inverse importance).
- Hit-testing must use the rendered (compensated) geometry or the crosshairs
  will disagree with what the eye sees.
- Importance source of truth: the type tags from
  [idea-todo-graph-modeling](idea-todo-graph-modeling.md) (category, goal),
  later critical-path/frontier computations. Degree is the fallback for
  untyped graphs.

Prototype cheaply: apply a compensating `group.scale()` to category/goal
nodes on zoom change behind a setting, screenshot the next graph at fit
zoom, compare in the `/shots/` gallery.
