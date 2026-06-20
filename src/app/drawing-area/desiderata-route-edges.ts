import { DANode } from './da-node';
import { DAEdge } from './da-edge';
import {
  applyBezierFitWeightedChainEdges,
  BezierFitWeightedChainOptions,
  DEFAULT_OPTIONS as BEZIER_FIT_WC_DEFAULTS,
  DEFAULT_WC_OPTIONS as BEZIER_FIT_WC_BASE_DEFAULTS,
} from './bezier-fit-weighted-chain-edges';
import { computeRoutingMetrics, RoutingMetrics } from './edge-routing-metrics';
import { WeightedChainOptions } from './weighted-chain-edges';

interface Pt { x: number; y: number; }
type RouteScore = RoutingMetrics & {
  broadCrossings: number;
  closeParallelSegments: number;
  bendCount: number;
  minSharedEndpointGap: number;
  minIncidentAngleDeg: number;
};

export interface DesiderataRouteOptions {
  base: {
    fit: BezierFitWeightedChainOptions;
    wc: WeightedChainOptions;
  };
  majorGrid: number;
  passes: number;
  satisfiedObstacleClearance: number;
  satisfiedEdgeClearance: number;
  satisfiedSharedEndpointGap: number;
  satisfiedIncidentAngleDeg: number;
  simplifyMaxEdgeNodeRatio: number;
}

export const DEFAULT_OPTIONS: DesiderataRouteOptions = {
  base: {
    fit: { ...BEZIER_FIT_WC_DEFAULTS },
    wc: { ...BEZIER_FIT_WC_BASE_DEFAULTS },
  },
  majorGrid: 30,
  passes: 3,
  satisfiedObstacleClearance: 36,
  satisfiedEdgeClearance: 30,
  satisfiedSharedEndpointGap: 18,
  satisfiedIncidentAngleDeg: 12,
  simplifyMaxEdgeNodeRatio: 1.5,
};

/** Experimental router: generate a plausible route, then apply prioritized
 *  local edits. The comparator is intentionally lexicographic so a later
 *  aesthetic desideratum cannot buy its way past an earlier correctness one. */
export function applyDesiderataRouteEdges(
  nodes: DANode[],
  edges: DAEdge[],
  opts: DesiderataRouteOptions = DEFAULT_OPTIONS,
  log?: (msg: string) => void,
  frozenEdges: DAEdge[] = [],
): void {
  log?.(`[desiderata] start: base=bezier-fit-weighted-chain, grid=${opts.majorGrid}, passes=${opts.passes}`);
  applyBezierFitWeightedChainEdges(
    nodes,
    edges,
    opts.base.fit,
    opts.base.wc,
    log,
    frozenEdges,
  );

  for (let pass = 0; pass < opts.passes; pass++) {
    let changed = false;
    changed = repairNodeClips(nodes, edges, opts) || changed;
    if (shouldTrySimplification(nodes, edges, opts)) {
      changed = improveSharedEndpointFans(nodes, edges, opts) || changed;
      changed = snapWaypointsToMajorGrid(nodes, edges, opts) || changed;
      changed = pruneRedundantWaypoints(nodes, edges, opts) || changed;
    }
    if (!changed) break;
  }
  log?.('[desiderata] done');
}

function shouldTrySimplification(nodes: DANode[], edges: DAEdge[], opts: DesiderataRouteOptions): boolean {
  if (nodes.length === 0) return false;
  return edges.length / nodes.length <= opts.simplifyMaxEdgeNodeRatio;
}

function improveSharedEndpointFans(nodes: DANode[], edges: DAEdge[], opts: DesiderataRouteOptions): boolean {
  let changed = false;
  for (const node of nodes) {
    const incident = edges.filter(edge => edge.destNode === node);
    if (incident.length < 3) continue;
    let progress = true;
    while (progress) {
      progress = false;
      for (const edge of incident) {
        if (edge.srcNode === edge.destNode || hasPinnedControlPoint(edge)) continue;
        const current = ptsOf(edge);
        const candidates = fanEditCandidates(edge, node, opts);
        let best = current;
        let bestMetrics = scoreRoute(nodes, edges);
        for (const candidate of candidates) {
          edge.setControlPoints(candidate);
          const metrics = scoreRoute(nodes, edges);
          if (isBetter(metrics, bestMetrics, opts)) {
            best = candidate;
            bestMetrics = metrics;
          }
        }
        edge.setControlPoints(best);
        if (!samePoints(current, best)) {
          changed = true;
          progress = true;
        }
      }
    }
  }
  return changed;
}

