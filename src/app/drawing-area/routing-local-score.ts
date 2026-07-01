// Local, single-edge scorer for the incremental router.
//
// The production desiderata router scores every candidate by recomputing
// whole-graph metrics (computeRoutingMetrics over all nodes × all edges) — an
// O(E^2) call buried inside candidate loops, which is the source of the dense-
// graph slowdown. This module scores ONE edge's candidate polyline against the
// nodes and a small set of context edges (already-routed + frozen). Cost is
// O(nodes + contextSegments × candidateSegments), independent of total graph
// size, so the incremental router can stay inside hard budgets.
//
// The desideratum priority order is the revised one agreed for v2:
//   HARD (must be driven to zero, lexicographically, before anything else):
//     1. edge passes through a non-incident node
//     2. edge crosses one of its own siblings
//     3. edge crosses itself
//     4. any crossing it makes is shallower than minCrossingAngleDeg
//   SOFT (only break ties once the hard tier is clean):
//     5. node clearance        (higher is better, saturated)
//     6. edge clearance        (higher is better, saturated)
//     7. non-sibling crossings (fewer is better)   <-- now BELOW clearance
//     8. sibling separation    (higher is better, saturated) — fans parallel /
//                              anti-parallel groups into distinct lanes
//     9. fan separation        (higher is better, saturated) — incident edges
//                              approach a shared node at distinct angles
//    10. aesthetics, least-tolerated first: bends, length, max curvature, bulge
//        (max curvature = the single sharpest turn, not the accumulated sum;
//         see notes/desiderata-bulge-curvature-bends.md)

import {
  Pt,
  NodeBoxSource,
  dist,
  perpDist,
  angleBetween,
  segmentsIntersect,
  acuteAngleBetweenSegmentsDeg,
  segSegDistance,
  pointSegmentDistance,
  bboxOf,
  inflateBox,
  segmentIntersectsBox,
  pointBoxDistance,
} from './routing-geometry';

/** Minimal node surface the scorer reads. */
export type ScoreNode = NodeBoxSource;

/** A context edge the candidate is scored against: its rendered polyline plus
 *  the node references needed to decide incidence and sibling-ship. */
export interface ContextEdge {
  poly: Pt[];
  srcNode: ScoreNode;
  destNode: ScoreNode;
}

export interface LocalScoreOptions {
  /** Crossings shallower than this (degrees) count as a hard failure. */
  minCrossingAngleDeg: number;
  /** Node clearance is "good enough" at this distance; extra doesn't help. */
  satisfiedNodeClearance: number;
  /** Edge clearance is "good enough" at this distance; extra doesn't help. */
  satisfiedEdgeClearance: number;
  /** Sibling edges (same unordered node pair) must run at least this far apart
   *  in their interiors; they converge at the shared endpoints by necessity, so
   *  this is measured away from the ends. Drives parallel/anti-parallel groups
   *  to fan into separate lanes instead of collapsing onto one line. */
  satisfiedSiblingSeparation: number;
  /** Edges that share ONE endpoint node (a fan-in / fan-out, not siblings)
   *  should approach that node at distinct angles so they don't bunch onto the
   *  same perimeter point. Approaches at least this many degrees apart are
   *  "good enough". */
  satisfiedIncidentAngleDeg: number;
  /** (IDv3) Score fan-in/fan-out interior separation. Off by default so the
   *  IDv2 router's output is unchanged; the v3 router turns it on. When on, two
   *  edges that share ONE endpoint must also run at least
   *  `satisfiedFanSeparation` apart in their interiors (away from the shared
   *  hub), not just approach the hub at distinct angles — closing the gap that
   *  lets two fan arcs graze along their length (converge-circular Out→D3/D4).
   *  The incident-angle term only constrains the first segment at the hub. */
  fanSeparationEnabled?: boolean;
  /** Interior separation (px) between two fan edges that is "good enough". */
  satisfiedFanSeparation?: number;
  /** Radius (px) around the shared hub within which fan edges are allowed to
   *  converge — separation is only measured outside this zone (they must meet
   *  at the shared perimeter by necessity). ~ node half-diagonal. */
  fanHubExclusion?: number;
  /** (IDv3) Measure node clearance along the WHOLE rendered path instead of just
   *  its interior waypoints. Off by default so IDv2 is unchanged. IDv2's
   *  interior-vertex-only measurement is blind to a STRAIGHT edge (no interior
   *  vertices → reported as perfectly clear) that grazes a non-incident node —
   *  so a near-miss that reads as "is this edge connecting to that node?" goes
   *  unpenalised (dense n8→n10 skimming n9 by 1.6px). With this on, the graze is
   *  seen, and since node clearance outranks crossings, the router will pull the
   *  edge clear of the node even at the cost of a bend or a crossing. */
  wholePathClearance?: boolean;
  /** Radius (px) around each edge endpoint excluded from whole-path clearance,
   *  so an edge isn't penalised for leaving its own perimeter beside a neighbour
   *  of its incident node. Only used when `wholePathClearance` is on. */
  endpointClearanceRadius?: number;
}

