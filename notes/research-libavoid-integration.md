---
title: libavoid-js as the near-term edge-routing integration
type: research
---

# libavoid-js as the near-term edge-routing integration

## Why it's the right fit

libavoid is a C++ library built specifically for interactive diagram editors (Inkscape, JointJS, Sprotty), now available in JavaScript as `libavoid-js` (WebAssembly).

- Designed exactly for "nodes are fixed, route edges around them" — kidraw's primary problem.
- Supports both polyline and orthogonal routing.
- Obstacle avoidance is the primary feature; edges won't pass through nodes.
- Handles parallel-edge separation (nudging — but orthogonal-only; see [research-polyline-nudging](research-polyline-nudging.md) for what's still needed).
- Interactive: can reroute specific edges incrementally when a node moves, without redoing everything.

## Key configurable penalties

- `segmentPenalty` — penalises each bend (minimises bends).
- `anglePenalty` — penalises non-orthogonal turns.
- `crossingPenalty` — penalises edge crossings.
- `shapeBufferDistance` — minimum clearance around nodes.

Tuning these gives the bends-vs-crossings tradeoff knob.

## JavaScript status

`libavoid-js` on npm. WASM-based. 8–11× slower than C++ but fine for small / medium graphs. Actively maintained (latest release April 2025, v0.4.5). LGPL-2.1 — usable in a proprietary app as long as the library itself isn't modified.

- [libavoid-js GitHub](https://github.com/Aksem/libavoid-js)
- [libavoid-js npm](https://www.npmjs.com/package/libavoid-js)
- [libavoid overview (Adaptagrams)](https://www.adaptagrams.org/documentation/libavoid.html)
- [JointJS libavoid demo](https://www.jointjs.com/demos/libavoid-standalone-link-routing)
- [ELK blog on libavoid integration](https://eclipse.dev/elk/blog/posts/2022/22-11-17-libavoid.html)

## Integration sketch

1. Register all nodes as obstacles with their bounding boxes.
2. Register all edges as connectors (source node → target node).
3. Call `router.processTransaction()` — libavoid computes routes.
4. Read back bend points for each connector.
5. Update kidraw's `DAWaypoint` positions accordingly.

The bend points map directly onto the existing `_controlPoints` shape. Compatible with the current architecture.

## Considerations

- WASM loading is async — handle gracefully on first use.
- Keep libavoid's obstacle registry in sync as nodes are added / moved / deleted.
- Configure penalties to control the crossings-vs-bends tradeoff per-graph.
- LGPL implications: don't modify libavoid itself; link to it as-is.
