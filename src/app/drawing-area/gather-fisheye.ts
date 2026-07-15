/**
 * Pure geometry for the gathered ("sucked-in") view: every neighbor of the
 * anchor — incoming and outgoing — pulled onto a ring around it with its
 * original bearing preserved, so the gathered picture reads as the
 * ungathered layout radially compressed, not as a re-layout.
 *
 * When the ring can't cleanly hold everyone, neighbors collapse into
 * *stacks* (cascaded piles). Stacks never mix incoming with outgoing
 * neighbors, and within a direction they group by kind (edge tag), so a
 * pile is always "the N things of the same sort in the same direction".
 * Protected neighbors (the navigate-to-next candidate and its nearest
 * siblings) always stay individually visible. Cascade offsets are capped:
 * a stack of 50 looks essentially like a stack of 4.
 */

export interface GatherBox {
  id: string;
  /** Box center. */
  cx: number;
  cy: number;
  halfW: number;
  halfH: number;
}

export interface GatherNeighbor extends GatherBox {
  /** Which way the connecting edge(s) run relative to the anchor. A
   *  neighbor with edges both ways counts as 'out'. */
  direction: 'in' | 'out';
  /** Grouping key for stacking (edge kind / node type); '' when untyped. */
  kind: string;
  /** Never stacked (navigate-to-next candidate and its nearest siblings). */
  protected?: boolean;
}

export interface GatherStackRef {
  /** `${direction}:${kind}` — stable identity of the pile. */
  key: string;
  /** 0 = top of the stack (fully visible). */
  index: number;
  size: number;
}

export interface GatherPlacement {
  id: string;
  /** New box center. */
  x: number;
  y: number;
  /** null → individually placed. */
  stack: GatherStackRef | null;
}

export interface GatherPlan {
  placed: GatherPlacement[];
  /** Ring radius the neighbors were placed at (anchor center → box center). */
  ringRadius: number;
  /** Non-participant boxes should clear this distance from the anchor
   *  center so nearby strangers are never mistaken for neighbors. */
  clearRadius: number;
}

export interface GatherOptions {
  /** Clear arc gap between neighbor box footprints on the ring. */
  perimeterGap: number;
  /** Radial room between the anchor's box and the ring (edge-label band). */
  labelBand: number;
  /** Max fraction of the full circle the footprints may occupy. */
  ringFill: number;
  /** Widen the ring up to this factor before resorting to stacks. */
  maxWiden: number;
  /** Cascade offset per visible stack level, pointing radially outward. */
  stackOffset: number;
  /** Visible cascade levels; deeper members sit exactly under the last
   *  visible level (a stack of 50 looks like a stack of 4). */
  stackMaxVisible: number;
  /** Extra clearance beyond the ring for pushing strangers away. */
  clearMargin: number;
}

export const DEFAULT_GATHER_OPTIONS: GatherOptions = {
  perimeterGap: 70,
  labelBand: 80,
  ringFill: 0.85,
  maxWiden: 1.5,
  stackOffset: 14,
  stackMaxVisible: 3,
  clearMargin: 60,
};

const TAU = Math.PI * 2;

function halfDiag(b: {halfW: number; halfH: number}): number {
  return Math.hypot(b.halfW, b.halfH);
}

/** Bearing of a neighbor from the anchor; deterministic for degenerate
 *  (coincident) positions. */
function bearing(anchor: GatherBox, b: GatherBox): number {
  const dx = b.cx - anchor.cx;
  const dy = b.cy - anchor.cy;
  if (Math.hypot(dx, dy) < 1e-6) return 0;
  return Math.atan2(dy, dx);
}

/** Circular mean of angles (unit-vector sum); 0 for an empty/balanced set. */
function circularMean(angles: number[]): number {
  let x = 0;
  let y = 0;
  for (const a of angles) {
    x += Math.cos(a);
    y += Math.sin(a);
  }
  if (Math.hypot(x, y) < 1e-9) return angles.length > 0 ? angles[0] : 0;
  return Math.atan2(y, x);
}

