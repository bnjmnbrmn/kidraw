import type { DANode } from './da-node';
import type { DAEdge } from './da-edge';
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
  /** Number of Laplacian smoothing passes over each edge's interior control
   *  polygon after declustering. Each pass nudges every control point a
   *  fraction of the way toward the midpoint of its neighbors (the node
   *  centers anchor the ends), rounding out the small kinks and wobbles the
   *  Catmull-Rom otherwise renders through DP's output. 0 disables. Kept low
   *  so obstacle-avoiding bends don't slacken into the node they're dodging. */
  controlPointSmoothing: number;
  /** Tolerance (px) for the second Douglas-Peucker pass run *after* smoothing.
   *  It operates on the already-obstacle-safe smoothed polygon, so it can be
   *  more aggressive than `dpTolerance` (which must stay faithful to the raw
   *  physics path): it strips the flattened wobble points a corridor leaves
   *  behind without touching the genuine clearance bends. 0 disables. */
  resimplifyTolerance: number;
  /** Replace the fixed-tolerance re-simplify with constraint-based pruning:
   *  greedily drop the least-significant control point (smallest deviation
   *  from the line through its neighbors) and keep going until removing any
   *  remaining point would make the path clip a non-incident node box. Unlike
   *  a tolerance, this removes *as many as the geometry allows*, so a
   *  symmetric path keeps a symmetric, minimal set of waypoints. When on,
   *  `resimplifyTolerance` is ignored. */
  pruneToConstraints: boolean;
  /** After routing, snap an edge to a straight line if its straight chord
   *  clears every non-incident node box (by the weighted-chain `clearance`)
   *  AND straightening would not leave it running parallel-and-close to a
   *  nearby edge. The physics tends to leave a residual bow even when the path
   *  is clear; this removes it for the common "obvious straight shot" edges
   *  (tree spokes, cycle sides, chain links). false disables the pass. */
  straightenUnobstructed: boolean;
  /** Replace the routes of a parallel/anti-parallel sibling group (≥2 edges
   *  between the same node pair) with deterministic, evenly-spaced arcs that
   *  are mirror-symmetric about the chord — but only when the corridor between
   *  the two nodes is clear of other nodes (otherwise the physics route, which
   *  navigated the obstacle, is kept). The physics settles siblings into
   *  near-parallel but visibly asymmetric lanes; this makes anti-parallel
   *  pairs a clean lens and N-way parallels a symmetric fan. false disables. */
  symmetrizeSiblings: boolean;
  /** Perpendicular spacing (px) between adjacent lanes in a symmetrized
   *  sibling group, measured at the node ends. A 2-edge anti-parallel pair
   *  attaches ±siblingLaneGap/2 from center on each node perimeter, so the two
   *  arcs leave/enter the nodes already separated (no brushing at the ends). */
  siblingLaneGap: number;
  /** How much wider each sibling arc bulges at its midpoint than at the node
   *  ends, as a multiple of the end offset. 1 = constant-offset (parallel
   *  lanes); >1 = a lens/leaf that bows out in the middle. */
  siblingBulge: number;
  /** Collapse a one-sided detour edge (its route only ever bows to one side of
   *  the chord) into a single symmetric control point at the chord midpoint,
   *  dipped to the shallowest depth that still clears every non-incident node.
   *  Gives clean, symmetric, equal-depth arcs for edges hopping a row of nodes
   *  (tangent-grazing). Weaving routes (bow both sides) are left untouched. */
  collapseSimpleArcs: boolean;
  /** Spread the attach points of *bent* edges that leave/enter a shared node at
   *  nearly the same angle, so they don't bunch where they touch the node (e.g.
   *  tangent-grazing's A→C and A→D both leaving A). Edges within
   *  `fanAttachMinAngleDeg` of each other at a node get a near-node control
   *  point that fans them to at least that angle apart. Only affects edges that
   *  already bend — straight radial fans (hub-spoke, k3-3) are left alone. */
  separateFanAttachments: boolean;
  /** Minimum angular separation (degrees) between two bent edges where they
   *  attach to a shared node. Also the threshold below which they count as
   *  "bunched". */
  fanAttachMinAngleDeg: number;
}

