// incremental-desiderata-v3 — harness-only experimental router (successor to
// incremental-desiderata-v2). Same per-edge, curve-scored, budgeted hill-climb
// as v2, plus four targeted improvements identified by case review:
//
//   1. RELAXATION SWEEPS. v2 routes each edge once against the already-placed
//      edges and freezes it; a fan that arrives early never sees the edges that
//      land later, so it can crowd or be crossed (converge-circular S3→In
//      crossing S1/S2→In). v3 follows the initial pass with a few Gauss-Seidel
//      sweeps that re-route every edge against ALL the others, so the fan
//      settles into even spacing.
//   2. FAN INTERIOR SEPARATION. The scorer (gated flag) now keeps two edges that
//      share one endpoint apart along their interiors, not just at the hub, so
//      fan-out arcs stop grazing (converge-circular Out→D3/D4).
//   3. SYMMETRIC-ARC COLLAPSE. After an edge converges, a one-sided detour is
//      collapsed to a single centred waypoint at the shallowest clearing depth —
//      escaping the greedy plateau that left v2 with multi-waypoint wiggles
//      (bypass-obstacle's 3-point kink). Ported from bezier-fit-weighted-chain.
//   4. CLUSTER-AWARE BYPASS. v2's bypass offsets around each clipped node
//      independently, which threads tight gaps between obstacles. v3 also routes
//      around the UNION of obstacles whose gap is below clusterGap, so it goes
//      around a tight pair instead of between them (tangent-grazing B→D vs OBS).
//
// As in v2: scoring is always LOCAL (one edge's curve vs nodes + nearby context
// curves), everything runs inside hard budgets, and edges left with hard-tier
// failures are reported in `uncleanEdges`. NOT wired into the app/worker —
// registered only in the routing-eval bundle-entry.

import type { DANode } from './da-node';
import type { DAEdge } from './da-edge';
import {
  Pt, Bbox, unit, vector, dist, bboxOf, inflateBox, segmentIntersectsBox,
} from './routing-geometry';
import { sampleSmoothPath } from './routing-curve';
import {
  ContextEdge,
  LocalScore,
  LocalScoreOptions,
  DEFAULT_LOCAL_SCORE_OPTIONS,
  compareLocalScores,
  scoreEdgeRoute,
} from './routing-local-score';

export interface IncrementalBudgets {
  maxCandidatesPerEdge: number;
  maxIterationsPerEdge: number;
  maxMovesPerIteration: number;
  maxTotalScoreCalls: number;
  maxElapsedMs: number;
}

export interface IncrementalDesiderataV3Options {
  local: LocalScoreOptions;
  tension: number;
  stepsPerSegment: number;
  perpOffset: number;
  moveStep: number;
  maxWaypoints: number;
  nearbyMargin: number;
  /** Number of Gauss-Seidel relaxation sweeps after the initial placement. Each
   *  sweep re-routes every edge against all the others. 0 = v2 behaviour. */
  relaxationPasses: number;
  /** Obstacles whose mutual box-gap is below this (px) are treated as one
   *  cluster and routed around together rather than threaded between. */
  clusterGap: number;
  /** Collapse a one-sided detour to a single symmetric waypoint after refine. */
  collapseSymmetricArcs: boolean;
  budgets: IncrementalBudgets;
}

export const DEFAULT_OPTIONS: IncrementalDesiderataV3Options = {
  local: {
    ...DEFAULT_LOCAL_SCORE_OPTIONS,
    fanSeparationEnabled: true,
    satisfiedFanSeparation: 28,
    fanHubExclusion: 90,
    wholePathClearance: true,
    endpointClearanceRadius: 55,
  },
  tension: 0.5,
  stepsPerSegment: 8,
  perpOffset: 70,
  moveStep: 45,
  maxWaypoints: 4,
  nearbyMargin: 240,
  relaxationPasses: 2,
  clusterGap: 72, // ~2 × satisfiedNodeClearance
  collapseSymmetricArcs: true,
  budgets: {
    maxCandidatesPerEdge: 8,
    maxIterationsPerEdge: 20,
    maxMovesPerIteration: 32,
    maxTotalScoreCalls: 60000,
    maxElapsedMs: 8000,
  },
};

export interface IncrementalRouterStats {
  nodeCount: number;
  edgeCount: number;
  candidatesEvaluated: number;
  scoreCalls: number;
  refineIterations: number;
  relaxationSweeps: number;
  elapsedMs: number;
  budgetHit: boolean;
  uncleanEdges: string[];
}

