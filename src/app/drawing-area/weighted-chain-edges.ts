import { DANode } from './da-node';
import { DAEdge } from './da-edge';

/** Weighted-chain routing.
 *
 *  Mental model: the canvas is a wooden board with a hole at each node.
 *  Each edge is a chain of rigid metal segments coming up out of the source
 *  node's hole, across the board, and back down into the dest node's hole.
 *  Equal weights hang on the chain ends inside the holes — gravity pulls them
 *  down, which pulls the chain taut between the two holes. Charges on the
 *  hinges (where segments meet) and on node borders push the chain away from
 *  obstacles and from sibling chains, deflecting it without compressing it.
 *
 *  Implementation:
 *  - Rigid segments enforced via Position-Based Dynamics (PBD): after each
 *    timestep's force-based position update, we project bead positions so
 *    every adjacent pair is exactly segmentLength apart.
 *  - End beads are NOT pinned. A constant endpointForce pulls bead-0 toward
 *    the source center and bead-(N-1) toward the dest center. With equal
 *    magnitudes the chain has tension along it but no net translation.
 *  - Charges (obstacle + sibling) act only on beads OUTSIDE both incident
 *    bboxes — beads "in the hole" exert no influence and feel no charge.
 *  - Excess slack drains: periodically, end beads that have been pulled
 *    deep into their incident bbox (i.e. when both bead-0 and bead-1 are
 *    inside the source bbox, or both end beads are inside the dest bbox)
 *    get spliced off. The chain shortens until the visible portion is taut. */

interface Pt { x: number; y: number; }

