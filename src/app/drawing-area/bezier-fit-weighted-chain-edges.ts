import { DANode } from './da-node';
import { DAEdge } from './da-edge';
import {
  applyWeightedChainEdges,
  WeightedChainOptions,
  DEFAULT_OPTIONS as WC_DEFAULT_OPTIONS,
} from './weighted-chain-edges';

interface Pt { x: number; y: number; }

export interface BezierFitWeightedChainOptions {
  /** Maximum allowed perpendicular deviation (px) of the simplified Bezier
   *  control-point chain from the dense weighted-chain polyline. Lower =
   *  more control points, closer to the physics result. Higher = simpler
   *  chain, cruder approximation. */
  dpTolerance: number;
  /** Minimum spacing (px) between consecutive control points after DP.
   *  Douglas-Peucker keeps every individually-significant point but does not
   *  guarantee they are well-separated; at tight obstacle-wrap corners it can
   *  leave clusters of points only a few px apart. The Catmull-Rom smoother
   *  then kinks through those clusters. This pass collapses any run of points
   *  closer than `minControlPointSpacing` so the rendered curve stays smooth.
   *  0 disables declustering. */
  minControlPointSpacing: number;
  /** After routing, snap an edge to a straight line if its straight chord
   *  clears every non-incident node box (by the weighted-chain `clearance`)
   *  AND straightening would not leave it running parallel-and-close to a
   *  nearby edge. The physics tends to leave a residual bow even when the path
   *  is clear; this removes it for the common "obvious straight shot" edges
   *  (tree spokes, cycle sides, chain links). false disables the pass. */
  straightenUnobstructed: boolean;
}

export const DEFAULT_OPTIONS: BezierFitWeightedChainOptions = {
  dpTolerance: 3,
  minControlPointSpacing: 12,
  straightenUnobstructed: true,
};

/** Default weighted-chain options for the hybrid. Overrides the underlying
 *  `segmentLength` to a moderate value: dense enough that the DP step has
 *  good curvature detail to work with, sparse enough to avoid the
 *  pathological compute time the bare weighted-chain hits at the default
 *  `segmentLength = 0.5` on dense graphs. The downstream DP tolerance is
 *  what actually determines final control-point count, so segmentLength's
 *  job here is just to feed enough samples. */
export const DEFAULT_WC_OPTIONS: WeightedChainOptions = {
  ...WC_DEFAULT_OPTIONS,
  segmentLength: 4,
};

/** Hybrid routing: run the weighted-chain PBD physics sim to produce a
 *  dense bead polyline that respects all the physics constraints (rigid
 *  segment chain, obstacle repulsion, endpoint forces, sibling lanes),
 *  then collapse that polyline down to as few control points as possible
 *  via Douglas-Peucker simplification. Render the result as a smooth
 *  Catmull-Rom-derived curve through the surviving cps.
 *
 *  Mirrors the bezier-fit-charged-spring pattern but with weighted-chain
 *  as the physics base. The two flavours differ in their underlying
 *  physics character — charged-spring's beads obey continuous spring
 *  forces, while weighted-chain's beads are rigidly linked via PBD
 *  constraint projection. The fit step is the same on either base. */
