import {DrawingAreaComponent} from './drawing-area.component';

/** Leaving label-edit mode must stop every caret, not just the ones on
 *  selected items.
 *
 *  A node is given a caret before selection settles -- beginNewNodeLabelEdit
 *  shows one on a freshly created node that is not selected yet -- so a
 *  teardown keyed off the selection left that node's blink interval running
 *  for the rest of the session, painting a caret on a node nobody was
 *  editing. */
describe('DrawingAreaComponent caret teardown', () => {
  function fakeItem(selected: boolean) {
    return {
      isSelected: selected,
      label: 'text',
      hideCursor: jasmine.createSpy('hideCursor'),
    };
  }

  function buildComponent(nodes: unknown[], labels: unknown[]): any {
    const component = Object.create(DrawingAreaComponent.prototype) as any;
    component.log = {log: () => {}};
    const edge = {labels};
    component.drawingLayer = {
      getDANodes: () => nodes,
      getDAEdges: () => [edge],
      unselectAll: jasmine.createSpy('unselectAll'),
      batchDraw: jasmine.createSpy('batchDraw'),
    };
    component.crosshairsLayer = {
      showCrosshairs: jasmine.createSpy('showCrosshairs'),
    };
    component.finishTweens = jasmine.createSpy('finishTweens');
    component.clearLabelEditGhost = jasmine.createSpy('clearLabelEditGhost');
    component.unselectAllLabels = jasmine.createSpy('unselectAllLabels');
    component.getEdgesContainingLabel = () => [];
    component.newNodeEdgeFocus = null;
    return component;
  }

  it('stops the caret on nodes that are not selected', () => {
    const selectedNode = fakeItem(true);
    const unselectedNode = fakeItem(false);
    const component = buildComponent([selectedNode, unselectedNode], []);

    component.exitLabelEditMode();

    expect(selectedNode.hideCursor).toHaveBeenCalled();
    // The regression: this one used to keep blinking forever.
    expect(unselectedNode.hideCursor).toHaveBeenCalled();
  });

  it('stops the caret on labels that are not selected', () => {
    const selectedLabel = fakeItem(true);
    const unselectedLabel = fakeItem(false);
    const component = buildComponent([], [selectedLabel, unselectedLabel]);

    component.exitLabelEditMode();

    expect(selectedLabel.hideCursor).toHaveBeenCalled();
    expect(unselectedLabel.hideCursor).toHaveBeenCalled();
  });
});
