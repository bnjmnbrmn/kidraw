import { DACommandType } from './command.model';
import { LayoutController, LayoutHost } from './layout-controller';

/** Layouts and routing themselves run in the browser tests
 *  (tools/qa/edges/layout-routing.js, layout-clear.js): the routing needs its
 *  Web Worker. */
describe('LayoutController', () => {
  it('takes Apply Layout and Apply Edge Routing from the command table', () => {
    const layout = new LayoutController({} as LayoutHost);
    const apply = spyOn(layout, 'applyLayout');
    const route = spyOn(layout, 'applyEdgeRouting');
    const commands = layout.commands();
    commands[DACommandType.APPLY_LAYOUT]({kind: DACommandType.APPLY_LAYOUT, layout: 'grid'});
    commands[DACommandType.APPLY_EDGE_ROUTING]({kind: DACommandType.APPLY_EDGE_ROUTING, algorithm: 'desiderata'});
    expect(apply).toHaveBeenCalledWith('grid');
    expect(route).toHaveBeenCalledWith('desiderata');
  });

  it('is not running until a routing pass starts, and stopping when idle is harmless', () => {
    const layout = new LayoutController({} as LayoutHost);
    expect(layout.running).toBeFalse();
    layout.stop();
    expect(layout.running).toBeFalse();
  });

  it('re-routing the edges of nodes that have none touches nothing', () => {
    const batchDraw = jasmine.createSpy('batchDraw');
    const layout = new LayoutController({drawingLayer: {batchDraw}} as unknown as LayoutHost);
    layout.rerouteIncidentEdges([{connectedEdges: []} as never]);
    expect(batchDraw).not.toHaveBeenCalled();
  });
});
