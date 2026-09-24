import {DrawingAreaComponent} from './drawing-area.component';
import {DALabel} from './da-label';
import {DANode} from './da-node';
import {wireDrawingAreaCollaborators} from './drawing-area.test-fixture';

describe('DrawingAreaComponent selection priority', () => {
  function buildSelectionTestComponent(): any {
    const component = Object.create(DrawingAreaComponent.prototype) as any;
    wireDrawingAreaCollaborators(component);
    component.tweens = [];
    component.drawingLayer = {
      unselectAll: jasmine.createSpy('unselectAll'),
      getDAWaypoints: () => [],
      batchDraw: jasmine.createSpy('batchDraw'),
    };
    component.unselectAllLabels = jasmine.createSpy('unselectAllLabels');
    component.getDAEdgesContainingCrosshairs = () => [];
    component.crosshairsCircleRadiusInLayerCoords = () => 20;
    return component;
  }

  it('should select label before node when a label is under crosshairs', () => {
    const component = buildSelectionTestComponent();
    const label = new DALabel(120, 120, 'label');
    const node = new DANode(50, 50, 'node');

    component.getLabelUnderCrosshairs = () => label;
    component.getDANodesContainingCrosshairs = () => [node];

    component.selectOnlyTopItem();

    expect(component.drawingLayer.unselectAll).toHaveBeenCalled();
    expect(component.unselectAllLabels).toHaveBeenCalled();
    expect(label.isSelected).toBeTrue();
    expect(node.isSelected).toBeFalse();
  });

  it('should select node when no label is under crosshairs', () => {
    const component = buildSelectionTestComponent();
    const node = new DANode(50, 50, 'node');

    component.getLabelUnderCrosshairs = () => null;
    component.getDANodesContainingCrosshairs = () => [node];

    component.selectOnlyTopItem();

    expect(node.isSelected).toBeTrue();
  });

  it('selects the node on top where nodes overlap, the one the hover trace is on', () => {
    const component = buildSelectionTestComponent();
    const under = {isSelected: false, zIndex: () => 0};
    const onTop = {isSelected: false, zIndex: () => 5};
    component.getLabelUnderCrosshairs = () => null;
    component.getDANodesContainingCrosshairs = () => [under, onTop];

    component.selectOnlyTopItem();

    expect(onTop.isSelected).toBeTrue();
    expect(under.isSelected).toBeFalse();
  });

  it('the edit keys take the node under a waypoint within reach, not the waypoint', () => {
    const component = buildSelectionTestComponent();
    const node = {isSelected: false, zIndex: () => 0};
    const waypoint = {isSelected: false};
    component.getLabelUnderCrosshairs = () => null;
    component.getWaypointUnderCrosshairs = () => waypoint;
    component.getDANodesContainingCrosshairs = () => [node];

    component.selectTextUnderCrosshairs();

    expect(node.isSelected).toBeTrue();
    expect(waypoint.isSelected).toBeFalse();
  });
});