export const DEFAULT_OPTIONS: BezierFitWeightedChainOptions = {
  dpTolerance: 4,
  minControlPointSpacing: 14,
  controlPointSmoothing: 3,
  resimplifyTolerance: 12,
  pruneToConstraints: true,
  straightenUnobstructed: true,
  symmetrizeSiblings: true,
  siblingLaneGap: 30,
  siblingBulge: 1.8,
  collapseSimpleArcs: true,
  separateFanAttachments: true,
  fanAttachMinAngleDeg: 16,
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
    const smoothed = smoothControlPolygon(
      declustered, centerOf(edge.srcNode), centerOf(edge.destNode), fitOpts.controlPointSmoothing,
    );
    // Thin the smoothed polygon. Constraint pruning removes as many points as
    // the geometry allows (until the path would clip a node), which gives a
    // minimal, symmetry-respecting set; the tolerance path is the fallback.
    const resimplified = fitOpts.pruneToConstraints
      ? constraintPrune(
          smoothed, centerOf(edge.srcNode), centerOf(edge.destNode),
          edge.srcNode, edge.destNode, nodes, wcOpts.clearance,
        )
      : fitOpts.resimplifyTolerance > 0
        ? douglasPeucker(smoothed, fitOpts.resimplifyTolerance)
        : smoothed;
    // If the route only ever bows to one side of the chord (a simple detour
    // past a row of nodes), collapse it to a single symmetric midpoint arc at
    // the shallowest depth that still clears the obstacles — the cleanest form
    // for cases like tangent-grazing. Weaving routes (maze S, dense chords) bow
    // both sides and are left as-is.
    const collapsed = fitOpts.collapseSimpleArcs
      ? collapseToSymmetricArc(
          resimplified, centerOf(edge.srcNode), centerOf(edge.destNode),
          edge.srcNode, edge.destNode, nodes, wcOpts.clearance,
        )
      : resimplified;
    edge.setControlPoints(collapsed);
    edge.setSmoothRendering(true);
    log?.(`[bezier-fit-wc] edge ${edge.id} ${edge.srcNode.id}→${edge.destNode.id}: ${dense.length} → ${simplified.length} → ${trimmed.length} → ${declustered.length} → ${resimplified.length} → ${collapsed.length} cps`);
  }

  if (fitOpts.straightenUnobstructed) {
    straightenUnobstructedEdges(nodes, edges, wcOpts.clearance, wcOpts.laneSpacing, log);
  }
  if (fitOpts.symmetrizeSiblings) {
    symmetrizeSiblingGroups(nodes, edges, wcOpts.clearance, fitOpts.siblingLaneGap, fitOpts.siblingBulge, log);
  }
  if (fitOpts.separateFanAttachments) {
    separateFanAttachments(nodes, edges, fitOpts.fanAttachMinAngleDeg, log);
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

/** Distance from a node's center to its box perimeter along unit direction
 *  (ux, uy). Used to place a control point just outside the node. */
function halfExtentAlong(node: DANode, ux: number, uy: number): number {
  const hw = node.NODE_WIDTH / 2;
  const hh = node.NODE_HEIGHT / 2;
  const tx = Math.abs(ux) > 1e-6 ? hw / Math.abs(ux) : Infinity;
  const ty = Math.abs(uy) > 1e-6 ? hh / Math.abs(uy) : Infinity;
  return Math.min(tx, ty);
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
    // Edges that share a node fan out from (or into) that node: straight lines
    // from a common point diverge by angle and only meet at the point, so they
    // can never run alongside. Skipping them lets fanned diagonals (k3-3
    // crossings, a hub's spokes) straighten instead of staying bowed by the
    // near-the-shared-node proximity. The guard still keeps INDEPENDENT
    // parallel edges (no shared endpoint) apart.
    if (other.srcNode === self.srcNode || other.srcNode === self.destNode ||
        other.destNode === self.srcNode || other.destNode === self.destNode) {
      continue;
    }
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

/** Spread the attach points of bent edges that leave/enter a shared node at
 *  nearly the same angle, so they don't bunch where they touch the node. For
 *  each node, the incident *bent* (≥1 cp), non-sibling edges are sorted by the
 *  angle from the node centre to their nearest control point; any run within
 *  `minAngleDeg` of each other is fanned out to exactly that spacing by giving
 *  each a near-node control point in the re-spread direction. Straight edges
 *  (0 cps) are skipped, so clean radial fans (hub-spoke, k3-3) are untouched. */
function separateFanAttachments(
  nodes: DANode[],
  edges: DAEdge[],
  minAngleDeg: number,
  log?: (msg: string) => void,
): void {
  const minAngle = (minAngleDeg * Math.PI) / 180;
  const SHOULDER = 75; // px from node centre to the inserted control point

  // Sibling edges are already laned by the symmetrize pass; exclude them.
  const pairCount = new Map<string, number>();
  for (const e of edges) {
    if (e.srcNode === e.destNode) continue;
    const k = unorderedPairKey(e);
    pairCount.set(k, (pairCount.get(k) ?? 0) + 1);
  }

  // True if the polyline through [srcCenter, ...cps, destCenter] clears every
  // non-incident node box (small margin) — used to reject a shoulder that would
  // push the attachment into a neighbouring node.
  const polyClears = (e: DAEdge, cps: Pt[]): boolean => {
    const a = centerOf(e.srcNode), b = centerOf(e.destNode);
    const path = [a, ...cps, b];
    for (const nd of nodes) {
      if (nd === e.srcNode || nd === e.destNode) continue;
      const x = nd.konvaGroup.x(), y = nd.konvaGroup.y();
      const bx0 = x - 4, by0 = y - 4, bx1 = x + nd.NODE_WIDTH + 4, by1 = y + nd.NODE_HEIGHT + 4;
      // Skip the first and last segments: those run to the incident node
      // *centres*, so they pass through the node interior (and sometimes a
      // neighbour) even though the real edge stops at the perimeter. The
      // shoulder we're testing always sits on an interior segment.
      for (let i = 1; i < path.length - 2; i++) {
        if (segIntersectsRect(path[i].x, path[i].y, path[i + 1].x, path[i + 1].y, bx0, by0, bx1, by1)) return false;
      }
    }
    return true;
  };

  let spread = 0;
  for (const n of nodes) {
    const cn = centerOf(n);
    type Incident = { e: DAEdge; isSrc: boolean; angle: number };
    const incident: Incident[] = [];
    for (const e of edges) {
      if (e.srcNode === e.destNode) continue;
      if ((pairCount.get(unorderedPairKey(e)) ?? 0) > 1) continue; // sibling
      if (e.controlPoints.length === 0) continue;                 // straight
      const isSrc = e.srcNode === n;
      if (!isSrc && e.destNode !== n) continue;
      const cps = e.controlPoints;
      const aim = isSrc ? cps[0] : cps[cps.length - 1];
      incident.push({ e, isSrc, angle: Math.atan2(aim.y - cn.y, aim.x - cn.x) });
    }
    if (incident.length < 2) continue;
    incident.sort((a, b) => a.angle - b.angle);

    // Walk runs of edges that are within minAngle of their predecessor.
    let i = 0;
    while (i < incident.length) {
      let j = i;
      while (j + 1 < incident.length && incident[j + 1].angle - incident[j].angle < minAngle) j++;
      const group = incident.slice(i, j + 1);
      if (group.length >= 2) {
        // Greedy: keep each edge near its natural angle, but push any that
        // would sit within minAngle of an already-placed edge away in whichever
        // direction still clears the obstacles (offsets tried nearest-first,
        // deeper before shallower). An edge that can stay at its natural angle
        // keeps no shoulder.
        const placed: number[] = [];
        const offsets = [0, 1, -1, 2, -2, 3, -3];
        for (const g of group) {
          let done = false;
          for (const o of offsets) {
            const cand = g.angle + o * minAngle;
            if (placed.some(a => Math.abs(cand - a) < minAngle * 0.95)) continue;
            if (o === 0) { placed.push(cand); done = true; break; } // natural — no shoulder
            for (const dist of [SHOULDER, 55, 40]) {
              const shoulder = { x: cn.x + Math.cos(cand) * dist, y: cn.y + Math.sin(cand) * dist };
              const cps = g.e.controlPoints.map(p => ({ x: p.x, y: p.y }));
              if (g.isSrc) cps.unshift(shoulder); else cps.push(shoulder);
              if (polyClears(g.e, cps)) {
                g.e.setControlPoints(cps);
                placed.push(cand);
                spread++;
                done = true;
                break;
              }
            }
            if (done) break;
          }
          if (!done) placed.push(g.angle);
        }
      }
      i = j + 1;
    }
  }
  log?.(`[bezier-fit-wc] fan-attach: spread ${spread} edge ends`);
}

/** Give each parallel/anti-parallel sibling group a clean, mirror-symmetric
 *  set of arcs — but only when the corridor between the two nodes is clear, so
 *  we never undo a route that was navigating an obstacle. Each edge in a group
 *  of size k gets lane index (i - (k-1)/2) and three control points: one just
 *  outside each node offset by `laneGap * laneIndex` (so the arcs attach to the
 *  perimeter already separated — no brushing at the ends) and a midpoint offset
 *  by `laneGap * laneIndex * bulge` (so it bows out into a lens). The middle
 *  edge of an odd group (lane 0) becomes straight. Edges are ordered by id and
 *  the chord is taken in canonical node-id order, so the result is
 *  deterministic and symmetric regardless of edge direction. */
function symmetrizeSiblingGroups(
  nodes: DANode[],
  edges: DAEdge[],
  clearance: number,
  laneGap: number,
  bulge: number,
  log?: (msg: string) => void,
): void {
  // Bucket edges by unordered node pair.
  const groups = new Map<string, DAEdge[]>();
  for (const e of edges) {
    if (e.srcNode === e.destNode) continue;
    const k = unorderedPairKey(e);
    let arr = groups.get(k);
    if (!arr) { arr = []; groups.set(k, arr); }
    arr.push(e);
  }

  // Inflated boxes for the clear-corridor test.
  const inflated = new Map<DANode, Bbox2>();
  for (const n of nodes) {
    const x = n.konvaGroup.x();
    const y = n.konvaGroup.y();
    inflated.set(n, {
      minX: x - clearance, minY: y - clearance,
      maxX: x + n.NODE_WIDTH + clearance, maxY: y + n.NODE_HEIGHT + clearance,
    });
  }

  let symmetrized = 0;
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    if (group.some(e => e.controlPoints.some(cp => cp.pinned))) continue; // respect pins

    // Canonical chord endpoints (lower node id is `a`) so the perpendicular
    // direction — and thus the lane sign — is independent of edge direction.
    const sample = group[0];
    const lowerIsSrc = sample.srcNode.id < sample.destNode.id;
    const nodeA = lowerIsSrc ? sample.srcNode : sample.destNode;
    const nodeB = lowerIsSrc ? sample.destNode : sample.srcNode;
    const a = centerOf(nodeA);
    const b = centerOf(nodeB);

    // Clear corridor? If any non-incident node box straddles the chord, leave
    // the physics route (it routed around that obstacle) untouched.
    let blocked = false;
    for (const n of nodes) {
      if (n === nodeA || n === nodeB) continue;
      const bb = inflated.get(n)!;
      if (segIntersectsRect(a.x, a.y, b.x, b.y, bb.minX, bb.minY, bb.maxX, bb.maxY)) {
        blocked = true;
        break;
      }
    }
    if (blocked) continue;

    const L = Math.hypot(b.x - a.x, b.y - a.y) || 1;
    const ux = (b.x - a.x) / L;
    const uy = (b.y - a.y) / L;
    const perpX = -uy;
    const perpY = ux;
    const midX = (a.x + b.x) / 2;
    const midY = (a.y + b.y) / 2;

    // Place the near-end control points just outside each node's perimeter
    // (along the chord) so their lateral offset reads as a separated attach
    // point. Clamp so the two shoulders never cross past the midpoint on short
    // edges.
    const shoulderA = Math.min(halfExtentAlong(nodeA, ux, uy) + 10, L * 0.4);
    const shoulderB = Math.min(halfExtentAlong(nodeB, ux, uy) + 10, L * 0.4);

    const ordered = [...group].sort((e1, e2) => (e1.id < e2.id ? -1 : e1.id > e2.id ? 1 : 0));
    const k = ordered.length;
    for (let i = 0; i < k; i++) {
      const lane = i - (k - 1) / 2;
      const edge = ordered[i];
      if (Math.abs(lane) < 1e-6) {
        edge.clearControlPoints();
      } else {
        const endOff = lane * laneGap;
        const midOff = lane * laneGap * bulge;
        const cpNearA = { x: a.x + ux * shoulderA + perpX * endOff, y: a.y + uy * shoulderA + perpY * endOff };
        const cpMid = { x: midX + perpX * midOff, y: midY + perpY * midOff };
        const cpNearB = { x: b.x - ux * shoulderB + perpX * endOff, y: b.y - uy * shoulderB + perpY * endOff };
        // Control points must run src→dest. nodeA is the canonical lower-id
        // node; an edge that actually starts at nodeB needs them reversed, or
        // its path doubles back on itself (the anti-parallel crossing bug).
        edge.setControlPoints(
          edge.srcNode === nodeA ? [cpNearA, cpMid, cpNearB] : [cpNearB, cpMid, cpNearA],
        );
      }
      edge.setSmoothRendering(true);
    }
    symmetrized += k;
  }
  log?.(`[bezier-fit-wc] symmetrize: ${symmetrized} sibling edges set to symmetric arcs`);
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

/** Collapse a one-sided detour route into a single symmetric midpoint arc.
 *  Only fires when every control point lies on the same side of the chord
 *  (a simple hop past a row of nodes, not a weaving S). The single control
 *  point sits at the chord midpoint, dipped to that side by the shallowest
 *  depth at which the rendered curve still clears every non-incident node —
 *  so two structurally-identical detours land at the same depth and a detour
 *  past more nodes lands deeper. Returns the input unchanged if it weaves both
 *  sides or no clearing depth is found within the search cap. */
function collapseToSymmetricArc(
  cps: Pt[],
  srcCenter: Pt, destCenter: Pt,
  srcNode: DANode, destNode: DANode,
  nodes: DANode[], clearance: number,
): Pt[] {
  if (cps.length === 0) return cps;
  const ux = destCenter.x - srcCenter.x;
  const uy = destCenter.y - srcCenter.y;
  const L = Math.hypot(ux, uy);
  if (L < 1e-6) return cps;
  const perpX = -uy / L, perpY = ux / L;

  // Signed perpendicular offset of each cp from the chord; bail if it bows to
  // both sides (a weave can't be one symmetric bump).
  let sum = 0, minOff = Infinity, maxOff = -Infinity;
  for (const p of cps) {
    const off = (p.x - srcCenter.x) * perpX + (p.y - srcCenter.y) * perpY;
    sum += off;
    minOff = Math.min(minOff, off);
    maxOff = Math.max(maxOff, off);
  }
  if (minOff < -8 && maxOff > 8) return cps; // weaves both sides
  const side = sum >= 0 ? 1 : -1;

  const boxes: Bbox2[] = [];
  for (const n of nodes) {
    if (n === srcNode || n === destNode) continue;
    const x = n.konvaGroup.x(), y = n.konvaGroup.y();
    boxes.push({
      minX: x - clearance, minY: y - clearance,
      maxX: x + n.NODE_WIDTH + clearance, maxY: y + n.NODE_HEIGHT + clearance,
    });
  }
  const midX = (srcCenter.x + destCenter.x) / 2;
  const midY = (srcCenter.y + destCenter.y) / 2;

  // Shallowest depth (stepped) whose rendered arc clears every box.
  const cap = L * 0.7;
  for (let d = 8; d <= cap; d += 6) {
    const cp = { x: midX + perpX * side * d, y: midY + perpY * side * d };
    const poly = sampleTensionSpline([srcCenter, cp, destCenter], 0.5, 12);
    let clear = true;
    for (let i = 0; i < poly.length - 1 && clear; i++) {
      for (const b of boxes) {
        if (segIntersectsRect(poly[i].x, poly[i].y, poly[i + 1].x, poly[i + 1].y, b.minX, b.minY, b.maxX, b.maxY)) {
          clear = false;
          break;
        }
      }
    }
    if (clear) return [cp];
  }
  return cps;
}

/** Sample the Catmull-Rom tension spline through `points`, matching Konva's
 *  tensioned Line: each interior point gets a pair of bezier handles scaled by
 *  `tension`, and each span is a cubic bezier sampled `per` times. */
function sampleTensionSpline(points: Pt[], tension: number, per: number): Pt[] {
  const n = points.length;
  if (n < 3) return points.slice();
  const cp1: (Pt | null)[] = new Array(n).fill(null);
  const cp2: (Pt | null)[] = new Array(n).fill(null);
  for (let i = 1; i < n - 1; i++) {
    const p0 = points[i - 1], p1 = points[i], p2 = points[i + 1];
    const d01 = Math.hypot(p1.x - p0.x, p1.y - p0.y);
    const d12 = Math.hypot(p2.x - p1.x, p2.y - p1.y);
    const fa = (tension * d01) / (d01 + d12 || 1);
    const fb = (tension * d12) / (d01 + d12 || 1);
    cp1[i] = { x: p1.x - fa * (p2.x - p0.x), y: p1.y - fa * (p2.y - p0.y) };
    cp2[i] = { x: p1.x + fb * (p2.x - p0.x), y: p1.y + fb * (p2.y - p0.y) };
  }
  const out: Pt[] = [points[0]];
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[i], p1 = points[i + 1];
    const c0 = i === 0 ? p0 : cp2[i]!;
    const c1 = i + 1 === n - 1 ? p1 : cp1[i + 1]!;
    for (let s = 1; s <= per; s++) {
      const t = s / per, mt = 1 - t;
      const a = mt * mt * mt, b = 3 * mt * mt * t, c = 3 * mt * t * t, dd = t * t * t;
      out.push({
        x: a * p0.x + b * c0.x + c * c1.x + dd * p1.x,
        y: a * p0.y + b * c0.y + c * c1.y + dd * p1.y,
      });
    }
  }
  return out;
}

/** Greedily prune control points until removing any more would make the path
 *  clip a non-incident node box. Each step removes the interior point whose
 *  deviation from the line through its neighbors is smallest (the "flattest",
 *  least-significant point) — but only if the segment that would replace it
 *  still clears every inflated node box. Repeats until nothing is removable.
 *
 *  This is constraint-driven rather than tolerance-driven: it keeps exactly
 *  the points the obstacles force it to keep, so a symmetric path keeps a
 *  symmetric minimal set. The node centers anchor the ends (a removed end
 *  point's replacement segment runs from the node center to the next point;
 *  the visible path is a subset of that, so the test is conservative). */
function constraintPrune(
  pts: Pt[],
  srcCenter: Pt, destCenter: Pt,
  srcNode: DANode, destNode: DANode,
  nodes: DANode[], clearance: number,
): Pt[] {
  if (pts.length === 0) return pts;
  const boxes: Bbox2[] = [];
  for (const n of nodes) {
    if (n === srcNode || n === destNode) continue;
    const x = n.konvaGroup.x();
    const y = n.konvaGroup.y();
    boxes.push({
      minX: x - clearance, minY: y - clearance,
      maxX: x + n.NODE_WIDTH + clearance, maxY: y + n.NODE_HEIGHT + clearance,
    });
  }
  const clears = (p: Pt, q: Pt): boolean => {
    for (const b of boxes) {
      if (segIntersectsRect(p.x, p.y, q.x, q.y, b.minX, b.minY, b.maxX, b.maxY)) return false;
    }
    return true;
  };

  const cur = pts.map(p => ({ x: p.x, y: p.y }));
  while (cur.length > 0) {
    let best = -1;
    let bestCost = Infinity;
    for (let i = 0; i < cur.length; i++) {
      const prev = i === 0 ? srcCenter : cur[i - 1];
      const next = i === cur.length - 1 ? destCenter : cur[i + 1];
      const cost = perpDistance(cur[i], prev, next);
      if (cost < bestCost && clears(prev, next)) {
        best = i;
        bestCost = cost;
      }
    }
    if (best < 0) break;
    cur.splice(best, 1);
  }
  return cur;
}

/** Light Laplacian smoothing of an edge's interior control polygon: each pass
 *  moves every control point a fixed fraction toward the midpoint of its
 *  neighbors, with the src/dest node centers acting as the (fixed) end
 *  neighbors. Rounds out the small kinks and wobbles DP leaves behind. The
 *  fraction is deliberately small so an obstacle-avoiding bend doesn't relax
 *  back into the node it was dodging. */
function smoothControlPolygon(pts: Pt[], srcCenter: Pt, destCenter: Pt, passes: number): Pt[] {
  if (passes <= 0 || pts.length === 0) return pts;
  const ALPHA = 0.25;
  let cur = pts.map(p => ({ x: p.x, y: p.y }));
  for (let pass = 0; pass < passes; pass++) {
    const next = cur.map((p, i) => {
      const left = i === 0 ? srcCenter : cur[i - 1];
      const right = i === cur.length - 1 ? destCenter : cur[i + 1];
      const mx = (left.x + right.x) / 2;
      const my = (left.y + right.y) / 2;
      return { x: p.x * (1 - ALPHA) + mx * ALPHA, y: p.y * (1 - ALPHA) + my * ALPHA };
    });
    cur = next;
  }
  return cur;
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
