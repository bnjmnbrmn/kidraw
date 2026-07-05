---
title: Zones — semantic groups with visual containers and layout constraints
type: idea
---

# Zones

A **zone** is a named region of the diagram that contains nodes (and implicitly
their internal edges): a swim lane, a layer in an architecture diagram, a
subsystem boundary. This formalizes the "grouping shapes" bullet in
[idea-richer-edges](idea-richer-edges.md).

## Decomposition: three ideas wearing one name

Design discussions about zones go in circles because "zone" conflates three
separable concerns, each with a natural home in the
[HTML/CSS-style format split](../docs/file-format.md):

1. **Semantic membership** — "these items belong to Backend." A graph-document
   fact. Nearly identical to what tags already provide: flat, non-exclusive
   membership over nodes and edges.
2. **Visual container** — a labeled rectangle/band drawn behind the members.
   Pure presentation → style set.
3. **Layout constraint** — members confined to the region (swim lane: fixed
   band) or region bounds derived from members (auto-fit box). The only part
   requiring genuinely new machinery; interacts with edge routing.

Swim lane and "architecture layer" are two *styles/layout policies* of one
concept, not separate concepts.

## Naming

Keep **zone**. "Subgraph" over-promises induced-subgraph semantics; "group"
collides with selection-grouping; "layer" collides with Konva layers in the
codebase. Lane/layer/cluster are styles of a zone.

## Model decisions

- **Not a node.** A zone is its own top-level collection in `semantics`.
  Modeling it as a specially-tagged node would pollute graph semantics (layout
  treats it as a vertex, plain-graph exports get weird).
- **Membership by selector.** `members` is a tag reference or an explicit id
  list. An edge is "in" a zone when both endpoints are members — derived, not
  stored. A node may belong to several zones (unlike Graphviz clusters, which
  require a strict partition — a constant complaint there).
- **Zones are legal edge endpoints.** "web-client → backend-zone" is usually
  the *true* statement in an architecture diagram; the format should allow
  saying it directly. Graphviz can't (edges must be node→node, clipped at the
  cluster border via `lhead`/`ltail` — its most-complained-about wart). The
  rendering-clipped variant (edge semantically targets a member node, drawn
  stopping at the boundary) is a later per-edge style rule, not a model change.
- **Geometry and collapse live in the style set.** Band vs. box, fixed lane
  rect vs. auto-fit, fill, label placement — and `collapsed: true`. Collapse is
  a *view*: same graph document, one display shows the zone as a single box.
  When collapsed, the renderer lifts member-edges to the zone boundary at draw
  time — no graph rewrite. Zone-as-endpoint and collapsed-zone then share one
  rendering path.

Sketch:

```yaml
semantics:
  nodes:
    web-client: { label: Web Client }
    auth-service: { label: Auth Service, tags: [backend] }
  zones:
    backend:
      label: Backend
      members: { tag: backend }
  edges:
    client-calls-backend: { source: web-client, target: backend }
```

## Staging (zones are not MVP)

1. **Tags** (MVP, independently required by the file format) — 80% of zone
   semantics.
2. **Style-only background regions** — a style rule with a tag selector that
   draws an auto-fit rect behind matching items. Zero graph-model or layout
   work; already gives the "layers" look.
3. **Semantic zones** — the `zones` collection + zone-as-endpoint. Additive
   file-format change.
4. **Layout constraints** — lanes, containment, boundary-aware routing.
   Touches the routers; most expensive, last.
5. **Deferred indefinitely: nesting.** Zones-in-zones is where cross-boundary
   edge routing gets hard (see ELK below). Flat zones cover the stated use
   cases; selector membership doesn't preclude nesting later.

## Corner-avoidance guardrails (cheap, decide early)

- **One id namespace** across nodes and zones — validation rejects duplicate
  ids globally, so `target: backend` needs no type prefix.
- **Centralize endpoint validation** — "source/target must be an existing node
  id" should live in one place so relaxing to "node or zone id" is one change.
- **No hidden "everything is a node/edge" assumptions** — undo snapshots and
  the file-format layer should tolerate carrying an additional collection.
- **Don't let grouping sneak in as node-nesting** in the meantime.

## Prior art

- **Graphviz**: `subgraph` (pure grouping), `cluster*` (drawn box + keep-together),
  `rank=same` (alignment) are three separate mechanisms — supporting the
  decomposition above. Clusters as strict partitions and the `lhead`/`ltail`
  edge hack are the anti-patterns to avoid. Graphviz cannot do swim lanes well.
- **ELK / elkjs**: compound/hierarchical graphs with cross-hierarchy edges are
  first-class — the reference implementation to study for stages 4–5. See
  [research-other-layout-libraries](research-other-layout-libraries.md).
