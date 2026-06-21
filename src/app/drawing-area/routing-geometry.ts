// Shared pure-geometry primitives for the edge routers and their scorers.
//
// Everything here is Konva-free and side-effect-free: plain {x,y} points,
// axis-aligned boxes, and segment/polyline predicates. Both the production
// desiderata router and the experimental incremental router import from this
// module so the two share one definition of "do these segments cross", "how
// far is this point from that box", etc. The metrics module
// (edge-routing-metrics.ts) keeps its own copies for now — it is on the hot
// production path and we are not refactoring it in this pass.

export interface Pt {
  x: number;
  y: number;
}

export interface Bbox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** Structural surface of a node that the geometry layer reads — lets these
 *  helpers work against both the live DANode and the harness FakeDANode
 *  without importing either concrete type. */
export interface NodeBoxSource {
  konvaGroup: { x(): number; y(): number };
  NODE_WIDTH: number;
  NODE_HEIGHT: number;
}

// --- Vectors ---

export function vector(from: Pt, to: Pt): Pt {
  return { x: to.x - from.x, y: to.y - from.y };
}

export function unit(v: Pt): Pt {
  const len = Math.hypot(v.x, v.y);
  if (len < 1e-9) return { x: 1, y: 0 };
  return { x: v.x / len, y: v.y / len };
}

export function dist(a: Pt, b: Pt): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** Angle between two direction vectors, in degrees, 0..180. */
export function angleBetween(a: Pt, b: Pt): number {
  const alen = Math.hypot(a.x, a.y);
  const blen = Math.hypot(b.x, b.y);
  if (alen < 1e-9 || blen < 1e-9) return 0;
  const cos = (a.x * b.x + a.y * b.y) / (alen * blen);
  return (Math.acos(Math.max(-1, Math.min(1, cos))) * 180) / Math.PI;
}

/** Acute angle (0..90 deg) between two segments, direction-insensitive.
 *  |cos| folds θ and 180-θ together, so a near-parallel crossing reads as a
 *  small angle regardless of which way each segment points. */
export function acuteAngleBetweenSegmentsDeg(a1: Pt, a2: Pt, b1: Pt, b2: Pt): number {
  const dx1 = a2.x - a1.x;
  const dy1 = a2.y - a1.y;
  const dx2 = b2.x - b1.x;
  const dy2 = b2.y - b1.y;
  const len1 = Math.hypot(dx1, dy1) || 1;
  const len2 = Math.hypot(dx2, dy2) || 1;
  const cosAbs = Math.abs((dx1 * dx2 + dy1 * dy2) / (len1 * len2));
  return (Math.acos(Math.min(1, cosAbs)) * 180) / Math.PI;
}

// --- Segment / polyline predicates ---

/** True if the open segments a1→a2 and b1→b2 cross in their interiors
 *  (shared endpoints and collinear overlaps do NOT count). */
export function segmentsIntersect(a1: Pt, a2: Pt, b1: Pt, b2: Pt): boolean {
  const d = (a2.x - a1.x) * (b2.y - b1.y) - (a2.y - a1.y) * (b2.x - b1.x);
  if (Math.abs(d) < 1e-9) return false;
  const t = ((b1.x - a1.x) * (b2.y - b1.y) - (b1.y - a1.y) * (b2.x - b1.x)) / d;
  const u = ((b1.x - a1.x) * (a2.y - a1.y) - (b1.y - a1.y) * (a2.x - a1.x)) / d;
  return t > 0 && t < 1 && u > 0 && u < 1;
}

/** Perpendicular distance from p to the infinite line through a,b. */
export function perpDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return Math.hypot(p.x - a.x, p.y - a.y);
  return Math.abs(dx * (a.y - p.y) - (a.x - p.x) * dy) / len;
}

/** Distance from p to the closest point on segment a→b. */
export function pointSegmentDistance(p: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-9) return dist(p, a);
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq));
  return dist(p, { x: a.x + t * dx, y: a.y + t * dy });
}

/** Minimum distance between two segments; 0 if they cross. */
export function segSegDistance(p1: Pt, p2: Pt, p3: Pt, p4: Pt): number {
  if (segmentsIntersect(p1, p2, p3, p4)) return 0;
  return Math.min(
    pointSegmentDistance(p1, p3, p4),
    pointSegmentDistance(p2, p3, p4),
    pointSegmentDistance(p3, p1, p2),
    pointSegmentDistance(p4, p1, p2),
  );
}

// --- Boxes ---

export function bboxOf(node: NodeBoxSource): Bbox {
  const x = node.konvaGroup.x();
  const y = node.konvaGroup.y();
  return { minX: x, minY: y, maxX: x + node.NODE_WIDTH, maxY: y + node.NODE_HEIGHT };
}

export function inflateBox(box: Bbox, amount: number): Bbox {
  return {
    minX: box.minX - amount,
    minY: box.minY - amount,
    maxX: box.maxX + amount,
    maxY: box.maxY + amount,
  };
}

/** Strictly inside (boundary does not count). */
export function insideBox(point: Pt, box: Bbox): boolean {
  return point.x > box.minX && point.x < box.maxX && point.y > box.minY && point.y < box.maxY;
}

/** Liang–Barsky segment-vs-box clip test. True if the segment enters the
 *  box's interior at all (including passing clean through). */
export function segmentIntersectsBox(a: Pt, b: Pt, box: Bbox): boolean {
  let t0 = 0;
  let t1 = 1;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const tests = [
    { p: -dx, q: a.x - box.minX },
    { p: dx, q: box.maxX - a.x },
    { p: -dy, q: a.y - box.minY },
    { p: dy, q: box.maxY - a.y },
  ];
  for (const { p, q } of tests) {
    if (Math.abs(p) < 1e-9) {
      if (q < 0) return false;
      continue;
    }
    const r = q / p;
    if (p < 0) {
      if (r > t1) return false;
      if (r > t0) t0 = r;
    } else {
      if (r < t0) return false;
      if (r < t1) t1 = r;
    }
  }
  return t0 <= t1 && t1 >= 0 && t0 <= 1;
}

/** Shortest distance from point p to box (0 if inside or on the boundary). */
export function pointBoxDistance(p: Pt, box: Bbox): number {
  const cx = Math.max(box.minX, Math.min(p.x, box.maxX));
  const cy = Math.max(box.minY, Math.min(p.y, box.maxY));
  return Math.hypot(p.x - cx, p.y - cy);
}

// --- Small numeric helpers ---

export function roundTo(value: number, grid: number): number {
  return Math.round(value / grid) * grid;
}

export function samePoints(a: Pt[], b: Pt[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((p, i) => dist(p, b[i]) < 0.01);
}

export function uniquePoints(points: Pt[]): Pt[] {
  const out: Pt[] = [];
  for (const point of points) {
    if (!out.some(p => dist(p, point) < 0.01)) out.push(point);
  }
  return out;
}
