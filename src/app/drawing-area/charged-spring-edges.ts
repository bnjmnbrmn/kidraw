import { DANode } from './da-node';
import { DAEdge } from './da-edge';

interface Bead {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** The bead's seed position (straight-line, lane-offset). The anchor
   *  force pulls each bead gently back toward this point so a chain that
   *  has nothing to oppose cross-edge repulsion can't drift unboundedly. */
  restX: number;
  restY: number;
}

interface Obstacle {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface ChargedSpringOptions {
  beadsPerEdge: number;
  iterations: number;
  smoothingK: number;
  chargeK: number;
  /** Constant force applied perpendicular to the local edge direction when a
   *  bead is inside an obstacle's bounding box. Kept moderate so it does not
   *  explode the simulation; outside the box the inverse-square chargeK
   *  takes over. */
  insideKickK: number;
  damping: number;
  dt: number;
  clearance: number;
  /** After the sim, drop any bead within this perpendicular distance of the
   *  line through its surviving neighbors — they contribute no visible bend. */
  pruneEpsilon: number;
  /** Velocity cap per axis to keep numerics stable when beads sit inside obstacles. */
  maxVelocity: number;
  /** Initial perpendicular offset between sibling edges (edges sharing the same
   *  unordered {src, dest} pair). The k-th edge in a group of N gets offset
   *  (k − (N−1)/2) × laneSpacing along the canonical perpendicular. Bidirectional
   *  pairs and same-direction parallels both spread into distinct lanes. */
  laneSpacing: number;
  /** Inverse-square repulsion constant between beads on different edges. Lets
   *  edges actively push each other apart mid-sim, not just at initialization. */
  edgeRepulsionK: number;
  /** Cutoff distance for cross-edge bead repulsion (beyond this, no force). */
  edgeRepulsionMaxDist: number;
  /** Hooke-style pull toward each bead's straight-line lane-offset rest
   *  position. Without it, chains drift unboundedly under cross-edge or
   *  one-sided obstacle pressure. With it, lanes are a stable equilibrium
   *  and obstacles still locally deflect the chain. */
  anchorK: number;
}

export const DEFAULT_OPTIONS: ChargedSpringOptions = {
  beadsPerEdge: 16,
  iterations: 300,
  smoothingK: 0.4,
  chargeK: 9000,
  insideKickK: 80,
  damping: 0.78,
  dt: 1.0,
  clearance: 16,
  // Keep nearly all beads — pruning the chain to a few "key" bends produces
  // long polyline segments that look angular when rendered as straight lines.
  // A dense chain of short segments reads as a smoother curve.
  pruneEpsilon: 0.3,
  maxVelocity: 30,
  laneSpacing: 22,
  // Cross-edge bead repulsion is disabled by default. The lane-seed
  // offsets plus the anchor are enough to keep parallel siblings
  // separated, and adding bead-bead inverse-square forces between
  // edges destabilizes dense groups (4+ parallels) — the chain folds
  // back on itself when sibling beads push each other past their
  // chain neighbors. Re-enable for crossing non-sibling edges if that
  // case becomes important.
  edgeRepulsionK: 0,
  edgeRepulsionMaxDist: 60,
  // Anchor strength. With damping=0.78 and dt=1.0, the discrete spring is
  // stable up to K ≈ 2.56; we sit well below that. Equilibrium displacement
  // under a constant external force F is F / localAnchorK, so K=0.4 with the
  // distFromEnd boosts below caps drift at ~1-3 px even under typical
  // obstacle/cross-edge pressure.
  anchorK: 0.4,
};

interface EdgeSim {
  edge: DAEdge;
  start: {x: number; y: number};
  end: {x: number; y: number};
  beads: Bead[];
  obstacles: Obstacle[];
}

/** Run a charged-spring simulation on every non-self-loop edge in `edges`,
 *  populating each edge's controlPoints with the bend points that emerge.
 *
 *  Forces per bead:
 *  - Smoothing: pulled toward the midpoint of its two neighbors (or
 *    toward the perimeter endpoint at the chain ends).
 *  - Obstacle: inverse-square repulsion from every node bounding box
 *    except the edge's own src/dest, with a perpendicular kick when a
 *    bead is trapped inside an obstacle.
 *  - Cross-edge: inverse-square repulsion from beads on *other* edges
 *    (cutoff at edgeRepulsionMaxDist), so parallel siblings push apart.
 *
 *  Edges sharing the same unordered {src, dest} pair are seeded at
 *  perpendicular lane offsets so the sim starts with parallels separated
 *  rather than stacked. */
export function applyChargedSpringEdges(
  nodes: DANode[],
  edges: DAEdge[],
  opts: ChargedSpringOptions = DEFAULT_OPTIONS,
  log?: (msg: string) => void,
): void {
  const obstacles = buildObstacleMap(nodes, opts.clearance);
  log?.(`[charged-spring] start: ${nodes.length} nodes, ${edges.length} edges, ${opts.beadsPerEdge} beads/edge, ${opts.iterations} iters`);
  for (const n of nodes) {
    log?.(`[charged-spring]   node ${n.id} pos=(${n.konvaGroup.x().toFixed(0)},${n.konvaGroup.y().toFixed(0)}) size=${n.NODE_WIDTH}x${n.NODE_HEIGHT}`);
  }

  const groups = groupEdgesByUnorderedPair(edges);

  const states: EdgeSim[] = [];
  for (const edge of edges) {
    if (edge.srcNode === edge.destNode) {
      log?.(`[charged-spring] edge ${edge.id} is self-loop — skipped`);
      continue;
    }

    edge.initializeStraightControlPoints(opts.beadsPerEdge);
    const path = edge.getPathPoints();
    if (path.length < 3) continue;

    const start = path[0];
    const end = path[path.length - 1];
    // Apply the full lane offset to every bead, including the chain ends.
    // Each parallel sibling now sits in its own lane all the way to the
    // perimeter, so getEdgePoint projects to a different point on the
    // node face for each one — the edges no longer converge at a single
    // point on the border, they spread out across the face.
    const offset = laneOffsetVector(edge, groups, opts.laneSpacing);
    const inner = path.slice(1, -1);
    const beads: Bead[] = inner.map((p) => {
      const x = p.x + offset.x;
      const y = p.y + offset.y;
      return {x, y, vx: 0, vy: 0, restX: x, restY: y};
    });

    const incident = new Set([edge.srcNode, edge.destNode]);
    const edgeObstacles: Obstacle[] = [];
    for (const [n, ob] of obstacles) {
      if (!incident.has(n)) edgeObstacles.push(ob);
    }

    states.push({edge, start, end, beads, obstacles: edgeObstacles});
  }

  simulateAll(states, opts);

  for (const st of states) {
    const kept = prune(st.beads, st.start, st.end, opts.pruneEpsilon);
    st.edge.setControlPoints(kept);
    if (log) {
      const startStr = `(${st.start.x.toFixed(0)},${st.start.y.toFixed(0)})`;
      const endStr = `(${st.end.x.toFixed(0)},${st.end.y.toFixed(0)})`;
      const beadStr = kept.map(p => `(${p.x.toFixed(0)},${p.y.toFixed(0)})`).join(' ');
      log(`[charged-spring] edge ${st.edge.id} ${st.edge.srcNode.id}→${st.edge.destNode.id}: start=${startStr} end=${endStr} obstacles=${st.obstacles.length} beads(${kept.length}/${opts.beadsPerEdge})=${beadStr || '∅'}`);
    }
  }
  log?.(`[charged-spring] done`);
}

interface EdgeGroup {
  /** Canonical perpendicular: rotate (b - a) by +90°, where a is the node with
   *  the lexicographically smaller id. Same direction for every edge in the
   *  group so lane offsets land on a consistent global axis. */
  perpX: number;
  perpY: number;
  edges: DAEdge[];
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
    const dx = (b.konvaGroup.x() + b.NODE_WIDTH / 2) - (a.konvaGroup.x() + a.NODE_WIDTH / 2);
    const dy = (b.konvaGroup.y() + b.NODE_HEIGHT / 2) - (a.konvaGroup.y() + a.NODE_HEIGHT / 2);
    const len = Math.hypot(dx, dy) || 1;
    const group: EdgeGroup = {perpX: -dy / len, perpY: dx / len, edges: arr};
    for (const e of arr) result.set(e, group);
  }
  return result;
}