export function applyBezierFitWeightedChainEdges(
  nodes: DANode[],
  edges: DAEdge[],
  fitOpts: BezierFitWeightedChainOptions,
  wcOpts: WeightedChainOptions,
  log?: (msg: string) => void,
  frozenEdges: DAEdge[] = [],
): void {
  log?.(`[bezier-fit-wc] start: ${edges.length} edges, ${frozenEdges.length} frozen, dpTolerance=${fitOpts.dpTolerance}, segLen=${wcOpts.segmentLength}`);

  applyWeightedChainEdges(nodes, edges, wcOpts, log, frozenEdges);

  for (const edge of edges) {
    if (edge.srcNode === edge.destNode) {
      // Self-loop: leave the four-point loop path alone, but render smooth.
      edge.setSmoothRendering(true);
      continue;
    }
    const dense = edge.controlPoints.map(p => ({x: p.x, y: p.y}));
    const simplified = douglasPeucker(dense, fitOpts.dpTolerance);
    // Strip leading cps inside the source bbox and trailing cps inside the
    // destination bbox. The chain's anchor beads can land inside the node
    // they're anchored to; when the LAST cp is inside the destination bbox,
    // DAEdge's perimeter projection lands on the *near* side of the bbox
    // (between cp and node center), so the path's final segment leaves the
    // bbox heading away from the node center. The arrowhead is oriented
    // along that segment and ends up with its body trailing INTO the node,
    // where the white fill hides it. Stripping interior cps puts the last
    // cp outside the bbox so the perimeter projects to the *near-incoming*
    // edge and the final segment points into the node, as intended.
    const trimmed = stripInteriorCps(
      simplified,
      bboxOf(edge.srcNode),
      bboxOf(edge.destNode),
    );
    const declustered = declusterCps(trimmed, fitOpts.minControlPointSpacing);
    edge.setControlPoints(declustered);
    edge.setSmoothRendering(true);
    log?.(`[bezier-fit-wc] edge ${edge.id} ${edge.srcNode.id}→${edge.destNode.id}: ${dense.length} → ${simplified.length} → ${trimmed.length} → ${declustered.length} cps`);
  }

  if (fitOpts.straightenUnobstructed) {
    straightenUnobstructedEdges(nodes, edges, wcOpts.clearance, wcOpts.laneSpacing, log);
  }
  log?.('[bezier-fit-wc] done');
}

interface Bbox2 { minX: number; minY: number; maxX: number; maxY: number; }

/** Liang-Barsky segment vs. axis-aligned rect. Kept local so this module
 *  stays free of the Konva-importing ./utils (the routing-eval harness bundles
 *  these routers without Konva). Mirrors utils.lineSegmentIntersectsRect. */
function segIntersectsRect(
  x1: number, y1: number, x2: number, y2: number,
  minX: number, minY: number, maxX: number, maxY: number,
): boolean {
  let t0 = 0, t1 = 1;
  const dx = x2 - x1, dy = y2 - y1;
  for (const edge of [
    { p: -dx, q: x1 - minX },
    { p: dx, q: maxX - x1 },
    { p: -dy, q: y1 - minY },
    { p: dy, q: maxY - y1 },
  ]) {
    if (edge.p === 0) {
      if (edge.q < 0) return false;
    } else {
      const r = edge.q / edge.p;
      if (edge.p < 0) t0 = Math.max(t0, r);
      else t1 = Math.min(t1, r);
      if (t0 > t1) return false;
    }
  }
  return true;
}

function centerOf(node: DANode): Pt {
  const x = node.konvaGroup.x();
  const y = node.konvaGroup.y();
  return { x: x + node.NODE_WIDTH / 2, y: y + node.NODE_HEIGHT / 2 };
}

