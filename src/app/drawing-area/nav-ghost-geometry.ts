/**
 * Where the pieces of a navigation ghost go.
 *
 * The nav popup previews a candidate jump without moving the view: a dashed
 * copy of the source node, the edge, and the destination. The destination is
 * usually off-screen — that is the point of previewing it — so it has to be
 * pulled into the viewport, and the ghost edge has to meet both boxes on
 * their borders rather than at their centres.
 *
 * Pure geometry, in layer coordinates. Nothing here reads the canvas.
 */
import { Point } from './utils';

/** Half-extents of a box: the distance from its centre to each edge. */
export interface HalfExtents {
  w: number;
  h: number;
}

/**
 * Where the ghosted destination lands, given the viewport it must fit inside.
 *
 * Already inside: it stays where it is. Otherwise it slides back along the ray
 * from `source`, so the preview keeps the direction of the real edge instead of
 * jumping to an unrelated corner. If the source is off-screen too — it should
 * not be, it is under the crosshairs — a plain clamp is the best available.
 */
export function ghostLandingPoint(source: Point, destination: Point, lo: Point, hi: Point): Point {
  if (within(destination, lo, hi)) return destination;

  if (!within(source, lo, hi)) {
    return {
      x: Math.min(Math.max(destination.x, lo.x), hi.x),
      y: Math.min(Math.max(destination.y, lo.y), hi.y),
    };
  }

  // The largest fraction of the way to the destination that stays in bounds.
  const travel = Math.min(
    axisTravel(source.x, destination.x, lo.x, hi.x),
    axisTravel(source.y, destination.y, lo.y, hi.y),
  );
  return {
    x: source.x + (destination.x - source.x) * travel,
    y: source.y + (destination.y - source.y) * travel,
  };
}

/**
 * Where a ray leaving the centre of a box crosses its border.
 *
 * `direction` need not be normalised; only its sense matters. Used to start and
 * end the ghost edge on the two boxes rather than inside them.
 */
export function boxEdgePoint(center: Point, half: HalfExtents, direction: Point): Point {
  const scale = Math.min(
    direction.x !== 0 ? half.w / Math.abs(direction.x) : Number.POSITIVE_INFINITY,
    direction.y !== 0 ? half.h / Math.abs(direction.y) : Number.POSITIVE_INFINITY,
  );
  return {x: center.x + direction.x * scale, y: center.y + direction.y * scale};
}

function within(p: Point, lo: Point, hi: Point): boolean {
  return p.x >= lo.x && p.x <= hi.x && p.y >= lo.y && p.y <= hi.y;
}

/** Fraction of the way from `from` to `to` that stays within [min, max]. */
function axisTravel(from: number, to: number, min: number, max: number): number {
  if (to > max) return (max - from) / (to - from);
  if (to < min) return (min - from) / (to - from);
  return 1;
}
