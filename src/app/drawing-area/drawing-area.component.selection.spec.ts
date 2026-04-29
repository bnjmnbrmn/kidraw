import {DrawingAreaComponent} from './drawing-area.component';
import {DALabel} from './da-label';
import {DANode} from './da-node';

describe('DrawingAreaComponent selection priority', () => {
  function buildSelectionTestComponent(): any {
    const component = Object.create(DrawingAreaComponent.prototype) as any;
    component.tweens = [];
    component.drawingLayer = {
      unselectAll: jasmine.createSpy('unselectAll'),
    };
    component.unselectAllLabels = jasmine.createSpy('unselectAllLabels');
    component.getDAEdgesContainingCrosshairs = () => [];
    return component;
  }

  it('should select label before node when a label is under crosshairs', () => {
    const component = buildSelectionTestComponent();
    const label = new DALabel(120, 120, 'label');
    const node = new DANode(50, 50, 'node');

    component.getLabelUnderCrosshairs = () => label;
    component.getDANodesContainingCrosshairs = () => [node];

    component.singleItemSelect();

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

    component.singleItemSelect();

    expect(node.isSelected).toBeTrue();
  });
});
