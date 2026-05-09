import { DANode } from './da-node';
import { DAEdge } from './da-edge';

interface Obstacle {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

interface Pt { x: number; y: number; }

export interface BezierRouteOptions {
  /** Hard upper bound on bend points per edge. */
  maxControlPoints: number;
  /** Adding a control point only happens if the curve cost drops by at
   *  least this much; otherwise we keep the simpler curve. This is the
   *  "MDL" knob — penalty for chain complexity. */
  minImprovementPerPoint: number;
  /** Soft inverse-square repulsion from each non-incident node bbox. */
  obstaclePenaltyK: number;
  /** Linear cost per pixel of curve length. Encourages shortest routes. */
  lengthPenaltyK: number;
  /** Padding added to every node bbox before the obstacle penalty kicks in. */
  clearance: number;
  /** Perpendicular spacing between sibling edges (parallel routes between
   *  the same {src,dest} node pair). Each member's endpoints are pushed
   *  to its lane along the source/dest face direction. */
  laneSpacing: number;
  /** Gradient-descent settings for control-point optimization. */
  optimizeIterations: number;
  optimizeStepSize: number;
  /** Number of samples taken along the curve when computing cost. */
  curveSamples: number;
  /** Numerical-gradient finite-difference step (px). */
  gradEps: number;
}

export const DEFAULT_OPTIONS: BezierRouteOptions = {
  maxControlPoints: 4,
  minImprovementPerPoint: 50,
  obstaclePenaltyK: 8,
  lengthPenaltyK: 1.0,
  clearance: 18,
  laneSpacing: 22,
  optimizeIterations: 60,
  optimizeStepSize: 0.8,
  curveSamples: 50,
  gradEps: 1.0,
};

interface EdgeGroup {
  perpX: number;
  perpY: number;
  edges: DAEdge[];
}

export function applyBezierRouteEdges(
  nodes: DANode[],
  edges: DAEdge[],
  opts: BezierRouteOptions = DEFAULT_OPTIONS,
  log?: (msg: string) => void,
): void {
  const obstacles = buildObstacleMap(nodes, opts.clearance);
  log?.(`[bezier-route] start: ${nodes.length} nodes, ${edges.length} edges, max ${opts.maxControlPoints} cp/edge`);

  const groups = groupEdgesByUnorderedPair(edges);

  for (const edge of edges) {
    if (edge.srcNode === edge.destNode) {
      // Self-loop: leave the existing four-point loop path alone.
      edge.setSmoothRendering(true);
      continue;
    }

    edge.clearControlPoints();
    const straightPath = edge.getPathPoints();
    if (straightPath.length < 2) continue;
    const start = straightPath[0];
    const end = straightPath[straightPath.length - 1];

    const offsetMag = laneOffsetMagnitude(edge, groups, opts.laneSpacing);

    const incident = new Set([edge.srcNode, edge.destNode]);
    const edgeObstacles: Obstacle[] = [];
    for (const [n, ob] of obstacles) {
      if (!incident.has(n)) edgeObstacles.push(ob);
    }

    const cps = routeOneEdge(start, end, edgeObstacles, offsetMag, opts);

    edge.setControlPoints(cps);
    edge.setSmoothRendering(true);

    if (log) {
      const cpStr = cps.map(p => `(${p.x.toFixed(0)},${p.y.toFixed(0)})`).join(' ');
      log(`[bezier-route] edge ${edge.id} ${edge.srcNode.id}→${edge.destNode.id}: cps(${cps.length})=${cpStr || '∅ (straight)'}`);
    }
  }
  log?.(`[bezier-route] done`);
}

function routeOneEdge(
  start: Pt, end: Pt, obstacles: Obstacle[],
  offsetMag: number, opts: BezierRouteOptions,
): Pt[] {
  // Build lane-anchor cps near the chain ends. They serve two roles:
  //  - Anchor the perimeter projection so parallel siblings exit each face
  //    at distinct points (instead of stacking at the face midpoint).
  //  - Provide stable boundary conditions for optimization.
  // Anchors are NOT optimized; only middle cps move.
  const ANCHOR_T_NEAR = 0.12;
  const ANCHOR_T_FAR = 0.88;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy) || 1;
  const perpX = -dy / len;
  const perpY = dx / len;
  const anchorNear = offsetMag !== 0 ? {
    x: start.x + dx * ANCHOR_T_NEAR + perpX * offsetMag,
    y: start.y + dy * ANCHOR_T_NEAR + perpY * offsetMag,
  } : null;
  const anchorFar = offsetMag !== 0 ? {
    x: start.x + dx * ANCHOR_T_FAR + perpX * offsetMag,
    y: start.y + dy * ANCHOR_T_FAR + perpY * offsetMag,
  } : null;