function fanEditCandidates(edge: DAEdge, node: DANode, opts: DesiderataRouteOptions): Pt[][] {
  const current = ptsOf(edge);
  const path = edge.getPathPoints();
  if (path.length < 2) return [];
  const isSrc = edge.srcNode === node;
  const nearIndex = isSrc ? 0 : current.length - 1;
  const out: Pt[][] = [];

  if (current.length > 0) {
    const anchor = current[nearIndex];
    for (const point of fanPointCandidates(anchor, path, isSrc, opts.majorGrid)) {
      out.push(current.map((p, i) => i === nearIndex ? point : p));
    }
  }

  if (current.length < 3) {
    for (const point of insertedFanPointCandidates(path, isSrc, opts.majorGrid)) {
      out.push(isSrc ? [point, ...current] : [...current, point]);
    }
  }

  return out;
}

function fanPointCandidates(anchor: Pt, path: Pt[], isSrc: boolean, grid: number): Pt[] {
  const endpoint = isSrc ? path[0] : path[path.length - 1];
  const neighbor = isSrc ? path[1] : path[path.length - 2];
  const tangent = vector(endpoint, neighbor);
  const perp = unit({ x: -tangent.y, y: tangent.x });
  const candidates: Pt[] = [];
  for (const amount of [grid, grid * 1.5, grid * 2]) {
    candidates.push(
      { x: anchor.x + amount, y: anchor.y },
      { x: anchor.x - amount, y: anchor.y },
      { x: anchor.x, y: anchor.y + amount },
      { x: anchor.x, y: anchor.y - amount },
      { x: anchor.x + perp.x * amount, y: anchor.y + perp.y * amount },
      { x: anchor.x - perp.x * amount, y: anchor.y - perp.y * amount },
    );
  }
  return uniquePoints(candidates.map(p => ({ x: roundTo(p.x, grid / 2), y: roundTo(p.y, grid / 2) })));
}

function insertedFanPointCandidates(path: Pt[], isSrc: boolean, grid: number): Pt[] {
  const start = path[0];
  const end = path[path.length - 1];
  const endpoint = isSrc ? start : end;
  const other = isSrc ? end : start;
  const chord = vector(other, endpoint);
  const perp = unit({ x: -chord.y, y: chord.x });
  const candidates: Pt[] = [];
  for (const t of [0.55, 0.7, 0.82]) {
    const base = {
      x: other.x + chord.x * t,
      y: other.y + chord.y * t,
    };
    for (const amount of [0, grid, grid * 1.5, grid * 2]) {
      candidates.push(
        { x: base.x + perp.x * amount, y: base.y + perp.y * amount },
        { x: base.x - perp.x * amount, y: base.y - perp.y * amount },
        { x: base.x + amount, y: base.y },
        { x: base.x - amount, y: base.y },
      );
    }
  }
  return uniquePoints(candidates.map(p => ({ x: roundTo(p.x, grid / 2), y: roundTo(p.y, grid / 2) })));
}

function repairNodeClips(nodes: DANode[], edges: DAEdge[], opts: DesiderataRouteOptions): boolean {
  let changed = false;
  for (const edge of edges) {
    if (edge.srcNode === edge.destNode || hasPinnedControlPoint(edge)) continue;
    const hit = firstNodeClip(edge, nodes);
    if (!hit) continue;
    changed = tryRepairNodeClip(edge, hit, nodes, edges, opts) || changed;
  }
  return changed;
}

