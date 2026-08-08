import {DrawingAreaComponent} from './drawing-area.component';
import {DACommandType} from './command.model';

/** Tap semantics of the a=add / i=insert model
 *  (notes/design-add-insert-model.md): tap-a quick-adds by crosshairs
 *  context, tap-i edits text, v+o cycles selected-edge directedness. */
describe('DrawingAreaComponent add/insert tap semantics', () => {
  function buildComponent(overrides: {
    selectedEdges?: unknown[];
    selectedNodes?: unknown[];
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
      getSelectedDANodes: () => overrides.selectedNodes ?? [],
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
    component._defaultEdgeDirectedness = 'directed';
    component.pushUndoSnapshot = jasmine.createSpy('pushUndoSnapshot');
    const createdNode = {nodeShape: component._defaultNodeShape};
    component.createNewNode = jasmine.createSpy('createNewNode').and.returnValue(createdNode);
    component.beginNewNodeLabelEdit = jasmine.createSpy('beginNewNodeLabelEdit')
      .and.callFake((node: {nodeShape: string}) => {
        if (node.nodeShape !== 'junction' && node.nodeShape !== 'invisible') {
          component.daOut.emit({kind: 'started-label-editing-mode', mode: 'insert'});
        }
      });
    component.quickAddConnectedRight = jasmine.createSpy('quickAddConnectedRight');
    component.unselectAllLabels = jasmine.createSpy('unselectAllLabels');
    component.singleItemSelect = jasmine.createSpy('singleItemSelect');
    component.showEditCarets = jasmine.createSpy('showEditCarets');
    component.crosshairsInLayerCoords = () => ({x: 10, y: 20});
    component.addLabel = jasmine.createSpy('addLabel');
    component.finishTweens = jasmine.createSpy('finishTweens');
    component.emitStatus = jasmine.createSpy('emitStatus');
    component.undoRedoService = {pushSnapshot: jasmine.createSpy('pushSnapshot')};
    component.crosshairsLayer = {hideCrosshairs: jasmine.createSpy('hideCrosshairs')};
    component.checkAndEmitEditState = jasmine.createSpy('checkAndEmitEditState');
    component.scheduleVaultAutoSave = jasmine.createSpy('scheduleVaultAutoSave');
    component.growMods = new Set<string>();
    component.growPressedKeys = new Set<string>();
    return component;
  }

  describe('handleQuickAdd (tap a)', () => {
    it('creates a node and enters label edit over blank canvas', () => {
      const component = buildComponent();
      component.handleQuickAdd();
      expect(component.pushUndoSnapshot).toHaveBeenCalledWith({kind: DACommandType.QUICK_ADD});
      expect(component.createNewNode).toHaveBeenCalledWith(undefined, false);
      expect(component.beginNewNodeLabelEdit).toHaveBeenCalled();
      expect(component.daOut.emit).toHaveBeenCalledWith({kind: 'started-label-editing-mode', mode: 'insert'});
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
      expect(component.daOut.emit).not.toHaveBeenCalledWith(
        jasmine.objectContaining({kind: 'started-label-editing-mode'}));
    });
  });

  describe('connected-add defaults', () => {
    it('starts connected adds as outgoing directed edges by default', () => {
      const component = buildComponent();

      expect(component._defaultEdgeDirectedness).toBe('directed');
      expect(component.defaultGrowDirection({nodeShape: 'box', tags: []})).toBe(0);
    });

    it('starts ordinary connected adds with the configured undirected default', () => {
      const component = buildComponent();
      component._defaultEdgeDirectedness = 'undirected';

      expect(component.defaultGrowDirection({
        nodeShape: 'box',
        tags: [],
      })).toBe(2);
    });

    it('does not reverse outgoing adds for todo category nodes', () => {
      const component = buildComponent({diagramType: 'todo-graph'});
      component._defaultEdgeDirectedness = 'directed';

      expect(component.defaultGrowDirection({
        nodeShape: 'circle',
        tags: [],
      })).toBe(0);
    });
  });

  describe('self-loop add', () => {
    it('adds the default edge from the hovered node back to itself', () => {
      const node = {zIndex: () => 1, label: {text: () => 'A'}, nodeShape: 'box'};
      const component = buildComponent({nodesUnderCrosshairs: [node]});
      const edge = {};
      component.addDefaultEdge = jasmine.createSpy('addDefaultEdge').and.returnValue(edge);

      expect(component.addSelfEdge()).toBe(edge);
      expect(component.addDefaultEdge).toHaveBeenCalledWith(node, node);
      expect(component.drawingLayer.batchDraw).toHaveBeenCalled();
      expect(component.emitStatus).toHaveBeenCalledWith('Self loop added to A');
    });

    it('falls back to the sole selected node', () => {
      const node = {zIndex: () => 1, label: {text: () => ''}, nodeShape: 'circle'};
      const component = buildComponent({selectedNodes: [node]});
      component.addDefaultEdge = jasmine.createSpy('addDefaultEdge').and.returnValue({});

      component.addSelfEdge();

      expect(component.addDefaultEdge).toHaveBeenCalledWith(node, node);
    });

    it('opens Add > Edge from grow targeting and commits Self Loop', () => {
      const node = {zIndex: () => 1, label: {text: () => 'A'}, nodeShape: 'box'};
      const component = buildComponent();
      component.growActive = true;
      component.growAnchor = node;
      component.growEdgeMenuActive = false;
      component.growHoldKey = 'a';
      component.growKeys = {
        up: 'k', left: 'h', down: 'j', right: 'l', cycle: 'o', newNode: 'f',
        search: '/', coarse: 's', fine: 'd', edgeSubmenu: 's', selfLoop: 'l',
      };
      component.growGhost = null;
      component.navPopupOpen = false;
      component.commitGrowSelfLoop = jasmine.createSpy('commitGrowSelfLoop');

      component.handleGrowKeyDown(new KeyboardEvent('keydown', {key: 's'}));
      expect(component.growEdgeMenuActive).toBeTrue();
      expect(component.daOut.emit).toHaveBeenCalledWith(
        {kind: 'popup-state', open: true, surface: 'grow-edge'});

      component.handleGrowKeyDown(new KeyboardEvent('keydown', {key: 'l'}));
      expect(component.commitGrowSelfLoop).not.toHaveBeenCalled();
      component.handleGrowKeyUp(new KeyboardEvent('keyup', {key: 'l'}));
      expect(component.commitGrowSelfLoop).toHaveBeenCalled();
    });

    it('accepts a Self Loop leaf rolled just before its Edge submenu key', () => {
      const node = {zIndex: () => 1, label: {text: () => 'A'}, nodeShape: 'box'};
      const component = buildComponent();
      component.growActive = true;
      component.growAnchor = node;
      component.growEdgeMenuActive = false;
      component.growHoldKey = 'a';
      component.growKeys = {
        up: 'k', left: 'h', down: 'j', right: 'l', cycle: 'o', newNode: 'f',
        search: '/', coarse: 's', fine: 'd', edgeSubmenu: 's', selfLoop: 'l',
      };
      component.growGhost = null;
      component.navPopupOpen = false;
      component.growHop = jasmine.createSpy('growHop');
      component.commitGrowSelfLoop = jasmine.createSpy('commitGrowSelfLoop');

      component.handleGrowKeyDown(new KeyboardEvent('keydown', {key: 'l'}));
      expect(component.growHop).toHaveBeenCalledWith('right');
      component.handleGrowKeyDown(new KeyboardEvent('keydown', {key: 's'}));
      expect(component.growSelfLoopPending).toBeTrue();

      component.handleGrowKeyUp(new KeyboardEvent('keyup', {key: 'l'}));
      expect(component.commitGrowSelfLoop).toHaveBeenCalled();
    });

    it('captures one undo snapshot when the grow Edge submenu commits', () => {
      const node = {zIndex: () => 1, label: {text: () => 'A'}, nodeShape: 'box'};
      const component = buildComponent();
      component.growAnchor = node;
      component.exitGrowMode = jasmine.createSpy('exitGrowMode');
      component.addSelfEdge = jasmine.createSpy('addSelfEdge');

      component.commitGrowSelfLoop();

      expect(component.exitGrowMode).toHaveBeenCalled();
      expect(component.undoRedoService.pushSnapshot).toHaveBeenCalledTimes(1);
      expect(component.addSelfEdge).toHaveBeenCalledWith(node);
      expect(component.scheduleVaultAutoSave).toHaveBeenCalled();
    });
  });

  describe('editTextAtCrosshairs (tap i)', () => {
    it('edits the node under the crosshairs', () => {
      const component = buildComponent({nodesUnderCrosshairs: [{}]});
      component.editTextAtCrosshairs();
      expect(component.singleItemSelect).toHaveBeenCalled();
      expect(component.showEditCarets).toHaveBeenCalledWith({x: 10, y: 20});
      expect(component.daOut.emit).toHaveBeenCalledWith(
        {kind: 'started-label-editing-mode', mode: 'vimNormal'});
    });

    it('edits a label under the crosshairs', () => {
      const component = buildComponent({labelUnderCrosshairs: {}});
      component.editTextAtCrosshairs();
      expect(component.singleItemSelect).toHaveBeenCalled();
      expect(component.showEditCarets).toHaveBeenCalledWith({x: 10, y: 20});
      expect(component.daOut.emit).toHaveBeenCalledWith(
        {kind: 'started-label-editing-mode', mode: 'vimNormal'});
    });

    it('selects an edge label and edits it', () => {
      const label = {isSelected: false};
      const edge = {labels: [label]};
      const component = buildComponent({edgesUnderCrosshairs: [edge]});
      component.editTextAtCrosshairs();
      expect(label.isSelected).toBeTrue();
      expect(component.daOut.emit).toHaveBeenCalledWith(
        {kind: 'started-label-editing-mode', mode: 'vimNormal'});
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
      expect(component.daOut.emit).toHaveBeenCalledWith(
        {kind: 'started-label-editing-mode', mode: 'insert'});
    });

    it('stays put when addLabel fails on the edge', () => {
      const edge = {labels: [] as unknown[]};
      const component = buildComponent({edgesUnderCrosshairs: [edge]});
      component.editTextAtCrosshairs();
      expect(component.daOut.emit).not.toHaveBeenCalledWith(
        jasmine.objectContaining({kind: 'started-label-editing-mode'}));
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
