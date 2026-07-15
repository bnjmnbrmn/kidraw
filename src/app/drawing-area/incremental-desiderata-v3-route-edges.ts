// incremental-desiderata-v3 — harness-only experimental router (successor to
// incremental-desiderata-v2). Same per-edge, curve-scored, budgeted hill-climb
// as v2 (shared machinery: incremental-routing-common.ts), plus:
//
//   1. RELAXATION SWEEPS. v2 routes each edge once against the already-placed
//      edges and freezes it; a fan that arrives early never sees the edges that
//      land later, so it can crowd or be crossed (converge-circular S3→In
//      crossing S1/S2→In). v3 follows the initial pass with a few Gauss-Seidel
//      sweeps that re-route every edge against ALL the others, so the fan
//      settles into even spacing.
//   2. FAN INTERIOR SEPARATION. The scorer (gated flag) keeps two edges that
//      share one endpoint apart along their interiors, not just at the hub, so
//      fan-out arcs stop grazing (converge-circular Out→D3/D4).
//   3. SYMMETRIC-ARC COLLAPSE. After an edge converges, a one-sided detour is
//      collapsed to a single centred waypoint at the shallowest clearing depth —
//      escaping the greedy plateau that left v2 with multi-waypoint wiggles
//      (bypass-obstacle's 3-point kink). Tries BOTH sides of the chord.
//   4. CLUSTER-AWARE BYPASS. v2's bypass offsets around each clipped node
//      independently, which threads tight gaps between obstacles. v3 also routes
//      around the UNION of obstacles whose gap is below clusterGap, so it goes
//      around a tight pair instead of between them (tangent-grazing B→D vs OBS).
//   5. WHOLE-PATH CLEARANCE with a straightness exemption (see the gated flags
//      in routing-local-score.ts): a straight edge grazing a non-incident node
//      is seen and pulled clear; an unambiguous straight chord stays straight.
//
// Used by the app two ways: the FULL-GRAPH router is selectable from the
// Layout submenu ('Route: Incr v3', worker + sync fallback), and the
// SINGLE-EDGE entry point `routeNewEdgeIncrementally` runs whenever the user
// adds an edge or drags a node, routing just the affected edges against the
// existing graph as frozen context. Also registered in the routing-eval
// bundle-entry. See notes/plan-incremental-desiderata-v3.md.

import type { DANode } from './da-node';
import type { DAEdge } from './da-edge';
import { Pt, Bbox, unit, vector, bboxOf, inflateBox, segmentIntersectsBox } from './routing-geometry';
import {
  ContextEdge,
  LocalScore,
  LocalScoreOptions,
  DEFAULT_LOCAL_SCORE_OPTIONS,
  compareLocalScores,
} from './routing-local-score';
import {
  IncrementalBudgets,
  IncrementalRouteOptions,
  IncrementalRouteStats,
  EdgeChoice,
  NearbyContext,
  routeOneEdge,
  evaluate,
  toContext,
  filterNearby,
  compareEdgeOrder,
  outOfGlobalBudget,
  center,
} from './incremental-routing-common';

export type { IncrementalBudgets } from './incremental-routing-common';

export interface IncrementalDesiderataV3Options extends IncrementalRouteOptions {
  local: LocalScoreOptions;
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
    satisfiedGrazeClearance: 16,
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

export interface IncrementalRouterStats extends IncrementalRouteStats {
  nodeCount: number;
  edgeCount: number;
  relaxationSweeps: number;
  elapsedMs: number;
  /** Ids of edges whose final route still has hard-tier failures. */
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

  // Cached context per routed edge, refreshed only when its route changes —
  // the relaxation sweeps read everyone else's cache instead of resampling
  // every curve for every edge (O(E²) per sweep otherwise).
  const ctxCache = new Map<DAEdge, NearbyContext>();
  const lastScore = new Map<DAEdge, LocalScore | null>();

  // --- Initial pass: place each edge against earlier ones + frozen context.
  const placed: ContextEdge[] = [...frozenContext];
  for (const edge of ordered) {
    if (outOfGlobalBudget(stats, startMs, opts)) { stats.budgetHit = true; break; }
    const nearby = filterNearby(edge, placed, opts);
    const best = routeOneEdgeV3(edge, nodes, nearby, opts, stats, startMs);
    edge.setControlPoints(best.controlPoints);
    edge.setSmoothRendering(true);
    lastScore.set(edge, best.score);
    const ctx = toContext(edge, opts);
    ctxCache.set(edge, ctx);
    placed.push(ctx);
  }

