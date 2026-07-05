import {DrawingAreaComponent} from './drawing-area.component';
import {DACommandType} from './command.model';

describe('DrawingAreaComponent edit-or-insert (context-sensitive i key)', () => {
  function buildComponent(overrides: {
    selectedNodes?: unknown[];
    selectedEdges?: unknown[];
    selectedWaypoints?: unknown[];
    selectedLabels?: unknown[];
    labelUnderCrosshairs?: unknown;
    nodesUnderCrosshairs?: unknown[];
    waypointUnderCrosshairs?: unknown;
    edgesUnderCrosshairs?: unknown[];
    defaultNodeShape?: string;
  } = {}): any {
    const component = Object.create(DrawingAreaComponent.prototype) as any;
    component.log = {log: () => {}};
    component.daOut = jasmine.createSpyObj('daOut', ['emit']);
    component.drawingLayer = {
      getSelectedDANodes: () => overrides.selectedNodes ?? [],
      getSelectedDAEdges: () => overrides.selectedEdges ?? [],
      getSelectedDAWaypoints: () => overrides.selectedWaypoints ?? [],
      unselectAll: jasmine.createSpy('unselectAll'),
      batchDraw: jasmine.createSpy('batchDraw'),
    };
    component.getSelectedLabels = () => overrides.selectedLabels ?? [];
    component.getLabelUnderCrosshairs = () => overrides.labelUnderCrosshairs ?? null;
    component.getDANodesContainingCrosshairs = () => overrides.nodesUnderCrosshairs ?? [];
    component.getWaypointUnderCrosshairs = () => overrides.waypointUnderCrosshairs ?? undefined;
    component.getDAEdgesContainingCrosshairs = () => overrides.edgesUnderCrosshairs ?? [];
    component._defaultNodeShape = overrides.defaultNodeShape ?? 'box';
    component.pushUndoSnapshot = jasmine.createSpy('pushUndoSnapshot');
    component.createNewNode = jasmine.createSpy('createNewNode');
    component.handleEditSelected = jasmine.createSpy('handleEditSelected');
    component.focusAndReleaseSelectedItem = jasmine.createSpy('focusAndReleaseSelectedItem');
    return component;
  }

  describe('computeEditContext', () => {
    it('reports multi-select for two selected items of any kind', () => {
      const component = buildComponent({selectedNodes: [{}], selectedEdges: [{}]});
      expect(component.computeEditContext()).toBe('multi-select');
    });

    it('reports single-select for one selected item', () => {
      const component = buildComponent({selectedWaypoints: [{}]});
      expect(component.computeEditContext()).toBe('single-select');
    });

    it('reports item for a label under the crosshairs', () => {
      const component = buildComponent({labelUnderCrosshairs: {}});
      expect(component.computeEditContext()).toBe('item');
    });

    it('reports item for a node under the crosshairs', () => {
      const component = buildComponent({nodesUnderCrosshairs: [{}]});
      expect(component.computeEditContext()).toBe('item');
    });

    it('reports empty for a waypoint under the crosshairs, even on an edge', () => {
      const component = buildComponent({waypointUnderCrosshairs: {}, edgesUnderCrosshairs: [{}]});
      expect(component.computeEditContext()).toBe('empty');
    });

    it('reports edge for an edge under the crosshairs', () => {
      const component = buildComponent({edgesUnderCrosshairs: [{}]});
      expect(component.computeEditContext()).toBe('edge');
    });

    it('reports empty over blank canvas', () => {
      const component = buildComponent();
      expect(component.computeEditContext()).toBe('empty');
    });

    it('lets selection win over crosshairs position', () => {
      const component = buildComponent({selectedNodes: [{}], nodesUnderCrosshairs: [{}]});
      expect(component.computeEditContext()).toBe('single-select');
    });
  });

  describe('handleEditOrInsert', () => {
    it('warns and does nothing else with a multi-selection', () => {
      const component = buildComponent({selectedNodes: [{}, {}]});
      component.handleEditOrInsert();
      expect(component.daOut.emit).toHaveBeenCalledWith(
        jasmine.objectContaining({kind: 'status-message'}));
      expect(component.createNewNode).not.toHaveBeenCalled();
      expect(component.handleEditSelected).not.toHaveBeenCalled();
      expect(component.focusAndReleaseSelectedItem).not.toHaveBeenCalled();
    });

    it('focuses and releases a single selected item', () => {
      const component = buildComponent({selectedEdges: [{}]});
      component.handleEditOrInsert();
      expect(component.focusAndReleaseSelectedItem).toHaveBeenCalled();
      expect(component.createNewNode).not.toHaveBeenCalled();
    });

    it('edits the item under the crosshairs', () => {
      const component = buildComponent({nodesUnderCrosshairs: [{}]});
      component.handleEditOrInsert();
      expect(component.handleEditSelected).toHaveBeenCalled();
      expect(component.createNewNode).not.toHaveBeenCalled();
    });

    it('hints at the held-key options over an edge', () => {
      const component = buildComponent({edgesUnderCrosshairs: [{}]});
      component.handleEditOrInsert();
      expect(component.daOut.emit).toHaveBeenCalledWith(
        jasmine.objectContaining({kind: 'status-message'}));
      expect(component.createNewNode).not.toHaveBeenCalled();
      expect(component.handleEditSelected).not.toHaveBeenCalled();
    });

    it('creates a node and enters label edit over blank canvas', () => {
      const component = buildComponent();
      component.handleEditOrInsert();
      expect(component.pushUndoSnapshot).toHaveBeenCalledWith({kind: DACommandType.CREATE_NEW_NODE});
      expect(component.createNewNode).toHaveBeenCalled();
      expect(component.daOut.emit).toHaveBeenCalledWith({kind: 'started-label-editing-mode'});
    });

    it('creates a node but skips label edit when the default shape is junction', () => {
      const component = buildComponent({defaultNodeShape: 'junction'});
      component.handleEditOrInsert();
      expect(component.createNewNode).toHaveBeenCalled();
      expect(component.daOut.emit).not.toHaveBeenCalledWith({kind: 'started-label-editing-mode'});
    });
  });

  describe('focusAndReleaseSelectedItem', () => {
    it('recenters, jumps the crosshairs to the item, and deselects', () => {
      const component = buildComponent();
      delete component.focusAndReleaseSelectedItem; // use the real prototype method
      const calls: string[] = [];
      component.finishTweens = () => calls.push('finishTweens');
      component.recenterView = () => calls.push('recenterView');
      component.selectedItemStagePoint = () => ({x: 300, y: 200});
      component.crosshairsLayer = {crosshairsX: () => 100, crosshairsY: () => 50};
      component.moveCrosshairsBy = jasmine.createSpy('moveCrosshairsBy')
        .and.callFake(() => calls.push('moveCrosshairsBy'));
      component.unselectAllLabels = jasmine.createSpy('unselectAllLabels');
      component.checkAndEmitEditState = jasmine.createSpy('checkAndEmitEditState');

      component.focusAndReleaseSelectedItem();

      expect(component.moveCrosshairsBy).toHaveBeenCalledWith(200, 150);
      expect(calls.indexOf('recenterView')).toBeLessThan(calls.indexOf('moveCrosshairsBy'));
      expect(component.drawingLayer.unselectAll).toHaveBeenCalled();
      expect(component.unselectAllLabels).toHaveBeenCalled();
      expect(component.checkAndEmitEditState).toHaveBeenCalled();
    });
  });

  describe('selectedItemStagePoint', () => {
    it('converts a selected edge path midpoint to stage coordinates', () => {
      const edge = {
        getPathPoints: () => [
          {x: 0, y: 0},
          {x: 100, y: 100},
          {x: 200, y: 0},
        ],
      };
      const component = buildComponent({selectedEdges: [edge]});
      component.drawingLayer.scaleX = () => 2;
      component.drawingLayer.x = () => 10;
      component.drawingLayer.y = () => 20;

      expect(component.selectedItemStagePoint()).toEqual({x: 210, y: 220});
    });
  });
});