  const buildFull = (middle: Pt[]): Pt[] =>
    anchorNear && anchorFar ? [anchorNear, ...middle, anchorFar] : [...middle];

  let middleCps: Pt[] = [];
  let cost = computeCurveCost(start, buildFull(middleCps), end, obstacles, opts);

  for (let n = 1; n <= opts.maxControlPoints; n++) {
    const ins = findWorstSampleAndDisplace(start, buildFull(middleCps), end, obstacles, opts);
    if (!ins) break;

    const trialMiddle = insertMiddleInOrder(middleCps, ins, start, end);
    // Clamp the freshly-inserted cp into the lane band before optimization
    // so the seed itself is never crossing a sibling.
    for (const cp of trialMiddle) {
      clampToLaneBand(cp, start, end, offsetMag, opts.laneSpacing);
    }
    optimizeMiddleCps(trialMiddle, anchorNear, anchorFar, start, end, obstacles, offsetMag, opts);
    const trialCost = computeCurveCost(start, buildFull(trialMiddle), end, obstacles, opts);

    if (cost - trialCost >= opts.minImprovementPerPoint) {
      middleCps = trialMiddle;
      cost = trialCost;
    } else {
      break;
    }
  }

  return buildFull(middleCps);
}

/** Project a middle cp's perpendicular offset (relative to the canonical
 *  start→end line) into its lane band so siblings can't cross. The band
 *  is centered on the edge's lane offset and is `laneSpacing` wide. The
 *  cp's tangential (along-line) component is left untouched. */
function clampToLaneBand(
  cp: Pt, start: Pt, end: Pt, laneCenterMag: number, laneSpacing: number,
): void {
  if (laneSpacing <= 0) return;
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len = Math.hypot(dx, dy) || 1;
  const perpX = -dy / len;
  const perpY = dx / len;
  const proj = (cp.x - start.x) * perpX + (cp.y - start.y) * perpY;
  const halfWidth = laneSpacing / 2;
  const minProj = laneCenterMag - halfWidth;
  const maxProj = laneCenterMag + halfWidth;
  let delta = 0;
  if (proj < minProj) delta = minProj - proj;
  else if (proj > maxProj) delta = maxProj - proj;
  if (delta !== 0) {
    cp.x += perpX * delta;
    cp.y += perpY * delta;
  }
}

/** Insert a new control point into the middle-cp list, ordered by
 *  projection along the start→end vector. */
function insertMiddleInOrder(middle: Pt[], newCp: Pt, start: Pt, end: Pt): Pt[] {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len2 = dx * dx + dy * dy || 1;
  const proj = (p: Pt) => ((p.x - start.x) * dx + (p.y - start.y) * dy) / len2;
  const newProj = proj(newCp);
  const out: Pt[] = [];
  let inserted = false;
  for (const cp of middle) {
    if (!inserted && proj(cp) > newProj) {
      out.push({...newCp});
      inserted = true;
    }
    out.push({...cp});
  }
  if (!inserted) out.push({...newCp});
  return out;
}

function optimizeMiddleCps(
  middle: Pt[], anchorNear: Pt | null, anchorFar: Pt | null,
  start: Pt, end: Pt, obstacles: Obstacle[],
  laneCenterMag: number, opts: BezierRouteOptions,
): void {
  if (middle.length === 0) return;

  const buildFull = (m: Pt[]): Pt[] =>
    anchorNear && anchorFar ? [anchorNear, ...m, anchorFar] : [...m];

  for (let iter = 0; iter < opts.optimizeIterations; iter++) {
    const grad: Pt[] = middle.map(() => ({x: 0, y: 0}));
    const baseCost = computeCurveCost(start, buildFull(middle), end, obstacles, opts);
    for (let i = 0; i < middle.length; i++) {
      middle[i].x += opts.gradEps;
      const cxp = computeCurveCost(start, buildFull(middle), end, obstacles, opts);
      middle[i].x -= 2 * opts.gradEps;
      const cxm = computeCurveCost(start, buildFull(middle), end, obstacles, opts);
      middle[i].x += opts.gradEps;
      grad[i].x = (cxp - cxm) / (2 * opts.gradEps);

      middle[i].y += opts.gradEps;
      const cyp = computeCurveCost(start, buildFull(middle), end, obstacles, opts);
      middle[i].y -= 2 * opts.gradEps;
      const cym = computeCurveCost(start, buildFull(middle), end, obstacles, opts);
      middle[i].y += opts.gradEps;
      grad[i].y = (cyp - cym) / (2 * opts.gradEps);
    }
    let step = opts.optimizeStepSize;
    let attempts = 0;
    while (attempts < 4) {
      const trial = middle.map((p, i) => ({x: p.x - grad[i].x * step, y: p.y - grad[i].y * step}));
      // Hard sibling-anti-crossing constraint: clamp each cp's perpendicular
      // component back into its lane band (laneCenterMag ± laneSpacing/2)
      // before evaluating cost. Combined with re-sorting along the chain
      // direction, this keeps siblings from swapping lanes mid-chain.
      for (const t of trial) {
        clampToLaneBand(t, start, end, laneCenterMag, opts.laneSpacing);
      }
      // Re-sort along the chain direction so the polyline never folds back
      // on itself. Gradient descent is free to move cps tangentially as well
      // as perpendicularly, and without this they can swap order — the
      // resulting folded curve is what reads visually as a sibling crossing.
      sortByLineProjection(trial, start, end);
      const trialCost = computeCurveCost(start, buildFull(trial), end, obstacles, opts);
      if (trialCost < baseCost) {
        for (let i = 0; i < middle.length; i++) {
          middle[i].x = trial[i].x;
          middle[i].y = trial[i].y;
        }
        break;
      }
      step *= 0.5;
      attempts++;
    }
  }
}

