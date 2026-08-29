import {DrawingAreaComponent} from './drawing-area.component';
import {DACommandType} from './command.model';

/** Tap semantics of the a=add / i=insert model
 *  (notes/design-add-insert-model.md): tap-a adds by crosshairs
 *  context, tap-i edits text, v+o cycles selected-edge directedness. */
describe('DrawingAreaComponent add/insert tap semantics', () => {
  function buildComponent(overrides: {
    selectedEdges?: unknown[];
    selectedNodes?: unknown[];
    labelUnderCrosshairs?: unknown;
    nodesUnderCrosshairs?: unknown[];
    waypointUnderCrosshairs?: unknown;
    edgesUnderCrosshairs?: unknown[];
    allNodes?: unknown[];
    defaultNodeShape?: string;
    diagramType?: string;
  } = {}): any {
    const component = Object.create(DrawingAreaComponent.prototype) as any;
    component.log = {log: () => {}};
    component.daOut = jasmine.createSpyObj('daOut', ['emit']);
    component.drawingLayer = {
      getSelectedDAEdges: () => overrides.selectedEdges ?? [],
      getSelectedDANodes: () => overrides.selectedNodes ?? [],
      getDANodes: () => overrides.allNodes ?? [],
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
    component.quickAddSelfLoop = jasmine.createSpy('quickAddSelfLoop');
    component.unselectAllLabels = jasmine.createSpy('unselectAllLabels');
    component.singleItemSelect = jasmine.createSpy('singleItemSelect');
    component.showEditCarets = jasmine.createSpy('showEditCarets');
    component.crosshairsInLayerCoords = () => ({x: 10, y: 20});
    component.addLabel = jasmine.createSpy('addLabel').and.returnValue({});
    component.finishTweens = jasmine.createSpy('finishTweens');
    component.emitStatus = jasmine.createSpy('emitStatus');
    component.undoRedoService = {pushSnapshot: jasmine.createSpy('pushSnapshot')};
    component.crosshairsLayer = {
      hideCrosshairs: jasmine.createSpy('hideCrosshairs'),
      batchDraw: jasmine.createSpy('batchDraw'),
    };
    component.checkAndEmitEditState = jasmine.createSpy('checkAndEmitEditState');
    component.scheduleVaultAutoSave = jasmine.createSpy('scheduleVaultAutoSave');
    component.growMods = new Set<string>();
    component.growPressedKeys = new Set<string>();
    component.growGhostTargets = [];
    component.growInsertionTarget = null;
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

    it('adds a self-loop to the topmost node under the crosshairs', () => {
      const top = {zIndex: () => 2};
      const bottom = {zIndex: () => 1};
      const component = buildComponent({nodesUnderCrosshairs: [bottom, top]});
      component.handleQuickAdd();
      expect(component.quickAddSelfLoop).toHaveBeenCalledWith(top);
      expect(component.createNewNode).not.toHaveBeenCalled();
    });

    it('adds an editable label over an edge', () => {
      const component = buildComponent({edgesUnderCrosshairs: [{}]});
      component.handleQuickAdd();
      expect(component.pushUndoSnapshot).toHaveBeenCalledWith({kind: DACommandType.ADD_LABEL});
      expect(component.addLabel).toHaveBeenCalledOnceWith(false);
      expect(component.showEditCarets).toHaveBeenCalled();
      expect(component.daOut.emit).toHaveBeenCalledWith(
        {kind: 'started-label-editing-mode', mode: 'insert'});
      expect(component.scheduleVaultAutoSave).toHaveBeenCalled();
      expect(component.createNewNode).not.toHaveBeenCalled();
    });

    it('hints instead of adding over a label', () => {
      const component = buildComponent({labelUnderCrosshairs: {}});
      component.handleQuickAdd();
      expect(component.daOut.emit).toHaveBeenCalledWith(
        jasmine.objectContaining({kind: 'status-message'}));
      expect(component.quickAddSelfLoop).not.toHaveBeenCalled();
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

    it('keeps the Edge submenu open when Add is released before its leaf', () => {
      const node = {zIndex: () => 1, label: {text: () => 'A'}, nodeShape: 'box'};
      const component = buildComponent();
      component.growActive = true;
      component.growAnchor = node;
      component.growEdgeMenuActive = true;
      component.growSelfLoopPending = false;
      component.growHoldReleased = false;
      component.growHoldKey = 'a';
      component.growKeys = {
        up: 'k', left: 'h', down: 'j', right: 'l', cycle: 'o', newNode: 'f',
        search: '/', coarse: 's', fine: 'd', edgeSubmenu: 's', selfLoop: 'l',
      };
      component.navPopupOpen = false;
      component.exitGrowMode = jasmine.createSpy('exitGrowMode');
      component.commitGrowSelfLoop = jasmine.createSpy('commitGrowSelfLoop');

      component.handleGrowKeyUp(new KeyboardEvent('keyup', {key: 'a'}));

      expect(component.growHoldReleased).toBeTrue();
      expect(component.exitGrowMode).not.toHaveBeenCalled();

      component.handleGrowKeyDown(new KeyboardEvent('keydown', {key: 'l'}));
      component.handleGrowKeyUp(new KeyboardEvent('keyup', {key: 'l'}));
      expect(component.commitGrowSelfLoop).toHaveBeenCalled();
    });

    it('opens Edge for the sole selected node from blank-canvas grow mode', () => {
      const node = {zIndex: () => 1, label: {text: () => 'A'}, nodeShape: 'box'};
      const component = buildComponent({selectedNodes: [node]});
      component.growActive = true;
      component.growAnchor = null;
      component.growPlacing = false;
      component.growEdgeMenuActive = false;
      component.growKeys = {
        up: 'k', left: 'h', down: 'j', right: 'l', cycle: 'o', newNode: 'f',
        search: '/', coarse: 's', fine: 'd', edgeSubmenu: 's', selfLoop: 'l',
      };
      component.getNodeCenterInLayerCoordinates = () => ({x: 100, y: 200});
      component.buildCurrentGrowGhostTargets = () => [];
      component.growGhost = null;

      component.handleGrowKeyDown(new KeyboardEvent('keydown', {key: 's'}));

      expect(component.growAnchor).toBe(node);
      expect(component.growOrigin).toEqual({x: 100, y: 200});
      expect(component.growEdgeMenuActive).toBeTrue();
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

    it('routes the grow Edge submenu through the same self-loop commit', () => {
      const node = {zIndex: () => 1, label: {text: () => 'A'}, nodeShape: 'box'};
      const component = buildComponent();
      component.growAnchor = node;
      component.growDirState = 0;
      component.exitGrowMode = jasmine.createSpy('exitGrowMode');

      component.commitGrowSelfLoop();

      expect(component.exitGrowMode).toHaveBeenCalled();
      expect(component.quickAddSelfLoop).toHaveBeenCalledWith(node, 0);
    });

    it('captures one undo snapshot when a self-loop is committed', () => {
      const node = {zIndex: () => 1, label: {text: () => 'A'}, nodeShape: 'box'};
      const component = buildComponent();
      component.addSelfEdge = jasmine.createSpy('addSelfEdge');
      component.quickAddSelfLoop = (DrawingAreaComponent.prototype as any)
        .quickAddSelfLoop.bind(component);

      component.quickAddSelfLoop(node);

      expect(component.pushUndoSnapshot).toHaveBeenCalledOnceWith(
        {kind: DACommandType.QUICK_ADD});
      expect(component.addSelfEdge).toHaveBeenCalledWith(node, undefined);
      expect(component.scheduleVaultAutoSave).toHaveBeenCalled();
    });
  });

  describe('grow endpoint navigation', () => {
    it('delegates nodes-only endpoint selection to the active Move by Node engine', () => {
      const anchor = {id: 'anchor'};
      const target = {id: 'target'};
      const component = buildComponent({
        allNodes: [anchor, target],
      });
      component.growAnchor = anchor;
      component.growTarget = null;
      component.graphItemNavigationStrategy = 'adaptive-quadrant-rings';
      component.quadrantNavLast = null;
      component.snapToNodeInDirection = jasmine.createSpy('snapToNodeInDirection')
        .and.callFake(() => {
          component.quadrantNavLast = {id: 'target', kind: 'node'};
        });
      component.redrawGrowGhost = jasmine.createSpy('redrawGrowGhost');
      component.navStopCenter = () => null;
      component.parkGrowCrosshairsOnAnchor = jasmine.createSpy('park');

      component.growHop('right');

      expect(component.snapToNodeInDirection).toHaveBeenCalledWith('right', 'nodes');
      expect(component.growTarget).toBe(target);
      expect(component.redrawGrowGhost).toHaveBeenCalled();
      // The crosshairs stay on the node being grown from (da-448).
      expect(component.parkGrowCrosshairsOnAnchor).toHaveBeenCalled();
    });

    it('lands on insertion ghosts through the same Move by Node result', () => {
      const anchor = {id: 'anchor'};
      const ghost = {id: 'grow-ghost:grid:1:0', x: 400, y: 100, source: 'grid'};
      const component = buildComponent({allNodes: [anchor]});
      component.growAnchor = anchor;
      component.growGhostTargets = [ghost];
      component.graphItemNavigationStrategy = 'adaptive-band-grid';
      component.navGridLast = null;
      component.snapToNodeInDirection = jasmine.createSpy('snapToNodeInDirection')
        .and.callFake(() => {
          component.navGridLast = {id: ghost.id, kind: 'node'};
        });
      component.redrawGrowGhost = jasmine.createSpy('redrawGrowGhost');
      component.navStopCenter = () => null;
      component.parkGrowCrosshairsOnAnchor = jasmine.createSpy('park');

      component.growHop('right');

      expect(component.growTarget).toBeNull();
      expect(component.growInsertionTarget).toBe(ghost);
      expect(component.redrawGrowGhost).toHaveBeenCalled();
    });

    it('turns a pristine release over a node into a self-loop', () => {
      const anchor = {id: 'anchor'};
      const component = buildComponent();
      component.growAnchor = anchor;
      component.growTarget = null;
      component.growInsertionTarget = null;
      component.growDirState = 0;
      component.exitGrowMode = jasmine.createSpy('exitGrowMode');

      component.commitGrowMode();

      expect(component.quickAddSelfLoop).toHaveBeenCalledWith(anchor, 0);
    });

    it('creates and edits a node when an insertion ghost is released', () => {
      const anchor = {id: 'anchor'};
      const ghost = {id: 'grow-ghost:midpoint:a:b', x: 250, y: 300, source: 'midpoint'};
      const component = buildComponent();
      component.growAnchor = anchor;
      component.growInsertionTarget = ghost;
      component.growDirState = 3;
      component.exitGrowMode = jasmine.createSpy('exitGrowMode');
      component.commitGrowInsertion = jasmine.createSpy('commitGrowInsertion');

      component.commitGrowMode();

      expect(component.commitGrowInsertion).toHaveBeenCalledWith(anchor, ghost, 3);
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
