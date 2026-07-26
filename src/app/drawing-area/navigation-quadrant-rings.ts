import {NavigationGridStop} from './navigation-grid';
import {
  NavigationQuadrant,
  navigationQuadrant,
} from './navigation-quadrant-grid';

const ORIGIN_EPSILON = 4;

/** One graph-item stop measured from the fixed quadrant origin. */
export interface QuadrantRingStop<T extends NavigationGridStop = NavigationGridStop> {
  source: T;
  quadrant: NavigationQuadrant;
  radius: number;
  /** Screen-space angle: zero=east, increasing clockwise. */
  angle: number;
}

/**
 * A single quarter-ring contains exactly one stop. Its radial boundaries are
 * inferred only from neighboring stops in the same quadrant, so East, South,
 * West, and North deliberately have independent ring spacing.
 */
export interface QuadrantRingBand<T extends NavigationGridStop = NavigationGridStop> {
  stop: QuadrantRingStop<T>;
  innerRadius: number;
  /** Infinity means the final ring continues to the edge of the viewport. */
  outerRadius: number;
}

export interface QuadrantRingGrid<T extends NavigationGridStop = NavigationGridStop> {
  origin: {x: number; y: number};
  originStops: T[];
  stops: QuadrantRingStop<T>[];
  rings: Record<NavigationQuadrant, QuadrantRingBand<T>[]>;
}

const QUADRANTS: readonly NavigationQuadrant[] = [
  'north',
  'south',
  'east',
  'west',
];

function cardinalAngle(quadrant: NavigationQuadrant): number {
  return ({
    east: 0,
    south: Math.PI / 2,
    west: Math.PI,
    north: -Math.PI / 2,
  } as const)[quadrant];
}

function angularDistance(a: number, b: number): number {
  const fullTurn = Math.PI * 2;
  const delta = Math.abs((a - b) % fullTurn);
  return Math.min(delta, fullTurn - delta);
}

/**
 * Build four independent radial orderings. Unlike the adaptive band grid,
 * nearby radii are never clustered: every non-origin stop owns one ordinal
 * quarter-ring.
 */
export function buildQuadrantRingGrid<T extends NavigationGridStop>(
  stops: readonly T[],
  origin: {x: number; y: number},
): QuadrantRingGrid<T> {
  const originStops: T[] = [];
  const measured: QuadrantRingStop<T>[] = [];

  for (const source of stops) {
    const dx = source.cx - origin.x;
    const dy = source.cy - origin.y;
    const radius = Math.hypot(dx, dy);
    const quadrant = navigationQuadrant(dx, dy);
    if (radius < ORIGIN_EPSILON || quadrant === null) {
      originStops.push(source);
      continue;
    }
    measured.push({
      source,
      quadrant,
      radius,
      angle: Math.atan2(dy, dx),
    });
  }

  const rings = {
    north: [],
    south: [],
    east: [],
    west: [],
  } as Record<NavigationQuadrant, QuadrantRingBand<T>[]>;

  for (const quadrant of QUADRANTS) {
    const ordered = measured
      .filter(stop => stop.quadrant === quadrant)
      .sort((a, b) =>
        a.radius - b.radius ||
        angularDistance(a.angle, cardinalAngle(quadrant)) -
          angularDistance(b.angle, cardinalAngle(quadrant)) ||
        a.source.id.localeCompare(b.source.id) ||
        a.source.kind.localeCompare(b.source.kind));

    rings[quadrant] = ordered.map((stop, index) => ({
      stop,
      innerRadius: index === 0
        ? 0
        : (ordered[index - 1].radius + stop.radius) / 2,
      outerRadius: index === ordered.length - 1
        ? Number.POSITIVE_INFINITY
        : (stop.radius + ordered[index + 1].radius) / 2,
    }));
  }

  return {origin, originStops, stops: measured, rings};
}

/** Return the next outward stop in one quadrant. */
export function nextQuadrantRingStop<T extends NavigationGridStop>(
  grid: QuadrantRingGrid<T>,
  quadrant: NavigationQuadrant,
  current: QuadrantRingStop<T> | null,
): QuadrantRingStop<T> | null {
  const rings = grid.rings[quadrant];
  if (!current || current.quadrant !== quadrant) {
    return rings[0]?.stop ?? null;
  }
  const currentIndex = rings.findIndex(ring => ring.stop === current);
  return currentIndex >= 0 ? rings[currentIndex + 1]?.stop ?? null : rings[0]?.stop ?? null;
}

/** Start/end angles for a 90° screen-space quadrant wedge. */
export function quadrantArcAngles(
  quadrant: NavigationQuadrant,
): {start: number; end: number} {
  return ({
    east: {start: -Math.PI / 4, end: Math.PI / 4},
    south: {start: Math.PI / 4, end: Math.PI * 3 / 4},
    west: {start: Math.PI * 3 / 4, end: Math.PI * 5 / 4},
    north: {start: Math.PI * 5 / 4, end: Math.PI * 7 / 4},
  } as const)[quadrant];
}

export function quarterArcPoints(
  origin: {x: number; y: number},
  radius: number,
  quadrant: NavigationQuadrant,
  segments = 24,
): number[] {
  const {start, end} = quadrantArcAngles(quadrant);
  const points: number[] = [];
  for (let index = 0; index <= segments; index++) {
    const angle = start + (end - start) * index / segments;
    points.push(
      origin.x + Math.cos(angle) * radius,
      origin.y + Math.sin(angle) * radius,
    );
  }
  return points;
}
