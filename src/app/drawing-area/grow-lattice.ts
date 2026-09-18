/**
 * Walking the placement lattice that `grow-ghost-targets.ts` builds.
 *
 * That module decides which spots around the anchor are on offer; this one
 * decides where a direction press goes from wherever the aim is now. The two
 * halves have to agree about the lattice — same anchor, same step, same cell
 * ids — so they read best side by side.
 *
 * Konva-free and stateless, like its sibling: nodes come in as plain boxes.
 */
import type {GrowGhostNodeCenter, GrowGhostTarget} from './grow-ghost-targets';

export interface Point {
  x: number;
  y: number;
}

/** Integer offsets from the anchor's cell, which is {ix: 0, iy: 0}. */
export interface LatticeCell {
  ix: number;
  iy: number;
}

export type HopDirection = 'left' | 'right' | 'up' | 'down';

/** Where a press landed: an offered spot, or a node that was in the way. */
export type GrowHop =
  | {kind: 'cell'; target: GrowGhostTarget}
  | {kind: 'node'; id: string};

export interface GrowHopRequest {
  direction: HopDirection;
  /** The lattice target the aim is on, if it is on one. */
  fromTargetId: string | null;
  /** The centre of the node the aim is on, if it is on one. Neither set means
   *  the aim is still on the anchor itself. */
  fromNodeCentre: Point | null;
  anchorCentre: Point;
  /** Centre-to-centre distance of one cell, per axis. */
  step: Point;
  targets: readonly GrowGhostTarget[];
  /** Every node except the anchor. */
  nodes: readonly GrowGhostNodeCenter[];
  /** Half-extents of the node a spot would create. */
  newNodeHalf: {w: number; h: number};
  clearance?: number;
}

const UNIT: Record<HopDirection, Point> = {
  left: {x: -1, y: 0},
  right: {x: 1, y: 0},
  up: {x: 0, y: -1},
  down: {x: 0, y: 1},
};

/**
 * A node this far off a cell, as a fraction of the step, is still standing on
 * it for the purpose of carrying on the walk.
 *
 * As written the guard cannot fire: `Math.round` already bounds each axis's
 * residual at half a step, so `off` is at most 0.5 and never exceeds 0.6. A
 * node is therefore assigned its nearest cell however far off the lattice it
 * actually is. Carried over unchanged from the component rather than tightened,
 * because what the cut-off should be — if there should be one — is a design
 * question, not a transcription one (inferred, 2026-09-18 — from the
 * arithmetic, not from a decision about what was wanted).
 */
const ON_CELL_TOLERANCE = 0.6;

/** The cell a lattice target's id encodes, or null if it is not one. */
export function latticeCellOfId(id: string | null | undefined): LatticeCell | null {
  const match = /^grow-ghost:grid:(-?\d+):(-?\d+)$/.exec(id ?? '');
  return match ? {ix: Number(match[1]), iy: Number(match[2])} : null;
}

/** The cell a node is standing on, if it is near enough to one to carry on
 *  walking from. The anchor's own cell does not count: it is where the walk
 *  started, not a spot it can step off again. */
export function latticeCellOfNode(
  centre: Point,
  anchorCentre: Point,
  step: Point,
): LatticeCell | null {
  const ix = Math.round((centre.x - anchorCentre.x) / step.x);
  const iy = Math.round((centre.y - anchorCentre.y) / step.y);
  if (!ix && !iy) return null;
  const off = Math.max(
    Math.abs(centre.x - anchorCentre.x - ix * step.x) / step.x,
    Math.abs(centre.y - anchorCentre.y - iy * step.y) / step.y,
  );
  return off <= ON_CELL_TOLERANCE ? {ix, iy} : null;
}

/** Where a cell sits, whether or not the lattice offered it. */
export function cellCentre(anchorCentre: Point, cell: LatticeCell, step: Point): Point {
  return {
    x: anchorCentre.x + cell.ix * step.x,
    y: anchorCentre.y + cell.iy * step.y,
  };
}

/**
 * Where a direction press goes, or null when it walks off the end of the
 * lattice and the caller should fall through to Move by Node.
 *
 * Move by Node reads a field of stops as bands and rings, which is right for
 * the scattered real nodes it was built for and wrong for a regular grid: with
 * every intersection filled, a repeated right press wanders up and down the
 * first column instead of walking out along the row. So a hop steps by index —
 * one cell in the direction pressed — and only the fall-through reaches the
 * engine, which is how the real nodes beyond the lattice stay reachable.
 *
 * Aiming at a node is not the end of the walk: the node stands on (or near) a
 * cell of the same lattice, so pressing on from it carries on across the grid.
 * Otherwise a spot behind a neighbour could not be reached at all, and a
 * diagonal one only ever through its orthogonal neighbours.
 */
