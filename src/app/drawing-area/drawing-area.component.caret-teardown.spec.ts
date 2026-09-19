import {DrawingAreaComponent} from './drawing-area.component';
import {wireDrawingAreaCollaborators} from './drawing-area.test-fixture';

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
    wireDrawingAreaCollaborators(component);
    component.log = {log: () => {}};
    const edge = {labels};
    component.drawingLayer = {
      getDANodes: () => nodes,
      getSelectedDANodes: () => nodes.filter((n: any) => n.isSelected),
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
    component.newNodeArrivedByLink = false;
    component.getDANodesContainingCrosshairs = () => [];
    component.getLabelUnderCrosshairs = () => undefined;
    component.getNodeCenterInLayerCoordinates = () => ({x: 10, y: 20});
    component.parkCrosshairsAt = jasmine.createSpy('parkCrosshairsAt');
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

  // Keeping the caret in view pans the graph under the hidden crosshairs; the
  // edit key must still find the node afterwards.
  it('puts the crosshairs back on the edited node when they ended up off it', () => {
    const node = fakeItem(true);
    const component = buildComponent([node], []);

    component.exitLabelEditMode();

    expect(component.parkCrosshairsAt).toHaveBeenCalledWith({x: 10, y: 20});
  });

  it('leaves the crosshairs alone when they are still on the edited node', () => {
    const node = fakeItem(true);
    const component = buildComponent([node], []);
    component.getDANodesContainingCrosshairs = () => [node];

    component.exitLabelEditMode();

    expect(component.parkCrosshairsAt).not.toHaveBeenCalled();
  });
});
