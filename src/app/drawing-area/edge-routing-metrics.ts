import { DANode } from './da-node';
import { DAEdge } from './da-edge';

/** Quality metrics for a routed graph. Hard fails are counts that should
 *  ideally be zero (any nonzero value makes the composite -Infinity). Soft
 *  metrics are continuous values combined via weights to produce a score
 *  for ranking and auto-tuning. */
export interface RoutingMetrics {
  // Hard fails — counts; ideally 0.
  edgesThroughNodes: number;
  siblingCrossings: number;
  selfIntersections: number;
  // Soft.
  totalLength: number;
  totalCurvature: number;
  maxBulgeRatio: number;
  minObstacleClearance: number;
  // Composite.
  hardFailCount: number;
  composite: number;
}

export interface MetricWeights {
  totalLength: number;
  totalCurvature: number;
  maxBulgeRatio: number;
  minObstacleClearance: number;
}

/** Default weights — handed-tuned starting point. Phase 6 will fit these
 *  from A/B picks. Negative weight means "bigger is worse". */
export const DEFAULT_WEIGHTS: MetricWeights = {
  totalLength: -0.01,
  totalCurvature: -2,
  maxBulgeRatio: -50,
  minObstacleClearance: 0.5,
};

interface Box { minX: number; minY: number; maxX: number; maxY: number; }
interface Pt { x: number; y: number; }

export function computeRoutingMetrics(
  nodes: DANode[],
  edges: DAEdge[],
  weights: MetricWeights = DEFAULT_WEIGHTS,
): RoutingMetrics {
  const edgesThroughNodes = countEdgesThroughNodes(nodes, edges);
  const siblingCrossings = countSiblingCrossings(edges);
  const selfIntersections = countSelfIntersections(edges);
  const totalLength = computeTotalLength(edges);
  const totalCurvature = computeTotalCurvature(edges);
  const maxBulgeRatio = computeMaxBulgeRatio(edges);
  const minObstacleClearance = computeMinObstacleClearance(nodes, edges);

  const hardFailCount = edgesThroughNodes + siblingCrossings + selfIntersections;
  const composite = hardFailCount > 0 ? -Infinity
    : weights.totalLength * totalLength
      + weights.totalCurvature * totalCurvature
      + weights.maxBulgeRatio * maxBulgeRatio
      + weights.minObstacleClearance * minObstacleClearance;

  return {
    edgesThroughNodes, siblingCrossings, selfIntersections,
    totalLength, totalCurvature, maxBulgeRatio, minObstacleClearance,
    hardFailCount, composite,
  };
}

function nodeBox(n: DANode, clearance: number = 0): Box {
  const x = n.konvaGroup.x();
  const y = n.konvaGroup.y();
  return {
    minX: x - clearance, minY: y - clearance,
    maxX: x + n.NODE_WIDTH + clearance, maxY: y + n.NODE_HEIGHT + clearance,
  };
}

function strictlyInside(p: Pt, b: Box): boolean {
  return p.x > b.minX && p.x < b.maxX && p.y > b.minY && p.y < b.maxY;
}

/** Get the visible polyline for metrics: skip beads that fall strictly
 *  inside either incident bbox (these are "in-hole" for weighted-chain;
 *  irrelevant for other algos since they don't have such beads). */
function getMetricPolyline(edge: DAEdge): Pt[] {
  const poly = edge.getPathPoints();
  if (poly.length < 2) return poly;
  const srcBox = nodeBox(edge.srcNode);
  const destBox = nodeBox(edge.destNode);
  return poly.filter(p => !strictlyInside(p, srcBox) && !strictlyInside(p, destBox));
}

// --- Hard fails ---

function countEdgesThroughNodes(nodes: DANode[], edges: DAEdge[]): number {
  let count = 0;
  for (const edge of edges) {
    const poly = getMetricPolyline(edge);
    const incident = new Set([edge.srcNode, edge.destNode]);
    let hit = false;
    for (const n of nodes) {
      if (incident.has(n)) continue;
      const box = nodeBox(n);
      for (let i = 0; i < poly.length - 1 && !hit; i++) {
        if (segmentBoxIntersect(poly[i], poly[i + 1], box)) hit = true;
      }
      if (hit) break;
    }
    if (hit) count++;
  }
  return count;
}

function countSiblingCrossings(edges: DAEdge[]): number {
  const byKey = new Map<string, DAEdge[]>();
  for (const e of edges) {
    if (e.srcNode === e.destNode) continue;
    const k = e.srcNode.id < e.destNode.id
      ? `${e.srcNode.id}|${e.destNode.id}`
      : `${e.destNode.id}|${e.srcNode.id}`;
    let arr = byKey.get(k);
    if (!arr) { arr = []; byKey.set(k, arr); }
    arr.push(e);
  }
  let count = 0;
  for (const arr of byKey.values()) {
    if (arr.length < 2) continue;
    const polys = arr.map(getMetricPolyline);
    for (let i = 0; i < polys.length; i++) {
      for (let j = i + 1; j < polys.length; j++) {
        if (interiorPolylineCross(polys[i], polys[j])) count++;
      }
    }
  }
  return count;
}