function snapWaypointsToMajorGrid(nodes: DANode[], edges: DAEdge[], opts: DesiderataRouteOptions): boolean {
  const grid = opts.majorGrid;
  if (grid <= 0) return false;
  let changed = false;
  for (const edge of edges) {
    if (edge.srcNode === edge.destNode || hasPinnedControlPoint(edge)) continue;
    const original = ptsOf(edge);
    for (let i = 0; i < original.length; i++) {
      const current = ptsOf(edge);
      const candidates = snapCandidates(current[i], grid);
      let best = current;
      let bestMetrics = scoreRoute(nodes, edges);
      for (const candidatePt of candidates) {
        const candidate = current.map((p, j) => j === i ? candidatePt : p);
        edge.setControlPoints(candidate);
        const metrics = scoreRoute(nodes, edges);
        if (isBetter(metrics, bestMetrics, opts)) {
          best = candidate;
          bestMetrics = metrics;
        }
      }
      edge.setControlPoints(best);
      changed = changed || !samePoints(current, best);
    }
  }
  return changed;
}

function pruneRedundantWaypoints(nodes: DANode[], edges: DAEdge[], opts: DesiderataRouteOptions): boolean {
  let changed = false;
  for (const edge of edges) {
    if (edge.srcNode === edge.destNode || hasPinnedControlPoint(edge)) continue;
    let current = ptsOf(edge);
    let progress = true;
    while (progress && current.length > 0) {
      progress = false;
      let best = current;
      let bestMetrics = scoreRoute(nodes, edges);
      for (let i = 0; i < current.length; i++) {
        const candidate = current.filter((_, j) => j !== i);
        edge.setControlPoints(candidate);
        const metrics = scoreRoute(nodes, edges);
        if (isNoWorseForSimplification(metrics, bestMetrics, opts)) {
          best = candidate;
          bestMetrics = metrics;
          progress = true;
        }
      }
      edge.setControlPoints(best);
      changed = changed || progress;
      current = best;
    }
  }
  return changed;
}

function tryRepairNodeClip(
  edge: DAEdge,
  obstacle: DANode,
  nodes: DANode[],
  edges: DAEdge[],
  opts: DesiderataRouteOptions,
): boolean {
  const original = ptsOf(edge);
  const obstacleBox = bboxOf(obstacle);
  const inflated = inflateBox(obstacleBox, opts.base.wc.clearance);
  const cleaned = original.filter(p => !insideBox(p, obstacleBox));
  let best: Pt[] | null = null;
  let bestMetrics = scoreRoute(nodes, edges);

  for (let insertAt = 0; insertAt <= cleaned.length; insertAt++) {
    for (const detour of detourCandidates(inflated)) {
      const candidate = [
        ...cleaned.slice(0, insertAt),
        ...detour,
        ...cleaned.slice(insertAt),
      ];
      edge.setControlPoints(candidate);
      const metrics = scoreRoute(nodes, edges);
      if (isBetter(metrics, bestMetrics, opts)) {
        best = candidate;
        bestMetrics = metrics;
      }
    }
  }

  edge.setControlPoints(best ?? original);
  return best !== null;
}

function firstNodeClip(edge: DAEdge, nodes: DANode[]): DANode | null {
  const path = edge.getPathPoints();
  for (const node of nodes) {
    if (node === edge.srcNode || node === edge.destNode) continue;
    const box = bboxOf(node);
    for (let i = 0; i < path.length - 1; i++) {
      if (segmentIntersectsBox(path[i], path[i + 1], box)) return node;
    }
  }
  return null;
}

function snapCandidates(point: Pt, grid: number): Pt[] {
  const x = roundTo(point.x, grid);
  const y = roundTo(point.y, grid);
  return uniquePoints([
    { x, y: point.y },
    { x: point.x, y },
    { x, y },
    { x: Math.floor(point.x / grid) * grid, y: point.y },
    { x: Math.ceil(point.x / grid) * grid, y: point.y },
    { x: point.x, y: Math.floor(point.y / grid) * grid },
    { x: point.x, y: Math.ceil(point.y / grid) * grid },
  ]).filter(p => dist(p, point) > 0.01 && dist(p, point) <= grid * 0.75);
}