export function planGrowHop(request: GrowHopRequest): GrowHop | null {
  const {direction, anchorCentre, step, targets, nodes, newNodeHalf} = request;
  const from = currentCell(request);
  if (!from) return null;

  const unit = UNIT[direction];
  const to = {ix: from.ix + unit.x, iy: from.iy + unit.y};
  const at = cellCentre(anchorCentre, to, step);
  const here = aimCentre(request);

  // A node between here and there wins: connecting two nodes must not mean
  // walking past one of them because a placement spot lay beyond it.
  const between = nodeInTheWay(nodes, here, unit, at, step);
  if (between) return {kind: 'node', id: between.id};

  const cell = targets.find(target => {
    const found = latticeCellOfId(target.id);
    return !!found && found.ix === to.ix && found.iy === to.iy;
  });
  if (cell) return {kind: 'cell', target: cell};

  const occupier = nodeStandingOn(nodes, at, newNodeHalf, request.clearance);
  return occupier ? {kind: 'node', id: occupier.id} : null;
}

/** The cell the aim is on now — the anchor's own when it is on neither a
 *  lattice spot nor a node. */
function currentCell(request: GrowHopRequest): LatticeCell | null {
  if (request.fromTargetId) return latticeCellOfId(request.fromTargetId);
  if (request.fromNodeCentre) {
    return latticeCellOfNode(request.fromNodeCentre, request.anchorCentre, request.step);
  }
  return {ix: 0, iy: 0};
}

/** Where the aim is, in layer coordinates. */
function aimCentre(request: GrowHopRequest): Point {
  if (request.fromTargetId) {
    const target = request.targets.find(t => t.id === request.fromTargetId);
    if (target) return {x: target.x, y: target.y};
  }
  return request.fromNodeCentre ?? request.anchorCentre;
}

/**
 * The node a hop would pass through on its way to the next cell.
 *
 * Cells the lattice offers are, by construction, clear of node boxes — so a
 * step that stays on the lattice can walk straight past a node standing off
 * the grid, which is what broke connecting two existing nodes. Anything whose
 * box reaches into the corridor of the step, and which is nearer than the
 * cell, is taken first; a node further out is simply reached a press later.
 */
export function nodeInTheWay(
  nodes: readonly GrowGhostNodeCenter[],
  from: Point,
  unit: Point,
  cell: Point,
  step: Point,
): GrowGhostNodeCenter | null {
  const reach = Math.abs(unit.x * (cell.x - from.x) + unit.y * (cell.y - from.y));
  if (reach <= 0) return null;
  const corridor = (unit.x !== 0 ? step.y : step.x) / 2;
  let best: {node: GrowGhostNodeCenter; along: number} | null = null;
  for (const node of nodes) {
    const dx = node.x - from.x;
    const dy = node.y - from.y;
    const along = unit.x * dx + unit.y * dy;
    const across = Math.abs(unit.x !== 0 ? dy : dx);
    const half = (unit.x !== 0 ? node.halfH ?? 0 : node.halfW ?? 0);
    if (along <= 1 || along >= reach) continue;
    if (across - half > corridor) continue;
    if (!best || along < best.along) best = {node, along};
  }
  return best?.node ?? null;
}

/** The node standing on a cell — which is why the cell was not offered — by
 *  the same geometry the builder refuses it with (da-510). */
export function nodeStandingOn(
  nodes: readonly GrowGhostNodeCenter[],
  at: Point,
  newNodeHalf: {w: number; h: number},
  clearance = 12,
): GrowGhostNodeCenter | null {
  let best: {node: GrowGhostNodeCenter; distance: number} | null = null;
  for (const node of nodes) {
    const halfW = (node.halfW ?? 0) + newNodeHalf.w + clearance;
    const halfH = (node.halfH ?? 0) + newNodeHalf.h + clearance;
    if (Math.abs(node.x - at.x) >= halfW || Math.abs(node.y - at.y) >= halfH) continue;
    const distance = Math.hypot(node.x - at.x, node.y - at.y);
    if (!best || distance < best.distance) best = {node, distance};
  }
  return best?.node ?? null;
}
