/**
 * Where Gather puts things (notes/idea-gather-recursive.md, v2 2026-09-25).
 *
 * Ben's aim for the gathered view: "the ungathered layout, but sucked in"
 * (Ben, 2026-07-15). Every gathered node keeps its bearing from the anchor
 * and moves in to a ring close around it, so the neighborhood keeps its
 * shape. Neighbors that would overlap on the ring are spread just enough
 * around it. Nodes that are not part of the gathering but sit inside the
 * gathered circle are pushed straight out past it, so being close means
 * being connected.
 *
 * Pure geometry: boxes in, top-left positions out.
 */
import { resolveBoxOverlaps } from './overlap-resolution';

export interface GatherBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Clear space between box perimeters, in layer units. */
export const GATHER_GAP = 36;

/** New top-left positions by id, for the nodes that move. */
export type GatherPlan = Map<string, {x: number; y: number}>;

interface Placed {
  box: GatherBox;
  bearing: number;
  reach: number;
}

const center = (b: GatherBox) => ({x: b.x + b.w / 2, y: b.y + b.h / 2});
const reach = (b: GatherBox) => Math.hypot(b.w, b.h) / 2;

/**
 * Plan a gathering around `anchor`: `rings[0]` its neighbors, `rings[1]`
 * (optional) their neighbors, placed on successive rings; `others` are
 * pushed out of the way. The anchor stays where it is.
 */
export function planGather(anchor: GatherBox, rings: GatherBox[][], others: GatherBox[]): GatherPlan {
  const plan: GatherPlan = new Map();
  const c = center(anchor);
  let inner = reach(anchor);
  for (const ring of rings.filter(r => r.length > 0)) {
    const placed = ring.map(box => ({box, bearing: bearingOf(center(box), c), reach: reach(box)}));
    const widest = Math.max(...placed.map(p => p.reach));
    const radius = ringRadius(placed, inner + widest + GATHER_GAP);
    spreadBearings(placed, radius);
    for (const p of placed) {
      plan.set(p.box.id, {
        x: c.x + Math.cos(p.bearing) * radius - p.box.w / 2,
        y: c.y + Math.sin(p.bearing) * radius - p.box.h / 2,
      });
    }
    inner = radius + widest;
  }
  pushOthersOut(c, inner + GATHER_GAP, others, anchor, rings.flat(), plan);
  return plan;
}

function bearingOf(point: {x: number; y: number}, from: {x: number; y: number}): number {
  const dx = point.x - from.x, dy = point.y - from.y;
  return dx === 0 && dy === 0 ? 0 : Math.atan2(dy, dx);
}

/** The angle a box takes up on a ring of this radius, gap included. */
function arcOf(p: Placed, radius: number): number {
  return 2 * Math.asin(Math.min(1, (p.reach + GATHER_GAP / 2) / radius));
}

/** At least `minimum`, and large enough that the ring holds every box. */
function ringRadius(placed: Placed[], minimum: number): number {
  let radius = minimum;
  while (placed.reduce((sum, p) => sum + arcOf(p, radius), 0) > 2 * Math.PI) radius *= 1.15;
  return radius;
}

/** Nudge bearings apart, keeping their order around the ring, until
 *  neighbors on it no longer overlap. Boxes that were already clear of each
 *  other keep the bearing they had. */
function spreadBearings(placed: Placed[], radius: number): void {
  if (placed.length < 2) return;
  placed.sort((a, b) => a.bearing - b.bearing);
  for (let pass = 0; pass < 200; pass++) {
    let moved = false;
    for (let i = 0; i < placed.length; i++) {
      const a = placed[i], b = placed[(i + 1) % placed.length];
      const need = (arcOf(a, radius) + arcOf(b, radius)) / 2;
      let gap = b.bearing - a.bearing;
      if (i === placed.length - 1) gap += 2 * Math.PI;
      if (gap >= need - 1e-9) continue;
      const shift = (need - gap) / 2;
      a.bearing -= shift;
      b.bearing += shift;
      moved = true;
    }
    if (!moved) return;
  }
}

/** Anything inside the gathered circle moves straight out past it, then
 *  apart from each other, never onto the gathered nodes. */
function pushOthersOut(c: {x: number; y: number}, clear: number, others: GatherBox[],
                       anchor: GatherBox, gathered: GatherBox[], plan: GatherPlan): void {
  const pushed = new Set<string>();
  const boxes = others.map(box => {
    const bc = center(box);
    const distance = Math.hypot(bc.x - c.x, bc.y - c.y);
    const needed = clear + reach(box);
    if (distance >= needed) return {x: box.x, y: box.y, w: box.w, h: box.h, movable: true};
    const bearing = bearingOf(bc, c);
    pushed.add(box.id);
    return {
      x: c.x + Math.cos(bearing) * needed - box.w / 2,
      y: c.y + Math.sin(bearing) * needed - box.h / 2,
      w: box.w, h: box.h, movable: true,
    };
  });
  const fixed = [anchor, ...gathered].map(box => {
    const at = plan.get(box.id) ?? box;
    return {x: at.x, y: at.y, w: box.w, h: box.h, movable: false};
  });
  const all = [...boxes, ...fixed];
  for (const i of resolveBoxOverlaps(all, GATHER_GAP / 2)) {
    if (i < others.length) pushed.add(others[i].id);
  }
  others.forEach((box, i) => {
    if (pushed.has(box.id)) plan.set(box.id, {x: all[i].x, y: all[i].y});
  });
}
