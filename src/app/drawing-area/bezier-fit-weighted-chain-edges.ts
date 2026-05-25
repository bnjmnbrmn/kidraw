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
}

export const DEFAULT_OPTIONS: BezierFitWeightedChainOptions = {
  dpTolerance: 3,
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
): void {
  log?.(`[bezier-fit-wc] start: ${edges.length} edges, dpTolerance=${fitOpts.dpTolerance}, segLen=${wcOpts.segmentLength}`);

  applyWeightedChainEdges(nodes, edges, wcOpts, log);

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
    edge.setControlPoints(trimmed);
    edge.setSmoothRendering(true);
    log?.(`[bezier-fit-wc] edge ${edge.id} ${edge.srcNode.id}→${edge.destNode.id}: ${dense.length} → ${simplified.length} → ${trimmed.length} cps`);
  }
  log?.('[bezier-fit-wc] done');
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