export const DEFAULT_LOCAL_SCORE_OPTIONS: LocalScoreOptions = {
  minCrossingAngleDeg: 30,
  satisfiedNodeClearance: 36,
  satisfiedEdgeClearance: 30,
  satisfiedSiblingSeparation: 34,
  satisfiedIncidentAngleDeg: 22,
  // Fan-interior separation defaults OFF (IDv2 parity); v3 enables it.
  fanSeparationEnabled: false,
  satisfiedFanSeparation: 28,
  fanHubExclusion: 90,
  // Whole-path clearance defaults OFF (IDv2 parity); v3 enables it.
  wholePathClearance: false,
  endpointClearanceRadius: 55,
};

export interface LocalScore {
  // Hard tier (each ideally 0).
  clipCount: number;
  siblingCrossCount: number;
  selfIntersections: number;
  shallowCrossCount: number;
  hardFailCount: number;
  // Soft tier.
  minNodeClearance: number; // raw px (not clamped); clamp happens in compare
  minEdgeClearance: number; // raw px
  minSiblingSeparation: number; // raw px; interior gap to nearest sibling
  minIncidentAngleDeg: number; // smallest approach-angle gap to a fan neighbour
  minFanSeparation: number; // raw px; interior gap to nearest fan neighbour (v3)
  nonSiblingCrossCount: number;
  maxBulgeRatio: number;
  maxCurvature: number; // largest single interior turn angle (radians)
  bendCount: number;
  length: number;
}

/** Score `poly` (the candidate rendered polyline for an edge between
 *  `srcNode` and `destNode`) against the obstacle nodes and context edges. */