export function applyIncrementalDesiderataV3RouteEdges(
  nodes: DANode[],
  edges: DAEdge[],
  opts: IncrementalDesiderataV3Options = DEFAULT_OPTIONS,
  log?: (msg: string) => void,
  frozenEdges: DAEdge[] = [],
): IncrementalRouterStats {
  const startMs = Date.now();
  const stats: IncrementalRouterStats = {
    nodeCount: nodes.length,
    edgeCount: edges.length,
    candidatesEvaluated: 0,
    scoreCalls: 0,
    refineIterations: 0,
    relaxationSweeps: 0,
    elapsedMs: 0,
    budgetHit: false,
    uncleanEdges: [],
  };

  const routable = edges.filter(e => e.srcNode !== e.destNode);
  for (const edge of routable) {
    edge.setControlPoints([]);
    edge.setSmoothRendering(true);
  }

  const ordered = [...routable].sort(compareEdgeOrder);

  const frozenContext: ContextEdge[] = frozenEdges
    .filter(e => e.srcNode !== e.destNode)
    .map(e => toContext(e, opts));

  // --- Initial pass: place each edge against earlier ones + frozen context.
  const context: ContextEdge[] = [...frozenContext];
  const lastScore = new Map<DAEdge, LocalScore | null>();
  for (const edge of ordered) {
    if (outOfGlobalBudget(stats, startMs, opts)) { stats.budgetHit = true; break; }
    const nearby = filterNearby(edge, context, opts);
    const best = routeOneEdge(edge, nodes, nearby, opts, stats, startMs);
    edge.setControlPoints(best.controlPoints);
    edge.setSmoothRendering(true);
    lastScore.set(edge, best.score);
    context.push(toContext(edge, opts));
  }

  // --- Relaxation sweeps: re-route every edge against ALL others. Lets edges
  // placed early react to ones placed late (even fan spacing, fewer crossings).
  for (let pass = 0; pass < opts.relaxationPasses; pass++) {
    if (outOfGlobalBudget(stats, startMs, opts)) { stats.budgetHit = true; break; }
    stats.relaxationSweeps++;
    let changed = false;
    for (const edge of ordered) {
      if (outOfGlobalBudget(stats, startMs, opts)) { stats.budgetHit = true; break; }
      const others = contextOfOthers(edge, ordered, frozenContext, opts);
      const nearby = filterNearby(edge, others, opts);
      const current: EdgeChoice = {
        controlPoints: edge.controlPoints.map(p => ({ x: p.x, y: p.y })),
        score: null,
      };
      // Re-score the current route against the (now complete) context so the
      // comparison is apples-to-apples with the candidates.
      current.score = evaluate(edge, current.controlPoints, nodes, nearby, opts, stats);
      const best = routeOneEdge(edge, nodes, nearby, opts, stats, startMs, current);
      edge.setControlPoints(best.controlPoints);
      edge.setSmoothRendering(true);
      lastScore.set(edge, best.score);
      if (!samePointList(current.controlPoints, best.controlPoints)) changed = true;
    }
    if (!changed) break; // settled
  }

  for (const edge of ordered) {
    const s = lastScore.get(edge);
    if (s && s.hardFailCount > 0) stats.uncleanEdges.push(edge.id);
  }

  stats.elapsedMs = Date.now() - startMs;
  log?.(
    `[incremental-v3] nodes=${stats.nodeCount} edges=${stats.edgeCount} ` +
    `cand=${stats.candidatesEvaluated} score=${stats.scoreCalls} ` +
    `iters=${stats.refineIterations} sweeps=${stats.relaxationSweeps} ms=${stats.elapsedMs} ` +
    `budgetHit=${stats.budgetHit} unclean=${stats.uncleanEdges.length}`,
  );
  return stats;
}

interface EdgeChoice {
  controlPoints: Pt[];
  score: LocalScore | null;
}

