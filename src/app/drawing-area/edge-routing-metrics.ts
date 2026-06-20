import type { DANode } from './da-node';
import type { DAEdge } from './da-edge';

/** Quality metrics for a routed graph. Hard fails are counts that should
 *  ideally be zero (any nonzero value makes the composite -Infinity). Soft
 *  metrics are continuous values combined via weights to produce a score
 *  for ranking and auto-tuning. */
export interface RoutingMetrics {
  // Hard fails — counts; ideally 0.
  edgesThroughNodes: number;
  siblingCrossings: number;
  selfIntersections: number;
  // Soft. Clearance metrics are saturated: extra distance beyond the cap
  // doesn't matter visually and shouldn't keep rewarding the composite.
  totalLength: number;
  totalCurvature: number;
  maxBulgeRatio: number;
  minObstacleClearance: number;       // closest non-incident node bbox; clamped
  minEdgeEdgeClearance: number;       // closest other-edge (no shared endpoint); clamped
  nonSiblingCrossings: number;        // count; soft penalty (some are unavoidable on dense graphs)
  minCrossingAngleDeg: number;        // smallest acute angle (deg) at any non-sibling crossing; clamped to cap
  // Composite.
  hardFailCount: number;
  composite: number;
}

export interface MetricWeights {
  totalLength: number;
  totalCurvature: number;
  maxBulgeRatio: number;
  minObstacleClearance: number;
  minEdgeEdgeClearance: number;
  nonSiblingCrossings: number;
  minCrossingAngleDeg: number;
}

/** Default weights — hand-tuned starting point. Phase 2b's pairwise
 *  calibration will refit these from human picks. Negative weight means
 *  "bigger is worse". The two clearance metrics now saturate at
 *  CLEARANCE_THRESHOLD_RATIO × avg-non-invisible-node-width, so their
 *  effective range is bounded and their weights don't need to be tiny. */
export const DEFAULT_WEIGHTS: MetricWeights = {
  totalLength: -0.01,
  totalCurvature: -2,
  maxBulgeRatio: -50,
  minObstacleClearance: 0.5,
  minEdgeEdgeClearance: 0.5,
  nonSiblingCrossings: -5,
  minCrossingAngleDeg: 1,
};

/** Saturation caps for the two clearance metrics, in pixels. Beyond these
 *  distances additional separation is visually irrelevant — the eye stops
 *  caring once the gap is "clearly comfortable". Tuned by hand: 60 px is
 *  roughly the gap between two default-sized (120 px) nodes laid out side
 *  by side; that's a useful "clearly clear" reference. Split between node
 *  clearance and edge-edge clearance so they can be adjusted independently
 *  if it turns out one needs to be tighter than the other. */
const OBSTACLE_CLEARANCE_CAP = 60;
const EDGE_EDGE_CLEARANCE_CAP = 60;

/** Saturation cap for the crossing-angle metric (degrees). Crossings at
 *  or above this angle are visually unambiguous — the eye reads "two
 *  separate lines crossing" rather than "one line tangent to another".
 *  Below this, the crossing looks shallow and the in→out pairing gets
 *  confusing. 30° matches the user's stated visual rule of thumb. */