function unorderedPairKey(e: DAEdge): string {
  const a = e.srcNode.id, b = e.destNode.id;
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Snap edges with an obviously-clear straight shot to a straight line. An
 *  edge is straightened only if (a) it has no parallel/anti-parallel sibling
 *  (those need lanes), (b) it carries no pinned waypoint, (c) its straight
 *  chord clears every non-incident node box by `clearance`, and (d) the
 *  straight chord would not run nearly parallel and within `minSeparation` of
 *  another edge's current route. The pass is greedy: an edge straightened
 *  early is "seen" by the parallel check of later edges, so two edges that
 *  would collapse onto each other keep one of them bowed. */
function straightenUnobstructedEdges(
  nodes: DANode[],
  edges: DAEdge[],
  clearance: number,
  minSeparation: number,
  log?: (msg: string) => void,
): void {
  // Count edges per unordered node pair so we can skip ones with siblings.
  const pairCount = new Map<string, number>();
  for (const e of edges) {
    if (e.srcNode === e.destNode) continue;
    const k = unorderedPairKey(e);
    pairCount.set(k, (pairCount.get(k) ?? 0) + 1);
  }

  // Pre-inflate non-incident node boxes by `clearance` for the obstacle test.
  const inflated = new Map<DANode, Bbox2>();
  for (const n of nodes) {
    const x = n.konvaGroup.x();
    const y = n.konvaGroup.y();
    inflated.set(n, {
      minX: x - clearance, minY: y - clearance,
      maxX: x + n.NODE_WIDTH + clearance, maxY: y + n.NODE_HEIGHT + clearance,
    });
  }

  // ~20° tolerance for "nearly parallel" (direction-agnostic).
  const PARALLEL_COS = Math.cos((20 * Math.PI) / 180);
  let straightened = 0;

  for (const edge of edges) {
    if (edge.srcNode === edge.destNode) continue;
    if ((pairCount.get(unorderedPairKey(edge)) ?? 0) > 1) continue;
    if (edge.controlPoints.length === 0) continue;          // already straight
    if (edge.controlPoints.some(cp => cp.pinned)) continue; // respect user pins

    const a = centerOf(edge.srcNode);
    const b = centerOf(edge.destNode);

    // (c) Clear of every non-incident node box?
    let blocked = false;
    for (const n of nodes) {
      if (n === edge.srcNode || n === edge.destNode) continue;
      const bb = inflated.get(n)!;
      if (segIntersectsRect(a.x, a.y, b.x, b.y, bb.minX, bb.minY, bb.maxX, bb.maxY)) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;

    // (d) Would the straight chord run parallel-and-close to another edge?
    if (runsParallelClose(a, b, edge, edges, minSeparation, PARALLEL_COS)) continue;

    edge.clearControlPoints();
    straightened++;
  }
  log?.(`[bezier-fit-wc] straighten: ${straightened}/${edges.length} edges snapped to straight`);
}

/** True if the chord a→b runs nearly parallel to, and within `minSeparation`
 *  of, a segment of some other edge — over a real side-by-side stretch (not
 *  just meeting end-to-end, which is the normal collinear-chain case). */
function runsParallelClose(
  a: Pt, b: Pt, self: DAEdge, edges: DAEdge[],
  minSeparation: number, parallelCos: number,
): boolean {
  const ux = b.x - a.x, uy = b.y - a.y;
  const L = Math.hypot(ux, uy);
  if (L < 1e-6) return false;
  const ax = ux / L, ay = uy / L; // unit direction of the chord

  for (const other of edges) {
    if (other === self) continue;
    const pts = other.getPathPoints();
    for (let i = 0; i < pts.length - 1; i++) {
      const p = pts[i], q = pts[i + 1];
      const vx = q.x - p.x, vy = q.y - p.y;
      const vlen = Math.hypot(vx, vy);
      if (vlen < 1e-6) continue;
      // Nearly parallel (either direction)?
      const cos = Math.abs((vx * ax + vy * ay) / vlen);
      if (cos < parallelCos) continue;
      // Overlap of the two segments projected onto the chord direction.
      const tp = (p.x - a.x) * ax + (p.y - a.y) * ay;
      const tq = (q.x - a.x) * ax + (q.y - a.y) * ay;
      const lo = Math.max(0, Math.min(tp, tq));
      const hi = Math.min(L, Math.max(tp, tq));
      const overlap = hi - lo;
      if (overlap <= minSeparation) continue; // just touching end-to-end, not alongside
      // Perpendicular gap: lateral distance of the other segment from the chord line.
      const perp = Math.abs((p.x - a.x) * ay - (p.y - a.y) * ax);
      if (perp < minSeparation) return true;
    }
  }
  return false;
}

/** Recursive Douglas-Peucker polyline simplification. Returns a subset
 *  of `points` that includes the first and last point, plus any inner
 *  points whose perpendicular distance to the line through the surviving
 *  neighbors exceeds `tolerance`.
 *
 *  Duplicated from bezier-fit-route-edges.ts. Kept local for now — a
 *  future round may extract a shared util once we have ≥2 bezier-fit
 *  variants that need to share the function. */
function douglasPeucker(points: Pt[], tolerance: number): Pt[] {
  if (points.length <= 2) return points.map(p => ({...p}));

  // Find the inner point with maximum perpendicular distance to the line
  // between the first and last point.
  const first = points[0];
  const last = points[points.length - 1];
  let maxDist = 0;
  let maxIdx = -1;
  for (let i = 1; i < points.length - 1; i++) {
    const d = perpDistance(points[i], first, last);
    if (d > maxDist) {
      maxDist = d;
      maxIdx = i;
    }
  }

  if (maxDist > tolerance) {
    // Split at the worst-offending point and recurse.
    const left = douglasPeucker(points.slice(0, maxIdx + 1), tolerance);
    const right = douglasPeucker(points.slice(maxIdx), tolerance);
    // left ends with points[maxIdx], right starts with points[maxIdx]; drop one.
    return [...left.slice(0, -1), ...right];
  }
  // Nothing significant between first and last; drop the middle.
  return [{...first}, {...last}];
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Collapse runs of closely-spaced control points so the Catmull-Rom smoother
 *  doesn't kink through them. A "cluster" is a maximal run of consecutive
 *  interior points all within `minSpacing` of the run's first point (radial,
 *  so a long evenly-spaced curve is NOT collapsed — only genuinely bunched
 *  points are). Each cluster is replaced by its centroid. The first and last
 *  points are always preserved exactly: they set the arrowhead direction. */
function declusterCps(points: Pt[], minSpacing: number): Pt[] {
  if (minSpacing <= 0 || points.length <= 2) return points;
  const lastIdx = points.length - 1;
  const result: Pt[] = [points[0]];
  let i = 1;
  while (i < lastIdx) {
    const start = points[i];
    let sumX = start.x, sumY = start.y, count = 1;
    let j = i + 1;
    while (j < lastIdx && dist(points[j], start) < minSpacing) {
      sumX += points[j].x; sumY += points[j].y; count++; j++;
    }
    const c = {x: sumX / count, y: sumY / count};
    // Drop the representative if it would itself sit too close to the last
    // kept point (it would just re-introduce a short segment).
    if (dist(c, result[result.length - 1]) >= minSpacing) result.push(c);
    i = j;
  }
  // The endpoint stays; if it crowds the previous kept interior point, drop
  // that interior point rather than the endpoint.
  const last = points[lastIdx];
  while (result.length > 1 && dist(last, result[result.length - 1]) < minSpacing) {
    result.pop();
  }
  result.push(last);
  return result;
}

function perpDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs(dx * (a.y - p.y) - (a.x - p.x) * dy) / len;
}

interface Bbox { minX: number; minY: number; maxX: number; maxY: number; }

function bboxOf(node: DANode): Bbox {
  const x = node.konvaGroup.x();
  const y = node.konvaGroup.y();
  return { minX: x, minY: y, maxX: x + node.NODE_WIDTH, maxY: y + node.NODE_HEIGHT };
}

function isInside(p: Pt, b: Bbox): boolean {
  return p.x > b.minX && p.x < b.maxX && p.y > b.minY && p.y < b.maxY;
}

/** Drop leading control points that lie inside `src` and trailing ones
 *  inside `dst`. Returns at minimum an empty array (callers handle that
 *  case by relying on DAEdge's straight-line src→dst perimeter fallback). */
function stripInteriorCps(points: Pt[], src: Bbox, dst: Bbox): Pt[] {
  let lo = 0;
  while (lo < points.length && isInside(points[lo], src)) lo++;
  let hi = points.length;
  while (hi > lo && isInside(points[hi - 1], dst)) hi--;
  return points.slice(lo, hi);
}
