import { DANode } from './da-node';
import { DAEdge } from './da-edge';

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
}

export const DEFAULT_OPTIONS: ChargedSpringOptions = {
  beadsPerEdge: 8,
  iterations: 240,
  smoothingK: 0.35,
  chargeK: 9000,
  insideKickK: 80,
  damping: 0.72,
  dt: 1.0,
  clearance: 16,
  pruneEpsilon: 1.5,
  maxVelocity: 30,
};

/** Run a charged-spring simulation on every non-self-loop edge in `edges`,
 *  populating each edge's controlPoints with the bend points that emerge.
 *
 *  Beads are connected to their neighbors by a smoothing pull (toward the
 *  midpoint of the two neighbors) and are repelled by every node in `nodes`
 *  except the edge's own src/dest. */
export function applyChargedSpringEdges(
  nodes: DANode[],
  edges: DAEdge[],
  opts: ChargedSpringOptions = DEFAULT_OPTIONS,
): void {
  const obstacles = buildObstacleMap(nodes, opts.clearance);

  for (const edge of edges) {
    if (edge.srcNode === edge.destNode) continue;

    edge.initializeStraightControlPoints(opts.beadsPerEdge);
    const path = edge.getPathPoints();
    if (path.length < 3) continue;

    const startEndpoint = path[0];
    const endEndpoint = path[path.length - 1];
    const beads: Bead[] = path.slice(1, -1).map(p => ({x: p.x, y: p.y, vx: 0, vy: 0}));

    const incident = new Set([edge.srcNode, edge.destNode]);
    const edgeObstacles: Obstacle[] = [];
    for (const [n, ob] of obstacles) {
      if (!incident.has(n)) edgeObstacles.push(ob);
    }

    simulate(beads, startEndpoint, endEndpoint, edgeObstacles, opts);

    edge.setControlPoints(prune(beads, startEndpoint, endEndpoint, opts.pruneEpsilon));
  }
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

function simulate(
  beads: Bead[],
  start: {x: number; y: number},
  end: {x: number; y: number},
  obstacles: Obstacle[],
  opts: ChargedSpringOptions,
): void {
  for (let iter = 0; iter < opts.iterations; iter++) {
    for (let i = 0; i < beads.length; i++) {
      const b = beads[i];
      const left = i === 0 ? start : beads[i - 1];
      const right = i === beads.length - 1 ? end : beads[i + 1];

      const midX = (left.x + right.x) / 2;
      const midY = (left.y + right.y) / 2;
      let fx = opts.smoothingK * (midX - b.x);
      let fy = opts.smoothingK * (midY - b.y);

      // Unit perpendicular to the local edge direction (left → right).
      // Used to push beads off the line when they're trapped inside an obstacle.
      const edx = right.x - left.x;
      const edy = right.y - left.y;
      const elen = Math.hypot(edx, edy) || 1;
      const perpX = -edy / elen;
      const perpY = edx / elen;

      for (const ob of obstacles) {
        const f = obstacleForce(b.x, b.y, ob, opts.chargeK, opts.insideKickK, perpX, perpY);
        fx += f.fx;
        fy += f.fy;
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

    for (const b of beads) {
      b.x += b.vx * opts.dt;
      b.y += b.vy * opts.dt;
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
