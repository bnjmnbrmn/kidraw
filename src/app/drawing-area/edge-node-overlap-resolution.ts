/** Post-layout pass: push node boxes off straight edge chords so no
 *  straight-line edge passes through a non-endpoint node (see
 *  notes/idea-layout-node-edge-avoidance.md). Companion to
 *  overlap-resolution.ts and composed with it: every node push is followed
 *  by a box-overlap sweep so fixing a pierce never leaves two boxes
 *  overlapping. */

import {OverlapBox, resolveBoxOverlaps} from './overlap-resolution';
import {closestPointOnSegment, lineSegmentIntersectsRect} from './utils';

/** An edge as a pair of indices into the boxes array (src, dest). */
export interface EdgeIndexPair {
  a: number;
  b: number;
}

const EPS = 1e-6;
const MAX_SWEEPS = 8;
/** Fraction of extra push beyond the computed penetration, so a box lands
 *  clear of the chord instead of exactly tangent to it. */
const OVERSHOOT = 0.1;

/** Half-extent of an axis-aligned box in direction `dir` (the AABB support
 *  radius): how far the box reaches from its center along that direction. */
function supportRadius(box: OverlapBox, dirX: number, dirY: number): number {
  return (box.w / 2) * Math.abs(dirX) + (box.h / 2) * Math.abs(dirY);
}

/**
 * Push movable boxes perpendicular off every straight edge chord (center to
 * center of the endpoint boxes) that pierces them, keeping `clearance` px
 * between the chord and the box, then re-run box-overlap resolution with
 * `boxGap` so the pushes never leave boxes overlapping. Pinned boxes are
 * never moved (a pierce through a pinned box is left for the router).
 * Mutates box x/y in place and returns the indices of boxes that moved.
 */
export function resolveEdgeNodeOverlaps(
  boxes: OverlapBox[],
  edges: EdgeIndexPair[],
  clearance: number,
  boxGap: number,
): number[] {
  const moved = new Set<number>();

  for (let sweep = 0; sweep < MAX_SWEEPS; sweep++) {
    let pushed = false;

    for (const edge of edges) {
      if (edge.a === edge.b) continue; // self-loops have no straight chord
      const ea = boxes[edge.a];
      const eb = boxes[edge.b];
      const x1 = ea.x + ea.w / 2;
      const y1 = ea.y + ea.h / 2;
      const x2 = eb.x + eb.w / 2;
      const y2 = eb.y + eb.h / 2;

      for (let k = 0; k < boxes.length; k++) {
        if (k === edge.a || k === edge.b) continue;
        const box = boxes[k];
        if (!box.movable) continue;
        if (!lineSegmentIntersectsRect(
              x1, y1, x2, y2,
              box.x - clearance, box.y - clearance,
              box.x + box.w + clearance, box.y + box.h + clearance)) {
          continue;
        }

        const cx = box.x + box.w / 2;
        const cy = box.y + box.h / 2;
        const closest = closestPointOnSegment(cx, cy, x1, y1, x2, y2);
        let dirX = cx - closest.x;
        let dirY = cy - closest.y;
        let dist = Math.hypot(dirX, dirY);
        if (dist < EPS) {
          // Box center sits exactly on the chord: push perpendicular to it,
          // deterministic side.
          const chordLen = Math.max(Math.hypot(x2 - x1, y2 - y1), EPS);
          dirX = -(y2 - y1) / chordLen;
          dirY = (x2 - x1) / chordLen;
          dist = 0;
        } else {
          dirX /= dist;
          dirY /= dist;
        }

        const penetration = supportRadius(box, dirX, dirY) + clearance - dist;
        if (penetration <= EPS) continue;

        const push = penetration * (1 + OVERSHOOT);
        box.x += dirX * push;
        box.y += dirY * push;
        moved.add(k);
        pushed = true;
      }
    }

    if (!pushed) break;
    // A push can land the box on a neighbor; keep the no-overlap invariant.
    for (const i of resolveBoxOverlaps(boxes, boxGap)) moved.add(i);
  }

  return [...moved];
}