export function scoreEdgeRoute(
  poly: Pt[],
  srcNode: ScoreNode,
  destNode: ScoreNode,
  bendCount: number,
  nodes: ScoreNode[],
  context: ContextEdge[],
  opts: LocalScoreOptions = DEFAULT_LOCAL_SCORE_OPTIONS,
): LocalScore {
  const clipCount = countClips(poly, srcNode, destNode, nodes);
  const selfIntersections = countSelfIntersections(poly);

  let siblingCrossCount = 0;
  let nonSiblingCrossCount = 0;
  let shallowCrossCount = 0;
  let minEdgeClearance = opts.satisfiedEdgeClearance;
  let minSiblingSeparation = opts.satisfiedSiblingSeparation;
  let minIncidentAngleDeg = opts.satisfiedIncidentAngleDeg;
  const fanEnabled = opts.fanSeparationEnabled === true;
  const fanCap = opts.satisfiedFanSeparation ?? 28;
  const fanExclusion = opts.fanHubExclusion ?? 90;
  let minFanSeparation = fanCap;

  // Interior sample points of this candidate, used to measure how far it runs
  // from a sibling away from the shared endpoints.
  const interior = interiorSamplePoints(poly);

  for (const other of context) {
    const sib = isSibling(srcNode, destNode, other);
    const sharesEndpoint =
      other.srcNode === srcNode ||
      other.srcNode === destNode ||
      other.destNode === srcNode ||
      other.destNode === destNode;

    for (let i = 0; i < poly.length - 1; i++) {
      for (let j = 0; j < other.poly.length - 1; j++) {
        if (segmentsIntersect(poly[i], poly[i + 1], other.poly[j], other.poly[j + 1])) {
          if (sib) {
            siblingCrossCount++;
          } else {
            nonSiblingCrossCount++;
            const angle = acuteAngleBetweenSegmentsDeg(
              poly[i], poly[i + 1], other.poly[j], other.poly[j + 1],
            );
            if (angle < opts.minCrossingAngleDeg) shallowCrossCount++;
          }
        }
        // Edge-edge clearance is only meaningful for edges that don't share a
        // node — incident edges legitimately converge at the shared hub.
        if (!sharesEndpoint) {
          const d = segSegDistance(poly[i], poly[i + 1], other.poly[j], other.poly[j + 1]);
          if (d < minEdgeClearance) minEdgeClearance = d;
        }
      }
    }

    // Vertex-passthrough crossings: strict segmentsIntersect ignores touches at
    // a segment endpoint, so a route can hide a crossing by placing a waypoint
    // EXACTLY on the crossed edge (the curve then passes through that point as a
    // vertex — diamond-x / k4 BD). Count a crossing when one of this curve's
    // interior vertices lies on `other` and the curve passes from one side to
    // the other there.
    for (let k = 1; k < poly.length - 1; k++) {
      for (let j = 0; j < other.poly.length - 1; j++) {
        if (vertexPassesThrough(poly[k - 1], poly[k], poly[k + 1], other.poly[j], other.poly[j + 1])) {
          if (sib) {
            siblingCrossCount++;
          } else {
            nonSiblingCrossCount++;
            const angle = acuteAngleBetweenSegmentsDeg(
              poly[k - 1], poly[k + 1], other.poly[j], other.poly[j + 1],
            );
            if (angle < opts.minCrossingAngleDeg) shallowCrossCount++;
          }
          break; // at most one crossing per vertex
        }
      }
    }

    // Siblings share BOTH endpoints, so they must converge at the ends; measure
    // their separation only at this candidate's interior sample points. Two
    // overlapping straight siblings score 0 here, which pushes the router to
    // bow this one into its own lane.
    if (sib) {
      for (const p of interior) {
        const d = pointPolylineDistance(p, other.poly);
        if (d < minSiblingSeparation) minSiblingSeparation = d;
      }
    } else if (sharesEndpoint) {
      // Fan-in / fan-out: reward distinct approach angles at the shared node so
      // edges don't bunch onto the same perimeter point.
      const a = incidentApproachAngle(poly, srcNode, destNode, other);
      if (a !== null && a < minIncidentAngleDeg) minIncidentAngleDeg = a;
      // (v3) Also keep the two fans apart along their interiors, not just at the
      // hub. Measured outside the hub-convergence zone.
      if (fanEnabled) {
        const hub = sharedHubCenter(srcNode, destNode, other);
        if (hub) {
          const d = fanInteriorSeparation(poly, other.poly, hub, fanExclusion);
          if (d < minFanSeparation) minFanSeparation = d;
        }
      }
    }
  }

  const minNodeClearance = computeMinNodeClearance(
    poly, srcNode, destNode, nodes, opts,
  );

  const hardFailCount = clipCount + siblingCrossCount + selfIntersections + shallowCrossCount;

  return {
    clipCount,
    siblingCrossCount,
    selfIntersections,
    shallowCrossCount,
    hardFailCount,
    minNodeClearance,
    minEdgeClearance,
    minSiblingSeparation,
    minIncidentAngleDeg,
    minFanSeparation,
    nonSiblingCrossCount,
    maxBulgeRatio: computeBulgeRatio(poly),
    maxCurvature: computeMaxCurvature(poly),
    bendCount,
    length: computeLength(poly),
  };
}

/** Lexicographic comparison: returns <0 if a is better than b, >0 if worse,
 *  0 if indistinguishable. Encodes the agreed v2 priority order. */
