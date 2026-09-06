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
  source: 'grid';
}

const POSITION_PRECISION = 100;

/** How many cells out the lattice runs from the anchor, each way. */
const GRID_REACH = 3;

function positionKey(point: {x: number; y: number}): string {
  return `${Math.round(point.x * POSITION_PRECISION)}:${Math.round(point.y * POSITION_PRECISION)}`;
}

/**
 * Candidate positions for held-Add navigation: a lattice around the anchor.
 *
 * Every cell of the lattice is offered, not just the anchor's own row and
 * column, so a node can be placed north-east of its parent and not only
 * north or east of it. The lattice hangs off the anchor rather than off the
 * background grid's origin, which is what keeps "one slot up" the same
 * distance whichever node you grew from; the caller sizes its cell (see
 * `minimumGridSpacing`), and gives the row and the column their own step so a
 * node placed above can sit closer than one placed beside (da-559).
 *
 * Exact existing-node centers are omitted: Move by Node must keep the real
 * node as the unambiguous target.
 */
export function buildGrowGhostTargets(
  nodes: readonly GrowGhostNodeCenter[],
  anchor: GrowGhostNodeCenter,
  bounds: GrowGhostBounds,
  // One number keeps the lattice square; a pair gives the row and the column
  // their own step.
  minimumGridSpacing: number | {x: number; y: number} = 300,
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
  // bounded by GRID_REACH, because every cell is also drawn as a marker and a
  // lattice that runs to the edge of the viewport draws a great many of them
  // around the node you are trying to look at (da-499).
  const minIx = Math.max(-GRID_REACH, Math.floor((bounds.minX - anchor.x) / stepX) - 1);
  const maxIx = Math.min(GRID_REACH, Math.ceil((bounds.maxX - anchor.x) / stepX) + 1);
  const minIy = Math.max(-GRID_REACH, Math.floor((bounds.minY - anchor.y) / stepY) - 1);
  const maxIy = Math.min(GRID_REACH, Math.ceil((bounds.maxY - anchor.y) / stepY) + 1);
  // Row and column first, then the diagonals ring by ring: the order is what
  // decides which of two coincident cells survives dedupe, and the cardinal
  // ones are the ones a reader of the overlay expects to be there.
  const cells: Array<[number, number]> = [];
  for (let ix = minIx; ix <= maxIx; ix++) if (ix !== 0) cells.push([ix, 0]);
  for (let iy = minIy; iy <= maxIy; iy++) if (iy !== 0) cells.push([0, iy]);
  for (let ring = 1; ring <= GRID_REACH; ring++) {
    for (let ix = minIx; ix <= maxIx; ix++) {
      for (let iy = minIy; iy <= maxIy; iy++) {
        if (ix === 0 || iy === 0) continue;
        if (Math.max(Math.abs(ix), Math.abs(iy)) !== ring) continue;
        cells.push([ix, iy]);
      }
    }
  }
  for (const [ix, iy] of cells) {
    add({
      id: `grow-ghost:grid:${ix}:${iy}`,
      x: anchor.x + ix * stepX,
      y: anchor.y + iy * stepY,
      source: 'grid',
    });
  }

  return targets;
}
