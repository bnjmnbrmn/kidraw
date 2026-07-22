import {
  buildNavigationGrid,
  NavigationAxisBand,
  NavigationGridStop,
} from './navigation-grid';

export const FULL_TURN = Math.PI * 2;
const ORIGIN_EPSILON = 4;

export type CardinalDirection = 'left' | 'right' | 'up' | 'down';
export type PolarLogicalDirection = 'outward' | 'inward' | 'clockwise' | 'counterclockwise';

/** A graph-item stop represented in both stage and fixed-origin polar space. */
export interface PolarNavigationStop<T extends NavigationGridStop = NavigationGridStop>
  extends NavigationGridStop {
  source: T;
  stageX: number;
  stageY: number;
  radius: number;
  /** Screen-space angle: zero=east, increasing clockwise. */
  angle: number;
  /** Angle unwrapped from the largest empty seam; also stored in `cx`. */
  unwrappedAngle: number;
}

export interface PolarNavigationGrid<T extends NavigationGridStop = NavigationGridStop> {
  origin: {x: number; y: number};
  seamAngle: number;
  /** Converts radians to tolerance-relative units for 2-D cell refinement. */
  angularScale: number;
  stops: PolarNavigationStop<T>[];
  originStops: T[];
  radialBands: NavigationAxisBand<PolarNavigationStop<T>>[];
  angularBands: NavigationAxisBand<PolarNavigationStop<T>>[];
  maxRadius: number;
}

export function normalizeAngle(angle: number): number {
  const normalized = angle % FULL_TURN;
  return normalized < 0 ? normalized + FULL_TURN : normalized;
}

export function circularAngleDistance(a: number, b: number): number {
  const delta = Math.abs(normalizeAngle(a) - normalizeAngle(b));
  return Math.min(delta, FULL_TURN - delta);
}

/** Put the linear 0/2π seam halfway through the largest empty angular gap,
 *  preventing a visually coherent spoke from being split at screen-east. */
export function choosePolarSeam(angles: readonly number[]): number {
  if (angles.length === 0) return 0;
  if (angles.length === 1) return normalizeAngle(angles[0] + Math.PI);

  const sorted = angles.map(normalizeAngle).sort((a, b) => a - b);
  let gapStart = sorted[0];
  let largestGap = -1;
  for (let i = 0; i < sorted.length; i++) {
    const start = sorted[i];
    const end = i === sorted.length - 1 ? sorted[0] + FULL_TURN : sorted[i + 1];
    const gap = end - start;
    if (gap > largestGap) {
      largestGap = gap;
      gapStart = start;
    }
  }
  return normalizeAngle(gapStart + largestGap / 2);
}

export function buildPolarNavigationGrid<T extends NavigationGridStop>(
  stops: readonly T[],
  origin: {x: number; y: number},
  radialTolerance: number,
  angularTolerance: number,
): PolarNavigationGrid<T> {
  const measured = stops.map(source => {
    const dx = source.cx - origin.x;
    const dy = source.cy - origin.y;
    return {source, radius: Math.hypot(dx, dy), angle: normalizeAngle(Math.atan2(dy, dx))};
  });
  const originStops = measured
    .filter(stop => stop.radius < ORIGIN_EPSILON)
    .map(stop => stop.source);
  const away = measured.filter(stop => stop.radius >= ORIGIN_EPSILON);
  const seamAngle = choosePolarSeam(away.map(stop => stop.angle));
  // Cartesian cell refinement compares x/y gaps. Normalize radians to the
  // radial tolerance so neither axis wins merely because of its unit.
  const angularScale = radialTolerance / Math.max(angularTolerance, Number.EPSILON);
  const polarStops: PolarNavigationStop<T>[] = away.map(stop => {
    const unwrappedAngle = normalizeAngle(stop.angle - seamAngle);
    return {
      id: stop.source.id,
      kind: stop.source.kind,
      // buildNavigationGrid treats x as the angular coordinate and y as the
      // radial coordinate. Stage coordinates stay alongside for landing.
      cx: unwrappedAngle * angularScale,
      cy: stop.radius,
      source: stop.source,
      stageX: stop.source.cx,
      stageY: stop.source.cy,
      radius: stop.radius,
      angle: stop.angle,
      unwrappedAngle,
    };
  });
  const maxRadius = Math.max(0, ...polarStops.map(stop => stop.radius));
  const grid = buildNavigationGrid(
    polarStops,
    FULL_TURN * angularScale,
    maxRadius + radialTolerance,
    {x: angularTolerance * angularScale, y: radialTolerance},
  );
  return {
    origin,
    seamAngle,
    angularScale,
    stops: polarStops,
    originStops,
    radialBands: grid.rows,
    angularBands: grid.columns,
    maxRadius,
  };
}

/** Convert an unwrapped band coordinate back to its screen-space angle. */
export function polarBandAngle(grid: PolarNavigationGrid, unwrappedAngle: number): number {
  return normalizeAngle(grid.seamAngle + unwrappedAngle / grid.angularScale);
}

export function polarGridAngleCoordinate(grid: PolarNavigationGrid, angle: number): number {
  return normalizeAngle(angle - grid.seamAngle) * grid.angularScale;
}

/**
 * Cardinal keys keep their visual meaning by rotating their polar role in
 * each quadrant. At every non-origin point this is a bijection: the four keys
 * always cover outward, inward, clockwise, and counterclockwise exactly once.
 */
export function polarDirectionForCardinal(
  angle: number,
  direction: CardinalDirection,
): PolarLogicalDirection {
  // Cardinal order follows increasing screen-space angle: east, south, west,
  // north. Rounding gives the quadrant whose axis is closest to the stop.
  const outwardIndex = Math.round(normalizeAngle(angle) / (Math.PI / 2)) % 4;
  const directionIndex: Record<CardinalDirection, number> = {
    right: 0,
    down: 1,
    left: 2,
    up: 3,
  };
  const relative = (directionIndex[direction] - outwardIndex + 4) % 4;
  return (['outward', 'clockwise', 'inward', 'counterclockwise'] as const)[relative];
}

export function cardinalAngle(direction: CardinalDirection): number {
  return ({right: 0, down: Math.PI / 2, left: Math.PI, up: Math.PI * 1.5})[direction];
}