export function compareLocalScores(a: LocalScore, b: LocalScore, opts: LocalScoreOptions): number {
  // Hard tier — every count lower-is-better, in priority order.
  const hardTiers: Array<keyof LocalScore> = [
    'clipCount',
    'siblingCrossCount',
    'selfIntersections',
    'shallowCrossCount',
  ];
  for (const key of hardTiers) {
    if (a[key] !== b[key]) return a[key] < b[key] ? -1 : 1;
  }

  // Soft tier 1: node clearance, then edge clearance (higher is better,
  // clamped at the "satisfied" thresholds so surplus separation can't buy
  // its way past a later desideratum).
  const aNode = Math.min(a.minNodeClearance, opts.satisfiedNodeClearance);
  const bNode = Math.min(b.minNodeClearance, opts.satisfiedNodeClearance);
  if (Math.abs(aNode - bNode) > 0.5) return aNode > bNode ? -1 : 1;

  const aEdge = Math.min(a.minEdgeClearance, opts.satisfiedEdgeClearance);
  const bEdge = Math.min(b.minEdgeClearance, opts.satisfiedEdgeClearance);
  if (Math.abs(aEdge - bEdge) > 0.5) return aEdge > bEdge ? -1 : 1;

  // Soft tier 2: non-sibling crossings (now ranked below clearance).
  if (a.nonSiblingCrossCount !== b.nonSiblingCrossCount) {
    return a.nonSiblingCrossCount < b.nonSiblingCrossCount ? -1 : 1;
  }

  // Soft tier 3: sibling separation (higher is better, clamped). Ranked above
  // aesthetics so a parallel/anti-parallel edge will take a bend to fan into
  // its own lane, but below crossings so it won't cross another edge to do so.
  const aSib = Math.min(a.minSiblingSeparation, opts.satisfiedSiblingSeparation);
  const bSib = Math.min(b.minSiblingSeparation, opts.satisfiedSiblingSeparation);
  if (Math.abs(aSib - bSib) > 0.5) return aSib > bSib ? -1 : 1;

  // Soft tier 4: fan-in/fan-out approach-angle separation (higher is better,
  // clamped). Keeps incident edges from bunching at a shared node.
  const aInc = Math.min(a.minIncidentAngleDeg, opts.satisfiedIncidentAngleDeg);
  const bInc = Math.min(b.minIncidentAngleDeg, opts.satisfiedIncidentAngleDeg);
  if (Math.abs(aInc - bInc) > 0.5) return aInc > bInc ? -1 : 1;

  // Soft tier 4b (v3, gated): fan-in/fan-out interior separation (higher is
  // better, clamped). Ranked alongside the other fan/sibling terms — above
  // aesthetics so a fan edge will take a bend to pull out of its neighbour's
  // path, but below crossings so it won't cross to do so. Off for IDv2.
  if (opts.fanSeparationEnabled) {
    const cap = opts.satisfiedFanSeparation ?? 28;
    const aFan = Math.min(a.minFanSeparation, cap);
    const bFan = Math.min(b.minFanSeparation, cap);
    if (Math.abs(aFan - bFan) > 0.5) return aFan > bFan ? -1 : 1;
  }

  // Soft tier 5: aesthetics, least-tolerated first — bends, length, max
  // curvature, bulge (see notes/desiderata-bulge-curvature-bends.md).
  if (a.bendCount !== b.bendCount) return a.bendCount < b.bendCount ? -1 : 1;
  if (Math.abs(a.length - b.length) > 0.5) return a.length < b.length ? -1 : 1;
  if (Math.abs(a.maxCurvature - b.maxCurvature) > 0.02) {
    return a.maxCurvature < b.maxCurvature ? -1 : 1;
  }
  if (Math.abs(a.maxBulgeRatio - b.maxBulgeRatio) > 0.01) {
    return a.maxBulgeRatio < b.maxBulgeRatio ? -1 : 1;
  }
  return 0;
}

// --- Component computations ---

function countClips(poly: Pt[], src: ScoreNode, dest: ScoreNode, nodes: ScoreNode[]): number {
  let count = 0;
  for (const node of nodes) {
    if (node === src || node === dest) continue;
    const box = bboxOf(node);
    for (let i = 0; i < poly.length - 1; i++) {
      if (segmentIntersectsBox(poly[i], poly[i + 1], box)) {
        count++;
        break;
      }
    }
  }
  return count;
}

function countSelfIntersections(poly: Pt[]): number {
  let count = 0;
  for (let i = 0; i < poly.length - 2; i++) {
    for (let j = i + 2; j < poly.length - 1; j++) {
      if (i === 0 && j === poly.length - 2) continue; // wrap-around perimeter pair
      if (segmentsIntersect(poly[i], poly[i + 1], poly[j], poly[j + 1])) count++;
    }
  }
  return count;
}

function computeMinNodeClearance(
  poly: Pt[], src: ScoreNode, dest: ScoreNode, nodes: ScoreNode[], opts: LocalScoreOptions,
): number {
  const cap = opts.satisfiedNodeClearance;
  if (opts.wholePathClearance) {
    return wholePathNodeClearance(poly, src, dest, nodes, cap, opts.endpointClearanceRadius ?? 55);
  }
  let min = cap;
  for (const node of nodes) {
    if (node === src || node === dest) continue;
    const box = bboxOf(node);
    // Interior points only — the endpoints sit on incident perimeters and a
    // non-incident node near an endpoint shouldn't be penalised here.
    for (let i = 1; i < poly.length - 1; i++) {
      const d = pointBoxDistance(poly[i], box);
      if (d < min) min = d;
      if (min === 0) return 0;
    }
  }
  return min;
}

