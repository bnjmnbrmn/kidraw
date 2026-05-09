import { DANode } from './da-node';
import { DAEdge } from './da-edge';
import { applyChargedSpringEdges, ChargedSpringOptions } from './charged-spring-edges';

interface Pt { x: number; y: number; }

export interface BezierFitOptions {
  /** Maximum allowed perpendicular deviation (px) of the simplified Bezier
   *  control-point chain from the dense charged-spring polyline. Lower =
   *  more control points, closer to the physics result. Higher = simpler
   *  chain, cruder approximation. */
  dpTolerance: number;
}

export const DEFAULT_OPTIONS: BezierFitOptions = {
  dpTolerance: 3,
};

/** Hybrid routing: run the charged-spring physics sim with pruning disabled
 *  to get a dense bead polyline that respects all the physics constraints
 *  (obstacles, sibling lanes, anchors), then collapse that polyline down
 *  to as few control points as possible via Douglas-Peucker simplification.
 *  Render the result as a smooth Catmull-Rom-derived curve through the
 *  surviving cps.
 *
 *  Best of both worlds:
 *  - Charged-spring: natural shape, automatic obstacle avoidance, sibling
 *    separation, robust force-balance.
 *  - Bezier: clean rendering, few control points, smooth curve. */
export function applyBezierFitChargedSpringEdges(
  nodes: DANode[],
  edges: DAEdge[],
  fitOpts: BezierFitOptions,
  csOpts: ChargedSpringOptions,
  log?: (msg: string) => void,
): void {
  log?.(`[bezier-fit] start: ${edges.length} edges, dpTolerance=${fitOpts.dpTolerance}`);

  // Run charged-spring with pruning disabled — we want the full dense polyline
  // before we apply our own simplification on top of it.
  const noPruneCs: ChargedSpringOptions = { ...csOpts, pruneEpsilon: 0 };
  applyChargedSpringEdges(nodes, edges, noPruneCs, log);

  for (const edge of edges) {
    if (edge.srcNode === edge.destNode) {
      // Self-loop: leave the four-point loop path alone, but render smooth.
      edge.setSmoothRendering(true);
      continue;
    }
    const dense = edge.controlPoints.map(p => ({x: p.x, y: p.y}));
    const simplified = douglasPeucker(dense, fitOpts.dpTolerance);
    edge.setControlPoints(simplified);
    edge.setSmoothRendering(true);
    log?.(`[bezier-fit] edge ${edge.id} ${edge.srcNode.id}→${edge.destNode.id}: ${dense.length} → ${simplified.length} cps`);
  }
  log?.('[bezier-fit] done');
}

/** Recursive Douglas-Peucker polyline simplification. Returns a subset
 *  of `points` that includes the first and last point, plus any inner
 *  points whose perpendicular distance to the line through the surviving
 *  neighbors exceeds `tolerance`. */
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
