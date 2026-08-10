/** Pure geometry for edge-label anchoring.
 *
 *  An edge label's position is stored as an anchor — a fraction `t` (0..1)
 *  of arc length along the edge's rendered polyline, plus a discrete `side`
 *  (above / on / below the line). Absolute x/y is derived from the anchor
 *  every time the edge geometry changes, so labels follow node moves,
 *  waypoint drags, and re-routing.
 *
 *  "Above" is screen-stable: it is the path normal whose y-component is
 *  negative (screen up), independent of the edge's travel direction, so a
 *  label above an A→B edge stays above when the edge is B→A. On (near-)
 *  vertical segments the normal is horizontal; "above" degrades to the
 *  +x side deterministically.
 */

export type EdgeLabelSide = 'above' | 'on' | 'below';

/** Canonical slide stops along the path (start / middle / end). Coarse-tier
 *  sliding jumps between these; they also bound how close to a node a label
 *  can slide, keeping it clear of arrowheads and node faces. */
export const LABEL_T_STOPS: readonly number[] = [0.1, 0.5, 0.9];
export const LABEL_T_MIN = LABEL_T_STOPS[0];
export const LABEL_T_MAX = LABEL_T_STOPS[LABEL_T_STOPS.length - 1];

export interface Point {
  x: number;
  y: number;
}

export interface AxisAlignedRect extends Point {
  width: number;
  height: number;
}

export interface DirectionalLabelStepOptions {
  coarse?: boolean;
  labelSize?: {width: number; height: number};
  keepOutRects?: readonly AxisAlignedRect[];
  keepOutPadding?: number;
}

/** Position on the path at arc-length fraction `t`, plus the screen-stable
 *  "above" unit normal at that point. */
export interface PathAnchor extends Point {
  /** Unit normal pointing to the "above" side (screen up-ish). */
  nx: number;
  ny: number;
}

function segmentLengths(points: readonly Point[]): { lengths: number[]; total: number } {
  const lengths: number[] = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const len = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
    lengths.push(len);
    total += len;
  }
  return { lengths, total };
}

/** Total arc length of the polyline. */
export function pathLength(points: readonly Point[]): number {
  return segmentLengths(points).total;
}

/** The "above" unit normal for a segment direction (dx, dy): the
 *  perpendicular whose y-component is negative, tie-breaking to +x for
 *  vertical travel. Returns null for a degenerate (zero-length) direction. */
function aboveNormal(dx: number, dy: number): { nx: number; ny: number } | null {
  const len = Math.hypot(dx, dy);
  if (len < 1e-9) return null;
  let nx = -dy / len;
  let ny = dx / len;
  if (ny > 1e-9 || (Math.abs(ny) <= 1e-9 && nx < 0)) {
    nx = -nx;
    ny = -ny;
  }
  return { nx, ny };
}

/** Point (and above-normal) at arc-length fraction `t` along the polyline.
 *  `t` is clamped to [0, 1]. Returns null if the path has < 2 points or is
 *  degenerate. */
export function pointAtT(points: readonly Point[], t: number): PathAnchor | null {
  if (points.length < 2) return null;
  const { lengths, total } = segmentLengths(points);
  if (total < 1e-9) return null;
  const target = Math.min(Math.max(t, 0), 1) * total;
  let accumulated = 0;
  for (let i = 0; i < lengths.length; i++) {
    const isLast = i === lengths.length - 1;
    if (accumulated + lengths[i] >= target || isLast) {
      const segT = lengths[i] > 1e-9 ? (target - accumulated) / lengths[i] : 0;
      const dx = points[i + 1].x - points[i].x;
      const dy = points[i + 1].y - points[i].y;
      const normal = aboveNormal(dx, dy) ?? { nx: 0, ny: -1 };
      return {
        x: points[i].x + segT * dx,
        y: points[i].y + segT * dy,
        ...normal,
      };
    }
    accumulated += lengths[i];
  }
  return null;
}

/** Project `p` onto the polyline: the arc-length fraction `t` of the nearest
 *  path point, and the signed perpendicular distance from the path to `p`
 *  (positive = the "above" side). Returns null for degenerate paths. */
export function projectPointToPath(
  points: readonly Point[],
  p: Point,
): { t: number; signedDist: number } | null {
  if (points.length < 2) return null;
  const { lengths, total } = segmentLengths(points);
  if (total < 1e-9) return null;

  let bestDist = Infinity;
  let bestArc = 0;
  let bestSigned = 0;
  let accumulated = 0;
  for (let i = 0; i < lengths.length; i++) {
    const dx = points[i + 1].x - points[i].x;
    const dy = points[i + 1].y - points[i].y;
    const len = lengths[i];
    if (len > 1e-9) {
      const segT = Math.min(Math.max(
        ((p.x - points[i].x) * dx + (p.y - points[i].y) * dy) / (len * len), 0), 1);
      const projX = points[i].x + segT * dx;
      const projY = points[i].y + segT * dy;
      const d = Math.hypot(p.x - projX, p.y - projY);
      if (d < bestDist) {
        bestDist = d;
        bestArc = accumulated + segT * len;
        const normal = aboveNormal(dx, dy) ?? { nx: 0, ny: -1 };
        bestSigned = (p.x - projX) * normal.nx + (p.y - projY) * normal.ny;
      }
    }
    accumulated += len;
  }
  if (!isFinite(bestDist)) return null;
  return { t: bestArc / total, signedDist: bestSigned };
}

/** Derive a discrete side from a signed perpendicular distance: within
 *  `onThreshold` of the line counts as 'on'. */
export function sideFromSignedDist(signedDist: number, onThreshold: number): EdgeLabelSide {
  if (signedDist > onThreshold) return 'above';
  if (signedDist < -onThreshold) return 'below';
  return 'on';
}