/** (IDv3) Node clearance measured along the whole rendered path, sampled at a
 *  fixed spacing so a STRAIGHT edge (no interior vertices) is measured too.
 *  Samples within `endR` of either endpoint are skipped — an edge leaving its
 *  own incident perimeter beside a neighbour shouldn't count as a graze. */
function wholePathNodeClearance(
  poly: Pt[], src: ScoreNode, dest: ScoreNode, nodes: ScoreNode[], cap: number, endR: number,
): number {
  if (poly.length < 2) return cap;
  const A = poly[0], B = poly[poly.length - 1];
  const STEP = 8;
  let min = cap;
  for (const node of nodes) {
    if (node === src || node === dest) continue;
    const box = bboxOf(node);
    for (let i = 0; i < poly.length - 1; i++) {
      const p = poly[i], q = poly[i + 1];
      const segLen = dist(p, q);
      if (segLen < 1e-6) continue;
      const steps = Math.max(1, Math.ceil(segLen / STEP));
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        const pt = { x: p.x + (q.x - p.x) * t, y: p.y + (q.y - p.y) * t };
        if (dist(pt, A) < endR || dist(pt, B) < endR) continue;
        const d = pointBoxDistance(pt, box);
        if (d < min) min = d;
        if (min === 0) return 0;
      }
    }
  }
  return min;
}

/** A few points sampled along the polyline by arc length, away from the
 *  endpoints — used to measure interior separation from siblings. */
function interiorSamplePoints(poly: Pt[]): Pt[] {
  if (poly.length < 2) return [];
  return [0.3, 0.5, 0.7].map(f => pointAtFraction(poly, f));
}

/** Point at fraction `f` (0..1) along the polyline, by arc length. */
function pointAtFraction(poly: Pt[], f: number): Pt {
  const segLens: number[] = [];
  let total = 0;
  for (let i = 0; i < poly.length - 1; i++) {
    const len = dist(poly[i], poly[i + 1]);
    segLens.push(len);
    total += len;
  }
  if (total < 1e-9) return poly[0];
  let target = f * total;
  for (let i = 0; i < segLens.length; i++) {
    if (target <= segLens[i]) {
      const t = segLens[i] < 1e-9 ? 0 : target / segLens[i];
      return { x: poly[i].x + (poly[i + 1].x - poly[i].x) * t, y: poly[i].y + (poly[i + 1].y - poly[i].y) * t };
    }
    target -= segLens[i];
  }
  return poly[poly.length - 1];
}

/** Angle (deg) between two edges' approach directions at the node they share,
 *  both pointing away from that node. null if they don't share a single node or
 *  a polyline is degenerate. */
function incidentApproachAngle(poly: Pt[], src: ScoreNode, dest: ScoreNode, other: ContextEdge): number | null {
  let shared: ScoreNode | null = null;
  if (src === other.srcNode || src === other.destNode) shared = src;
  else if (dest === other.srcNode || dest === other.destNode) shared = dest;
  if (!shared) return null;
  const candDir = approachDir(poly, shared === src);
  const otherDir = approachDir(other.poly, shared === other.srcNode);
  if (!candDir || !otherDir) return null;
  return angleBetween(candDir, otherDir);
}

/** Direction leaving the polyline's start (or end) endpoint, into the edge. */
function approachDir(poly: Pt[], atStart: boolean): Pt | null {
  if (poly.length < 2) return null;
  const n = poly.length;
  return atStart
    ? { x: poly[1].x - poly[0].x, y: poly[1].y - poly[0].y }
    : { x: poly[n - 2].x - poly[n - 1].x, y: poly[n - 2].y - poly[n - 1].y };
}

/** Signed side of point p relative to the directed line a→b (>0 left, <0 right,
 *  0 on the line within tolerance). */
function sideSign(a: Pt, b: Pt, p: Pt): number {
  const v = (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);
  return v > 1e-6 ? 1 : v < -1e-6 ? -1 : 0;
}

/** True if vertex `v` (with neighbours `prev`/`next`) lies on segment s1→s2 and
 *  the path passes through to the other side there — a crossing the strict
 *  segment test misses because it sits at a vertex. */
function vertexPassesThrough(prev: Pt, v: Pt, next: Pt, s1: Pt, s2: Pt): boolean {
  const EPS = 2;
  if (pointSegmentDistance(v, s1, s2) > EPS) return false;
  // v must project strictly inside the segment (not near its endpoints, where a
  // shared node / corner would give a false positive).
  const dx = s2.x - s1.x, dy = s2.y - s1.y;
  const len2 = dx * dx + dy * dy;
  if (len2 < 1e-9) return false;
  const t = ((v.x - s1.x) * dx + (v.y - s1.y) * dy) / len2;
  if (t <= 0.001 || t >= 0.999) return false;
  const sp = sideSign(s1, s2, prev);
  const sn = sideSign(s1, s2, next);
  return sp !== 0 && sn !== 0 && sp !== sn;
}

