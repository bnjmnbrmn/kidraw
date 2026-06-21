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
//     9. aesthetics, least-tolerated first: bends, length, max curvature, bulge
//        (max curvature = the single sharpest turn, not the accumulated sum;
//         see notes/desiderata-bulge-curvature-bends.md)

import {
  Pt,
  NodeBoxSource,
  dist,
  perpDist,
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
}

export const DEFAULT_LOCAL_SCORE_OPTIONS: LocalScoreOptions = {
  minCrossingAngleDeg: 30,
  satisfiedNodeClearance: 36,
  satisfiedEdgeClearance: 30,
  satisfiedSiblingSeparation: 34,
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

    // Siblings share BOTH endpoints, so they must converge at the ends; measure
    // their separation only at this candidate's interior sample points. Two
    // overlapping straight siblings score 0 here, which pushes the router to
    // bow this one into its own lane.
    if (sib) {
      for (const p of interior) {
        const d = pointPolylineDistance(p, other.poly);
        if (d < minSiblingSeparation) minSiblingSeparation = d;
      }
    }
  }

  const minNodeClearance = computeMinNodeClearance(
    poly, srcNode, destNode, nodes, opts.satisfiedNodeClearance,
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

  // Soft tier 4: aesthetics, least-tolerated first — bends, length, max
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
  poly: Pt[], src: ScoreNode, dest: ScoreNode, nodes: ScoreNode[], cap: number,
): number {
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