function routeOneEdge(
  edge: DAEdge,
  nodes: DANode[],
  context: ContextEdge[],
  opts: IncrementalDesiderataV3Options,
  stats: IncrementalRouterStats,
  startMs: number,
  initial?: EdgeChoice,
): EdgeChoice {
  // 1. Seed — fixed candidate set, plus the current route (for relaxation) so a
  // sweep can only improve, never regress, an edge by its own measure.
  let best: EdgeChoice = initial
    ? { controlPoints: initial.controlPoints.map(p => ({ ...p })), score: initial.score }
    : { controlPoints: [], score: null };
  const seeds = buildSeedCandidates(edge, opts).slice(0, opts.budgets.maxCandidatesPerEdge);
  for (const candidate of seeds) {
    if (outOfGlobalBudget(stats, startMs, opts)) { stats.budgetHit = true; break; }
    const score = evaluate(edge, candidate, nodes, context, opts, stats);
    if (best.score === null || compareLocalScores(score, best.score, opts.local) < 0) {
      best = { controlPoints: candidate, score };
    }
  }

  // 2. Refine — bounded hill-climb; stop early when no move improves.
  for (let iter = 0; iter < opts.budgets.maxIterationsPerEdge; iter++) {
    if (outOfGlobalBudget(stats, startMs, opts)) { stats.budgetHit = true; break; }
    stats.refineIterations++;
    const moves = generateMoves(edge, best.controlPoints, nodes, opts, iter)
      .slice(0, opts.budgets.maxMovesPerIteration);

    let improved = false;
    for (const candidate of moves) {
      if (outOfGlobalBudget(stats, startMs, opts)) { stats.budgetHit = true; break; }
      const score = evaluate(edge, candidate, nodes, context, opts, stats);
      if (best.score === null || compareLocalScores(score, best.score, opts.local) < 0) {
        best = { controlPoints: candidate, score };
        improved = true;
      }
    }
    if (!improved) break;
  }

  // 3. Collapse a one-sided detour to a single symmetric waypoint.
  if (opts.collapseSymmetricArcs) {
    best = maybeCollapseSymmetric(edge, best, nodes, context, opts, stats);
  }

  return best;
}

/** Try replacing a one-sided multi-waypoint detour with a single centred
 *  waypoint. The greedy hill-climb can get stuck removing waypoints one at a
 *  time through asymmetric intermediates that re-clip; synthesising a fresh
 *  centred waypoint jumps straight to the clean symmetric arc. Kept only if it
 *  compares no-worse — and since fewer bends rank above length/curvature, an
 *  equally-clear single waypoint wins.
 *
 *  Tries BOTH sides of the chord: a detour threading a tight corridor on its
 *  own side (tangent-grazing B→D between C and A→D's dip) may collapse cleanly
 *  only by flipping over the obstacle to the open side. The original-side
 *  candidates are unchanged, so this is a strict candidate superset. */
function maybeCollapseSymmetric(
  edge: DAEdge, best: EdgeChoice, nodes: DANode[], context: ContextEdge[],
  opts: IncrementalDesiderataV3Options, stats: IncrementalRouterStats,
): EdgeChoice {
  const cp = best.controlPoints;
  if (cp.length < 2) return best;
  const s = center(edge.srcNode), d = center(edge.destNode);
  const ux = d.x - s.x, uy = d.y - s.y;
  const L = Math.hypot(ux, uy);
  if (L < 1e-6) return best;
  const perpX = -uy / L, perpY = ux / L;

  let minOff = Infinity, maxOff = -Infinity, sum = 0;
  for (const p of cp) {
    const o = (p.x - s.x) * perpX + (p.y - s.y) * perpY;
    sum += o; minOff = Math.min(minOff, o); maxOff = Math.max(maxOff, o);
  }
  if (minOff < -8 && maxOff > 8) return best; // weaves both sides — not a simple arc
  const side = sum >= 0 ? 1 : -1;
  const depthBase = Math.max(Math.abs(minOff), Math.abs(maxOff));
  const midX = (s.x + d.x) / 2, midY = (s.y + d.y) / 2;

  let cand = best;
  for (const sgn of [side, -side]) {
    for (const f of [0.8, 1.0, 1.2, 1.45, 1.75]) {
      const depth = depthBase * f;
      const wp = { x: midX + perpX * sgn * depth, y: midY + perpY * sgn * depth };
      const score = evaluate(edge, [wp], nodes, context, opts, stats);
      if (compareLocalScores(score, cand.score!, opts.local) < 0) {
        cand = { controlPoints: [wp], score };
      }
    }
  }
  return cand;
}

function evaluate(
  edge: DAEdge,
  candidate: Pt[],
  nodes: DANode[],
  context: ContextEdge[],
  opts: IncrementalDesiderataV3Options,
  stats: IncrementalRouterStats,
): LocalScore {
  edge.setControlPoints(candidate);
  const curve = sampleSmoothPath(edge.getPathPoints(), opts.tension, opts.stepsPerSegment);
  const score = scoreEdgeRoute(
    curve, edge.srcNode, edge.destNode, candidate.length, nodes, context, opts.local,
  );
  stats.scoreCalls++;
  stats.candidatesEvaluated++;
  return score;
}