function detourCandidates(box: Bbox): Pt[][] {
  const corners = [
    { x: box.minX, y: box.minY },
    { x: box.maxX, y: box.minY },
    { x: box.maxX, y: box.maxY },
    { x: box.minX, y: box.maxY },
  ];
  const candidates: Pt[][] = corners.map(c => [c]);
  for (let i = 0; i < corners.length; i++) {
    candidates.push([corners[i], corners[(i + 1) % corners.length]]);
    candidates.push([corners[(i + 1) % corners.length], corners[i]]);
  }
  return candidates;
}

function isBetter(candidate: RouteScore, current: RouteScore, opts: DesiderataRouteOptions): boolean {
  const ordered = compareMetrics(candidate, current, opts);
  return ordered < 0;
}

function isNoWorseForSimplification(candidate: RouteScore, current: RouteScore, opts: DesiderataRouteOptions): boolean {
  const ordered = compareMetrics(candidate, current, opts);
  if (ordered < 0) return true;
  if (ordered > 0) return false;
  return candidate.bendCount < current.bendCount ||
    candidate.totalLength <= current.totalLength + 0.01;
}

function compareMetrics(a: RouteScore, b: RouteScore, opts: DesiderataRouteOptions): number {
  const lowerIsBetter: Array<keyof RouteScore> = [
    'hardFailCount',
    'edgesThroughNodes',
    'siblingCrossings',
    'selfIntersections',
    'nonSiblingCrossings',
    'closeParallelSegments',
  ];
  for (const key of lowerIsBetter) {
    const delta = a[key] - b[key];
    if (Math.abs(delta) > toleranceFor(key)) return delta < 0 ? -1 : 1;
  }

  const higherIsBetter: Array<keyof RouteScore> = [
    'minCrossingAngleDeg',
    'minObstacleClearance',
    'minEdgeEdgeClearance',
    'minSharedEndpointGap',
    'minIncidentAngleDeg',
  ];
  for (const key of higherIsBetter) {
    const delta = comparableMetricValue(a, key, opts) - comparableMetricValue(b, key, opts);
    if (Math.abs(delta) > toleranceFor(key)) return delta > 0 ? -1 : 1;
  }

  const crossingLowerIsBetter: Array<keyof RouteScore> = [
    'broadCrossings',
  ];
  for (const key of crossingLowerIsBetter) {
    const delta = a[key] - b[key];
    if (Math.abs(delta) > toleranceFor(key)) return delta < 0 ? -1 : 1;
  }

  const aestheticLowerIsBetter: Array<keyof RouteScore> = [
    'maxBulgeRatio',
    'totalCurvature',
    'bendCount',
    'totalLength',
  ];
  for (const key of aestheticLowerIsBetter) {
    const delta = a[key] - b[key];
    if (Math.abs(delta) > toleranceFor(key)) return delta < 0 ? -1 : 1;
  }
  return 0;
}

function comparableMetricValue(score: RouteScore, key: keyof RouteScore, opts: DesiderataRouteOptions): number {
  if (key === 'minObstacleClearance') {
    return Math.min(score.minObstacleClearance, opts.satisfiedObstacleClearance);
  }
  if (key === 'minEdgeEdgeClearance') {
    return Math.min(score.minEdgeEdgeClearance, opts.satisfiedEdgeClearance);
  }
  if (key === 'minSharedEndpointGap') {
    return Math.min(score.minSharedEndpointGap, opts.satisfiedSharedEndpointGap);
  }
  if (key === 'minIncidentAngleDeg') {
    return Math.min(score.minIncidentAngleDeg, opts.satisfiedIncidentAngleDeg);
  }
  return score[key];
}

function scoreRoute(nodes: DANode[], edges: DAEdge[]): RouteScore {
  return {
    ...computeRoutingMetrics(nodes, edges),
    broadCrossings: countBroadCrossings(edges),
    closeParallelSegments: countCloseParallelSegments(edges),
    bendCount: edges.reduce((sum, edge) => sum + edge.controlPoints.length, 0),
    ...computeIncidentSeparation(edges),
  };
}

function toleranceFor(key: keyof RouteScore): number {
  switch (key) {
    case 'totalLength':
      return 0.5;
    case 'totalCurvature':
      return 0.02;
    case 'maxBulgeRatio':
      return 0.01;
    case 'minObstacleClearance':
    case 'minEdgeEdgeClearance':
    case 'minSharedEndpointGap':
      return 0.5;
    case 'minCrossingAngleDeg':
    case 'minIncidentAngleDeg':
      return 0.5;
    default:
      return 0;
  }
}

