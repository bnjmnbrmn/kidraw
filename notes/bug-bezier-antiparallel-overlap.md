---
title: Bezier-route anti-parallel edges overlap
type: bug
status: fixed
---

# Bezier-route anti-parallel edges overlap

With `bezier-route-edges` (`b → ;`), two anti-parallel edges between the same node pair (A→B and B→A) overlapped exactly, visually appearing as a single bidirectional edge. Observed 2026-05-10. Confirmed by routing-eval round-1 feedback on the `bezier-route|anti-parallel` and `bezier-route|hub-spoke` cells (both rated 1/5, "Overlapping").

## Root cause

The lane-offset logic in `bezier-route-edges.ts` already grouped edges by an unordered key, but `routeOneEdge` then applied the scalar offset along each edge's *local* perpendicular (`-dy/len, dx/len` computed from that edge's own src→end direction). For A→B the local perp pointed one way; for B→A it pointed the opposite way. Combined with opposite-sign offsets from `idx - (N-1)/2`, the two effects cancelled and both edges landed on the same side of the chord.

## Fix

Introduced a `LaneInfo` struct that carries the group's *canonical* perpendicular (computed once per group from the lower-id endpoint, identical for every member) plus the signed offset along it. `routeOneEdge`, `clampToLaneBand`, and `optimizeMiddleCps` now all reference that canonical perp rather than the edge-local one. This matches the pattern already in `charged-spring-edges` / `flexible-wire-edges` / `weighted-chain-edges`, and the shared `canonicalPairKey` helper is now used here too.

After the fix, A→B and B→A land in distinct lanes on opposite sides of the chord, visibly separated.

## Scope

Only `bezier-route-edges` was affected; the physics-based routers already grouped by unordered pair and used the canonical perpendicular correctly.