/**
 * Place items on a circle as close to their desired angles as possible
 * subject to pairwise minimum separations (isotonic regression / pool
 * adjacent violators). Items must be sorted by desired angle. `sep[i]` is
 * the required angular distance between item i and item i+1.
 */
function packAngles(desired: number[], sep: number[]): number[] {
  const n = desired.length;
  if (n <= 1) return desired.slice();
  // Cut the circle at the largest gap between consecutive desired angles
  // so the wrap point disturbs the layout least.
  const order = desired.map((_, i) => i); // caller pre-sorts
  let cut = 0;
  let biggestGap = -1;
  for (let i = 0; i < n; i++) {
    const a = desired[order[i]];
    const b = desired[order[(i + 1) % n]] + (i === n - 1 ? TAU : 0);
    const gap = b - a;
    if (gap > biggestGap) {
      biggestGap = gap;
      cut = (i + 1) % n;
    }
  }
  // Unroll into a monotone sequence starting at the cut.
  const idx: number[] = [];
  for (let i = 0; i < n; i++) idx.push((cut + i) % n);
  // Unwrap into an ascending sequence: the input is sorted by angle, so in
  // cut order values ascend and drop by 2π exactly once, at the wrap.
  const target: number[] = [];
  for (let i = 0; i < n; i++) {
    let a = desired[idx[i]];
    while (target.length > 0 && a < target[target.length - 1] - 1e-9) a += TAU;
    target.push(a);
  }
  const sepSeq: number[] = [];
  for (let i = 0; i < n - 1; i++) sepSeq.push(sep2(idx[i], idx[i + 1], sep));
  // Substitute q_i = p_i - prefix_i → isotonic regression onto q_{i+1} >= q_i.
  const prefix: number[] = [0];
  for (let i = 0; i < n - 1; i++) prefix.push(prefix[i] + sepSeq[i]);
  const a = target.map((t, i) => t - prefix[i]);
  const blocks: {sum: number; count: number}[] = [];
  for (const v of a) {
    let cur = {sum: v, count: 1};
    while (blocks.length > 0) {
      const prev = blocks[blocks.length - 1];
      if (prev.sum / prev.count >= cur.sum / cur.count) {
        blocks.pop();
        cur = {sum: prev.sum + cur.sum, count: prev.count + cur.count};
      } else break;
    }
    blocks.push(cur);
  }
  const q: number[] = [];
  for (const b of blocks) {
    const mean = b.sum / b.count;
    for (let i = 0; i < b.count; i++) q.push(mean);
  }
  const packed = q.map((v, i) => v + prefix[i]);
  // Wrap guard: total span may exceed the circle minus the wrap separation;
  // compress uniformly around the mean when it does.
  const wrapSep = sep2(idx[n - 1], idx[0], sep);
  const span = packed[n - 1] - packed[0];
  const maxSpan = TAU - wrapSep;
  if (span > maxSpan && span > 1e-9) {
    const mid = (packed[n - 1] + packed[0]) / 2;
    const f = maxSpan / span;
    for (let i = 0; i < n; i++) packed[i] = mid + (packed[i] - mid) * f;
  }
  const result = new Array<number>(n);
  for (let i = 0; i < n; i++) result[idx[i]] = packed[i];
  return result;

  function sep2(i: number, j: number, minSep: number[]): number {
    return (minSep[i] + minSep[j]) / 2;
  }
}

interface RingItem {
  /** Individual neighbor or stack of them; members[0] is the stack top. */
  members: GatherNeighbor[];
  stackKey: string | null;
  desiredAngle: number;
  /** Full angular footprint at radius r is footprint / r. */
  footprint: number;
}

/** Plan the gathered view. Neighbors keep their bearings; stacking kicks in
 *  only when the (moderately widened) ring cannot hold everyone. */
