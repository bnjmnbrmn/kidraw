import { Axis } from './axis';
import { KeyboardDrag, KeyboardDragHost } from './keyboard-drag';

/** A selection of labels, waypoints and edges on a grid of 20 (sub-grid 5).
 *  Node drags tween over animation frames and are left to the browser tests
 *  (tools/qa/drag-and-grow/coarse-drag.js). */
function setUp(selection: {labels?: object[]; waypoints?: object[]; edges?: object[]} = {}) {
  const moveWaypoint = jasmine.createSpy('moveWaypoint');
  const dragLabelToward = jasmine.createSpy('dragLabelToward');
  const animations = jasmine.createSpyObj('animations', ['cancelFrame', 'finishAll', 'trackFrame']);
  const host = {
    drawingLayer: {
      getSelectedDANodes: () => [],
      getSelectedDAEdges: () => selection.edges ?? [],
      getSelectedDAWaypoints: () => selection.waypoints ?? [],
      findEdgeForWaypoint: () => ({moveWaypoint}),
      getGridSpacing: () => 20,
      getSubGridSpacing: () => 5,
      unselectAll: jasmine.createSpy('unselectAll'),
      batchDraw: () => undefined,
    },
    animations,
    crosshairsInLayerCoords: () => ({x: 50, y: 50}),
    edgesUnderCrosshairs: () => selection.edges ?? [],
    findSnapOnEdge: () => ({point: {x: 50, y: 50}, segmentIndex: 0}),
    getSelectedLabels: () => selection.labels ?? [],
    getEdgeForLabel: () => ({dragLabelToward}),
    unselectAllLabels: jasmine.createSpy('unselectAllLabels'),
  } as unknown as KeyboardDragHost;
  return {drag: new KeyboardDrag(host), host, moveWaypoint, dragLabelToward, animations};
}

describe('KeyboardDrag', () => {
  it('moves a waypoint one grid step, a sub-grid step when fine, ten when coarse', () => {
    const waypoint = {};
    const {drag, moveWaypoint} = setUp({waypoints: [waypoint]});
    drag.step(Axis.X, 1);
    drag.step(Axis.Y, -1, 'fine');
    drag.step(Axis.X, -1, 'coarse');
    expect(moveWaypoint.calls.allArgs()).toEqual([[waypoint, 20, 0], [waypoint, 0, -5], [waypoint, -200, 0]]);
  });

  it('slides a label along its own edge, by the grid spacing', () => {
    const label = {};
    const {drag, dragLabelToward} = setUp({labels: [label]});
    drag.step(Axis.Y, 1);
    drag.step(Axis.X, -1, 'coarse');
    expect(dragLabelToward.calls.allArgs()).toEqual([
      [label, {x: 0, y: 1}, 20, false],
      [label, {x: -1, y: 0}, 20, true],
    ]);
  });

  it('grows a waypoint under the crosshairs when an edge is selected alone, and moves that', () => {
    const grown = {isSelected: false};
    const edge = {isSelected: true, insertWaypointAt: jasmine.createSpy('insertWaypointAt').and.returnValue(grown)};
    const {drag, host, moveWaypoint} = setUp({edges: [edge]});
    drag.step(Axis.X, 1);
    expect(edge.insertWaypointAt).toHaveBeenCalledOnceWith({x: 50, y: 50}, 0);
    expect(host.drawingLayer.unselectAll).toHaveBeenCalled();
    expect(grown.isSelected).toBeTrue();
    expect(moveWaypoint).toHaveBeenCalledOnceWith(grown, 20, 0);
  });

  it('settles whatever was still moving before it moves anything', () => {
    const {drag, animations, moveWaypoint} = setUp({waypoints: [{}]});
    moveWaypoint.and.callFake(() => {
      expect(animations.cancelFrame).toHaveBeenCalled();
      expect(animations.finishAll).toHaveBeenCalled();
    });
    drag.step(Axis.X, 1);
    expect(moveWaypoint).toHaveBeenCalled();
  });
});