function sortByLineProjection(pts: Pt[], start: Pt, end: Pt): void {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const len2 = dx * dx + dy * dy || 1;
  pts.sort((a, b) => {
    const pa = ((a.x - start.x) * dx + (a.y - start.y) * dy) / len2;
    const pb = ((b.x - start.x) * dx + (b.y - start.y) * dy) / len2;
    return pa - pb;
  });
}

/** Find the worst-cost sample on the current curve and propose a new
 *  control point displaced from it, perpendicular to the local curve
 *  direction, away from the obstacle responsible for the cost.
 *  Returns null when no sample is inside the clearance band. */
function findWorstSampleAndDisplace(
  start: Pt, cps: Pt[], end: Pt,
  obstacles: Obstacle[], opts: BezierRouteOptions,
): Pt | null {
  const samples = sampleCurve(start, cps, end, opts.curveSamples);
  let worstSampleIdx = -1;
  let worstObstacle: Obstacle | null = null;
  let worstPenalty = 0;
  const c = opts.clearance;
  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    for (const ob of obstacles) {
      const d = distanceToBox(s.x, s.y, ob);
      if (d >= c) continue;
      const penalty = (c - d) * (c - d);
      if (penalty > worstPenalty) {
        worstPenalty = penalty;
        worstSampleIdx = i;
        worstObstacle = ob;
      }
    }
  }
  if (worstSampleIdx < 0 || !worstObstacle) return null;

  const s = samples[worstSampleIdx];
  // Local curve direction from neighboring samples
  const prev = samples[Math.max(0, worstSampleIdx - 1)];
  const next = samples[Math.min(samples.length - 1, worstSampleIdx + 1)];
  const dx = next.x - prev.x;
  const dy = next.y - prev.y;
  const len = Math.hypot(dx, dy) || 1;
  const perpX = -dy / len;
  const perpY = dx / len;

  // Direction from obstacle (closest point) to sample, projected onto perp.
  const ox = Math.max(worstObstacle.minX, Math.min(s.x, worstObstacle.maxX));
  const oy = Math.max(worstObstacle.minY, Math.min(s.y, worstObstacle.maxY));
  const awayX = s.x - ox;
  const awayY = s.y - oy;
  const proj = perpX * awayX + perpY * awayY;
  const sign = proj >= 0 ? 1 : -1;

  // Push the new cp out from the obstacle far enough that the sample
  // moves clear of the clearance band. The displacement is the obstacle's
  // perpendicular penetration plus the clearance, in the perpendicular
  // direction away from it.
  const obstacleCenterX = (worstObstacle.minX + worstObstacle.maxX) / 2;
  const obstacleCenterY = (worstObstacle.minY + worstObstacle.maxY) / 2;
  const obstacleHalfWidth = (worstObstacle.maxX - worstObstacle.minX) / 2;
  const obstacleHalfHeight = (worstObstacle.maxY - worstObstacle.minY) / 2;
  const displacement = Math.max(
    obstacleHalfWidth, obstacleHalfHeight,
    Math.hypot(s.x - obstacleCenterX, s.y - obstacleCenterY),
  );
  return {
    x: s.x + perpX * sign * displacement,
    y: s.y + perpY * sign * displacement,
  };
}


