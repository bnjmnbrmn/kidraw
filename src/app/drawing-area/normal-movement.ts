export type NormalMovementAxis = 'x' | 'y';

export interface NormalMovementPoint {
  x: number;
  y: number;
}

/** One graph feature close enough to a normal-movement goal line to visit. */
export interface NormalMovementSnapCandidate {
  id: string;
  /** Canvas item represented by this stop, used to preserve hover feedback
   *  when overlapping nodes would otherwise win geometric hit priority. */
  targetKind?: 'node' | 'waypoint' | 'label' | 'edge';
  targetId?: string;
  point: NormalMovementPoint;
  /**
   * Primary-axis interval where the goal line actually crosses this item.
   * Movement stops at the boundary it encounters instead of pulling to the
   * item's center. This keeps pass-throughs on the goal line.
   */
  crossingSpan?: {min: number; max: number};
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
  /** Direction-qualified visits. A feature can be crossed once each way,
   *  but alternating at one boundary must not rediscover it indefinitely. */
  visited: ReadonlySet<string>;
  lastSign: -1 | 1 | null;
}

export interface NormalMovementStep {
  state: NormalMovementGoal;
  target: NormalMovementPoint;
  kind: 'line' | 'snap' | 'return';
  snappedId?: string;
  snappedCandidate?: NormalMovementSnapCandidate;
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
  const visited = state.visited;

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
    .filter(candidate => !visited.has(visitKey(sign, candidate.id)))
    .map(candidate => {
      const point = candidateTarget(state, sign, candidate);
      return {
        candidate,
        point,
        progress: sign * (primaryOf(state.axis, point) - state.primary),
      };
    })
    .filter(({progress}) => progress > EPS && progress <= distance + EPS)
    .sort((a, b) => a.progress - b.progress ||
      a.candidate.priority - b.candidate.priority ||
      a.candidate.distance - b.candidate.distance);

  const eligibleNext = eligible[0];
  if (eligibleNext) {
    const next = eligibleNext.candidate;
    const target = eligibleNext.point;
    const nextVisited = new Set(visited);
    nextVisited.add(visitKey(sign, next.id));
    const primary = primaryOf(state.axis, target);
    const projection = pointOnLine(state.axis, primary, state.line);
    const offLine = Math.abs(perpendicularOf(state.axis, target) - state.line) > EPS;
    return {
      state: {
        ...state,
        primary,
        pendingReturn: offLine ? projection : undefined,
        visited: nextVisited,
        lastSign: sign,
      },
      target,
      kind: 'snap',
      snappedId: next.id,
      snappedCandidate: next,
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

function visitKey(sign: -1 | 1, id: string): string {
  return `${sign}:${id}`;
}

/**
 * Resolve the point encountered in this direction. When already inside a
 * crossing span, the exit boundary is the next meaningful point.
 */
function candidateTarget(
  state: NormalMovementGoal,
  sign: -1 | 1,
  candidate: NormalMovementSnapCandidate,
): NormalMovementPoint {
  const span = candidate.crossingSpan;
  if (!span) return candidate.point;

  let primary: number;
  if (sign > 0) {
    primary = state.primary < span.min - EPS ? span.min : span.max;
  } else {
    primary = state.primary > span.max + EPS ? span.max : span.min;
  }
  return pointOnLine(state.axis, primary, state.line);
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
