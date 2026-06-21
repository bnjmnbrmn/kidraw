// incremental-desiderata-v2 — harness-only experimental router.
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
// NOT wired into the app/worker — registered only in the routing-eval
// bundle-entry. See notes/plan-incremental-desiderata-v2.md.

import type { DANode } from './da-node';
import type { DAEdge } from './da-edge';
import { Pt, Bbox, unit, vector, bboxOf, inflateBox, segmentIntersectsBox } from './routing-geometry';
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
  /** Cap on the fixed seed candidate set evaluated up front. */
  maxCandidatesPerEdge: number;
  /** Ceiling on refine-loop iterations per edge (the loop stops early when no
   *  move improves, so this is a ceiling, not a fixed count). */
  maxIterationsPerEdge: number;
  /** Cap on mutation candidates scored within one refine iteration. */
  maxMovesPerIteration: number;
  maxTotalScoreCalls: number;
  maxElapsedMs: number;
}

export interface IncrementalDesiderataOptions {
  local: LocalScoreOptions;
  /** Curve tension — 0.5 matches the app's `DAEdge.SMOOTH_TENSION`. */
  tension: number;
  /** Curve sampling density per Bézier segment. */
  stepsPerSegment: number;
  /** Perpendicular offset (px) for the seed bow candidates. */
  perpOffset: number;
  /** Base nudge (px) for refinement MOVE/ADD candidates; decays over iters. */
  moveStep: number;
  /** Hard cap on waypoints per edge. */
  maxWaypoints: number;
  /** Context edges are pre-filtered to those whose bbox is within this margin
   *  (px) of the edge's endpoints — a cheap way to keep dense-graph scoring
   *  bounded without changing the result for nearby crossings. */
  nearbyMargin: number;
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

interface EdgeChoice {
  controlPoints: Pt[];
  score: LocalScore | null;
}

function routeOneEdge(
  edge: DAEdge,
  nodes: DANode[],
  context: ContextEdge[],
  opts: IncrementalDesiderataOptions,
  stats: IncrementalRouterStats,
  startMs: number,
): EdgeChoice {
  // 1. Seed.
  let best: EdgeChoice = { controlPoints: [], score: null };
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
    if (!improved) break; // converged
  }

  return best;
}

/** Set the candidate, sample its smooth curve, and score it locally. */
function evaluate(
  edge: DAEdge,
  candidate: Pt[],
  nodes: DANode[],
  context: ContextEdge[],
  opts: IncrementalDesiderataOptions,
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

/** The fixed seed set: straight, two doglegs, a perpendicular midpoint in each
 *  direction, and a two-point bow in each direction. */
function buildSeedCandidates(edge: DAEdge, opts: IncrementalDesiderataOptions): Pt[][] {
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

/** MOVE every waypoint a few ways, ADD one at the longest gap (and near any
 *  node the curve currently clips), and REMOVE each waypoint. Step size decays
 *  over iterations so early moves explore and later ones settle. */
function generateMoves(
  edge: DAEdge, cp: Pt[], nodes: DANode[], opts: IncrementalDesiderataOptions, iter: number,
): Pt[][] {
  const s = center(edge.srcNode);
  const d = center(edge.destNode);
  const perp = unit({ x: -(d.y - s.y), y: d.x - s.x });
  const decay = Math.max(0.35, 1 - (iter / opts.budgets.maxIterationsPerEdge) * 0.7);
  const step = opts.moveStep * decay;

  const moves: Pt[][] = [];

  // OBSTACLE BYPASS — route around ALL nodes the current curve clips, on each
  // side at once. A single mid-waypoint can't clear two in-line obstacles
  // (tangent-grazing's B+C) and a node sitting directly between the endpoints
  // (converge's S4 between S3 and In) needs a clean side route, not a nudge.
  for (const bypass of obstacleBypassCandidates(edge, cp, nodes, perp, s, opts)) {
    moves.push(bypass);
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

  // REMOVE (simplify)
  for (let i = 0; i < cp.length; i++) {
    moves.push(cp.filter((_, j) => j !== i));
  }

  return moves;
}

/** Candidates that route around every node the current rendered curve clips,
 *  one per perpendicular side. Each clipped node gets a waypoint offset clear
 *  of it (by its extent along the chord-perpendicular + clearance), and the
 *  waypoints are ordered along the chord so the detour is monotone. */
function obstacleBypassCandidates(
  edge: DAEdge, cp: Pt[], nodes: DANode[], perp: Pt, s: Pt, opts: IncrementalDesiderataOptions,
): Pt[][] {
  // Sample the curve of the CURRENT best route (cp), not whatever candidate the
  // edge was last left on, so we detect the right obstacles.
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
      // Half-extent of the box measured along the perpendicular direction.
      const ext = Math.abs(perp.x) * (node.NODE_WIDTH / 2) + Math.abs(perp.y) * (node.NODE_HEIGHT / 2);
      const dist = ext + clearance;
      const pt = { x: c.x + sign * perp.x * dist, y: c.y + sign * perp.y * dist };
      const t = (c.x - s.x) * chordU.x + (c.y - s.y) * chordU.y; // projection along chord
      return { pt, t };
    });
    wps.sort((a, b) => a.t - b.t);
    out.push(wps.map(w => w.pt));
  }
  return out;
}