/** Absolute label-center position for an anchor (t, side) on the polyline.
 *  `clearance` is the perpendicular distance used for above/below. */
export function anchorPosition(
  points: readonly Point[],
  t: number,
  side: EdgeLabelSide,
  clearance: number,
): Point | null {
  const at = pointAtT(points, t);
  if (!at) return null;
  const k = side === 'above' ? clearance : side === 'below' ? -clearance : 0;
  return { x: at.x + k * at.nx, y: at.y + k * at.ny };
}

/** Whether an axis-aligned box centered at `center` stays wholly outside all
 * keep-out rectangles, including the requested padding. */
export function centeredBoxClearsRects(
  center: Point,
  size: {width: number; height: number},
  rects: readonly AxisAlignedRect[],
  padding = 0,
): boolean {
  const left = center.x - size.width / 2;
  const right = center.x + size.width / 2;
  const top = center.y - size.height / 2;
  const bottom = center.y + size.height / 2;
  return rects.every(rect =>
    right <= rect.x - padding || left >= rect.x + rect.width + padding ||
    bottom <= rect.y - padding || top >= rect.y + rect.height + padding,
  );
}

/** Next canonical stop strictly beyond `t` in the given direction, for
 *  coarse-tier sliding (start / middle / end). Clamps at the outer stops. */
export function nextTStop(t: number, direction: 1 | -1): number {
  const epsilon = 1e-6;
  if (direction > 0) {
    for (const stop of LABEL_T_STOPS) {
      if (stop > t + epsilon) return stop;
    }
    return LABEL_T_MAX;
  }
  for (let i = LABEL_T_STOPS.length - 1; i >= 0; i--) {
    if (LABEL_T_STOPS[i] < t - epsilon) return LABEL_T_STOPS[i];
  }
  return LABEL_T_MIN;
}

/** One step in the above → on → below cycle. `direction` +1 moves downward
 *  (above → on → below), -1 moves upward. Saturates at the ends. */
export function cycleSide(side: EdgeLabelSide, direction: 1 | -1): EdgeLabelSide {
  const order: EdgeLabelSide[] = ['above', 'on', 'below'];
  const idx = order.indexOf(side) + direction;
  return order[Math.min(Math.max(idx, 0), order.length - 1)];
}

/** Choose one anchor change that travels in the requested screen direction.
 * Path motion is considered in both source/destination directions, so edge
 * direction cannot invert Drag Left/Right. On a nearly perpendicular edge,
 * a side change can be the better cardinal movement. */
export function directionalLabelAnchorStep(
  points: readonly Point[],
  t: number,
  side: EdgeLabelSide,
  clearance: number,
  direction: Point,
  distance: number,
  options: DirectionalLabelStepOptions = {},
): {t: number; side: EdgeLabelSide} | null {
  const {
    coarse = false,
    labelSize,
    keepOutRects = [],
    keepOutPadding = 0,
  } = options;
  const current = anchorPosition(points, t, side, clearance);
  const directionLength = Math.hypot(direction.x, direction.y);
  const total = pathLength(points);
  if (!current || directionLength < 1e-9 || total < 1e-9) return null;
  const desired = {x: direction.x / directionLength, y: direction.y / directionLength};
  const candidates: Array<{t: number; side: EdgeLabelSide}> = [];
  const add = (candidate: {t: number; side: EdgeLabelSide}) => {
    if (Math.abs(candidate.t - t) < 1e-9 && candidate.side === side) return;
    if (candidates.some(item =>
      Math.abs(item.t - candidate.t) < 1e-9 && item.side === candidate.side)) return;
    candidates.push(candidate);
  };

  for (const sign of [-1, 1] as const) {
    add({
      t: coarse
        ? nextTStop(t, sign)
        : Math.min(Math.max(
          t + sign * Math.max(distance, 0) / total,
          LABEL_T_MIN,
        ), LABEL_T_MAX),
      side,
    });
  }
  // Side motion is one adjacent step at a time. Considering both outer sides
  // from every state made above → below win on distance and skipped `on`, so
  // a label could never be dragged back onto its edge.
  const sideOrder: readonly EdgeLabelSide[] = ['above', 'on', 'below'];
  const sideIndex = sideOrder.indexOf(side);
  if (sideIndex > 0) add({t, side: sideOrder[sideIndex - 1]});
  if (sideIndex < sideOrder.length - 1) add({t, side: sideOrder[sideIndex + 1]});

  let returnToOn: {t: number; side: EdgeLabelSide} | null = null;
  let best: {anchor: {t: number; side: EdgeLabelSide}; score: number} | null = null;
  const MIN_ALIGNMENT = 0.35;
  for (const candidate of candidates) {
    const position = anchorPosition(points, candidate.t, candidate.side, clearance);
    if (!position) continue;
    if (labelSize && !centeredBoxClearsRects(
      position, labelSize, keepOutRects, keepOutPadding,
    )) continue;
    const dx = position.x - current.x;
    const dy = position.y - current.y;
    const displacement = Math.hypot(dx, dy);
    if (displacement < 1e-9) continue;
    const projection = dx * desired.x + dy * desired.y;
    if (projection <= 1e-9 || projection / displacement < MIN_ALIGNMENT) continue;
    // When an outer-side label is being pushed toward the path, make the
    // adjacent `on` landing reachable even if a much longer along-path step
    // happens to have a larger cardinal projection on a diagonal edge.
    if (side !== 'on' && candidate.side === 'on') returnToOn = candidate;
    if (!best || projection > best.score + 1e-9) {
      best = {anchor: candidate, score: projection};
    }
  }
  return returnToOn ?? best?.anchor ?? null;
}
