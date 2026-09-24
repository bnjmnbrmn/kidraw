import {DrawingAreaComponent} from './drawing-area.component';
import {wireDrawingAreaCollaborators} from './drawing-area.test-fixture';

/** Vertical grow throws are half a slot, so stacks don't sprawl. (The
 *  temporary Circle/Box toggle tested here too was retired on 2026-09-24.) */
describe('DrawingAreaComponent vertical slot', () => {
  describe('grow placement slot', () => {
    function growComponent(): any {
      const c = Object.create(DrawingAreaComponent.prototype) as any;
    wireDrawingAreaCollaborators(c);
      c.grow.keys = {coarse: 's', fine: 'd'};
      c.grow.placement.modifiers = new Set<string>();
      c.grow.origin = {x: 0, y: 0};
      c.grow.placement.position = {x: 0, y: 0};
      c.grow.placement.rough = false;
      c.grow.anchor = null;
      c.grow.redrawGhost = () => {};
      return c;
    }

    // No anchor on the stub, so the slots come from the fallback 120 box:
    // 120 + min(120, max(24, 60)) across, 120 + min(90, max(10, 17)) down.
    it('clears the box plus a horizontal gap', () => {
      const c = growComponent();
      c.grow.placeMove('right');
      expect(c.grow.placement.position).toEqual({x: 180, y: 0});
    });

    it('throws a shorter distance vertically', () => {
      const c = growComponent();
      c.grow.placeMove('down');
      expect(c.grow.placement.position).toEqual({x: 0, y: 137});
    });

    it('shortens the upward throw too', () => {
      const c = growComponent();
      c.grow.placeMove('up');
      expect(c.grow.placement.position).toEqual({x: 0, y: -137});
    });

    it('scales the throw to the anchor it grows from', () => {
      const c = growComponent();
      // A 60px anchor, and the fallback 120 box for the node about to land:
      // half of each is 90, then max(10, 0.14*90) down and max(24, 0.5*90)
      // across.
      c.grow.anchor = {NODE_WIDTH: 60, NODE_HEIGHT: 60};
      c.grow.placeMove('down');
      expect(c.grow.placement.position).toEqual({x: 0, y: 103});
      c.grow.placement.rough = false;
      c.grow.placeMove('right');
      expect(c.grow.placement.position).toEqual({x: 135, y: 0});
    });

    it('uses the same axis split for a held coarse step', () => {
      const c = growComponent();
      c.grow.placement.rough = true;
      c.grow.placement.modifiers = new Set(['s']);
      c.grow.placeMove('down');
      expect(c.grow.placement.position).toEqual({x: 0, y: 137});
    });

    it('leaves the fine step axis-independent', () => {
      const c = growComponent();
      c.grow.placement.rough = true;
      c.grow.placement.modifiers = new Set(['d']);
      c.grow.placeMove('down');
      expect(c.grow.placement.position).toEqual({x: 0, y: 10});
    });
  });
});