export function planGather(
  anchor: GatherBox,
  neighbors: GatherNeighbor[],
  options?: Partial<GatherOptions>,
): GatherPlan {
  const opt = {...DEFAULT_GATHER_OPTIONS, ...options};
  if (neighbors.length === 0) {
    return {placed: [], ringRadius: 0, clearRadius: 0};
  }

  const maxNeighborDiag = Math.max(...neighbors.map(halfDiag));
  const baseRadius = halfDiag(anchor) + maxNeighborDiag + opt.labelBand;
  const arcBudget = TAU * opt.ringFill;

  const individualFootprint = (n: GatherNeighbor) => 2 * halfDiag(n) + opt.perimeterGap;

  // First choice: everyone individual, ring widened at most maxWiden.
  const totalArc = neighbors.reduce((s, n) => s + individualFootprint(n), 0);
  const fitRadius = totalArc / arcBudget;

  let items: RingItem[];
  if (fitRadius <= baseRadius * opt.maxWiden) {
    items = neighbors.map(n => ({
      members: [n],
      stackKey: null,
      desiredAngle: bearing(anchor, n),
      footprint: individualFootprint(n),
    }));
  } else {
    // Stacking mode: protected neighbors stay individual; the rest pile up
    // by direction + kind. Never mix in with out.
    const groups = new Map<string, GatherNeighbor[]>();
    const singles: GatherNeighbor[] = [];
    for (const n of neighbors) {
      if (n.protected) {
        singles.push(n);
        continue;
      }
      const key = `${n.direction}:${n.kind}`;
      const g = groups.get(key);
      if (g) g.push(n);
      else groups.set(key, [n]);
    }
    items = singles.map(n => ({
      members: [n],
      stackKey: null,
      desiredAngle: bearing(anchor, n),
      footprint: individualFootprint(n),
    }));
    for (const [key, members] of groups) {
      if (members.length === 1) {
        items.push({
          members,
          stackKey: null,
          desiredAngle: bearing(anchor, members[0]),
          footprint: individualFootprint(members[0]),
        });
        continue;
      }
      const mean = circularMean(members.map(m => bearing(anchor, m)));
      // Stack top: the member whose bearing is closest to the pile's mean
      // (most representative); deeper members are angularly farther.
      const sorted = [...members].sort((a, b) =>
        Math.abs(angleDiff(bearing(anchor, a), mean)) - Math.abs(angleDiff(bearing(anchor, b), mean)));
      const cascade = opt.stackOffset * Math.min(sorted.length - 1, opt.stackMaxVisible);
      items.push({
        members: sorted,
        stackKey: key,
        desiredAngle: mean,
        footprint: 2 * halfDiag(sorted[0]) + cascade + opt.perimeterGap,
      });
    }
  }

  // Ring radius: base, widened until the item footprints fit the budget.
  const itemArc = items.reduce((s, it) => s + it.footprint, 0);
  const ringRadius = Math.max(baseRadius, itemArc / arcBudget);

  // Angular packing: preserve bearings, resolve overlaps minimally.
  items.sort((a, b) => a.desiredAngle - b.desiredAngle);
  const desired = items.map(it => it.desiredAngle);
  const halfSep = items.map(it => it.footprint / ringRadius);
  const angles = packAngles(desired, halfSep);

  const placed: GatherPlacement[] = [];
  let maxItemExtent = 0;
  items.forEach((item, i) => {
    const angle = angles[i];
    const ux = Math.cos(angle);
    const uy = Math.sin(angle);
    const baseX = anchor.cx + ux * ringRadius;
    const baseY = anchor.cy + uy * ringRadius;
    item.members.forEach((m, j) => {
      const level = Math.min(j, opt.stackMaxVisible);
      const off = item.members.length > 1 ? opt.stackOffset * level : 0;
      placed.push({
        id: m.id,
        x: baseX + ux * off,
        y: baseY + uy * off,
        stack: item.stackKey === null
          ? null
          : {key: item.stackKey, index: j, size: item.members.length},
      });
      maxItemExtent = Math.max(maxItemExtent, halfDiag(m) + off);
    });
  });

  return {
    placed,
    ringRadius,
    clearRadius: ringRadius + maxItemExtent + opt.clearMargin,
  };
}

/** Signed smallest difference a−b, in (−π, π]. */
export function angleDiff(a: number, b: number): number {
  let d = (a - b) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d <= -Math.PI) d += TAU;
  return d;
}
