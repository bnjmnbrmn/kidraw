// Faithful sampler for the smooth curve a Konva.Arrow draws from a point list
// with `tension`. The app renders routed edges as `Konva.Arrow({ points,
// tension: 0.5 })` (da-edge.ts `SMOOTH_TENSION`), so to SCORE the curve the
// user actually sees — not the straight control polygon — we replicate Konva's
// tension expansion here and sample the resulting Bézier segments into a dense
// polyline.
//
// This mirrors Konva's own math exactly:
//   - Util._getControlPoints(x0,y0,x1,y1,x2,y2,t) — Catmull-Rom→Bézier tangents,
//   - Util._expandPoints(points,t)               — per-interior-point control pair,
//   - Line._sceneFunc                            — moveTo, leading quadratic,
//                                                  cubic segments, trailing quadratic.
// so the sampled polyline tracks the rendered stroke (including the overshoot a
// Catmull-Rom curve makes past its waypoints, which is what can clip a node).

import { Pt } from './routing-geometry';

/** Konva's per-interior-point tangent control points. */
function controlPoints(
  x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, t: number,
): [number, number, number, number] {
  const d01 = Math.hypot(x1 - x0, y1 - y0);
  const d12 = Math.hypot(x2 - x1, y2 - y1);
  const denom = d01 + d12 || 1;
  const fa = (t * d01) / denom;
  const fb = (t * d12) / denom;
  return [
    x1 - fa * (x2 - x0), y1 - fa * (y2 - y0),
    x1 + fb * (x2 - x0), y1 + fb * (y2 - y0),
  ];
}

/** Konva.Util._expandPoints: for each interior point, push
 *  [cpLeft, point, cpRight] (6 numbers). */
function expandPoints(flat: number[], tension: number): number[] {
  const len = flat.length;
  const out: number[] = [];
  for (let n = 2; n < len - 2; n += 2) {
    const cp = controlPoints(
      flat[n - 2], flat[n - 1], flat[n], flat[n + 1], flat[n + 2], flat[n + 3], tension,
    );
    if (Number.isNaN(cp[0])) continue;
    out.push(cp[0], cp[1], flat[n], flat[n + 1], cp[2], cp[3]);
  }
  return out;
}

function sampleQuad(out: Pt[], p0: Pt, c: Pt, p1: Pt, steps: number): void {
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    out.push({
      x: mt * mt * p0.x + 2 * mt * t * c.x + t * t * p1.x,
      y: mt * mt * p0.y + 2 * mt * t * c.y + t * t * p1.y,
    });
  }
}

function sampleCubic(out: Pt[], p0: Pt, c1: Pt, c2: Pt, p1: Pt, steps: number): void {
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const mt = 1 - t;
    const a = mt * mt * mt, b = 3 * mt * mt * t, c = 3 * mt * t * t, d = t * t * t;
    out.push({
      x: a * p0.x + b * c1.x + c * c2.x + d * p1.x,
      y: a * p0.y + b * c1.y + c * c2.y + d * p1.y,
    });
  }
}

/** Sample the smooth curve through `points` as Konva would render it with the
 *  given tension. Returns a dense polyline (the original endpoints are exact).
 *  With ≤2 points or tension 0 it returns the points unchanged (a straight
 *  line — same as Konva). */
export function sampleSmoothPath(points: Pt[], tension = 0.5, stepsPerSegment = 8): Pt[] {
  const P = points.length;
  if (P <= 2 || tension === 0) return points.map(p => ({ x: p.x, y: p.y }));

  const flat: number[] = [];
  for (const p of points) flat.push(p.x, p.y);
  const tp = expandPoints(flat, tension);
  if (tp.length < 4) return points.map(p => ({ x: p.x, y: p.y }));

  const out: Pt[] = [{ x: flat[0], y: flat[1] }];
  // Leading quadratic: start → first interior point, control = first cpLeft.
  sampleQuad(out, { x: flat[0], y: flat[1] }, { x: tp[0], y: tp[1] }, { x: tp[2], y: tp[3] }, stepsPerSegment);
  // Cubic segments between consecutive interior points.
  let n = 4;
  while (n < tp.length - 2) {
    const start = out[out.length - 1];
    sampleCubic(
      out, start,
      { x: tp[n], y: tp[n + 1] }, { x: tp[n + 2], y: tp[n + 3] }, { x: tp[n + 4], y: tp[n + 5] },
      stepsPerSegment,
    );
    n += 6;
  }
  // Trailing quadratic: last interior point → end, control = last cpRight.
  const start = out[out.length - 1];
  sampleQuad(
    out, start,
    { x: tp[tp.length - 2], y: tp[tp.length - 1] },
    { x: flat[2 * P - 2], y: flat[2 * P - 1] },
    stepsPerSegment,
  );
  return out;
}