function buildSeedCandidates(edge: DAEdge, opts: IncrementalDesiderataV3Options): Pt[][] {
  const s = center(edge.srcNode);
  const d = center(edge.destNode);
  const chord = vector(s, d);
  const perp = unit({ x: -chord.y, y: chord.x });
  const k = opts.perpOffset;
  const mid = { x: (s.x + d.x) / 2, y: (s.y + d.y) / 2 };
  const p1 = { x: s.x + chord.x / 3, y: s.y + chord.y / 3 };
  const p2 = { x: s.x + (chord.x * 2) / 3, y: s.y + (chord.y * 2) / 3 };
  return [
    [],
    [{ x: d.x, y: s.y }],
    [{ x: s.x, y: d.y }],
    [offset(mid, perp, k)],
    [offset(mid, perp, -k)],
    [offset(p1, perp, k), offset(p2, perp, k)],
    [offset(p1, perp, -k), offset(p2, perp, -k)],
  ];
}

function generateMoves(
  edge: DAEdge, cp: Pt[], nodes: DANode[], opts: IncrementalDesiderataV3Options, iter: number,
): Pt[][] {
  const s = center(edge.srcNode);
  const d = center(edge.destNode);
  const perp = unit({ x: -(d.y - s.y), y: d.x - s.x });
  const decay = Math.max(0.35, 1 - (iter / opts.budgets.maxIterationsPerEdge) * 0.7);
  const step = opts.moveStep * decay;
  const moves: Pt[][] = [];

  // Per-node bypass (around each clipped node, both sides).
  for (const bypass of obstacleBypassCandidates(edge, cp, nodes, perp, s, opts)) {
    moves.push(bypass);
  }
  // Cluster bypass (around the union of tight-gap obstacle groups, both sides).
  for (const around of clusterBypassCandidates(edge, cp, nodes, perp, s, opts)) {
    moves.push(around);
  }

  // MOVE
  const deltas: Pt[] = [
    { x: perp.x * step, y: perp.y * step },
    { x: -perp.x * step, y: -perp.y * step },
    { x: perp.x * step * 2, y: perp.y * step * 2 },
    { x: -perp.x * step * 2, y: -perp.y * step * 2 },
    { x: step, y: 0 }, { x: -step, y: 0 },
    { x: 0, y: step }, { x: 0, y: -step },
  ];
  for (let i = 0; i < cp.length; i++) {
    for (const delta of deltas) {
      moves.push(cp.map((p, j) => (j === i ? { x: p.x + delta.x, y: p.y + delta.y } : p)));
    }
  }

  // ADD
  if (cp.length < opts.maxWaypoints) {
    for (const ins of insertionCandidates(edge, cp, nodes, perp, step)) {
      moves.push([...cp.slice(0, ins.index), ins.point, ...cp.slice(ins.index)]);
    }
  }

  // REMOVE
  for (let i = 0; i < cp.length; i++) {
    moves.push(cp.filter((_, j) => j !== i));
  }

  return moves;
}

function obstacleBypassCandidates(
  edge: DAEdge, cp: Pt[], nodes: DANode[], perp: Pt, s: Pt, opts: IncrementalDesiderataV3Options,
): Pt[][] {
  edge.setControlPoints(cp);
  const curve = sampleSmoothPath(edge.getPathPoints(), opts.tension, opts.stepsPerSegment);
  const chordU = unit(vector(s, center(edge.destNode)));
  const clipped: DANode[] = [];
  for (const node of nodes) {
    if (node === edge.srcNode || node === edge.destNode) continue;
    const box = bboxOf(node);
    for (let i = 0; i < curve.length - 1; i++) {
      if (segmentIntersectsBox(curve[i], curve[i + 1], box)) { clipped.push(node); break; }
    }
  }
  if (clipped.length === 0 || clipped.length > opts.maxWaypoints) return [];

  const clearance = opts.local.satisfiedNodeClearance * 0.7;
  const out: Pt[][] = [];
  for (const sign of [1, -1]) {
    const wps = clipped.map(node => {
      const c = center(node);
      const ext = Math.abs(perp.x) * (node.NODE_WIDTH / 2) + Math.abs(perp.y) * (node.NODE_HEIGHT / 2);
      const distOff = ext + clearance;
      const pt = { x: c.x + sign * perp.x * distOff, y: c.y + sign * perp.y * distOff };
      const t = (c.x - s.x) * chordU.x + (c.y - s.y) * chordU.y;
      return { pt, t };
    });
    wps.sort((a, b) => a.t - b.t);
    out.push(wps.map(w => w.pt));
  }
  return out;
}

