import {NavigationGridStop} from './navigation-grid';

export const FULL_TURN = Math.PI * 2;

export type CardinalDirection = 'left' | 'right' | 'up' | 'down';
export type NavigationQuadrant = 'north' | 'south' | 'east' | 'west';
export type GoalVerticalDirection = 'north' | 'south';

export function normalizeAngle(angle: number): number {
  const normalized = angle % FULL_TURN;
  return normalized < 0 ? normalized + FULL_TURN : normalized;
}

export function cardinalAngle(direction: CardinalDirection): number {
  return ({right: 0, down: Math.PI / 2, left: Math.PI, up: Math.PI * 1.5})[direction];
}

/** Classify a point using the two 45-degree diagonals through the origin. */
export function navigationQuadrant(dx: number, dy: number): NavigationQuadrant | null {
  if (Math.max(Math.abs(dx), Math.abs(dy)) < 4) return null;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? 'east' : 'west';
  return dy >= 0 ? 'south' : 'north';
}

export function quadrantForDirection(direction: CardinalDirection): NavigationQuadrant {
  return ({right: 'east', down: 'south', left: 'west', up: 'north'} as const)[direction];
}

/**
 * A quadrant constrains travel parallel to its main axis. This keeps h/l
 * inside E/W and j/k inside N/S, while perpendicular movement can cross a
 * diagonal into a neighboring quadrant.
 */
export function moveUsesQuadrantConstraint(
  quadrant: NavigationQuadrant,
  direction: CardinalDirection,
): boolean {
  const horizontal = direction === 'left' || direction === 'right';
  return horizontal === (quadrant === 'east' || quadrant === 'west');
}

/** Distance to the forward half of a goal ray. Behind-origin points receive
 * a large penalty but remain a sparse-grid fallback. */
export function distanceToGoalRay(
  origin: {x: number; y: number},
  angle: number,
  stop: Pick<NavigationGridStop, 'cx'|'cy'>,
): number {
  const dx = stop.cx - origin.x;
  const dy = stop.cy - origin.y;
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const projection = dx * ux + dy * uy;
  const perpendicular = Math.abs(dx * uy - dy * ux);
  return perpendicular + (projection < 0 ? 1_000_000 + Math.abs(projection) : 0);
}

/** Dense views get finer goal-line steering, but every press remains visible. */
export function adaptiveGoalAngleStep(stopCount: number): number {
  const degrees = Math.max(5, Math.min(15, 90 / Math.sqrt(Math.max(1, stopCount))));
  return degrees * Math.PI / 180;
}

/**
 * Tilt the ray in the direction that moves its unit endpoint north/south on
 * screen. This is intentionally not clockwise/counterclockwise: at west,
 * south requires decreasing the angle while north requires increasing it.
 * At the vertical extreme, the requested farther movement is a no-op.
 */
export function adjustAngleTowardScreenVertical(
  angle: number,
  direction: GoalVerticalDirection,
  step: number,
): number {
  const current = normalizeAngle(angle);
  const candidates = [
    normalizeAngle(current - step),
    normalizeAngle(current + step),
  ];
  const desired = direction === 'south' ? Math.max : Math.min;
  const desiredY = desired(...candidates.map(candidate => Math.sin(candidate)));
  const currentY = Math.sin(current);
  const improves = direction === 'south'
    ? desiredY > currentY + 1e-9
    : desiredY < currentY - 1e-9;
  if (!improves) return current;

  const best = candidates.filter(candidate =>
    Math.abs(Math.sin(candidate) - desiredY) < 1e-9);
  // At due north/south both rotations improve equally; initially bend toward
  // screen-east so repeated n/p behavior is deterministic.
  return best.reduce((a, b) => Math.cos(a) >= Math.cos(b) ? a : b);
}
