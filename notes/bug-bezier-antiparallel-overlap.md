---
title: Bezier-route anti-parallel edges overlap
type: bug
status: open
---

# Bezier-route anti-parallel edges overlap

With `bezier-route-edges` (`b → ;`), two anti-parallel edges between the same node pair (A→B and B→A) overlap exactly, visually appearing as a single bidirectional edge. Observed 2026-05-10.

## Why

Likely the lane-offset logic in `bezier-route-edges.ts` keys parallels by *ordered* (src, dest) pair instead of unordered. Anti-parallels then end up in the same single-edge group, get no offset, and route along the same chord.

## How to fix

Switch lane-grouping to use the unordered-pair canonical key — the same `canonicalPairKey` pattern that `charged-spring`, `flexible-wire`, and `weighted-chain` already use. After the fix, A→B and B→A should land in distinct lanes and the rendering should show two visibly separated arrows.

## Scope

Only `bezier-route-edges` is affected; the physics-based routers already group by unordered pair correctly.