/** Candidates that route around the UNION of each tight-gap obstacle cluster
 *  (≥2 nodes) near the chord, on each side. A cluster's two waypoints sit just
 *  outside the union box's chord-extent corners, offset perpendicular clear of
 *  the whole box — so the edge goes around the pair instead of threading the
 *  sub-clearance gap between them. Single near-chord nodes are left to the
 *  per-node bypass above. */
function clusterBypassCandidates(
  edge: DAEdge, cp: Pt[], nodes: DANode[], perp: Pt, s: Pt, opts: IncrementalDesiderataV3Options,
): Pt[][] {
  const d = center(edge.destNode);
  const chordU = unit(vector(s, d));
  const L = Math.hypot(d.x - s.x, d.y - s.y);
  if (L < 1e-6) return [];

  // Obstacle nodes within clusterGap of the chord corridor.
  const near: DANode[] = [];
  for (const node of nodes) {
    if (node === edge.srcNode || node === edge.destNode) continue;
    const inflated = inflateBox(bboxOf(node), opts.clusterGap);
    if (segmentIntersectsBox(s, d, inflated)) near.push(node);
  }
  if (near.length < 2) return [];

  const clusters = clusterByGap(near, opts.clusterGap);
  const margin = opts.local.satisfiedNodeClearance * 0.8;
  const out: Pt[][] = [];
  for (const cl of clusters) {
    if (cl.length < 2 || cl.length > opts.maxWaypoints) continue;
    const ub = unionBoxes(cl.map(n => bboxOf(n)));
    const corners = [
      { x: ub.minX, y: ub.minY }, { x: ub.maxX, y: ub.minY },
      { x: ub.minX, y: ub.maxY }, { x: ub.maxX, y: ub.maxY },
    ];
    let tMin = Infinity, tMax = -Infinity, pMin = Infinity, pMax = -Infinity;
    for (const c of corners) {
      const t = (c.x - s.x) * chordU.x + (c.y - s.y) * chordU.y;
      const p = (c.x - s.x) * perp.x + (c.y - s.y) * perp.y;
      tMin = Math.min(tMin, t); tMax = Math.max(tMax, t);
      pMin = Math.min(pMin, p); pMax = Math.max(pMax, p);
    }
    // Keep the entry/exit waypoints inside the edge span.
    const t0 = Math.max(12, Math.min(tMin, L - 12));
    const t1 = Math.min(L - 12, Math.max(tMax, 12));
    for (const sign of [-1, 1]) {
      const pOff = sign < 0 ? pMin - margin : pMax + margin;
      const wp0 = { x: s.x + chordU.x * t0 + perp.x * pOff, y: s.y + chordU.y * t0 + perp.y * pOff };
      const wp1 = { x: s.x + chordU.x * t1 + perp.x * pOff, y: s.y + chordU.y * t1 + perp.y * pOff };
      out.push([wp0, wp1]);
    }
  }
  return out;
}

/** Group nodes whose box-to-box gap is below `gap` (single-linkage). */
function clusterByGap(ns: DANode[], gap: number): DANode[][] {
  const clusters: DANode[][] = [];
  const used = new Set<DANode>();
  for (const seed of ns) {
    if (used.has(seed)) continue;
    const cl = [seed];
    used.add(seed);
    for (let i = 0; i < cl.length; i++) {
      for (const cand of ns) {
        if (used.has(cand)) continue;
        if (boxGap(bboxOf(cl[i]), bboxOf(cand)) < gap) { cl.push(cand); used.add(cand); }
      }
    }
    clusters.push(cl);
  }
  return clusters;
}

function boxGap(a: Bbox, b: Bbox): number {
  const dx = Math.max(0, Math.max(a.minX - b.maxX, b.minX - a.maxX));
  const dy = Math.max(0, Math.max(a.minY - b.maxY, b.minY - a.maxY));
  return Math.hypot(dx, dy);
}

function unionBoxes(boxes: Bbox[]): Bbox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const b of boxes) {
    minX = Math.min(minX, b.minX); minY = Math.min(minY, b.minY);
    maxX = Math.max(maxX, b.maxX); maxY = Math.max(maxY, b.maxY);
  }
  return { minX, minY, maxX, maxY };
}

interface Insertion { point: Pt; index: number; }

