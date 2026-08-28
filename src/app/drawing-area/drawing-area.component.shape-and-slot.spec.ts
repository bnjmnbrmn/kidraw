import {DrawingAreaComponent} from './drawing-area.component';

/** Two pre-public cleanups:
 *  - the temporary Circle/Box toggle that stands in until shape follows a
 *    tag or class rather than being set per node;
 *  - vertical grow throws being half a slot, so stacks don't sprawl. */
describe('DrawingAreaComponent shape toggle and vertical slot', () => {
  function build(overrides: {
    selectedNodes?: unknown[];
    nodesUnderCrosshairs?: unknown[];
    defaultNodeShape?: string;
  } = {}): any {
    const component = Object.create(DrawingAreaComponent.prototype) as any;
    component.log = {log: () => {}};
    component.daOut = jasmine.createSpyObj('daOut', ['emit']);
    component._defaultNodeShape = overrides.defaultNodeShape ?? 'circle';
    component.drawingLayer = {
      getSelectedDANodes: () => overrides.selectedNodes ?? [],
      changeNodeShape: jasmine.createSpy('changeNodeShape'),
      batchDraw: jasmine.createSpy('batchDraw'),
    };
    component.getDANodesContainingCrosshairs =
      () => overrides.nodesUnderCrosshairs ?? [];
    component.updateEdgePoints = () => {};
    return component;
  }

  const node = (shape: string) =>
    ({nodeShape: shape, zIndex: () => 1, connectedEdges: []});

  describe('toggleNodeShape', () => {
    it('turns a box into a circle', () => {
      const c = build({selectedNodes: [node('box')]});
      c.toggleNodeShape();
      expect(c.drawingLayer.changeNodeShape)
        .toHaveBeenCalledWith(jasmine.anything(), 'circle');
    });

    it('turns a circle into a box', () => {
      const c = build({selectedNodes: [node('circle')]});
      c.toggleNodeShape();
      expect(c.drawingLayer.changeNodeShape)
        .toHaveBeenCalledWith(jasmine.anything(), 'box');
    });

    it('falls back to the node under the crosshairs when nothing is selected', () => {
      const c = build({nodesUnderCrosshairs: [node('box')]});
      c.toggleNodeShape();
      expect(c.drawingLayer.changeNodeShape)
        .toHaveBeenCalledWith(jasmine.anything(), 'circle');
    });

    it('converges a mixed selection on circle rather than splitting it', () => {
      const c = build({selectedNodes: [node('box'), node('circle')]});
      c.toggleNodeShape();
      const shapes = c.drawingLayer.changeNodeShape.calls.allArgs().map((a: unknown[]) => a[1]);
      expect(shapes).toEqual(['circle', 'circle']);
    });

    it('flips the default for new nodes when no node is addressed', () => {
      const c = build({defaultNodeShape: 'circle'});
      c.toggleNodeShape();
      expect(c._defaultNodeShape).toBe('box');
      expect(c.drawingLayer.changeNodeShape).not.toHaveBeenCalled();
    });
  });

  describe('grow placement slot', () => {
    function growComponent(): any {
      const c = Object.create(DrawingAreaComponent.prototype) as any;
      c.growKeys = {coarse: 's', fine: 'd'};
      c.growMods = new Set<string>();
      c.growOrigin = {x: 0, y: 0};
      c.growPlacePos = {x: 0, y: 0};
      c.growPlacedRough = false;
      c.redrawGrowGhost = () => {};
      return c;
    }

    it('throws a full slot horizontally', () => {
      const c = growComponent();
      c.growPlaceMove('right');
      expect(c.growPlacePos).toEqual({x: 300, y: 0});
    });

    it('throws half a slot vertically', () => {
      const c = growComponent();
      c.growPlaceMove('down');
      expect(c.growPlacePos).toEqual({x: 0, y: 150});
    });

    it('halves the upward throw too', () => {
      const c = growComponent();
      c.growPlaceMove('up');
      expect(c.growPlacePos).toEqual({x: 0, y: -150});
    });

    it('uses the same axis split for a held coarse step', () => {
      const c = growComponent();
      c.growPlacedRough = true;
      c.growMods = new Set(['s']);
      c.growPlaceMove('down');
      expect(c.growPlacePos).toEqual({x: 0, y: 150});
    });

    it('leaves the fine step axis-independent', () => {
      const c = growComponent();
      c.growPlacedRough = true;
      c.growMods = new Set(['d']);
      c.growPlaceMove('down');
      expect(c.growPlacePos).toEqual({x: 0, y: 10});
    });
  });
});
