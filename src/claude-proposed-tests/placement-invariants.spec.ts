/**
 * A node placed next to another must not land on it.
 *
 * The quick-add spacing was derived from the anchor's box alone, so growing
 * from a 50px node in a graph whose new nodes are 120px placed them
 * overlapping (measured 2026-08-29: center-to-center 60 for boxes that need
 * 85). The spacing has to clear half of EACH box — the one you are growing
 * from and the one about to land — plus a gap.
 */
import {BoxSize, PlacementAxis, quickAddSpacing} from '../app/drawing-area/quick-add-spacing';

/** Anchor sizes worth caring about: the default, Ben's todo-graph cards,
 *  a hand-shrunk node, and a very wide one. */
const ANCHORS: (BoxSize & {name: string})[] = [
  {w: 120, h: 120, name: 'default square'},
  {w: 280, h: 70, name: 'todo card'},
  {w: 50, h: 50, name: 'shrunk'},
  {w: 600, h: 90, name: 'very wide'},
];
/** What a new node starts at, per identity. */
const FRESH: (BoxSize & {name: string})[] = [
  {w: 120, h: 120, name: 'default identity'},
  {w: 280, h: 70, name: 'todo-graph identity'},
];

/** The distance the two boxes must clear before any gap is added. */
function halfBoxes(axis: PlacementAxis, anchor: BoxSize, fresh: BoxSize): number {
  return axis === 'y' ? (anchor.h + fresh.h) / 2 : (anchor.w + fresh.w) / 2;
}

describe('quick-add placement', () => {
  for (const anchor of ANCHORS) {
    for (const fresh of FRESH) {
      it(`never overlaps: ${anchor.name} → ${fresh.name}`, () => {
        for (const axis of ['x', 'y'] as PlacementAxis[]) {
          expect(quickAddSpacing(axis, anchor, fresh))
            .withContext(`axis ${axis}`)
            .toBeGreaterThan(halfBoxes(axis, anchor, fresh));
        }
      });

      it(`keeps the gap in a sane band: ${anchor.name} → ${fresh.name}`, () => {
        for (const axis of ['x', 'y'] as PlacementAxis[]) {
          const gap = quickAddSpacing(axis, anchor, fresh) - halfBoxes(axis, anchor, fresh);
          // Not touching, and not a chasm: the two failure modes Ben has
          // reported, in that order (da-369, then da-559).
          expect(gap).withContext(`axis ${axis} gap`).toBeGreaterThanOrEqual(8);
          expect(gap).toBeLessThanOrEqual(130);
        }
      });

      it(`places above closer than beside: ${anchor.name} → ${fresh.name}`, () => {
        // A stack reads as a stack when the boxes nearly touch; the same gap
        // sideways reads as two things that missed each other.
        const v = quickAddSpacing('y', anchor, fresh) - halfBoxes('y', anchor, fresh);
        const h = quickAddSpacing('x', anchor, fresh) - halfBoxes('x', anchor, fresh);
        expect(v).toBeLessThanOrEqual(h);
      });
    }
  }
});
