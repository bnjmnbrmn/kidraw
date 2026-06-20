// Message shapes exchanged with routing.worker.ts. Plain data only (structured
// clone) — no class instances cross the worker boundary.

import type { NodeShape } from './routing-worker-geometry';

export interface SerializedNode {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  shape: NodeShape;
}

export interface SerializedEdge {
  id: string;
  srcId: string;
  destId: string;
  /** Present for frozen (obstacle) edges so the worker can reproduce their
   *  rendered path; omitted for edges being routed. */
  controlPoints?: { x: number; y: number }[];
}

export interface RoutingRequest {
  nodes: SerializedNode[];
  /** Edges to route. */
  routeEdges: SerializedEdge[];
  /** Edges that stay put but act as obstacles (subset routing). */
  frozenEdges: SerializedEdge[];
}

export interface RoutedEdge {
  id: string;
  controlPoints: { x: number; y: number }[];
}

export interface RoutingResponse {
  edges: RoutedEdge[];
}
