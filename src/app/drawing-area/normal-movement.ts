export type NormalMovementAxis = 'x' | 'y';

export interface NormalMovementPoint {
  x: number;
  y: number;
}

/** A run of ordinary movement along one horizontal or vertical goal line. */
export interface NormalMovementGoal {
  axis: NormalMovementAxis;
  /** Fixed coordinate perpendicular to the movement axis. */
  line: number;
  /** Last point reached on the goal line. */
  primary: number;
}

export interface NormalMovementStep {
  state: NormalMovementGoal;
  target: NormalMovementPoint;
}

export function startNormalMovementGoal(
  axis: NormalMovementAxis,
  point: NormalMovementPoint,
): NormalMovementGoal {
  return {
    axis,
    line: axis === 'x' ? point.y : point.x,
    primary: axis === 'x' ? point.x : point.y,
  };
}

/**
 * Advance one ordinary movement gesture by its configured distance. Graph
 * items do not affect the target; item-aware travel belongs to Move by Node
 * and Move by Link.
 */
export function nextNormalMovementStep(
  state: NormalMovementGoal,
  sign: -1 | 1,
  distance: number,
): NormalMovementStep {
  const primary = state.primary + sign * distance;
  const target = pointOnLine(state.axis, primary, state.line);
  return {
    state: {
      ...state,
      primary,
    },
    target,
  };
}

function pointOnLine(
  axis: NormalMovementAxis,
  primary: number,
  line: number,
): NormalMovementPoint {
  return axis === 'x' ? {x: primary, y: line} : {x: line, y: primary};
}
