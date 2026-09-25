/**
 * How far from its anchor a quick-added node lands.
 *
 * One question, asked on one axis at a time: given the box you are growing
 * from and the box about to appear, what center-to-center distance puts them
 * side by side without touching and without a chasm between them? The held-Add
 * lattice, the rough directional throw, and the coarse placement step all
 * measure themselves in this unit.
 *
 * Pure geometry — it reads no canvas state. The caller resolves the two box
 * sizes; everything after that is arithmetic over the constants below.
 */

/** Which way the new node sits from its anchor. */
export type PlacementAxis = 'x' | 'y';

export interface BoxSize {
  w: number;
  h: number;
}

/** Placement used fixed slots — 300 across, 150 down — which read as a
 *  chasm next to a small box and as a squeeze next to a wide one. The gap
 *  is now a fraction of the box you are growing from, so a graph of 60px
 *  nodes places them 60px apart and a graph of big ones spreads out
 *  (2026-08-29). Horizontal gaps run wider because labels run across.
 *  Bounds keep tiny boxes from touching and huge ones from throwing the
 *  new node off screen. */
const GAP_RATIO_H = 0.5;
/** Vertical gaps are much tighter than horizontal ones (da-559): a stack
 *  reads as a stack when the boxes nearly touch, while the same gap
 *  sideways reads as two things that missed each other. Cut ~60% from the
 *  first pass at this. */
const GAP_RATIO_V = 0.14;
const GAP_MIN_H = 24;
const GAP_MIN_V = 10;
const GAP_MAX_H = 120;
const GAP_MAX_V = 90;

/** Fallback box when there is no anchor to measure — DANode's default. */
export const DEFAULT_BOX_SIZE = 120;

/**
 * Center-to-center distance for a node of size `fresh` placed beside a node
 * of size `anchor`, along `axis`.
 *
 * Half of each box, not one box twice: growing a small node next to the
 * default-sized one that is about to land there used to overlap them. The gap
 * added on top is proportional to that cleared distance, held inside bounds so
 * tiny boxes never touch and huge ones never throw the new node off screen.
 */
export function quickAddSpacing(axis: PlacementAxis, anchor: BoxSize, fresh: BoxSize): number {
  const vertical = axis === 'y';
  const halfBoxes = vertical
    ? (anchor.h + fresh.h) / 2
    : (anchor.w + fresh.w) / 2;
  const gap = vertical
    ? clamp(halfBoxes * GAP_RATIO_V, GAP_MIN_V, GAP_MAX_V)
    : clamp(halfBoxes * GAP_RATIO_H, GAP_MIN_H, GAP_MAX_H);
  return Math.round(halfBoxes + gap);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