function countSelfIntersections(edges: DAEdge[]): number {
  let count = 0;
  for (const edge of edges) {
    const poly = getMetricPolyline(edge);
    let found = false;
    for (let i = 0; i < poly.length - 2 && !found; i++) {
      for (let j = i + 2; j < poly.length - 1 && !found; j++) {
        // Skip the wrap-around pair (i=0 with j=last) — endpoints can be
        // adjacent on the perimeter for short edges.
        if (i === 0 && j === poly.length - 2) continue;
        if (segmentsIntersect(poly[i], poly[i + 1], poly[j], poly[j + 1])) found = true;
      }
    }
    if (found) count++;
  }
  return count;
}

// --- Soft metrics ---

function computeTotalLength(edges: DAEdge[]): number {
  let sum = 0;
  for (const edge of edges) {
    const poly = getMetricPolyline(edge);
    for (let i = 0; i < poly.length - 1; i++) {
      sum += Math.hypot(poly[i + 1].x - poly[i].x, poly[i + 1].y - poly[i].y);
    }
  }
  return sum;
}

function computeTotalCurvature(edges: DAEdge[]): number {
  let sum = 0;
  for (const edge of edges) {
    const poly = getMetricPolyline(edge);
    for (let i = 1; i < poly.length - 1; i++) {
      const a = poly[i - 1], b = poly[i], c = poly[i + 1];
      const dx1 = b.x - a.x, dy1 = b.y - a.y;
      const dx2 = c.x - b.x, dy2 = c.y - b.y;
      const len1 = Math.hypot(dx1, dy1) || 1;
      const len2 = Math.hypot(dx2, dy2) || 1;
      const cos = (dx1 * dx2 + dy1 * dy2) / (len1 * len2);
      sum += Math.acos(Math.max(-1, Math.min(1, cos)));
    }
  }
  return sum;
}

function computeMaxBulgeRatio(edges: DAEdge[]): number {
  let max = 0;
  for (const edge of edges) {
    const poly = getMetricPolyline(edge);
    if (poly.length < 2) continue;
    const start = poly[0], end = poly[poly.length - 1];
    const chordLen = Math.hypot(end.x - start.x, end.y - start.y);
    if (chordLen < 1) continue;
    let edgeMax = 0;
    for (let i = 1; i < poly.length - 1; i++) {
      const d = perpDist(poly[i], start, end);
      if (d > edgeMax) edgeMax = d;
    }
    const ratio = edgeMax / chordLen;
    if (ratio > max) max = ratio;
  }
  return max;
}

function computeMinObstacleClearance(nodes: DANode[], edges: DAEdge[]): number {
  let min = Infinity;
  for (const edge of edges) {
    const poly = getMetricPolyline(edge);
    const incident = new Set([edge.srcNode, edge.destNode]);
    for (const n of nodes) {
      if (incident.has(n)) continue;
      const box = nodeBox(n);
      for (let i = 1; i < poly.length - 1; i++) {
        const p = poly[i];
        const cx = Math.max(box.minX, Math.min(p.x, box.maxX));
        const cy = Math.max(box.minY, Math.min(p.y, box.maxY));
        const d = Math.hypot(p.x - cx, p.y - cy);
        if (d < min) min = d;
      }
    }
  }
  return min === Infinity ? 0 : min;
}

// --- Geometry helpers ---

function perpDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs((dx * (a.y - p.y)) - ((a.x - p.x) * dy)) / len;
}

function segmentsIntersect(p1: Pt, p2: Pt, p3: Pt, p4: Pt): boolean {
  const d = (p2.x - p1.x) * (p4.y - p3.y) - (p2.y - p1.y) * (p4.x - p3.x);
  if (Math.abs(d) < 1e-9) return false;
  const t = ((p3.x - p1.x) * (p4.y - p3.y) - (p3.y - p1.y) * (p4.x - p3.x)) / d;
  const u = ((p3.x - p1.x) * (p2.y - p1.y) - (p3.y - p1.y) * (p2.x - p1.x)) / d;
  return t > 0 && t < 1 && u > 0 && u < 1;
}

/** Polyline crossing test that ignores intersections within the first or
 *  last segment of either polyline — those are "near the perimeter" and
 *  parallel siblings naturally converge there. */
function interiorPolylineCross(a: Pt[], b: Pt[]): boolean {
  for (let i = 1; i < a.length - 2; i++) {
    for (let j = 1; j < b.length - 2; j++) {
      if (segmentsIntersect(a[i], a[i + 1], b[j], b[j + 1])) return true;
    }
  }
  return false;
}

function segmentBoxIntersect(p1: Pt, p2: Pt, b: Box): boolean {
  // If either endpoint inside box (strictly), it intersects.
  if (strictlyInside(p1, b) || strictlyInside(p2, b)) return true;
  // Otherwise check segment vs each box edge.
  const corners = [
    {x: b.minX, y: b.minY}, {x: b.maxX, y: b.minY},
    {x: b.maxX, y: b.maxY}, {x: b.minX, y: b.maxY},
  ];
  for (let i = 0; i < 4; i++) {
    if (segmentsIntersect(p1, p2, corners[i], corners[(i + 1) % 4])) return true;
  }
  return false;
}