function insertionCandidates(
  edge: DAEdge, cp: Pt[], nodes: DANode[], perp: Pt, step: number,
): Insertion[] {
  const path = edge.getPathPoints();
  const out: Insertion[] = [];
  let longest = -1, gapIdx = 0;
  for (let i = 0; i < path.length - 1; i++) {
    const len = Math.hypot(path[i + 1].x - path[i].x, path[i + 1].y - path[i].y);
    if (len > longest) { longest = len; gapIdx = i; }
  }
  const mid = {
    x: (path[gapIdx].x + path[gapIdx + 1].x) / 2,
    y: (path[gapIdx].y + path[gapIdx + 1].y) / 2,
  };
  for (const amt of [step, -step, step * 2, -step * 2]) {
    out.push({ point: offset(mid, perp, amt), index: gapIdx });
  }
  const clip = firstClip(edge, nodes, path);
  if (clip) {
    const c = center(clip.node);
    const away = unit(vector(c, clip.mid));
    for (const amt of [step * 1.5, step * 2.5]) {
      out.push({ point: offset(clip.mid, away, amt), index: clip.index });
    }
  }
  return out;
}

function firstClip(
  edge: DAEdge, nodes: DANode[], path: Pt[],
): { node: DANode; mid: Pt; index: number } | null {
  for (let i = 0; i < path.length - 1; i++) {
    for (const node of nodes) {
      if (node === edge.srcNode || node === edge.destNode) continue;
      if (segmentIntersectsBox(path[i], path[i + 1], bboxOf(node))) {
        return {
          node,
          mid: { x: (path[i].x + path[i + 1].x) / 2, y: (path[i].y + path[i + 1].y) / 2 },
          index: i,
        };
      }
    }
  }
  return null;
}

function offset(p: Pt, dir: Pt, amount: number): Pt {
  return { x: p.x + dir.x * amount, y: p.y + dir.y * amount };
}

function center(node: DANode): Pt {
  return {
    x: node.konvaGroup.x() + node.NODE_WIDTH / 2,
    y: node.konvaGroup.y() + node.NODE_HEIGHT / 2,
  };
}

function outOfGlobalBudget(
  stats: IncrementalRouterStats, startMs: number, opts: IncrementalDesiderataV3Options,
): boolean {
  return (
    stats.scoreCalls >= opts.budgets.maxTotalScoreCalls ||
    Date.now() - startMs >= opts.budgets.maxElapsedMs
  );
}

function compareEdgeOrder(a: DAEdge, b: DAEdge): number {
  const ay = a.srcNode.konvaGroup.y(), by = b.srcNode.konvaGroup.y();
  if (ay !== by) return ay - by;
  const ax = a.srcNode.konvaGroup.x(), bx = b.srcNode.konvaGroup.x();
  if (ax !== bx) return ax - bx;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

interface NearbyContext extends ContextEdge { bbox: Bbox; owner: DAEdge; }

function toContext(edge: DAEdge, opts: IncrementalDesiderataV3Options): NearbyContext {
  const curve = sampleSmoothPath(edge.getPathPoints(), opts.tension, opts.stepsPerSegment);
  return {
    poly: curve, srcNode: edge.srcNode, destNode: edge.destNode,
    bbox: bboxOfPoly(curve), owner: edge,
  };
}

/** Context = every routable edge's current route except `edge` itself, plus the
 *  frozen context. Used by the relaxation sweeps. */
function contextOfOthers(
  edge: DAEdge, ordered: DAEdge[], frozen: ContextEdge[], opts: IncrementalDesiderataV3Options,
): ContextEdge[] {
  const out: ContextEdge[] = [...frozen];
  for (const other of ordered) {
    if (other === edge) continue;
    out.push(toContext(other, opts));
  }
  return out;
}

function filterNearby(
  edge: DAEdge, context: ContextEdge[], opts: IncrementalDesiderataV3Options,
): ContextEdge[] {
  const span = inflateBox(
    unionBoxes([bboxOf(edge.srcNode), bboxOf(edge.destNode)]),
    opts.nearbyMargin,
  );
  return context.filter(c => {
    const cb = (c as NearbyContext).bbox ?? bboxOfPoly(c.poly);
    return boxesOverlap(span, cb);
  });
}

function bboxOfPoly(poly: Pt[]): Bbox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of poly) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

function boxesOverlap(a: Bbox, b: Bbox): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

function samePointList(a: Pt[], b: Pt[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i].x - b[i].x) > 0.01 || Math.abs(a[i].y - b[i].y) > 0.01) return false;
  }
  return true;
}