interface Bead {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

interface Obstacle {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface WeightedChainOptions {
  /** Length of each rigid segment between adjacent beads. */
  segmentLength: number;
  /** Initial chain length as a multiple of straight-line center-to-center
   *  distance. >1 gives the chain slack to navigate obstacles; the slack
   *  drains into the holes during the sim. Set ~1.5 for typical layouts. */
  initialSlackFactor: number;
  iterations: number;
  /** PBD constraint-projection sweeps per timestep. Higher = stiffer rigid
   *  segments. Each sweep walks the chain once adjusting bead positions to
   *  rest spacing; 8-15 is plenty for typical chain lengths. */
  pbdIterations: number;
  /** Constant force on each end bead toward its node center. The "weight"
   *  in the wooden-board model. Equal on both ends: net chain motion is
   *  zero, chain just pulls itself taut. */
  endpointForce: number;
  chargeK: number;
  /** Range (px) of obstacle repulsion. Beyond this distance from a node box a
   *  bead feels zero push; within it the force uses a finite-support kernel
   *  `chargeK * (1/d - 1/R)^2` that matches the old inverse-square strength up
   *  close but decays smoothly to exactly zero at R — instead of the old
   *  unbounded `chargeK/d^2` tail that bowed every edge away from every node in
   *  the graph. Smaller R = edges hug obstacles tighter and stay straight when
   *  there's clearance. */
  obstacleFalloffDist: number;
  insideKickK: number;
  damping: number;
  dt: number;
  /** Padding around node bboxes for both obstacle repulsion and the
   *  in-hole detection. */
  clearance: number;
  maxVelocity: number;
  laneSpacing: number;
  edgeRepulsionK: number;
  edgeRepulsionMaxDist: number;
  /** Every N iterations, drain end beads that are deep in their incident
   *  bbox. 0 disables draining (slack stays bowed on the surface). */
  drainInterval: number;
  /** Smoothstep-tapered charge over the first N beads from each end. */
  chargeRampLength: number;
  /** Magnitude (px) of random perturbation added to each bead's seed
   *  position. Helps the sim escape local minima — multiple runs with
   *  different RNG seeds will explore different basins. 0 disables. */
  initialJitter: number;
  /** RNG seed for jitter. Same seed → reproducible result. Bump it to
   *  retry from a different starting state. */
  rngSeed: number;
}

export const DEFAULT_OPTIONS: WeightedChainOptions = {
  segmentLength: 0.5,
  initialSlackFactor: 1.5,
  iterations: 400,
  pbdIterations: 12,
  endpointForce: 30,
  chargeK: 9000,
  obstacleFalloffDist: 80,
  insideKickK: 80,
  damping: 0.78,
  dt: 1.0,
  clearance: 24,
  maxVelocity: 30,
  laneSpacing: 22,
  edgeRepulsionK: 500,
  edgeRepulsionMaxDist: 60,
  drainInterval: 5,
  chargeRampLength: 5,
  initialJitter: 0,
  rngSeed: 1,
};

interface EdgeSim {
  edge: DAEdge;
  /** Endpoint-force target for bead-0. This is the source node's center
   *  shifted along the group's canonical perpendicular by the edge's signed
   *  lane offset. Each parallel sibling thus gravitates to its OWN lane
   *  inside the source-side hole, instead of all chains being pulled to a
   *  common center point (which collapsed anti-parallel pairs into the same
   *  line — see notes/bug-bezier-antiparallel-overlap.md for the analogous
   *  fix in bezier-route). */
  sourceTarget: {x: number; y: number};
  /** Endpoint-force target for bead-(N-1). Same lane shift as sourceTarget,
   *  applied at the destination node's center. */
  destTarget: {x: number; y: number};
  sourceBox: Obstacle;
  destBox: Obstacle;
  beads: Bead[];
  obstacles: Obstacle[];
}

interface EdgeGroup {
  perpX: number;
  perpY: number;
  edges: DAEdge[];
}

export function applyWeightedChainEdges(
  nodes: DANode[],
  edges: DAEdge[],
  opts: WeightedChainOptions = DEFAULT_OPTIONS,
  log?: (msg: string) => void,
  frozenEdges: DAEdge[] = [],
): void {
  const obstacles = buildObstacleMap(nodes, opts.clearance);
  log?.(`[weighted-chain] start: ${nodes.length} nodes, ${edges.length} edges, ${frozenEdges.length} frozen, segLen=${opts.segmentLength}, slack=${opts.initialSlackFactor}, ${opts.iterations} iters`);

  // Frozen edges (e.g. the unselected edges when routing a subset) contribute
  // static repulsion sources: the routed beads are pushed away from their
  // rendered geometry, but the frozen edges themselves never move. Densify
  // each frozen polyline so no gap exceeds the repulsion reach and a routed
  // bead can't slip through.
  const frozenPoints: Pt[] = [];
  const frozenSpacing = Math.max(4, opts.edgeRepulsionMaxDist / 4);
  for (const fe of frozenEdges) {
    densifyPolyline(fe.getPathPoints(), frozenSpacing, frozenPoints);
  }

  const groups = groupEdgesByUnorderedPair(edges);
  const rng = makeRng(opts.rngSeed >>> 0);

  const states: EdgeSim[] = [];
  for (const edge of edges) {
    if (edge.srcNode === edge.destNode) {
      log?.(`[weighted-chain] edge ${edge.id} is self-loop — skipped`);
      continue;
    }

    const sourceCenter = nodeCenter(edge.srcNode);
    const destCenter = nodeCenter(edge.destNode);
    const sourceBox = obstacles.get(edge.srcNode)!;
    const destBox = obstacles.get(edge.destNode)!;

    const dx = destCenter.x - sourceCenter.x;
    const dy = destCenter.y - sourceCenter.y;
    const L = Math.hypot(dx, dy) || 1;

    const baseCount = Math.max(2, Math.ceil(L / opts.segmentLength));
    const N = Math.max(4, Math.ceil(baseCount * opts.initialSlackFactor) + 1);

    // Lane offset perpendicular to chord, applied uniformly to all beads.
    // The end beads start AT the lane-offset center — they're already "in the
    // hole" and ready to be pulled deeper by the endpoint force toward that
    // same lane-offset point (sourceTarget / destTarget below).
    const offset = laneOffsetVector(edge, groups, opts.laneSpacing);

    const beads: Bead[] = [];
    const j = opts.initialJitter;
    for (let i = 0; i < N; i++) {
      const t = i / (N - 1);
      const jx = j > 0 ? (rng() - 0.5) * 2 * j : 0;
      const jy = j > 0 ? (rng() - 0.5) * 2 * j : 0;
      beads.push({
        x: sourceCenter.x + t * dx + offset.x + jx,
        y: sourceCenter.y + t * dy + offset.y + jy,
        vx: 0,
        vy: 0,
      });
    }

    const incident = new Set([edge.srcNode, edge.destNode]);
    const edgeObstacles: Obstacle[] = [];
    for (const [n, ob] of obstacles) {
      if (!incident.has(n)) edgeObstacles.push(ob);
    }

    const sourceTarget = {x: sourceCenter.x + offset.x, y: sourceCenter.y + offset.y};
    const destTarget = {x: destCenter.x + offset.x, y: destCenter.y + offset.y};
    states.push({edge, sourceTarget, destTarget, sourceBox, destBox, beads, obstacles: edgeObstacles});
  }

  simulateAll(states, opts, frozenPoints);

  for (const st of states) {
    // Pass all beads through as control points. Beads that ended up inside
    // either incident bbox draw lines through the node fill, which is
    // occluded — only the surface portion is visible.
    st.edge.setControlPoints(st.beads.map(b => ({x: b.x, y: b.y})));
    if (log) {
      const beadStr = st.beads.slice(0, 8).map(b => `(${b.x.toFixed(0)},${b.y.toFixed(0)})`).join(' ');
      log(`[weighted-chain] edge ${st.edge.id} ${st.edge.srcNode.id}→${st.edge.destNode.id}: ${st.beads.length} beads ${beadStr}${st.beads.length > 8 ? '...' : ''}`);
    }
  }
  log?.(`[weighted-chain] done`);
}

function simulateAll(states: EdgeSim[], opts: WeightedChainOptions, frozenPoints: Pt[] = []): void {
  const edgeRepulsionMaxDistSq = opts.edgeRepulsionMaxDist * opts.edgeRepulsionMaxDist;
  const segLen = opts.segmentLength;

  for (let iter = 0; iter < opts.iterations; iter++) {
    // Step 1: forces and velocity update on all beads.
    for (let s = 0; s < states.length; s++) {
      const st = states[s];
      const beads = st.beads;

      for (let i = 0; i < beads.length; i++) {
        const b = beads[i];
        let fx = 0, fy = 0;

        if (i === 0) {
          const dx = st.sourceTarget.x - b.x;
          const dy = st.sourceTarget.y - b.y;
          const d = Math.hypot(dx, dy) || 1;
          fx += opts.endpointForce * dx / d;
          fy += opts.endpointForce * dy / d;
        } else if (i === beads.length - 1) {
          const dx = st.destTarget.x - b.x;
          const dy = st.destTarget.y - b.y;
          const d = Math.hypot(dx, dy) || 1;
          fx += opts.endpointForce * dx / d;
          fy += opts.endpointForce * dy / d;
        }

        const inHole = inBox(b.x, b.y, st.sourceBox) || inBox(b.x, b.y, st.destBox);

        if (!inHole) {
          const distFromEnd = Math.min(i, beads.length - 1 - i);
          let chargeScale = 1;
          if (opts.chargeRampLength > 0) {
            const t = Math.min(distFromEnd / opts.chargeRampLength, 1);
            chargeScale = t * t * (3 - 2 * t);
          }
          const localChargeK = opts.chargeK * chargeScale;
          const localInsideKickK = opts.insideKickK * chargeScale;
          const localEdgeRepulsionK = opts.edgeRepulsionK * chargeScale;

          const left = i > 0 ? beads[i - 1] : b;
          const right = i < beads.length - 1 ? beads[i + 1] : b;
          const edx = right.x - left.x;
          const edy = right.y - left.y;
          const elen = Math.hypot(edx, edy) || 1;
          const perpX = -edy / elen;
          const perpY = edx / elen;

          for (const ob of st.obstacles) {
            const f = obstacleForce(b.x, b.y, ob, localChargeK, localInsideKickK, perpX, perpY, opts.obstacleFalloffDist);
            fx += f.fx;
            fy += f.fy;
          }

          // Global cross-edge bead repulsion: all-pairs over visible beads
          // on every other edge, not just siblings. PBD's rigid segments
          // make this stable (no squeeze-past-chain-neighbors instability).
          for (let s2 = 0; s2 < states.length; s2++) {
            if (s2 === s) continue;
            const other = states[s2];
            const others = other.beads;
            for (let j = 0; j < others.length; j++) {
              const o = others[j];
              // Skip in-hole beads — below the surface, no charge.
              if (inBox(o.x, o.y, other.sourceBox) || inBox(o.x, o.y, other.destBox)) continue;
              const ddx = b.x - o.x;
              const ddy = b.y - o.y;
              const dsq = ddx * ddx + ddy * ddy;
              if (dsq < 1e-6 || dsq > edgeRepulsionMaxDistSq) continue;
              const d = Math.sqrt(dsq);
              const force = localEdgeRepulsionK / dsq;
              fx += (ddx / d) * force;
              fy += (ddy / d) * force;
            }
          }

          // Repulsion from frozen edges (static obstacle geometry). Same law
          // as cross-edge bead repulsion, but these points never move.
          for (let p = 0; p < frozenPoints.length; p++) {
            const o = frozenPoints[p];
            const ddx = b.x - o.x;
            const ddy = b.y - o.y;
            const dsq = ddx * ddx + ddy * ddy;
            if (dsq < 1e-6 || dsq > edgeRepulsionMaxDistSq) continue;
            const d = Math.sqrt(dsq);
            const force = localEdgeRepulsionK / dsq;
            fx += (ddx / d) * force;
            fy += (ddy / d) * force;
          }
        }

        let vx = (b.vx + fx * opts.dt) * opts.damping;
        let vy = (b.vy + fy * opts.dt) * opts.damping;
        const speed = Math.hypot(vx, vy);
        if (speed > opts.maxVelocity) {
          vx = (vx / speed) * opts.maxVelocity;
          vy = (vy / speed) * opts.maxVelocity;
        }
        b.vx = vx;
        b.vy = vy;
      }
    }

    // Step 2: position update from velocity.
    for (const st of states) {
      for (const b of st.beads) {
        b.x += b.vx * opts.dt;
        b.y += b.vy * opts.dt;
      }
    }

    // Step 3: PBD — project positions onto the rigid-segment constraint
    // manifold. Each pass walks the chain once, adjusting both endpoints of
    // each segment by half the violation. Multiple passes converge.
    for (let pass = 0; pass < opts.pbdIterations; pass++) {
      for (const st of states) {
        const beads = st.beads;
        for (let i = 0; i < beads.length - 1; i++) {
          const a = beads[i];
          const b = beads[i + 1];
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const d = Math.hypot(dx, dy);
          if (d < 1e-6) continue;
          const correction = (d - segLen) / 2;
          const ux = dx / d;
          const uy = dy / d;
          a.x += correction * ux;
          a.y += correction * uy;
          b.x -= correction * ux;
          b.y -= correction * uy;
        }
      }
    }

    // Step 4: drain in-hole slack. Removes end beads that have been pulled
    // deep into their incident bbox (both end-side beads inside) — those
    // represent excess chain length that's been absorbed by the hole.
    if (opts.drainInterval > 0 && (iter + 1) % opts.drainInterval === 0) {
      for (const st of states) {
        drainEnds(st.beads, st.sourceBox, st.destBox);
      }
    }
  }
}

/** Splice off end beads that are deeply inside their incident bbox. The
 *  trigger is "both beads at this end are in the bbox" — when only the
 *  very last bead is inside, the chain on the surface is held taut by the
 *  endpoint pull and we stop. */
function drainEnds(beads: Bead[], srcBox: Obstacle, destBox: Obstacle): void {
  while (beads.length > 4 &&
         inBox(beads[0].x, beads[0].y, srcBox) &&
         inBox(beads[1].x, beads[1].y, srcBox)) {
    beads.shift();
  }
  while (beads.length > 4 &&
         inBox(beads[beads.length - 1].x, beads[beads.length - 1].y, destBox) &&
         inBox(beads[beads.length - 2].x, beads[beads.length - 2].y, destBox)) {
    beads.pop();
  }
}

/** Sample points along a polyline at ~`spacing` px intervals, appending them
 *  to `out`. Includes every original vertex plus interpolated points so no
 *  gap between consecutive samples exceeds `spacing`. */
function densifyPolyline(points: Pt[], spacing: number, out: Pt[]): void {
  if (points.length === 0) return;
  out.push({x: points[0].x, y: points[0].y});
  for (let i = 0; i < points.length - 1; i++) {
    const a = points[i];
    const b = points[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy);
    const steps = Math.max(1, Math.ceil(len / spacing));
    for (let s = 1; s <= steps; s++) {
      const t = s / steps;
      out.push({x: a.x + dx * t, y: a.y + dy * t});
    }
  }
}

function nodeCenter(n: DANode): {x: number; y: number} {
  return {
    x: n.konvaGroup.x() + n.NODE_WIDTH / 2,
    y: n.konvaGroup.y() + n.NODE_HEIGHT / 2,
  };
}

function inBox(x: number, y: number, box: Obstacle): boolean {
  return x >= box.minX && x <= box.maxX && y >= box.minY && y <= box.maxY;
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
    const key = canonicalPairKey(e.srcNode.id, e.destNode.id);
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
    const ac = nodeCenter(a);
    const bc = nodeCenter(b);
    const dx = bc.x - ac.x;
    const dy = bc.y - ac.y;
    const len = Math.hypot(dx, dy) || 1;
    const group: EdgeGroup = {perpX: -dy / len, perpY: dx / len, edges: arr};
    for (const e of arr) result.set(e, group);
  }
  return result;
}

function canonicalPairKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function laneOffsetVector(edge: DAEdge, groups: Map<DAEdge, EdgeGroup>, spacing: number): {x: number; y: number} {
  const group = groups.get(edge);
  if (!group || group.edges.length < 2) return {x: 0, y: 0};
  const idx = group.edges.indexOf(edge);
  const mag = (idx - (group.edges.length - 1) / 2) * spacing;
  return {x: group.perpX * mag, y: group.perpY * mag};
}

/** Mulberry32 — small fast deterministic PRNG. Same seed yields the same
 *  sequence, so bead jitter is reproducible. */
function makeRng(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function obstacleForce(
  x: number, y: number, ob: Obstacle,
  chargeK: number, insideKickK: number,
  perpX: number, perpY: number,
  falloffDist: number,
): {fx: number; fy: number} {
  const closestX = Math.max(ob.minX, Math.min(x, ob.maxX));
  const closestY = Math.max(ob.minY, Math.min(y, ob.maxY));
  const dx = x - closestX;
  const dy = y - closestY;
  const distSq = dx * dx + dy * dy;
  if (distSq < 1e-6) {
    const cx = (ob.minX + ob.maxX) / 2;
    const cy = (ob.minY + ob.maxY) / 2;
    const proj = perpX * (x - cx) + perpY * (y - cy);
    const sign = proj >= 0 ? 1 : -1;
    return {fx: perpX * insideKickK * sign, fy: perpY * insideKickK * sign};
  }
  const dist = Math.sqrt(distSq);
  // Finite-support kernel: ~chargeK/d^2 up close, exactly 0 at falloffDist,
  // and smoothly (C1) zero there. Kills the old unbounded inverse-square tail.
  if (dist >= falloffDist) return {fx: 0, fy: 0};
  const inv = 1 / dist - 1 / falloffDist;
  const force = chargeK * inv * inv;
  return {fx: (dx / dist) * force, fy: (dy / dist) * force};
}
