import { DANode } from './da-node';
import { DAEdge } from './da-edge';

interface Bead {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Seed (lane-offset straight-line) position. Used by anchor mode and
   *  inherited by new beads created via remeshing (interpolated from
   *  neighbors). With anchorK=0 the value is unused but still tracked so
   *  the same bead struct works in both modes. */
  restX: number;
  restY: number;
}

interface Obstacle {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface FlexibleWireOptions {
  /** Initial bead count per edge. The chain is reseeded at this count and
   *  then split/merged via remeshing as the path elongates or contracts. */
  initialBeadCount: number;
  iterations: number;
  /** Every N iterations, walk the chain and split/merge based on segment
   *  length vs targetSegmentLength. Set to 0 to disable remeshing entirely
   *  (then the algorithm is just charged-spring with no anchor + high sibling). */
  remeshInterval: number;
  /** Desired spacing between adjacent beads. Drives split/merge thresholds. */
  targetSegmentLength: number;
  /** Split a segment if its length exceeds target * this ratio. */
  splitThresholdRatio: number;
  /** Merge a pair of adjacent interior beads if their segment is below
   *  target * this ratio. */
  mergeThresholdRatio: number;
  /** Hard cap on bead count per edge — safety against runaway split. */
  maxBeadsPerEdge: number;
  /** Pulls each bead toward the midpoint of its two neighbors. Acts as a
   *  Laplacian smoother and a contractile force: with no anchor, beads
   *  collapse the chain to the locally-shortest obstacle-free path. */
  smoothingK: number;
  /** Hooke-style spring stiffness between adjacent beads, with rest length
   *  equal to targetSegmentLength. Unlike smoothing (which always wants
   *  segments shorter), this actively targets a *specific* spacing — pulls
   *  stretched segments together, pushes compressed segments apart. With
   *  damping=0.78 and dt=1.0 the discrete-spring stability limit per bead
   *  (which has springs to two neighbors) is ~1.28, so keep this < ~0.6. */
  segmentSpringK: number;
  chargeK: number;
  insideKickK: number;
  damping: number;
  dt: number;
  /** Clearance around node bounding boxes. With anchorK=0 (rubber-band mode)
   *  the chain hugs obstacle corners, so a generous clearance is what stops
   *  it from looking visually pinched. */
  clearance: number;
  /** Drop interior beads within this perpendicular distance of the line
   *  through their neighbors (after sim) — they contribute no visible bend. */
  pruneEpsilon: number;
  maxVelocity: number;
  /** Initial perpendicular offset between sibling edges, k-th of N at
   *  (k − (N−1)/2) × spacing. Without anchor, lanes are held purely by
   *  edgeRepulsionK below; without sibling repulsion, parallels collapse
   *  onto the same shortest path. */
  laneSpacing: number;
  /** Sibling-scoped cross-edge bead repulsion. Cranked up vs charged-spring
   *  defaults: in rubber-band mode this is the only thing keeping parallel
   *  edges in distinct lanes (no anchor pull to fight against). */
  edgeRepulsionK: number;
  edgeRepulsionMaxDist: number;
  /** Pull toward each bead's lane-offset rest position. Set to 0 for pure
   *  rubber-band behavior; >0 for anchored mode (chain stays close to its
   *  straight-line lane unless an obstacle deflects it). */
  anchorK: number;
  /** Tension along the chain, modeled as each interior bead pulled toward
   *  its perpendicular projection on the (un-offset) chord between the two
   *  pinned endpoints. Higher values make the wire taut: deflections only
   *  occur where obstacles push the chain off the chord. Unlike anchorK,
   *  beads can slide freely along the chord, so the chain doesn't fight
   *  contraction — it just resists *bulging* away from the chord line. */
  tautnessK: number;
  /** Smoothstep-tapered charge over the first N beads from each end —
   *  end beads carry less obstacle/sibling charge so they don't get pushed
   *  off-axis at the perimeter. Set 0 to disable. */
  chargeRampLength: number;
}

export const DEFAULT_OPTIONS: FlexibleWireOptions = {
  initialBeadCount: 16,
  iterations: 300,
  remeshInterval: 20,
  targetSegmentLength: 14,
  splitThresholdRatio: 1.5,
  mergeThresholdRatio: 0.5,
  maxBeadsPerEdge: 200,
  smoothingK: 0.5,
  segmentSpringK: 0.4,
  chargeK: 9000,
  insideKickK: 80,
  damping: 0.78,
  dt: 1.0,
  // Generous clearance vs charged-spring's 16 — without anchor the chain
  // pulls flush against obstacle bboxes; the extra padding stops it from
  // visually grazing node faces.
  clearance: 24,
  pruneEpsilon: 0.3,
  maxVelocity: 30,
  laneSpacing: 22,
  // 10x charged-spring's default. Sole defense against parallel-sibling
  // collapse in no-anchor mode.
  edgeRepulsionK: 500,
  edgeRepulsionMaxDist: 60,
  // Default to pure rubber-band. Switch to a small positive value (e.g. 0.4)
  // to get charged-spring-style anchored routing with adaptive bead count.
  anchorK: 0,
  // Moderate default tautness — chain sits close to the chord but bulges
  // freely around obstacles. Set to 0 for pure-slack rubber-band; crank up
  // to make obstacle deflections snap back tightly.
  tautnessK: 0.3,
  chargeRampLength: 5,
};

interface EdgeSim {
  edge: DAEdge;
  start: {x: number; y: number};
  end: {x: number; y: number};
  beads: Bead[];
  obstacles: Obstacle[];
  siblingIndices: number[];
}

/** Run an elastic-wire simulation: stiff contractile chain with adaptive
 *  bead count via periodic remeshing. The chain finds the shortest
 *  obstacle-avoiding path with bead count proportional to path length. */
export function applyFlexibleWireEdges(
  nodes: DANode[],
  edges: DAEdge[],
  opts: FlexibleWireOptions = DEFAULT_OPTIONS,
  log?: (msg: string) => void,
): void {
  const obstacles = buildObstacleMap(nodes, opts.clearance);
  log?.(`[flexible-wire] start: ${nodes.length} nodes, ${edges.length} edges, init ${opts.initialBeadCount} beads/edge, ${opts.iterations} iters, anchorK=${opts.anchorK}`);

  const groups = groupEdgesByUnorderedPair(edges);

  const states: EdgeSim[] = [];
  for (const edge of edges) {
    if (edge.srcNode === edge.destNode) {
      log?.(`[flexible-wire] edge ${edge.id} is self-loop — skipped`);
      continue;
    }

    edge.initializeStraightControlPoints(opts.initialBeadCount);
    const path = edge.getPathPoints();
    if (path.length < 3) continue;

    const start = path[0];
    const end = path[path.length - 1];
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

    states.push({edge, start, end, beads, obstacles: edgeObstacles, siblingIndices: []});
  }

  for (let i = 0; i < states.length; i++) {
    const myGroup = groups.get(states[i].edge);
    if (!myGroup) continue;
    for (let j = 0; j < states.length; j++) {
      if (i === j) continue;
      if (groups.get(states[j].edge) === myGroup) {
        states[i].siblingIndices.push(j);
      }
    }
  }

  simulateAll(states, opts);

  for (const st of states) {
    const kept = prune(st.beads, st.start, st.end, opts.pruneEpsilon);
    st.edge.setControlPoints(kept);
    if (log) {
      const startStr = `(${st.start.x.toFixed(0)},${st.start.y.toFixed(0)})`;
      const endStr = `(${st.end.x.toFixed(0)},${st.end.y.toFixed(0)})`;
      const beadStr = kept.map(p => `(${p.x.toFixed(0)},${p.y.toFixed(0)})`).join(' ');
      log(`[flexible-wire] edge ${st.edge.id} ${st.edge.srcNode.id}→${st.edge.destNode.id}: start=${startStr} end=${endStr} obstacles=${st.obstacles.length} beads(${kept.length}/${st.beads.length})=${beadStr || '∅'}`);
    }
  }
  log?.(`[flexible-wire] done`);
}

interface EdgeGroup {
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

function simulateAll(states: EdgeSim[], opts: FlexibleWireOptions): void {
  const edgeRepulsionMaxDistSq = opts.edgeRepulsionMaxDist * opts.edgeRepulsionMaxDist;

  for (let iter = 0; iter < opts.iterations; iter++) {
    for (let s = 0; s < states.length; s++) {
      const st = states[s];
      const beads = st.beads;
      // Precompute the chord (start→end, un-offset) for the tautness force.
      // Tension pulls each bead toward its perpendicular projection on this
      // line, leaving along-chord position free.
      const chordDx = st.end.x - st.start.x;
      const chordDy = st.end.y - st.start.y;
      const chordLen = Math.hypot(chordDx, chordDy) || 1;
      const chordUx = chordDx / chordLen;
      const chordUy = chordDy / chordLen;

      // First and last beads pinned (boundary conditions).
      for (let i = 1; i < beads.length - 1; i++) {
        const b = beads[i];
        const left = beads[i - 1];
        const right = beads[i + 1];

        const midX = (left.x + right.x) / 2;
        const midY = (left.y + right.y) / 2;
        let fx = opts.smoothingK * (midX - b.x);
        let fy = opts.smoothingK * (midY - b.y);

        if (opts.segmentSpringK > 0) {
          const rest = opts.targetSegmentLength;
          // Spring to left neighbor: stretched (d > rest) pulls bead toward
          // left, compressed (d < rest) pushes bead away from left.
          let sx = left.x - b.x;
          let sy = left.y - b.y;
          let sd = Math.hypot(sx, sy) || 1;
          let stretch = sd - rest;
          fx += opts.segmentSpringK * stretch * (sx / sd);
          fy += opts.segmentSpringK * stretch * (sy / sd);
          // Spring to right neighbor.
          sx = right.x - b.x;
          sy = right.y - b.y;
          sd = Math.hypot(sx, sy) || 1;
          stretch = sd - rest;
          fx += opts.segmentSpringK * stretch * (sx / sd);
          fy += opts.segmentSpringK * stretch * (sy / sd);
        }

        if (opts.anchorK > 0) {
          const distFromEnd = Math.min(i, beads.length - 1 - i);
          const anchorBoost = distFromEnd === 1 ? 3
                            : distFromEnd === 2 ? 1.6
                            : 1;
          const localAnchorK = opts.anchorK * anchorBoost;
          fx += localAnchorK * (b.restX - b.x);
          fy += localAnchorK * (b.restY - b.y);
        }

        if (opts.tautnessK > 0) {
          // Project bead onto chord SEGMENT (clamped to [0, chordLen]) and
          // pull toward that projection. Clamping matters when sibling
          // repulsion or numerical drift pushes a bead's along-chord
          // position past an endpoint: without it, the pull is purely
          // perpendicular to the infinite line and the bead never gets
          // dragged back into the segment.
          const sdx = b.x - st.start.x;
          const sdy = b.y - st.start.y;
          const projRaw = sdx * chordUx + sdy * chordUy;
          const proj = Math.max(0, Math.min(chordLen, projRaw));
          const projX = st.start.x + proj * chordUx;
          const projY = st.start.y + proj * chordUy;
          fx += opts.tautnessK * (projX - b.x);
          fy += opts.tautnessK * (projY - b.y);
        }

        const distFromEnd = Math.min(i, beads.length - 1 - i);
        let chargeScale = 1;
        if (opts.chargeRampLength > 0) {
          const t = Math.min(distFromEnd / opts.chargeRampLength, 1);
          chargeScale = t * t * (3 - 2 * t);
        }
        const localChargeK = opts.chargeK * chargeScale;
        const localInsideKickK = opts.insideKickK * chargeScale;
        const localEdgeRepulsionK = opts.edgeRepulsionK * chargeScale;

        const edx = right.x - left.x;
        const edy = right.y - left.y;
        const elen = Math.hypot(edx, edy) || 1;
        const perpX = -edy / elen;
        const perpY = edx / elen;

        for (const ob of st.obstacles) {
          const f = obstacleForce(b.x, b.y, ob, localChargeK, localInsideKickK, perpX, perpY);
          fx += f.fx;
          fy += f.fy;
        }

        for (const s2 of st.siblingIndices) {
          const others = states[s2].beads;
          for (let j = 0; j < others.length; j++) {
            const o = others[j];
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

    for (const st of states) {
      const beads = st.beads;
      for (let i = 1; i < beads.length - 1; i++) {
        const b = beads[i];
        b.x += b.vx * opts.dt;
        b.y += b.vy * opts.dt;
      }
    }

    if (opts.remeshInterval > 0 && (iter + 1) % opts.remeshInterval === 0) {
      for (const st of states) {
        remesh(st.beads, opts);
      }
    }
  }
}

/** Walk the chain: split segments longer than target * splitRatio, then
 *  merge interior pairs with combined segment shorter than target * mergeRatio.
 *  Endpoints (idx 0 and last) are pinned and never touched. */
function remesh(beads: Bead[], opts: FlexibleWireOptions): void {
  const splitMin = opts.targetSegmentLength * opts.splitThresholdRatio;
  const mergeMax = opts.targetSegmentLength * opts.mergeThresholdRatio;

  let i = 0;
  while (i < beads.length - 1) {
    if (beads.length >= opts.maxBeadsPerEdge) break;
    const a = beads[i];
    const b = beads[i + 1];
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    if (dist > splitMin) {
      beads.splice(i + 1, 0, {
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
        vx: (a.vx + b.vx) / 2,
        vy: (a.vy + b.vy) / 2,
        restX: (a.restX + b.restX) / 2,
        restY: (a.restY + b.restY) / 2,
      });
      // Re-check the new left segment in case it's still too long.
    } else {
      i++;
    }
  }

  // Merge: only collapse interior beads. Need at least 4 beads to consider
  // merging (so we keep both pinned endpoints and at least one interior on
  // each side). We merge bead i with bead i+1 when both are interior.
  i = 1;
  while (i < beads.length - 2) {
    if (beads.length <= 4) break;
    const a = beads[i];
    const b = beads[i + 1];
    const dist = Math.hypot(b.x - a.x, b.y - a.y);
    if (dist < mergeMax) {
      beads.splice(i, 2, {
        x: (a.x + b.x) / 2,
        y: (a.y + b.y) / 2,
        vx: (a.vx + b.vx) / 2,
        vy: (a.vy + b.vy) / 2,
        restX: (a.restX + b.restX) / 2,
        restY: (a.restY + b.restY) / 2,
      });
      // Don't advance — re-check the new merged bead with its new right neighbor.
    } else {
      i++;
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
