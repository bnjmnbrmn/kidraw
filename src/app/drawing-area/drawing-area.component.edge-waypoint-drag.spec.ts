import {DrawingAreaComponent} from './drawing-area.component';

describe('DrawingAreaComponent edge waypoint drag', () => {
  it('turns the selected edge under v into a waypoint on the first drag step', () => {
    const component = Object.create(DrawingAreaComponent.prototype) as any;
    const waypoint = {isSelected: false};
    const edge = {
      isSelected: true,
      zIndex: () => 2,
      getPathPoints: () => [{x: 0, y: 0}, {x: 100, y: 0}],
      insertWaypointAt: jasmine.createSpy('insertWaypointAt').and.returnValue(waypoint),
      moveWaypoint: jasmine.createSpy('moveWaypoint'),
    };

    component.cancelDragAnimation = jasmine.createSpy('cancelDragAnimation');
    component.finishTweens = jasmine.createSpy('finishTweens');
    component.getSelectedLabels = () => [];
    component.getDAEdgesContainingCrosshairs = () => [edge];
    component.crosshairsInLayerCoords = () => ({x: 50, y: 18});
    component.unselectAllLabels = jasmine.createSpy('unselectAllLabels');
    component.drawingLayer = {
      getSelectedDANodes: () => [],
      getSelectedDAWaypoints: () => [],
      getSelectedDAEdges: () => [edge],
      unselectAll: jasmine.createSpy('unselectAll'),
      getGridSpacing: () => 50,
      getSubGridSpacing: () => 5,
      findEdgeForWaypoint: () => edge,
      batchDraw: jasmine.createSpy('batchDraw'),
    };

    component.dragSelected('x', 1);

    expect(edge.insertWaypointAt).toHaveBeenCalledWith({x: 50, y: 0}, 0);
    expect(component.drawingLayer.unselectAll).toHaveBeenCalled();
    expect(waypoint.isSelected).toBeTrue();
    expect(edge.moveWaypoint).toHaveBeenCalledWith(waypoint, 50, 0);
  });
});
