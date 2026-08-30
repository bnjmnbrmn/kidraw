/**
 * A node placed next to another must not land on it.
 *
 * The quick-add slot was derived from the anchor's box alone, so growing
 * from a 50px node in a graph whose new nodes are 120px placed them
 * overlapping (measured 2026-08-29: centre-to-centre 60 for boxes that need
 * 85). The slot has to clear half of EACH box — the one you are growing
 * from and the one about to land — plus a gap.
 */
import {DrawingAreaComponent} from '../app/drawing-area/drawing-area.component';
import {DANode} from '../app/drawing-area/da-node';

/** Anchor sizes worth caring about: the default, Ben's todo-graph cards,
 *  a hand-shrunk node, and a very wide one. */
const ANCHORS = [
  {w: 120, h: 120, name: 'default square'},
  {w: 280, h: 70, name: 'todo card'},
  {w: 50, h: 50, name: 'shrunk'},
  {w: 600, h: 90, name: 'very wide'},
];
/** What a new node starts at, per identity. */
const FRESH = [
  {w: 120, h: 120, name: 'default identity'},
  {w: 280, h: 70, name: 'todo-graph identity'},
];

function slotFor(anchor: {w: number; h: number}, fresh: {w: number; h: number}, vertical: boolean): number {
  const component = Object.create(DrawingAreaComponent.prototype) as any;
  component.drawingLayer = {newNodeDefaultSize: () => fresh};
  const node = new DANode(0, 0, '');
  (node as any)._nodeWidth = anchor.w;
  (node as any)._nodeHeight = anchor.h;
  return component.quickAddSlot(vertical, node);
}

describe('quick-add placement', () => {
  for (const anchor of ANCHORS) {
    for (const fresh of FRESH) {
      it(`never overlaps: ${anchor.name} → ${fresh.name}`, () => {
        for (const vertical of [true, false]) {
          const slot = slotFor(anchor, fresh, vertical);
          const halves = vertical ? (anchor.h + fresh.h) / 2 : (anchor.w + fresh.w) / 2;
          expect(slot).withContext(`${vertical ? 'vertical' : 'horizontal'}`).toBeGreaterThan(halves);
        }
      });

      it(`keeps the gap in a sane band: ${anchor.name} → ${fresh.name}`, () => {
        for (const vertical of [true, false]) {
          const slot = slotFor(anchor, fresh, vertical);
          const gap = slot - (vertical ? (anchor.h + fresh.h) / 2 : (anchor.w + fresh.w) / 2);
          // Not touching, and not a chasm: the two failure modes Ben has
          // reported, in that order (da-369, then da-559).
          expect(gap).withContext(`${vertical ? 'vertical' : 'horizontal'} gap`).toBeGreaterThanOrEqual(8);
          expect(gap).toBeLessThanOrEqual(130);
        }
      });

      it(`places above closer than beside: ${anchor.name} → ${fresh.name}`, () => {
        // A stack reads as a stack when the boxes nearly touch; the same gap
        // sideways reads as two things that missed each other.
        const v = slotFor(anchor, fresh, true) - (anchor.h + fresh.h) / 2;
        const h = slotFor(anchor, fresh, false) - (anchor.w + fresh.w) / 2;
        expect(v).toBeLessThanOrEqual(h);
      });
    }
  }
});