/** Centre of the single node two edges share (the fan hub), or null if they
 *  don't share exactly one endpoint. */
function sharedHubCenter(src: ScoreNode, dest: ScoreNode, other: ContextEdge): Pt | null {
  let shared: ScoreNode | null = null;
  if (src === other.srcNode || src === other.destNode) shared = src;
  else if (dest === other.srcNode || dest === other.destNode) shared = dest;
  if (!shared) return null;
  const b = bboxOf(shared);
  return { x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 };
}

/** Smallest gap between this edge's interior and the other fan edge, measured
 *  only where BOTH run outside the hub-convergence zone (radius `excl` around
 *  `hub`). Returns Infinity if the two never both leave the hub zone (e.g. very
 *  short edges) so the caller's running min is left untouched. */
function fanInteriorSeparation(poly: Pt[], otherPoly: Pt[], hub: Pt, excl: number): number {
  let min = Infinity;
  for (const f of [0.3, 0.45, 0.6, 0.75, 0.9]) {
    const p = pointAtFraction(poly, f);
    if (dist(p, hub) < excl) continue;
    for (let i = 0; i < otherPoly.length - 1; i++) {
      const q1 = otherPoly[i], q2 = otherPoly[i + 1];
      // Skip the other edge's hub-convergence portion: both segment ends must be
      // clear of the hub zone for the gap to be meaningful.
      if (dist(q1, hub) < excl || dist(q2, hub) < excl) continue;
      const d = pointSegmentDistance(p, q1, q2);
      if (d < min) min = d;
    }
  }
  return min;
}

/** Shortest distance from a point to a polyline. */
function pointPolylineDistance(p: Pt, poly: Pt[]): number {
  if (poly.length < 2) return poly.length === 1 ? dist(p, poly[0]) : Infinity;
  let min = Infinity;
  for (let i = 0; i < poly.length - 1; i++) {
    const d = pointSegmentDistance(p, poly[i], poly[i + 1]);
    if (d < min) min = d;
  }
  return min;
}

function computeBulgeRatio(poly: Pt[]): number {
  if (poly.length < 2) return 0;
  const start = poly[0];
  const end = poly[poly.length - 1];
  const chord = dist(start, end);
  if (chord < 1) return 0;
  let maxDev = 0;
  for (let i = 1; i < poly.length - 1; i++) {
    const d = perpDist(poly[i], start, end);
    if (d > maxDev) maxDev = d;
  }
  return maxDev / chord;
}

/** Largest single interior turn angle (radians) — the sharpest kink, not the
 *  accumulated sum. A path of many gentle turns scores low here even though its
 *  total curvature is high; the bend count tier penalizes that path instead. */
function computeMaxCurvature(poly: Pt[]): number {
  let max = 0;
  for (let i = 1; i < poly.length - 1; i++) {
    const a = poly[i - 1], b = poly[i], c = poly[i + 1];
    const dx1 = b.x - a.x, dy1 = b.y - a.y;
    const dx2 = c.x - b.x, dy2 = c.y - b.y;
    const len1 = Math.hypot(dx1, dy1) || 1;
    const len2 = Math.hypot(dx2, dy2) || 1;
    const cos = (dx1 * dx2 + dy1 * dy2) / (len1 * len2);
    const ang = Math.acos(Math.max(-1, Math.min(1, cos)));
    if (ang > max) max = ang;
  }
  return max;
}

function computeLength(poly: Pt[]): number {
  let sum = 0;
  for (let i = 0; i < poly.length - 1; i++) sum += dist(poly[i], poly[i + 1]);
  return sum;
}

/** Inflated obstacle box used by callers that want a clearance margin baked
 *  into the clip test (kept here so the router and scorer agree on geometry). */
export function clearanceBox(node: NodeBoxSource, clearance: number) {
  return inflateBox(bboxOf(node), clearance);
}

function isSibling(src: ScoreNode, dest: ScoreNode, other: ContextEdge): boolean {
  return (
    (other.srcNode === src && other.destNode === dest) ||
    (other.srcNode === dest && other.destNode === src)
  );
}