  // --- Relaxation sweeps: re-route every edge against ALL others. Lets edges
  // placed early react to ones placed late (even fan spacing, fewer crossings).
  for (let pass = 0; pass < opts.relaxationPasses; pass++) {
    if (outOfGlobalBudget(stats, startMs, opts)) { stats.budgetHit = true; break; }
    stats.relaxationSweeps++;
    let changed = false;
    for (const edge of ordered) {
      if (outOfGlobalBudget(stats, startMs, opts)) { stats.budgetHit = true; break; }
      const others: ContextEdge[] = [...frozenContext];
      for (const other of ordered) {
        if (other === edge) continue;
        const c = ctxCache.get(other);
        if (c) others.push(c);
      }
      const nearby = filterNearby(edge, others, opts);
      const current: EdgeChoice = {
        controlPoints: edge.controlPoints.map(p => ({ x: p.x, y: p.y })),
        score: null,
      };
      // Re-score the current route against the (now complete) context so the
      // comparison is apples-to-apples with the candidates.
      current.score = evaluate(edge, current.controlPoints, nodes, nearby, opts, stats);
      const best = routeOneEdgeV3(edge, nodes, nearby, opts, stats, startMs, current);
      edge.setControlPoints(best.controlPoints);
      edge.setSmoothRendering(true);
      lastScore.set(edge, best.score);
      if (!samePointList(current.controlPoints, best.controlPoints)) {
        ctxCache.set(edge, toContext(edge, opts));
        changed = true;
      }
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

/** Route ONE newly added edge against the rest of the graph, which is held
 *  fixed — the "incremental" in incremental-desiderata, applied at edge-add
 *  time. Runs v3's full per-edge pipeline (seed + hill-climb + cluster bypass +
 *  symmetric collapse) under the per-edge budgets; for a single edge this is
 *  milliseconds, so callers can run it synchronously in the add-edge flow.
 *
 *  Returns whether the route is hard-tier clean (a clip/sibling-cross/self-
 *  intersection-free curve); the caller can surface an "edge could not be
 *  routed cleanly" status when false. Self-loops are left untouched (clean). */
export function routeNewEdgeIncrementally(
  nodes: DANode[],
  allEdges: DAEdge[],
  newEdge: DAEdge,
  opts: IncrementalDesiderataV3Options = DEFAULT_OPTIONS,
  log?: (msg: string) => void,
): boolean {
  if (newEdge.srcNode === newEdge.destNode) return true;
  const startMs = Date.now();
  const stats: IncrementalRouterStats = {
    nodeCount: nodes.length,
    edgeCount: allEdges.length,
    candidatesEvaluated: 0,
    scoreCalls: 0,
    refineIterations: 0,
    relaxationSweeps: 0,
    elapsedMs: 0,
    budgetHit: false,
    uncleanEdges: [],
  };

  const context: ContextEdge[] = allEdges
    .filter(e => e !== newEdge && e.srcNode !== e.destNode)
    .map(e => toContext(e, opts));
  const nearby = filterNearby(newEdge, context, opts);

  // Deterministic baseline, as in the full router.
  newEdge.setControlPoints([]);
  newEdge.setSmoothRendering(true);

  const best = routeOneEdgeV3(newEdge, nodes, nearby, opts, stats, startMs);
  newEdge.setControlPoints(best.controlPoints);
  newEdge.setSmoothRendering(true);

  stats.elapsedMs = Date.now() - startMs;
  log?.(
    `[incremental-v3] new edge ${newEdge.id}: cand=${stats.candidatesEvaluated} ` +
    `score=${stats.scoreCalls} iters=${stats.refineIterations} ms=${stats.elapsedMs} ` +
    `clean=${!best.score || best.score.hardFailCount === 0}`,
  );
  return !best.score || best.score.hardFailCount === 0;
}

/** v2's shared seed + hill-climb, plus v3's extras: cluster-bypass mutation
 *  candidates during refine, and the symmetric-arc collapse afterwards. */
function routeOneEdgeV3(
  edge: DAEdge,
  nodes: DANode[],
  context: ContextEdge[],
  opts: IncrementalDesiderataV3Options,
  stats: IncrementalRouterStats,
  startMs: number,
  initial?: EdgeChoice,
): EdgeChoice {
  const s = center(edge.srcNode);
  const d = center(edge.destNode);
  const perp = unit({ x: -(d.y - s.y), y: d.x - s.x });
  const extraMoves = (cp: Pt[]) => clusterBypassCandidates(edge, cp, nodes, perp, s, opts);

  let best = routeOneEdge(edge, nodes, context, opts, stats, startMs, initial, extraMoves);

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

/** Candidates that route around the UNION of each tight-gap obstacle cluster
 *  (≥2 nodes) near the chord, on each side. A cluster's two waypoints sit just
 *  outside the union box's chord-extent corners, offset perpendicular clear of
 *  the whole box — so the edge goes around the pair instead of threading the
 *  sub-clearance gap between them. Single near-chord nodes are left to the
 *  per-node bypass in the shared move generator. */
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
  // A long chord can cut through a whole layout row/column whose boxes are
  // separated by more than `clusterGap`. Per-node bypass then exceeds the
  // waypoint budget and every small cluster is a singleton. Include the union
  // of all near-chord obstacles as a two-waypoint outer bypass candidate.
  if (near.length > 1 && clusters.length > 1) clusters.unshift(near);
  const margin = opts.local.satisfiedNodeClearance * 0.8;
  const out: Pt[][] = [];
  for (const cl of clusters) {
    // Cluster size is unrelated to the waypoint budget: every cluster route
    // uses exactly two waypoints around its union box, whether the cluster
    // contains two obstacles or twenty. Capping by node count made long
    // cross-links through a layout column impossible to recover.
    if (cl.length < 2) continue;
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

function samePointList(a: Pt[], b: Pt[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i].x - b[i].x) > 0.01 || Math.abs(a[i].y - b[i].y) > 0.01) return false;
  }
  return true;
}
