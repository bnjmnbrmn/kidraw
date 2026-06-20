/// <reference lib="webworker" />
//
// Routing Web Worker. Runs the production routing pipeline (desiderata = bf-wc
// + refinement pass) off the main thread so the UI stays responsive and the
// caller can enforce a wall-clock timeout by terminating this worker.
//
// The routing functions only read a Konva-free, pure-geometry subset of
// DANode/DAEdge (their concrete imports are type-only), so we rebuild that
// subset here from the serialized request, route, and post the resulting
// control points back. The main thread applies them to the live edges.

import { applyDesiderataRouteEdges, DEFAULT_OPTIONS } from './desiderata-route-edges';
import { RoutingNode, RoutingEdge } from './routing-worker-geometry';
import type { DANode } from './da-node';
import type { DAEdge } from './da-edge';
import type { RoutingRequest, RoutingResponse, SerializedEdge } from './routing-worker-messages';

addEventListener('message', ({ data }: MessageEvent<RoutingRequest>) => {
  const nodeById = new Map<string, RoutingNode>();
  for (const n of data.nodes) {
    nodeById.set(n.id, new RoutingNode(n.id, n.x, n.y, n.width, n.height, n.shape));
  }

  const build = (e: SerializedEdge): RoutingEdge => {
    const edge = new RoutingEdge(e.id, nodeById.get(e.srcId)!, nodeById.get(e.destId)!);
    if (e.controlPoints) edge.setControlPoints(e.controlPoints);
    return edge;
  };

  const routeEdges = data.routeEdges.map(build);
  const frozenEdges = data.frozenEdges.map(build);
  const nodes = Array.from(nodeById.values());

  // The routing pipeline is typed to DANode/DAEdge but only duck-types the
  // geometry surface our RoutingNode/RoutingEdge provide — cast at the boundary.
  applyDesiderataRouteEdges(
    nodes as unknown as DANode[],
    routeEdges as unknown as DAEdge[],
    DEFAULT_OPTIONS,
    undefined,
    frozenEdges as unknown as DAEdge[],
  );

  const response: RoutingResponse = {
    edges: routeEdges.map(e => ({
      id: e.id,
      controlPoints: e.controlPoints.map(p => ({ x: p.x, y: p.y })),
    })),
  };
  postMessage(response);
});
