---
title: Bezier-route edges pass behind node bodies
type: bug
status: partially-fixed
---

# Bezier-route edges pass behind node bodies

With `bezier-route-edges`, edges that should bend around intervening nodes instead routed straight through them (and out the other side). Worst surfacing was the `sparse` cell in round-1 routing-eval feedback, rated 1/5 with comment *"Edges are going behind nodes. Also, more weird, out of the way routes."* In the original output every singleton edge (5/5 in `sparse`) cut through at least one node body.

## Root cause

Two issues combined:

1. `clampToLaneBand` applied a hard ±laneSpacing/2 (= ±11 px) constraint to every control point — including singleton edges with offset 0. That meant a singleton's cp could only ever sit within 11 px of its straight chord, far too narrow to bend around a 120 px node. Gradient descent that wanted to push the cp perpendicular to clear an obstacle was clamped back to the chord, so the optimizer instead moved the cp along the chord direction (visible in baselines as cps with y values like -44 or +2028, well off-canvas).
2. `findWorstSampleAndDisplace` seeded a new cp with a displacement equal to the distance from the worst sample to the obstacle's center. For a sample on the far side of a distant obstacle this could be hundreds of pixels — combined with no lane clamp it sent cps flying off-canvas.

## Fix (partial mitigation)

In `bezier-route-edges.ts`:

- **Skip the lane-band clamp for singleton edges.** `LaneInfo.clampToBand` is true only when the edge has at least one parallel sibling; singletons get a wider corridor instead.
- **Add a soft `clampToChordCorridor`** that caps a singleton cp's perpendicular distance from the chord at `max(obstacleHalfDim) + 2 * clearance`. Wide enough to bend around any one obstacle, narrow enough that gradient descent can't run off-canvas.
- **Cap the seed displacement** in `findWorstSampleAndDisplace` at `max(obstacleHalfDim) + clearance` instead of using the sample-to-center distance. The seed now lands just past the obstacle's clearance band rather than potentially hundreds of pixels out.

After the fix, `sparse` drops from 5 edges-through-nodes to 2, and no cps end up off-canvas. Every edge that bends does so in a visibly reasonable direction.

## What's still broken (deferred)

The remaining 2/5 edges in `sparse` that still clip node bodies are ones where 2 control points aren't enough to thread between obstacles, or where the optimizer settles into a local minimum that happens to overlap a node. A bend-count bump from 2 to 3-4 would likely fix most of them but increases computation cost and risks wigglier curves in already-clean scenarios — better deferred until either:

- A genuine obstacle-aware router (libavoid integration per `notes/research-libavoid-integration.md`) replaces the gradient-descent approach, OR
- The bend-budget is made adaptive (more cps allowed when more obstacles are along the chord).

This is acceptable as a Round 1 hard-quality-bar fix: it eliminated the worst-case "edge silently teleports through a node" cases, and the remaining clipping is mild grazing rather than full pass-through.

## Scope

`bezier-route-edges.ts` only.