function ptsOf(edge: DAEdge): Pt[] {
  return edge.controlPoints.map(p => ({ x: p.x, y: p.y }));
}

function hasPinnedControlPoint(edge: DAEdge): boolean {
  return edge.controlPoints.some(p => p.pinned);
}

interface Bbox { minX: number; minY: number; maxX: number; maxY: number; }

function bboxOf(node: DANode): Bbox {
  const x = node.konvaGroup.x();
  const y = node.konvaGroup.y();
  return { minX: x, minY: y, maxX: x + node.NODE_WIDTH, maxY: y + node.NODE_HEIGHT };
}

function inflateBox(box: Bbox, amount: number): Bbox {
  return {
    minX: box.minX - amount,
    minY: box.minY - amount,
    maxX: box.maxX + amount,
    maxY: box.maxY + amount,
  };
}

function insideBox(point: Pt, box: Bbox): boolean {
  return point.x > box.minX && point.x < box.maxX && point.y > box.minY && point.y < box.maxY;
}

function segmentIntersectsBox(a: Pt, b: Pt, box: Bbox): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const tests = [
    { p: -dx, q: a.x - box.minX },
    { p: dx, q: box.maxX - a.x },
    { p: -dy, q: a.y - box.minY },
    { p: dy, q: box.maxY - a.y },
  ];
  for (const { p, q } of tests) {
    if (Math.abs(p) < 1e-9) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
  }
  return t0 <= t1 && t1 >= 0 && t0 <= 1;
}

function countBroadCrossings(edges: DAEdge[]): number {
  const segments: Array<{ edgeIndex: number; a: Pt; b: Pt }> = [];
  for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex++) {
    const edge = edges[edgeIndex];
    if (edge.srcNode === edge.destNode) continue;
    const path = edge.getPathPoints();
    for (let i = 0; i < path.length - 1; i++) {
      segments.push({ edgeIndex, a: path[i], b: path[i + 1] });
    }
  }

  let count = 0;
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      if (segments[i].edgeIndex === segments[j].edgeIndex) continue;
      if (segmentsIntersect(segments[i].a, segments[i].b, segments[j].a, segments[j].b)) {
        count++;
      }
    }
  }
  return count;
}

function countCloseParallelSegments(edges: DAEdge[]): number {
  const segments = collectSegments(edges);
  let count = 0;
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      if (segments[i].edgeIndex === segments[j].edgeIndex) continue;
      if (areCloseParallelSegments(segments[i].a, segments[i].b, segments[j].a, segments[j].b)) {
        count++;
      }
    }
  }
  return count;
}

function collectSegments(edges: DAEdge[]): Array<{ edgeIndex: number; a: Pt; b: Pt }> {
  const segments: Array<{ edgeIndex: number; a: Pt; b: Pt }> = [];
  for (let edgeIndex = 0; edgeIndex < edges.length; edgeIndex++) {
    const edge = edges[edgeIndex];
    if (edge.srcNode === edge.destNode) continue;
    const path = edge.getPathPoints();
    for (let i = 0; i < path.length - 1; i++) {
      segments.push({ edgeIndex, a: path[i], b: path[i + 1] });
    }
  }
  return segments;
}

function areCloseParallelSegments(a1: Pt, a2: Pt, b1: Pt, b2: Pt): boolean {
  const av = vector(a1, a2);
  const bv = vector(b1, b2);
  const alen = Math.hypot(av.x, av.y);
  const blen = Math.hypot(bv.x, bv.y);
  if (alen < 20 || blen < 20) return false;
  const angle = Math.min(angleBetween(av, bv), 180 - angleBetween(av, bv));
  if (angle > 6) return false;
  const gap = Math.min(
    pointSegmentDistance(a1, b1, b2),
    pointSegmentDistance(a2, b1, b2),
    pointSegmentDistance(b1, a1, a2),
    pointSegmentDistance(b2, a1, a2),
  );
  if (gap > 12) return false;
  return projectedOverlapLength(a1, a2, b1, b2) > 28;
}