const CROSSING_ANGLE_CAP_DEG = 30;

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
  const minObstacleClearance = computeMinObstacleClearance(nodes, edges, OBSTACLE_CLEARANCE_CAP);
  const minEdgeEdgeClearance = computeMinEdgeEdgeClearance(edges, EDGE_EDGE_CLEARANCE_CAP);
  const nonSiblingCrossings = countNonSiblingCrossings(edges);
  const minCrossingAngleDeg = computeMinCrossingAngleDeg(edges, CROSSING_ANGLE_CAP_DEG);

  const hardFailCount = edgesThroughNodes + siblingCrossings + selfIntersections;
  const composite = hardFailCount > 0 ? -Infinity
    : weights.totalLength * totalLength
      + weights.totalCurvature * totalCurvature
      + weights.maxBulgeRatio * maxBulgeRatio
      + weights.minObstacleClearance * minObstacleClearance
      + weights.minEdgeEdgeClearance * minEdgeEdgeClearance
      + weights.nonSiblingCrossings * nonSiblingCrossings
      + weights.minCrossingAngleDeg * minCrossingAngleDeg;

  return {
    edgesThroughNodes, siblingCrossings, selfIntersections,
    totalLength, totalCurvature, maxBulgeRatio,
    minObstacleClearance, minEdgeEdgeClearance, nonSiblingCrossings,
    minCrossingAngleDeg,
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

/** Count pairs of edges (i, j) that cross each other's interior polylines
 *  AND are not from the same parallel-edge group (siblings). Sibling
 *  crossings are tracked separately as a hard fail; non-sibling crossings
 *  are soft because some are geometrically unavoidable on dense graphs
 *  (K_n is non-planar for n > 4). Uses the metric polyline (endpoints
 *  stripped), so two edges that just converge at a shared hub but never
 *  cross outside that hub do NOT count. Self-loops are skipped. */
function countNonSiblingCrossings(edges: DAEdge[]): number {
  const data = edges.map(e => {
    if (e.srcNode === e.destNode) return null;
    const a = e.srcNode.id, b = e.destNode.id;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    return { poly: getMetricPolyline(e), key };
  });
  let count = 0;
  for (let i = 0; i < data.length; i++) {
    const di = data[i];
    if (!di || di.poly.length < 2) continue;
    for (let j = i + 1; j < data.length; j++) {
      const dj = data[j];
      if (!dj || dj.poly.length < 2) continue;
      if (di.key === dj.key) continue;          // siblings; counted elsewhere
      if (interiorPolylineCross(di.poly, dj.poly)) count++;
    }
  }
  return count;
}

/** Smallest acute angle (degrees, 0..90) at any non-sibling crossing.
 *  Saturated at `cap` (degrees) — once every crossing is at least `cap`°
 *  apart, the eye reads "obviously crossing" rather than "tangent"; more
 *  separation doesn't help further. Returns `cap` if no crossings exist.
 *  Uses the same interior-segment filter as countNonSiblingCrossings,
 *  so the two metrics agree on which crossings to consider. */
function computeMinCrossingAngleDeg(edges: DAEdge[], cap: number): number {
  let min = cap;
  const data = edges.map(e => {
    if (e.srcNode === e.destNode) return null;
    const a = e.srcNode.id, b = e.destNode.id;
    const key = a < b ? `${a}|${b}` : `${b}|${a}`;
    return { poly: getMetricPolyline(e), key };
  });
  for (let i = 0; i < data.length; i++) {
    const di = data[i];
    if (!di || di.poly.length < 2) continue;
    for (let j = i + 1; j < data.length; j++) {
      const dj = data[j];
      if (!dj || dj.poly.length < 2) continue;
      if (di.key === dj.key) continue;
      // Mirror interiorPolylineCross's segment bounds: skip the first
      // and last segment of either polyline (they sit near the endpoint
      // perimeters where edges naturally converge).
      for (let ai = 1; ai < di.poly.length - 2; ai++) {
        for (let bi = 1; bi < dj.poly.length - 2; bi++) {
          if (segmentsIntersect(di.poly[ai], di.poly[ai + 1], dj.poly[bi], dj.poly[bi + 1])) {
            const angle = acuteAngleBetweenSegments(
              di.poly[ai], di.poly[ai + 1], dj.poly[bi], dj.poly[bi + 1],
            );
            if (angle < min) min = angle;
            if (min === 0) return 0;
          }
        }
      }
    }
  }
  return min;
}

function acuteAngleBetweenSegments(a1: Pt, a2: Pt, b1: Pt, b2: Pt): number {
  const dx1 = a2.x - a1.x, dy1 = a2.y - a1.y;
  const dx2 = b2.x - b1.x, dy2 = b2.y - b1.y;
  const len1 = Math.hypot(dx1, dy1) || 1;
  const len2 = Math.hypot(dx2, dy2) || 1;
  // |cos| collapses θ and 180-θ into the same acute angle in [0, 90].
  const cosAbs = Math.abs((dx1 * dx2 + dy1 * dy2) / (len1 * len2));
  return Math.acos(Math.min(1, cosAbs)) * 180 / Math.PI;
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

function computeMinObstacleClearance(nodes: DANode[], edges: DAEdge[], cap: number): number {
  // Walk every interior cp on every edge against every non-incident node
  // bbox. Take the min distance, but clamp at `cap` — visually, beyond a
  // node-width-ish gap the additional clearance is irrelevant. Returns
  // `cap` if no interior cps exist (which is the "all clear" state).
  let min = cap;
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
        if (min === 0) return 0;
      }
    }
  }
  return min;
}

/** Min distance between any two edges that do NOT share an endpoint node.
 *  Edges sharing an endpoint converge near that node by construction (fan-
 *  out / fan-in hubs) — measuring their close-pass would just penalize
 *  the topology, not the routing. For every truly-non-incident edge pair,
 *  walk all interior segment pairs and take the min point-to-segment
 *  distance. Clamped at `cap` like the node-clearance metric. */
function computeMinEdgeEdgeClearance(edges: DAEdge[], cap: number): number {
  let min = cap;
  const polys = edges.map(e => ({ poly: getMetricPolyline(e), src: e.srcNode, dst: e.destNode }));
  for (let i = 0; i < polys.length; i++) {
    const a = polys[i];
    if (a.poly.length < 2) continue;
    for (let j = i + 1; j < polys.length; j++) {
      const b = polys[j];
      if (b.poly.length < 2) continue;
      // Skip if they share any endpoint node.
      if (a.src === b.src || a.src === b.dst || a.dst === b.src || a.dst === b.dst) continue;
      // Min segment-to-segment distance between the two polylines.
      for (let ai = 0; ai < a.poly.length - 1; ai++) {
        for (let bi = 0; bi < b.poly.length - 1; bi++) {
          const d = segSegDistance(a.poly[ai], a.poly[ai + 1], b.poly[bi], b.poly[bi + 1]);
          if (d < min) min = d;
          if (min === 0) return 0;
        }
      }
    }
  }
  return min;
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

/** Minimum distance between two line segments (p1→p2 and p3→p4). If they
 *  intersect, returns 0. Otherwise: min of the four endpoint-to-other-
 *  segment distances. */
function segSegDistance(p1: Pt, p2: Pt, p3: Pt, p4: Pt): number {
  if (segmentsIntersect(p1, p2, p3, p4)) return 0;
  return Math.min(
    pointToSegmentDistance(p1, p3, p4),
    pointToSegmentDistance(p2, p3, p4),
    pointToSegmentDistance(p3, p1, p2),
    pointToSegmentDistance(p4, p1, p2),
  );
}

function pointToSegmentDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
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
