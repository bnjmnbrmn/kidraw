export type NormalMovementAxis = 'x' | 'y';

export interface NormalMovementPoint {
  x: number;
  y: number;
}

/** One graph feature close enough to a normal-movement goal line to visit. */
export interface NormalMovementSnapCandidate {
  id: string;
  point: NormalMovementPoint;
  /** Lower values win when features share the same progress coordinate. */
  priority: number;
  /** Perpendicular distance from the feature to the goal line. */
  distance: number;
}

/** A run of ordinary movement along one horizontal or vertical goal line. */
export interface NormalMovementGoal {
  axis: NormalMovementAxis;
  /** Fixed coordinate perpendicular to the movement axis. */
  line: number;
  /** Last point deliberately visited on the goal line. */
  primary: number;
  /** After an off-line snap, visit its projection before advancing again. */
  pendingReturn?: NormalMovementPoint;
  /** Do not repeatedly snap to a long edge or wide node during one pass. */
  visited: ReadonlySet<string>;
  lastSign: -1 | 1 | null;
}

export interface NormalMovementStep {
  state: NormalMovementGoal;
  target: NormalMovementPoint;
  kind: 'line' | 'snap' | 'return';
  snappedId?: string;
}

const EPS = 1e-6;

export function startNormalMovementGoal(
  axis: NormalMovementAxis,
  point: NormalMovementPoint,
): NormalMovementGoal {
  return {
    axis,
    line: axis === 'x' ? point.y : point.x,
    primary: axis === 'x' ? point.x : point.y,
    visited: new Set<string>(),
    lastSign: null,
  };
}

/**
 * Advance one ordinary movement gesture.
 *
 * Nearby graph features are inserted into the sequence ahead of the regular
 * grid point. An off-line feature is followed by its perpendicular projection
 * onto the goal line, so the line itself remains a complete, traversable
 * backbone. That return step is intentionally allowed to move perpendicular
 * to the requested direction.
 */
export function nextNormalMovementStep(
  state: NormalMovementGoal,
  sign: -1 | 1,
  distance: number,
  candidates: readonly NormalMovementSnapCandidate[],
): NormalMovementStep {
  let visited = state.visited;
  if (state.lastSign !== null && state.lastSign !== sign) {
    // Reversing direction is a fresh pass: features should be visitable on
    // the way back too.
    visited = new Set<string>();
  }

  if (state.pendingReturn) {
    const target = state.pendingReturn;
    return {
      state: {
        ...state,
        primary: primaryOf(state.axis, target),
        pendingReturn: undefined,
        visited,
        lastSign: sign,
      },
      target,
      kind: 'return',
    };
  }

  const eligible = candidates
    .filter(candidate => !visited.has(candidate.id))
    .map(candidate => ({
      candidate,
      progress: sign * (primaryOf(state.axis, candidate.point) - state.primary),
    }))
    .filter(({progress}) => progress > EPS && progress <= distance + EPS)
    .sort((a, b) => a.progress - b.progress ||
      a.candidate.priority - b.candidate.priority ||
      a.candidate.distance - b.candidate.distance);

  const next = eligible[0]?.candidate;
  if (next) {
    const nextVisited = new Set(visited);
    nextVisited.add(next.id);
    const primary = primaryOf(state.axis, next.point);
    const projection = pointOnLine(state.axis, primary, state.line);
    const offLine = Math.abs(perpendicularOf(state.axis, next.point) - state.line) > EPS;
    return {
      state: {
        ...state,
        primary,
        pendingReturn: offLine ? projection : undefined,
        visited: nextVisited,
        lastSign: sign,
      },
      target: next.point,
      kind: 'snap',
      snappedId: next.id,
    };
  }

  const primary = state.primary + sign * distance;
  const target = pointOnLine(state.axis, primary, state.line);
  return {
    state: {
      ...state,
      primary,
      pendingReturn: undefined,
      visited,
      lastSign: sign,
    },
    target,
    kind: 'line',
  };
}

function primaryOf(axis: NormalMovementAxis, point: NormalMovementPoint): number {
  return axis === 'x' ? point.x : point.y;
}

function perpendicularOf(axis: NormalMovementAxis, point: NormalMovementPoint): number {
  return axis === 'x' ? point.y : point.x;
}

function pointOnLine(
  axis: NormalMovementAxis,
  primary: number,
  line: number,
): NormalMovementPoint {
  return axis === 'x' ? {x: primary, y: line} : {x: line, y: primary};
}