function projectedOverlapLength(a1: Pt, a2: Pt, b1: Pt, b2: Pt): number {
  const dx = a2.x - a1.x;
  const dy = a2.y - a1.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return 0;
  const ux = dx / len;
  const uy = dy / len;
  const aMin = 0;
  const aMax = len;
  const bProj1 = (b1.x - a1.x) * ux + (b1.y - a1.y) * uy;
  const bProj2 = (b2.x - a1.x) * ux + (b2.y - a1.y) * uy;
  const bMin = Math.min(bProj1, bProj2);
  const bMax = Math.max(bProj1, bProj2);
  return Math.max(0, Math.min(aMax, bMax) - Math.max(aMin, bMin));
}

function computeIncidentSeparation(edges: DAEdge[]): {
  minSharedEndpointGap: number;
  minIncidentAngleDeg: number;
} {
  const byNode = new Map<DANode, Array<{ point: Pt; dir: Pt }>>();
  for (const edge of edges) {
    if (edge.srcNode === edge.destNode) continue;
    const path = edge.getPathPoints();
    if (path.length < 2) continue;
    addIncident(byNode, edge.srcNode, path[0], vector(path[0], path[1]));
    addIncident(byNode, edge.destNode, path[path.length - 1], vector(path[path.length - 1], path[path.length - 2]));
  }

  let minSharedEndpointGap = Infinity;
  let minIncidentAngleDeg = Infinity;
  for (const entries of byNode.values()) {
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        minSharedEndpointGap = Math.min(
          minSharedEndpointGap,
          dist(entries[i].point, entries[j].point),
        );
        minIncidentAngleDeg = Math.min(
          minIncidentAngleDeg,
          angleBetween(entries[i].dir, entries[j].dir),
        );
      }
    }
  }

  return {
    minSharedEndpointGap: Number.isFinite(minSharedEndpointGap) ? minSharedEndpointGap : 60,
    minIncidentAngleDeg: Number.isFinite(minIncidentAngleDeg) ? minIncidentAngleDeg : 90,
  };
}

function addIncident(
  byNode: Map<DANode, Array<{ point: Pt; dir: Pt }>>,
  node: DANode,
  point: Pt,
  dir: Pt,
): void {
  let entries = byNode.get(node);
  if (!entries) {
    entries = [];
    byNode.set(node, entries);
  }
  entries.push({ point, dir });
}

function vector(from: Pt, to: Pt): Pt {
  return { x: to.x - from.x, y: to.y - from.y };
}

function unit(v: Pt): Pt {
  const len = Math.hypot(v.x, v.y);
  if (len < 1e-9) return { x: 1, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

function angleBetween(a: Pt, b: Pt): number {
  const alen = Math.hypot(a.x, a.y);
  const blen = Math.hypot(b.x, b.y);
  if (alen < 1e-9 || blen < 1e-9) return 0;
  const cos = (a.x * b.x + a.y * b.y) / (alen * blen);
  return Math.acos(Math.max(-1, Math.min(1, cos))) * 180 / Math.PI;
}

function segmentsIntersect(a1: Pt, a2: Pt, b1: Pt, b2: Pt): boolean {
  const d = (a2.x - a1.x) * (b2.y - b1.y) - (a2.y - a1.y) * (b2.x - b1.x);
  if (Math.abs(d) < 1e-9) return false;
  const t = ((b1.x - a1.x) * (b2.y - b1.y) - (b1.y - a1.y) * (b2.x - b1.x)) / d;
  const u = ((b1.x - a1.x) * (a2.y - a1.y) - (b1.y - a1.y) * (a2.x - a1.x)) / d;
  return t > 0 && t < 1 && u > 0 && u < 1;
}

function roundTo(value: number, grid: number): number {
  return Math.round(value / grid) * grid;
}

function samePoints(a: Pt[], b: Pt[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((p, i) => dist(p, b[i]) < 0.01);
}

function uniquePoints(points: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const point of points) {
    if (!out.some(p => dist(p, point) < 0.01)) out.push(point);
  }
  return out;
}

function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function pointSegmentDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}
