---
title: Post-layout edge quality — crossings and wiggles the router introduces
type: idea
status: analyzed 2026-07-14, not started
---

# Post-layout edge quality

**Symptom (Ben, 2026-07-13):** on the big next.org todo graph, edges cross or
have strange wiggles after tree layout; same class of problem after force and
other node layouts. "For trees, it shouldn't be necessary for edges to cross."

## Measured facts (next.kidraw.yaml, 2026-07-14)

- 61 nodes, 60 edges, **zero nodes with more than one incoming edge — it is a
  pure tree**. After `treeLayout` (subtree-interval construction), straight
  tree edges are **crossing-free by construction**. Every crossing and every
  wiggle on this graph is *introduced* by the auto-route step that layouts now
  run (`d9a2037`).
- Fan-out distribution: one **18-way fan**, one 10-way, one 4-way. This matters
  below.
- Matches the known issue recorded with the tree-layout work: "IDv3 can
  *introduce* a few crossings on long fan edges where straight lines had none
  (4 on the 61-node tree)."

## Root causes (from `routing-local-score.ts`)

1. **Crossings rank below clearance.** The desiderata order puts node
   clearance (5) and edge clearance (6) above non-sibling crossings (7). The
   router will happily buy 36px of node clearance or 30px of edge clearance
   with a detour that *creates* a crossing or a bow. That trade is right for
   hand-drawn dense graphs; it is exactly wrong immediately after a tree
   layout, where the straight baseline is globally crossing-free.
2. **No straight-baseline comparison.** A candidate is scored absolutely,
   never against "what would the straight chord do?". So the router cannot
   know that its detour is a strict regression (introduces a crossing the
   straight line didn't have). The straightness exemption
   (`satisfiedGrazeClearance`) only waives *clearance* for already-straight
   routes; nothing waives *detours*.
3. **Fan rules don't scale with fan degree.** `satisfiedIncidentAngleDeg: 22`
   demands 22° between approaches at a shared node — an 18-way fan needs
   396° > 360°: **unsatisfiable**. Same for `satisfiedFanSeparation: 28px`
   interiors inside one wedge. The hill-climb chases an impossible objective;
   the leftover gradient shows up as wiggles on the fan edges. This is Ben's
   "rules about how closely near-parallel edges can be, especially around
   nodes they both come into or out of".

## Improvement directions

Ordered roughly by (impact / effort):

1. **No-new-crossings vs. the straight baseline (hard-ish rule).** Before
   scoring candidates for an edge, compute the straight chord's hard failures
   and crossing count. A candidate that introduces a crossing the baseline
   didn't have is rejected (or ranked below every non-worsening candidate)
   unless the baseline itself has a hard failure (node pierce). Cheap: the
   baseline is one extra scoring call per edge.
2. **Straight-line reversion pass.** After routing (and after layout
   auto-route in particular), for each edge compare the routed polyline with
   the straight chord: if the chord has no hard failures and no more
   crossings, take the chord. Kills residual wiggles wholesale. IDv3's
   symmetric-arc collapse is a special case of this.
3. **Degree-aware fan demands.** Replace the fixed
   `satisfiedIncidentAngleDeg` with `min(fixed, wedge/degree)` — e.g. an
   18-way fan within a 360° hub can only ask ~20°/edge; a 10-way fan inside a
   90° tree wedge asks 9°. Same scaling for `satisfiedFanSeparation`. A rule
   that cannot be satisfied should degrade to "as even as possible" instead
   of pushing edges into detours.
4. **Post-layout routing profile.** Layouts know they just produced clean
   geometry; pass a profile to `APPLY_EDGE_ROUTING`/`routeNewEdgeIncrementally`
   that (a) ranks crossings above soft clearance, (b) enables 1+2, (c) relaxes
   fan separation. Tree layouts could go further: **route only non-tree
   edges** (on this graph: none) and leave tree edges straight.
5. **Hub exclusion relative to layout spacing.** `fanHubExclusion: 90` is
   node-half-diagonal-ish; tree rings sit 170+ apart and wide fit-cards are
   much bigger. Fan edges necessarily converge near the hub — measure fan
   separation only in the middle third of the paths, or scale the exclusion
   with the incident node's box diagonal.
6. **Ports (bigger change).** Distribute edge endpoints along the node face
   instead of aiming at the center, so big fans separate at the perimeter by
   construction. Overlaps with the libavoid/nudging research
   (`graph-layout-research.md`); don't start here.

**First step when picked up:** load next.kidraw.yaml in the harness, count
crossings for straight-vs-routed to confirm the baseline is 0, then implement
(1)+(2) behind a flag and re-measure. The routing-eval harness already has the
scenario machinery; add a "post-tree-layout" scenario built from a real tidy
tree with an 18-way fan.

## Measured on real datasets (2026-07-14, tools/layout-metrics.js)

| dataset | layout | pierces | crossings | x-columns (vs depths) |
| :-- | :-- | --: | --: | --: |
| next (pure tree) | tree-right | 1 | 0 | 6 (6) |
| next (pure tree) | tree-right-clear | **0** | **0** | **6 (6), 0px dev** |
| next (pure tree) | force-clear | 1 | 28 | 48 (6) |
| kidraw-dev (non-tree) | tree-right | 7 | 13 | 4 (3) |
| kidraw-dev (non-tree) | tree-right-clear | 9 | 10 | 4 (3), 0px dev |
| kidraw-dev (non-tree) | force-clear | 0 | 39 | 38 (3) |

Reading: the tree-clear guarantee holds perfectly on the real tree; on the
non-tree dataset **every pierce and crossing comes from the straight
non-tree edges** (depends-on/serves cross-links) that tree-clear leaves
unrouted. The concrete next step is the *post-layout routing profile*
narrowed to exactly that: after tree-clear, route ONLY the non-tree edges
(tree edges stay straight) with the no-new-crossings rule. Force trades the
other way: pierce-free but crossing chaos (28–39) — wrong tool for
hierarchical todo graphs. Column alignment is essentially perfect for tree
layouts even on non-trees.

## In/out fan separation (Ben, 2026-07-14)

For *routed* graphs, refine the fan terms directionally: at a shared node,
an incoming/outgoing pair should demand **more** angular separation than
outgoing/outgoing or incoming/incoming pairs — direction groups should read
as groups. Concretely: `satisfiedIncidentAngleDeg` becomes a pair-class
function (opposite-direction pairs get the larger threshold; same-direction
pairs can pack tighter, scaled by fan degree per the fix list above). The
gather rework already realizes this macro-scale (ancestors left wedge,
descendants right wedge, clear margins between groups —
[idea-gather-recursive](idea-gather-recursive.md)); this item is the
router-level version.

Related: [plan-incremental-desiderata-v3](plan-incremental-desiderata-v3.md),
[idea-incremental-edge-routing](idea-incremental-edge-routing.md),
dev-status "Tree layouts" item (known 4-crossing regression).
