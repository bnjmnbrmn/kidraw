import {DrawingAreaComponent} from './drawing-area.component';
import {DALabel} from './da-label';
import {DANode} from './da-node';
import {DAWaypoint} from './da-waypoint';

describe('DrawingAreaComponent selection priority', () => {
  function buildSelectionTestComponent(): any {
    const component = Object.create(DrawingAreaComponent.prototype) as any;
    component.tweens = [];
    component.drawingLayer = {
      unselectAll: jasmine.createSpy('unselectAll'),
    };
    component.unselectAllWaypoints = jasmine.createSpy('unselectAllWaypoints');
    component.unselectAllLabels = jasmine.createSpy('unselectAllLabels');
    component.getDAEdgesContainingCrosshairs = () => [];
    return component;
  }

  it('should select waypoint before node in ensureTopItemSelected', () => {
    const component = buildSelectionTestComponent();
    const waypoint = new DAWaypoint(100, 100);
    const node = new DANode(50, 50, 'node');

    component.getWaypointUnderCrosshairs = () => waypoint;
    component.getDANodesContainingCrosshairs = () => [node];

    component.ensureTopItemSelected();

    expect(waypoint.isSelected).toBeTrue();
    expect(node.isSelected).toBeFalse();
  });

  it('should select waypoint before node in singleItemSelect', () => {
    const component = buildSelectionTestComponent();
    const waypoint = new DAWaypoint(100, 100);
    const node = new DANode(50, 50, 'node');

    component.getWaypointUnderCrosshairs = () => waypoint;
    component.getLabelUnderCrosshairs = () => null;
    component.getDANodesContainingCrosshairs = () => [node];

    component.singleItemSelect();

    expect(component.drawingLayer.unselectAll).toHaveBeenCalled();
    expect(component.unselectAllWaypoints).toHaveBeenCalled();
    expect(component.unselectAllLabels).toHaveBeenCalled();
    expect(waypoint.isSelected).toBeTrue();
    expect(node.isSelected).toBeFalse();
  });

  it('should select label before node when no waypoint is under crosshairs', () => {
    const component = buildSelectionTestComponent();
    const label = new DALabel(120, 120, 'label');
    const node = new DANode(50, 50, 'node');

    component.getWaypointUnderCrosshairs = () => null;
    component.getLabelUnderCrosshairs = () => label;
    component.getDANodesContainingCrosshairs = () => [node];

    component.singleItemSelect();

    expect(label.isSelected).toBeTrue();
    expect(node.isSelected).toBeFalse();
  });
});
