// incremental-desiderata-v2 — incremental router (selectable in the app's
// Layout submenu; also registered in the routing-eval bundle-entry).
//
// Routes edges ONE AT A TIME in a deterministic order. Each edge is scored as
// the SMOOTH CURVE its waypoints define (Konva tension 0.5, replicated by
// routing-curve.ts) — i.e. waypoints act as Bézier/Catmull-Rom control points,
// so we optimise what the user actually sees, not a straight control polygon.
//
// Per edge:
//   1. Seed — pick the best of a small fixed candidate set (straight, doglegs,
//      bows), scored on the curve.
//   2. Refine — a bounded hill-climb (up to `maxIterationsPerEdge`, ~20): each
//      iteration generates local waypoint mutations (MOVE an existing waypoint,
//      ADD one, REMOVE one), scores each on the curve against already-routed
//      context, and keeps the best improvement. It stops early when no move
//      improves (so the iteration count is effectively dynamic — the cap is
//      just a ceiling).
//
// Scoring is always LOCAL (one edge's curve vs nodes + nearby context curves),
// never a whole-graph metric recompute, and everything runs inside hard budgets
// (iterations/edge, total score calls, wall-clock ms). When a budget is hit the
// best route so far is kept. Edges left with hard-tier failures are reported in
// `uncleanEdges` for the "best-effort, report conflicts" policy.
//
// The seed/refine machinery is shared with incremental-desiderata-v3 — see
// incremental-routing-common.ts.

import type { DANode } from './da-node';
import type { DAEdge } from './da-edge';
import {
  LocalScoreOptions,
  DEFAULT_LOCAL_SCORE_OPTIONS,
  ContextEdge,
} from './routing-local-score';
import {
  IncrementalBudgets,
  IncrementalRouteOptions,
  routeOneEdge,
  toContext,
  filterNearby,
  compareEdgeOrder,
  outOfGlobalBudget,
} from './incremental-routing-common';

export type { IncrementalBudgets } from './incremental-routing-common';

export interface IncrementalDesiderataOptions extends IncrementalRouteOptions {
  local: LocalScoreOptions;
  budgets: IncrementalBudgets;
}

export const DEFAULT_OPTIONS: IncrementalDesiderataOptions = {
  local: { ...DEFAULT_LOCAL_SCORE_OPTIONS },
  tension: 0.5,
  stepsPerSegment: 8,
  perpOffset: 70,
  moveStep: 45,
  maxWaypoints: 4,
  nearbyMargin: 240,
  budgets: {
    maxCandidatesPerEdge: 8,
    maxIterationsPerEdge: 20,
    maxMovesPerIteration: 28,
    maxTotalScoreCalls: 20000,
    maxElapsedMs: 4000,
  },
};

export interface IncrementalRouterStats {
  nodeCount: number;
  edgeCount: number;
  candidatesEvaluated: number;
  scoreCalls: number;
  refineIterations: number;
  elapsedMs: number;
  budgetHit: boolean;
  /** Ids of edges whose final route still has hard-tier failures. */
  uncleanEdges: string[];
}

export function applyIncrementalDesiderataRouteEdges(
  nodes: DANode[],
  edges: DAEdge[],
  opts: IncrementalDesiderataOptions = DEFAULT_OPTIONS,
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
    elapsedMs: 0,
    budgetHit: false,
    uncleanEdges: [],
  };

  const routable = edges.filter(e => e.srcNode !== e.destNode);
  // Deterministic baseline: every routable edge starts straight (and smooth),
  // so a budget-skipped edge still has a clean, predictable curve.
  for (const edge of routable) {
    edge.setControlPoints([]);
    edge.setSmoothRendering(true);
  }

  const ordered = [...routable].sort(compareEdgeOrder);

  const context: ContextEdge[] = frozenEdges
    .filter(e => e.srcNode !== e.destNode)
    .map(e => toContext(e, opts));

  for (const edge of ordered) {
    if (outOfGlobalBudget(stats, startMs, opts)) {
      stats.budgetHit = true;
      break;
    }
    const nearby = filterNearby(edge, context, opts);
    const best = routeOneEdge(edge, nodes, nearby, opts, stats, startMs);
    edge.setControlPoints(best.controlPoints);
    edge.setSmoothRendering(true);
    context.push(toContext(edge, opts));
    if (best.score && best.score.hardFailCount > 0) stats.uncleanEdges.push(edge.id);
  }

  stats.elapsedMs = Date.now() - startMs;
  log?.(
    `[incremental-v2] nodes=${stats.nodeCount} edges=${stats.edgeCount} ` +
    `cand=${stats.candidatesEvaluated} score=${stats.scoreCalls} ` +
    `iters=${stats.refineIterations} ms=${stats.elapsedMs} ` +
    `budgetHit=${stats.budgetHit} unclean=${stats.uncleanEdges.length}`,
  );
  return stats;
}
