/// <reference lib="webworker" />
//
// Routing Web Worker. Runs the chosen edge-routing algorithm off the main
// thread so the UI stays responsive and the caller can enforce a wall-clock
// timeout by terminating this worker.
//
// The routing functions only read a Konva-free, pure-geometry subset of
// DANode/DAEdge (their concrete imports are type-only), so we rebuild that
// subset here from the serialized request, route, and post the resulting
// control points back. The main thread applies them to the live edges.

import {
  applyBezierFitWeightedChainEdges,
  DEFAULT_OPTIONS as BFWC_FIT_DEFAULTS,
  DEFAULT_WC_OPTIONS as BFWC_WC_DEFAULTS,
} from './bezier-fit-weighted-chain-edges';
import {
  applyDesiderataRouteEdges,
  DEFAULT_OPTIONS as DESIDERATA_DEFAULTS,
} from './desiderata-route-edges';
import {
  applyIncrementalDesiderataRouteEdges,
  DEFAULT_OPTIONS as INCREMENTAL_DEFAULTS,
} from './incremental-desiderata-route-edges';
import {
  applyIncrementalDesiderataV3RouteEdges,
  DEFAULT_OPTIONS as INCREMENTAL_V3_DEFAULTS,
} from './incremental-desiderata-v3-route-edges';
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

  // The routers are typed to DANode/DAEdge but only duck-type the geometry
  // surface our RoutingNode/RoutingEdge provide — cast at the boundary.
  const n = nodes as unknown as DANode[];
  const re = routeEdges as unknown as DAEdge[];
  const fe = frozenEdges as unknown as DAEdge[];

  let uncleanEdgeIds: string[] | undefined;
  let budgetHit: boolean | undefined;

  switch (data.algorithm) {
    case 'bezier-fit-weighted-chain':
      applyBezierFitWeightedChainEdges(n, re, BFWC_FIT_DEFAULTS, BFWC_WC_DEFAULTS, undefined, fe);
      break;
    case 'incremental-desiderata-v2': {
      const stats = applyIncrementalDesiderataRouteEdges(n, re, INCREMENTAL_DEFAULTS, undefined, fe);
      uncleanEdgeIds = stats.uncleanEdges;
      budgetHit = stats.budgetHit;
      break;
    }
    case 'incremental-desiderata-v3': {
      const stats = applyIncrementalDesiderataV3RouteEdges(n, re, INCREMENTAL_V3_DEFAULTS, undefined, fe);
      uncleanEdgeIds = stats.uncleanEdges;
      budgetHit = stats.budgetHit;
      break;
    }
    case 'desiderata':
    default:
      applyDesiderataRouteEdges(n, re, DESIDERATA_DEFAULTS, undefined, fe);
      break;
  }

  const response: RoutingResponse = {
    edges: routeEdges.map(e => ({
      id: e.id,
      controlPoints: e.controlPoints.map(p => ({ x: p.x, y: p.y })),
    })),
    uncleanEdgeIds,
    budgetHit,
  };
  postMessage(response);
});