function computeCurveCost(
  start: Pt, cps: Pt[], end: Pt,
  obstacles: Obstacle[], opts: BezierRouteOptions,
): number {
  const samples = sampleCurve(start, cps, end, opts.curveSamples);

  let cost = 0;

  // Length penalty — always positive, drives the curve toward the shortest
  // route. With strong-enough length cost the optimizer can't run away from
  // obstacles unboundedly: each pixel of detour costs lengthPenaltyK.
  for (let i = 1; i < samples.length; i++) {
    cost += opts.lengthPenaltyK * Math.hypot(samples[i].x - samples[i - 1].x, samples[i].y - samples[i - 1].y);
  }

  // Obstacle penalty — only active inside the clearance band. Outside
  // clearance, no obstacle force at all, so length penalty wins. Quadratic
  // (clearance - d)² gives a smooth gradient and a finite peak when a
  // sample sits on the box edge.
  const c = opts.clearance;
  for (const s of samples) {
    for (const ob of obstacles) {
      const d = distanceToBox(s.x, s.y, ob);
      if (d >= c) continue;
      const x = c - d;
      cost += opts.obstaclePenaltyK * x * x;
    }
  }

  return cost;
}

function sampleCurve(start: Pt, cps: Pt[], end: Pt, n: number): Pt[] {
  const pts = [start, ...cps, end];
  if (pts.length < 2) return [start];
  const segLens: number[] = [];
  let total = 0;
  for (let i = 1; i < pts.length; i++) {
    const len = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
    segLens.push(len);
    total += len;
  }
  if (total < 1e-6) return [start];
  const out: Pt[] = [];
  for (let s = 0; s <= n; s++) {
    const target = (s / n) * total;
    let cum = 0;
    for (let i = 0; i < segLens.length; i++) {
      if (cum + segLens[i] >= target) {
        const t = segLens[i] > 0 ? (target - cum) / segLens[i] : 0;
        out.push({
          x: pts[i].x + (pts[i + 1].x - pts[i].x) * t,
          y: pts[i].y + (pts[i + 1].y - pts[i].y) * t,
        });
        break;
      }
      cum += segLens[i];
    }
  }
  return out;
}

function distanceToBox(x: number, y: number, ob: Obstacle): number {
  const cx = Math.max(ob.minX, Math.min(x, ob.maxX));
  const cy = Math.max(ob.minY, Math.min(y, ob.maxY));
  return Math.hypot(x - cx, y - cy);
}

function buildObstacleMap(nodes: DANode[], clearance: number): Map<DANode, Obstacle> {
  const map = new Map<DANode, Obstacle>();
  for (const n of nodes) {
    const x = n.konvaGroup.x();
    const y = n.konvaGroup.y();
    map.set(n, {
      minX: x - clearance,
      minY: y - clearance,
      maxX: x + n.NODE_WIDTH + clearance,
      maxY: y + n.NODE_HEIGHT + clearance,
    });
  }
  return map;
}

function groupEdgesByUnorderedPair(edges: DAEdge[]): Map<DAEdge, EdgeGroup> {
  const byKey = new Map<string, DAEdge[]>();
  for (const e of edges) {
    if (e.srcNode === e.destNode) continue;
    const ids = [e.srcNode.id, e.destNode.id].sort();
    const key = `${ids[0]}|${ids[1]}`;
    let arr = byKey.get(key);
    if (!arr) { arr = []; byKey.set(key, arr); }
    arr.push(e);
  }
  const result = new Map<DAEdge, EdgeGroup>();
  for (const arr of byKey.values()) {
    const sample = arr[0];
    const lowerIsSrc = sample.srcNode.id < sample.destNode.id;
    const a = lowerIsSrc ? sample.srcNode : sample.destNode;
    const b = lowerIsSrc ? sample.destNode : sample.srcNode;
    const dx = (b.konvaGroup.x() + b.NODE_WIDTH / 2) - (a.konvaGroup.x() + a.NODE_WIDTH / 2);
    const dy = (b.konvaGroup.y() + b.NODE_HEIGHT / 2) - (a.konvaGroup.y() + a.NODE_HEIGHT / 2);
    const len = Math.hypot(dx, dy) || 1;
    const group: EdgeGroup = {perpX: -dy / len, perpY: dx / len, edges: arr};
    for (const e of arr) result.set(e, group);
  }
  return result;
}

function laneOffsetMagnitude(edge: DAEdge, groups: Map<DAEdge, EdgeGroup>, spacing: number): number {
  const g = groups.get(edge);
  if (!g || g.edges.length < 2) return 0;
  const idx = g.edges.indexOf(edge);
  return (idx - (g.edges.length - 1) / 2) * spacing;
}

