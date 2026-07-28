import {DrawingAreaComponent} from './drawing-area.component';
import {DACommandType} from './command.model';

/** Tap semantics of the a=add / i=insert model
 *  (notes/design-add-insert-model.md): tap-a quick-adds by crosshairs
 *  context, tap-i edits text, v+o cycles selected-edge directedness. */
describe('DrawingAreaComponent add/insert tap semantics', () => {
  function buildComponent(overrides: {
    selectedEdges?: unknown[];
    labelUnderCrosshairs?: unknown;
    nodesUnderCrosshairs?: unknown[];
    waypointUnderCrosshairs?: unknown;
    edgesUnderCrosshairs?: unknown[];
    defaultNodeShape?: string;
    diagramType?: string;
  } = {}): any {
    const component = Object.create(DrawingAreaComponent.prototype) as any;
    component.log = {log: () => {}};
    component.daOut = jasmine.createSpyObj('daOut', ['emit']);
    component.drawingLayer = {
      getSelectedDAEdges: () => overrides.selectedEdges ?? [],
      unselectAll: jasmine.createSpy('unselectAll'),
      batchDraw: jasmine.createSpy('batchDraw'),
      serializeGraph: () => ({nodes: [], edges: []}),
      diagramType: overrides.diagramType ?? 'default',
    };
    component.getLabelUnderCrosshairs = () => overrides.labelUnderCrosshairs ?? null;
    component.getDANodesContainingCrosshairs = () => overrides.nodesUnderCrosshairs ?? [];
    component.getWaypointUnderCrosshairs = () => overrides.waypointUnderCrosshairs ?? undefined;
    component.getDAEdgesContainingCrosshairs = () => overrides.edgesUnderCrosshairs ?? [];
    component._defaultNodeShape = overrides.defaultNodeShape ?? 'box';
    component.pushUndoSnapshot = jasmine.createSpy('pushUndoSnapshot');
    const createdNode = {nodeShape: component._defaultNodeShape};
    component.createNewNode = jasmine.createSpy('createNewNode').and.returnValue(createdNode);
    component.beginNewNodeLabelEdit = jasmine.createSpy('beginNewNodeLabelEdit')
      .and.callFake((node: {nodeShape: string}) => {
        if (node.nodeShape !== 'junction' && node.nodeShape !== 'invisible') {
          component.daOut.emit({kind: 'started-label-editing-mode'});
        }
      });
    component.quickAddConnectedRight = jasmine.createSpy('quickAddConnectedRight');
    component.unselectAllLabels = jasmine.createSpy('unselectAllLabels');
    component.singleItemSelect = jasmine.createSpy('singleItemSelect');
    component.showEditCarets = jasmine.createSpy('showEditCarets');
    component.addLabel = jasmine.createSpy('addLabel');
    component.finishTweens = jasmine.createSpy('finishTweens');
    component.emitStatus = jasmine.createSpy('emitStatus');
    component.undoRedoService = {pushSnapshot: jasmine.createSpy('pushSnapshot')};
    component.crosshairsLayer = {hideCrosshairs: jasmine.createSpy('hideCrosshairs')};
    return component;
  }

  describe('handleQuickAdd (tap a)', () => {
    it('creates a node and enters label edit over blank canvas', () => {
      const component = buildComponent();
      component.handleQuickAdd();
      expect(component.pushUndoSnapshot).toHaveBeenCalledWith({kind: DACommandType.QUICK_ADD});
      expect(component.createNewNode).toHaveBeenCalledWith(undefined, false);
      expect(component.beginNewNodeLabelEdit).toHaveBeenCalled();
      expect(component.daOut.emit).toHaveBeenCalledWith({kind: 'started-label-editing-mode'});
    });

    it('treats a waypoint under the crosshairs as blank canvas', () => {
      const component = buildComponent({waypointUnderCrosshairs: {}, edgesUnderCrosshairs: [{}]});
      component.handleQuickAdd();
      expect(component.createNewNode).toHaveBeenCalled();
    });

    it('quick-adds a connected node right of the topmost node under the crosshairs', () => {
      const top = {zIndex: () => 2};
      const bottom = {zIndex: () => 1};
      const component = buildComponent({nodesUnderCrosshairs: [bottom, top]});
      component.handleQuickAdd();
      expect(component.quickAddConnectedRight).toHaveBeenCalledWith(top);
      expect(component.createNewNode).not.toHaveBeenCalled();
    });

    it('hints instead of adding over an edge', () => {
      const component = buildComponent({edgesUnderCrosshairs: [{}]});
      component.handleQuickAdd();
      expect(component.daOut.emit).toHaveBeenCalledWith(
        jasmine.objectContaining({kind: 'status-message'}));
      expect(component.createNewNode).not.toHaveBeenCalled();
    });

    it('hints instead of adding over a label', () => {
      const component = buildComponent({labelUnderCrosshairs: {}});
      component.handleQuickAdd();
      expect(component.daOut.emit).toHaveBeenCalledWith(
        jasmine.objectContaining({kind: 'status-message'}));
      expect(component.quickAddConnectedRight).not.toHaveBeenCalled();
    });

    it('skips label edit when the default shape is junction', () => {
      const component = buildComponent({defaultNodeShape: 'junction'});
      component.handleQuickAdd();
      expect(component.createNewNode).toHaveBeenCalled();
      expect(component.daOut.emit).not.toHaveBeenCalledWith({kind: 'started-label-editing-mode'});
    });
  });

  describe('connected-add defaults', () => {
    it('starts ordinary connected adds with the configured undirected default', () => {
      const component = buildComponent();
      component._defaultEdgeDirectedness = 'undirected';

      expect(component.defaultGrowDirection({
        nodeShape: 'box',
        tags: [],
      })).toBe(2);
    });

    it('points a new todo task into a category represented by the current circle convention', () => {
      const component = buildComponent({diagramType: 'todo-graph'});
      component._defaultEdgeDirectedness = 'undirected';

      expect(component.defaultGrowDirection({
        nodeShape: 'circle',
        tags: [],
      })).toBe(1);
    });
  });

  describe('editTextAtCrosshairs (tap i)', () => {
    it('edits the node under the crosshairs', () => {
      const component = buildComponent({nodesUnderCrosshairs: [{}]});
      component.editTextAtCrosshairs();
      expect(component.singleItemSelect).toHaveBeenCalled();
      expect(component.showEditCarets).toHaveBeenCalled();
      expect(component.daOut.emit).toHaveBeenCalledWith({kind: 'started-label-editing-mode'});
    });

    it('edits a label under the crosshairs', () => {
      const component = buildComponent({labelUnderCrosshairs: {}});
      component.editTextAtCrosshairs();
      expect(component.singleItemSelect).toHaveBeenCalled();
      expect(component.daOut.emit).toHaveBeenCalledWith({kind: 'started-label-editing-mode'});
    });

    it('selects an edge label and edits it', () => {
      const label = {isSelected: false};
      const edge = {labels: [label]};
      const component = buildComponent({edgesUnderCrosshairs: [edge]});
      component.editTextAtCrosshairs();
      expect(label.isSelected).toBeTrue();
      expect(component.daOut.emit).toHaveBeenCalledWith({kind: 'started-label-editing-mode'});
      expect(component.addLabel).not.toHaveBeenCalled();
    });

    it('creates an empty label on a label-less edge and edits it', () => {
      const edge = {labels: [] as unknown[]};
      const component = buildComponent({edgesUnderCrosshairs: [edge]});
      component.addLabel = jasmine.createSpy('addLabel').and.callFake(() => {
        edge.labels.push({isSelected: true});
      });
      component.editTextAtCrosshairs();
      expect(component.addLabel).toHaveBeenCalled();
      expect(component.daOut.emit).toHaveBeenCalledWith({kind: 'started-label-editing-mode'});
    });

    it('stays put when addLabel fails on the edge', () => {
      const edge = {labels: [] as unknown[]};
      const component = buildComponent({edgesUnderCrosshairs: [edge]});
      component.editTextAtCrosshairs();
      expect(component.daOut.emit).not.toHaveBeenCalledWith({kind: 'started-label-editing-mode'});
    });

    it('hints over blank canvas', () => {
      const component = buildComponent();
      component.editTextAtCrosshairs();
      expect(component.daOut.emit).toHaveBeenCalledWith(
        jasmine.objectContaining({kind: 'status-message'}));
      expect(component.showEditCarets).not.toHaveBeenCalled();
    });
  });

  describe('cycleEdgeDirectedness (v+o)', () => {
    function edgeStub(id = 'e1') {
      return {
        id,
        directedness: 'directed' as string,
        src: 'A',
        dest: 'B',
        reverseDirection() { const s = this.src; this.src = this.dest; this.dest = s; },
      };
    }

    it('cycles forward → reversed → undirected → bidirectional → forward', () => {
      const edge = edgeStub();
      const component = buildComponent({selectedEdges: [edge]});
      component.edgeDirCycle = new Map();

      component.cycleEdgeDirectedness();
      expect(edge.directedness).toBe('directed');
      expect([edge.src, edge.dest]).toEqual(['B', 'A']);  // reversed

      component.cycleEdgeDirectedness();
      expect(edge.directedness).toBe('undirected');
      expect([edge.src, edge.dest]).toEqual(['B', 'A']);  // endpoints untouched

      component.cycleEdgeDirectedness();
      expect(edge.directedness).toBe('bidirectional');

      component.cycleEdgeDirectedness();
      expect(edge.directedness).toBe('directed');
      expect([edge.src, edge.dest]).toEqual(['A', 'B']);  // back where it started
      expect(component.undoRedoService.pushSnapshot).toHaveBeenCalledTimes(4);
    });

    it('re-derives its place in the cycle when the edge changed behind its back', () => {
      const edge = edgeStub();
      const component = buildComponent({selectedEdges: [edge]});
      component.edgeDirCycle = new Map([['e1', 3]]);  // stale: says bidirectional
      // Live state says directed, so the cursor is rebuilt as 'forward' and
      // the press reverses rather than wrapping.
      component.cycleEdgeDirectedness();
      expect(edge.directedness).toBe('directed');
      expect([edge.src, edge.dest]).toEqual(['B', 'A']);
    });

    it('warns when no edge is selected', () => {
      const component = buildComponent();
      component.edgeDirCycle = new Map();
      component.cycleEdgeDirectedness();
      expect(component.daOut.emit).toHaveBeenCalledWith(
        jasmine.objectContaining({kind: 'status-message'}));
      expect(component.undoRedoService.pushSnapshot).not.toHaveBeenCalled();
    });
  });
});
