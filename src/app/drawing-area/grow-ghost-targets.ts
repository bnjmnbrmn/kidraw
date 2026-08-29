export interface GrowGhostNodeCenter {
  id: string;
  x: number;
  y: number;
  /** Box half-extents. Optional for callers that only care about centres;
   *  without them a node can only block a target it sits exactly on. */
  halfW?: number;
  halfH?: number;
}

export interface GrowGhostBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface GrowGhostTarget {
  id: string;
  x: number;
  y: number;
  source: 'midpoint' | 'grid';
}

const POSITION_PRECISION = 100;

/** How many slots out the source-anchored lanes run, each way. */
const GRID_REACH = 3;

function positionKey(point: {x: number; y: number}): string {
  return `${Math.round(point.x * POSITION_PRECISION)}:${Math.round(point.y * POSITION_PRECISION)}`;
}

/**
 * Candidate positions for held-Add navigation.
 *
 * Anchor-to-visible-node midpoints come first and therefore win when a
 * source-anchored grid intersection lands at the same position. Exact
 * existing-node centers are omitted: Move by Node must keep the real node as
 * the unambiguous target.
 */
export function buildGrowGhostTargets(
  nodes: readonly GrowGhostNodeCenter[],
  anchor: GrowGhostNodeCenter,
  bounds: GrowGhostBounds,
  // One number keeps the lattice square; a pair gives the row and the column
  // their own step, which is what lets a node placed *above* sit closer than
  // one placed beside — the vertical slot is smaller (da-559).
  minimumGridSpacing: number | {x: number; y: number} = 300,
  // The caller may limit midpoint generation to visible nodes while still
  // passing every node above so offscreen centers remain occupied.
  midpointNodes: readonly GrowGhostNodeCenter[] = nodes,
  // Half-extents of the node a target would create, and the clear space to
  // keep around it. A target whose box would land on an existing node is not
  // offered: releasing there would drop a node on top of another (da-510).
  newNodeHalf?: {w: number; h: number},
  clearance = 12,
): GrowGhostTarget[] {
  const occupied = new Set(nodes.map(positionKey));
  const used = new Set<string>();
  const targets: GrowGhostTarget[] = [];
  const lands = newNodeHalf
    ? (x: number, y: number) => nodes.some(n => {
        if (n.id === anchor.id) return false;
        const hw = (n.halfW ?? 0) + newNodeHalf.w + clearance;
        const hh = (n.halfH ?? 0) + newNodeHalf.h + clearance;
        return Math.abs(n.x - x) < hw && Math.abs(n.y - y) < hh;
      })
    : () => false;
  const add = (target: GrowGhostTarget) => {
    const key = positionKey(target);
    if (occupied.has(key) || used.has(key)) return;
    if (lands(target.x, target.y)) return;
    used.add(key);
    targets.push(target);
  };

  for (const node of midpointNodes) {
    if (node.id === anchor.id) continue;
    const ids = [anchor.id, node.id].sort();
    add({
      id: `grow-ghost:midpoint:${ids[0]}:${ids[1]}`,
      x: (anchor.x + node.x) / 2,
      y: (anchor.y + node.y) / 2,
      source: 'midpoint',
    });
  }

  // The step is the placement slot itself. It used to be rounded up to a
  // whole cell of the major drawing grid, which never aligned anything — the
  // lanes hang off the anchor, not off the grid's origin — while inflating
  // every distance by up to a full cell (da-559).
  const minSpacing = typeof minimumGridSpacing === 'number'
    ? {x: minimumGridSpacing, y: minimumGridSpacing}
    : minimumGridSpacing;
  const stepX = Math.max(1, minSpacing.x);
  const stepY = Math.max(1, minSpacing.y);
  // One off-screen step lets the ordinary Move-by-Node edge-pan behavior
  // reveal a new insertion target instead of stopping at the viewport edge —
  // bounded by GRID_REACH, because every stop is also a ring in the
  // quadrant overlay, and a lane that runs to the edge of the viewport draws
  // a dozen of them around the node you are trying to look at (da-499).
  // Somewhere further out is still reachable: place, then move.
  const minIx = Math.max(-GRID_REACH, Math.floor((bounds.minX - anchor.x) / stepX) - 1);
  const maxIx = Math.min(GRID_REACH, Math.ceil((bounds.maxX - anchor.x) / stepX) + 1);
  const minIy = Math.max(-GRID_REACH, Math.floor((bounds.minY - anchor.y) / stepY) - 1);
  const maxIy = Math.min(GRID_REACH, Math.ceil((bounds.maxY - anchor.y) / stepY) + 1);
  // Add's directional navigation needs open cardinal lanes. Filling every
  // 2-D intersection makes a repeated right press spiral through diagonal
  // rings and can pan away before reaching a real node. The source's row and
  // column are the useful source-determined portion of the larger grid.
  for (let ix = minIx; ix <= maxIx; ix++) {
    if (ix === 0) continue;
    add({
      id: `grow-ghost:grid:${ix}:0`,
      x: anchor.x + ix * stepX,
      y: anchor.y,
      source: 'grid',
    });
  }
  for (let iy = minIy; iy <= maxIy; iy++) {
    if (iy === 0) continue;
    add({
      id: `grow-ghost:grid:0:${iy}`,
      x: anchor.x,
      y: anchor.y + iy * stepY,
      source: 'grid',
    });
  }

  return targets;
}