interface Insertion { point: Pt; index: number; }

/** Where to grow a new waypoint: at the longest control-polygon gap (offset
 *  perpendicular both ways) and, if the rendered curve clips a node, near that
 *  clip pushed away from the node's centre. */
function insertionCandidates(
  edge: DAEdge, cp: Pt[], nodes: DANode[], perp: Pt, step: number,
): Insertion[] {
  const path = edge.getPathPoints(); // [srcPerim, ...cp, destPerim]
  const out: Insertion[] = [];

  // Longest-gap midpoint.
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

  // Clip-aware: push a waypoint away from the first node the curve clips.
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
  stats: IncrementalRouterStats, startMs: number, opts: IncrementalDesiderataOptions,
): boolean {
  return (
    stats.scoreCalls >= opts.budgets.maxTotalScoreCalls ||
    Date.now() - startMs >= opts.budgets.maxElapsedMs
  );
}

/** Top-to-bottom, then left-to-right by source-node position, edge id as a
 *  stable tie-breaker. */
function compareEdgeOrder(a: DAEdge, b: DAEdge): number {
  const ay = a.srcNode.konvaGroup.y(), by = b.srcNode.konvaGroup.y();
  if (ay !== by) return ay - by;
  const ax = a.srcNode.konvaGroup.x(), bx = b.srcNode.konvaGroup.x();
  if (ax !== bx) return ax - bx;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

/** Context as the rendered smooth curve (so crossings/clearance are measured
 *  curve-vs-curve, matching what the user sees), plus a bbox for the nearby
 *  filter. */
interface NearbyContext extends ContextEdge { bbox: Bbox; }

function toContext(edge: DAEdge, opts: IncrementalDesiderataOptions): NearbyContext {
  const curve = sampleSmoothPath(edge.getPathPoints(), opts.tension, opts.stepsPerSegment);
  return { poly: curve, srcNode: edge.srcNode, destNode: edge.destNode, bbox: bboxOfPoly(curve) };
}

function filterNearby(
  edge: DAEdge, context: ContextEdge[], opts: IncrementalDesiderataOptions,
): ContextEdge[] {
  const span = inflateBox(
    unionBox(bboxOf(edge.srcNode), bboxOf(edge.destNode)),
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

function unionBox(a: Bbox, b: Bbox): Bbox {
  return {
    minX: Math.min(a.minX, b.minX), minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX), maxY: Math.max(a.maxY, b.maxY),
  };
}

function boxesOverlap(a: Bbox, b: Bbox): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}
