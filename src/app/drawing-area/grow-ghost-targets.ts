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

function positionKey(point: {x: number; y: number}): string {
  return `${Math.round(point.x * POSITION_PRECISION)}:${Math.round(point.y * POSITION_PRECISION)}`;
}

/**
 * Use the current major drawing grid without allowing add targets to become
 * denser than the established node-placement slot. The result is an integer
 * number of major cells, so zoom-level grid changes cannot introduce a
 * nearly-aligned second lattice.
 *
 * Except when the grid is coarser than the slot. The major grid is a power of
 * ten chosen to keep ~15 squares across the viewport, so it climbs a decade
 * every time you zoom out — and snapping up to it made a quick-add land a
 * whole 1000-unit cell away just because the view was wide. How far a new
 * node lands from its anchor is a property of the graph, not of how you
 * happen to be looking at it, so the slot wins there and the targets simply
 * are not grid-aligned (2026-08-29).
 */
export function growGhostGridStep(majorGridSpacing: number, minimumSpacing = 300): number {
  const major = Number.isFinite(majorGridSpacing) && majorGridSpacing > 0
    ? majorGridSpacing
    : minimumSpacing;
  if (major > minimumSpacing) return minimumSpacing;
  return Math.max(major, Math.ceil(minimumSpacing / major) * major);
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
  majorGridSpacing: number,
  bounds: GrowGhostBounds,
  minimumGridSpacing = 300,
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

  const step = growGhostGridStep(majorGridSpacing, minimumGridSpacing);
  // One off-screen step lets the ordinary Move-by-Node edge-pan behavior
  // reveal a new insertion target instead of stopping at the viewport edge.
  const minIx = Math.floor((bounds.minX - anchor.x) / step) - 1;
  const maxIx = Math.ceil((bounds.maxX - anchor.x) / step) + 1;
  const minIy = Math.floor((bounds.minY - anchor.y) / step) - 1;
  const maxIy = Math.ceil((bounds.maxY - anchor.y) / step) + 1;
  // Add's directional navigation needs open cardinal lanes. Filling every
  // 2-D intersection makes a repeated right press spiral through diagonal
  // rings and can pan away before reaching a real node. The source's row and
  // column are the useful source-determined portion of the larger grid.
  for (let ix = minIx; ix <= maxIx; ix++) {
    if (ix === 0) continue;
    add({
      id: `grow-ghost:grid:${ix}:0`,
      x: anchor.x + ix * step,
      y: anchor.y,
      source: 'grid',
    });
  }
  for (let iy = minIy; iy <= maxIy; iy++) {
    if (iy === 0) continue;
    add({
      id: `grow-ghost:grid:0:${iy}`,
      x: anchor.x,
      y: anchor.y + iy * step,
      source: 'grid',
    });
  }

  return targets;
}