function canonicalPairKey(idA: string, idB: string): string {
  return idA < idB ? `${idA}|${idB}` : `${idB}|${idA}`;
}

function laneOffsetVector(edge: DAEdge, groups: Map<DAEdge, EdgeGroup>, spacing: number): {x: number; y: number} {
  const group = groups.get(edge);
  if (!group || group.edges.length < 2) return {x: 0, y: 0};
  const idx = group.edges.indexOf(edge);
  const mag = (idx - (group.edges.length - 1) / 2) * spacing;
  return {x: group.perpX * mag, y: group.perpY * mag};
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

function simulateAll(states: EdgeSim[], opts: ChargedSpringOptions): void {
  const edgeRepulsionMaxDistSq = opts.edgeRepulsionMaxDist * opts.edgeRepulsionMaxDist;

  for (let iter = 0; iter < opts.iterations; iter++) {
    // Compute forces on every bead (positions stay frozen this iteration).
    for (let s = 0; s < states.length; s++) {
      const st = states[s];
      const beads = st.beads;
      // The first and last beads are PINNED at their seed positions
      // (which sit exactly on the centerline thanks to the sin ramp
      // touching zero at the endpoints). They act as fixed boundary
      // conditions so the chain meets the perimeter perpendicular to
      // the node face, the perimeter point lands at the face midpoint,
      // and the arrowhead approaches head-on without clipping. Trying
      // to enforce this with a strong anchor force runs into the
      // mass-spring-damper stability limit and oscillates instead.
      for (let i = 1; i < beads.length - 1; i++) {
        const b = beads[i];
        const left = beads[i - 1];
        const right = beads[i + 1];

        const midX = (left.x + right.x) / 2;
        const midY = (left.y + right.y) / 2;
        let fx = opts.smoothingK * (midX - b.x);
        let fy = opts.smoothingK * (midY - b.y);

        // Anchor: pull each bead toward its seed lane-offset position.
        // Beads near the chain ends still get a boost so bend-onset is
        // gradual and meets the pinned end smoothly. Stable as long as
        // localAnchorK * dt² < 2 / damping ≈ 2.56.
        const distFromEnd = Math.min(i, beads.length - 1 - i);
        const anchorBoost = distFromEnd === 1 ? 3
                          : distFromEnd === 2 ? 1.6
                          : 1;
        const localAnchorK = opts.anchorK * anchorBoost;
        fx += localAnchorK * (b.restX - b.x);
        fy += localAnchorK * (b.restY - b.y);

        const edx = right.x - left.x;
        const edy = right.y - left.y;
        const elen = Math.hypot(edx, edy) || 1;
        const perpX = -edy / elen;
        const perpY = edx / elen;

        for (const ob of st.obstacles) {
          const f = obstacleForce(b.x, b.y, ob, opts.chargeK, opts.insideKickK, perpX, perpY);
          fx += f.fx;
          fy += f.fy;
        }

        // Cross-edge bead repulsion: every bead on every other edge pushes
        // this bead away with inverse-square falloff, capped at a cutoff
        // distance. Keeps parallel siblings spread out at equilibrium.
        for (let s2 = 0; s2 < states.length; s2++) {
          if (s2 === s) continue;
          const others = states[s2].beads;
          for (let j = 0; j < others.length; j++) {
            const o = others[j];
            const ddx = b.x - o.x;
            const ddy = b.y - o.y;
            const dsq = ddx * ddx + ddy * ddy;
            if (dsq < 1e-6 || dsq > edgeRepulsionMaxDistSq) continue;
            const d = Math.sqrt(dsq);
            const force = opts.edgeRepulsionK / dsq;
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

    // Apply velocities now that all forces have been computed against
    // a consistent snapshot of bead positions. End beads (i=0 and i=N-1)
    // are pinned; their velocities never get touched, so this no-ops on
    // them, but skip explicitly for clarity.
    for (const st of states) {
      const beads = st.beads;
      for (let i = 1; i < beads.length - 1; i++) {
        const b = beads[i];
        b.x += b.vx * opts.dt;
        b.y += b.vy * opts.dt;
      }
    }
  }
}

function obstacleForce(
  x: number,
  y: number,
  ob: Obstacle,
  chargeK: number,
  insideKickK: number,
  perpX: number,
  perpY: number,
): {fx: number; fy: number} {
  const closestX = Math.max(ob.minX, Math.min(x, ob.maxX));
  const closestY = Math.max(ob.minY, Math.min(y, ob.maxY));
  const dx = x - closestX;
  const dy = y - closestY;
  const distSq = dx * dx + dy * dy;

  if (distSq < 1e-6) {
    // Bead is inside the obstacle. Pushing it out the nearest face would
    // commonly send it back along the edge direction (where it just came
    // from). Instead, kick it perpendicular to the local edge direction so
    // the line bends around the obstacle. Sign is chosen by which side of
    // the obstacle's center the bead sits on; if exactly centered, default
    // to the +perp side (deterministic symmetry break).
    const cx = (ob.minX + ob.maxX) / 2;
    const cy = (ob.minY + ob.maxY) / 2;
    const proj = perpX * (x - cx) + perpY * (y - cy);
    const sign = proj >= 0 ? 1 : -1;
    return {fx: perpX * insideKickK * sign, fy: perpY * insideKickK * sign};
  }

  const dist = Math.sqrt(distSq);
  const force = chargeK / distSq;
  return {fx: (dx / dist) * force, fy: (dy / dist) * force};
}

/** Drop beads that lie within `epsilon` of the line between their neighbors —
 *  these contribute no visible bend and just bloat the polyline. */
function prune(
  beads: Bead[],
  start: {x: number; y: number},
  end: {x: number; y: number},
  epsilon: number,
): {x: number; y: number}[] {
  const kept: {x: number; y: number}[] = [];
  for (let i = 0; i < beads.length; i++) {
    const left = kept.length > 0 ? kept[kept.length - 1] : start;
    const right = i === beads.length - 1 ? end : beads[i + 1];
    const dist = perpDistance(beads[i].x, beads[i].y, left.x, left.y, right.x, right.y);
    if (dist >= epsilon) {
      kept.push({x: beads[i].x, y: beads[i].y});
    }
  }
  return kept;
}

function perpDistance(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.sqrt(dx * dx + dy * dy);
  if (len < 1e-6) return Math.hypot(px - ax, py - ay);
  return Math.abs((dx * (ay - py)) - ((ax - px) * dy)) / len;
}
