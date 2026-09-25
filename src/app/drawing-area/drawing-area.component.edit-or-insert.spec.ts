import {DrawingAreaComponent} from './drawing-area.component';
import {DACommandType} from './command.model';
import {mutatesGraph} from './command-policy';
import {Overlay} from './overlay';
import {wireDrawingAreaCollaborators} from './drawing-area.test-fixture';

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
    wireDrawingAreaCollaborators(component);
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
    component.style.defaults.nodeShape = overrides.defaultNodeShape ?? 'box';
    component.style.defaults.edgeDirectedness = 'directed';
    component.pushUndoSnapshot = jasmine.createSpy('pushUndoSnapshot');
    const createdNode = {nodeShape: component.style.defaults.nodeShape};
    component.createNewNode = jasmine.createSpy('createNewNode').and.returnValue(createdNode);
    component.labelEdit.beginForNewNode = jasmine.createSpy('beginForNewNode')
      .and.callFake((node: {nodeShape: string}) => {
        if (node.nodeShape !== 'junction' && node.nodeShape !== 'invisible') {
          component.daOut.emit({kind: 'started-label-editing-mode', mode: 'insert'});
        }
      });
    component.quickAddSelfLoop = jasmine.createSpy('quickAddSelfLoop');
    component.unselectAllLabels = jasmine.createSpy('unselectAllLabels');
    component.selectTextUnderCrosshairs = jasmine.createSpy('selectTextUnderCrosshairs');
    component.labelEdit.showCarets = jasmine.createSpy('showCarets');
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
    // Object.create skips field initializers, so this collaborator is absent.
    // A spy, not the real controller: these are unit tests of the component,
    // and the real one would drag in layers this spec never set up.
    component.navGrid = (() => {
      const spy: any = jasmine.createSpyObj('navGrid',
        ['showNodeGrid', 'hideNodeGrid', 'redrawNodeGrid', 'snapToNodeInDirection',
         'jumpCrosshairsToStopCenter', 'setGraphItemNavigationStrategy', 'adoptStop',
         'adjustQuadrantGoalAngle', 'hideQuadrantGoalRay', 'cancelQuadrantGoalRayFade']);
      spy.visible = false;   // plain properties: specs set lastStop from their fakes
      spy.lastStop = null;
      return spy;
    })();
    return component;
  }

  describe('handleQuickAdd (tap a)', () => {
    it('creates a node and enters label edit over blank canvas', () => {
      const component = buildComponent();
      component.handleQuickAdd();
      expect(component.pushUndoSnapshot).toHaveBeenCalledWith({kind: DACommandType.QUICK_ADD});
      expect(component.createNewNode).toHaveBeenCalledWith(undefined, false);
      expect(component.labelEdit.beginForNewNode).toHaveBeenCalled();
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
      expect(component.labelEdit.showCarets).toHaveBeenCalled();
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

      expect(component.style.defaults.edgeDirectedness).toBe('directed');
      expect(component.grow.defaultDirection({nodeShape: 'box', tags: []})).toBe(0);
    });

    it('starts ordinary connected adds with the configured undirected default', () => {
      const component = buildComponent();
      component.style.defaults.edgeDirectedness = 'undirected';

      expect(component.grow.defaultDirection({
        nodeShape: 'box',
        tags: [],
      })).toBe(2);
    });

    it('does not reverse outgoing adds for todo category nodes', () => {
      const component = buildComponent({diagramType: 'todo-graph'});
      component.style.defaults.edgeDirectedness = 'directed';

      expect(component.grow.defaultDirection({
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
      component.grow.active = true;
      component.grow.anchor = node;
      component.grow.edgeMenuActive = false;
      component.grow.holdKey = 'a';
      component.grow.keys = {
        up: 'k', left: 'h', down: 'j', right: 'l', cycle: 'o', newNode: 'f',
        search: '/', coarse: 's', fine: 'd', edgeSubmenu: 's', selfLoop: 'l',
      };
      component.grow.popup.open = false;
      component.grow.commitSelfLoop = jasmine.createSpy('commitGrowSelfLoop');

      component.handleGrowKeyDown(new KeyboardEvent('keydown', {key: 's'}));
      expect(component.grow.edgeMenuActive).toBeTrue();
      expect(component.daOut.emit).toHaveBeenCalledWith(
        {kind: 'popup-state', open: true, surface: 'grow-edge'});

      component.handleGrowKeyDown(new KeyboardEvent('keydown', {key: 'l'}));
      expect(component.grow.commitSelfLoop).not.toHaveBeenCalled();
      component.handleGrowKeyUp(new KeyboardEvent('keyup', {key: 'l'}));
      expect(component.grow.commitSelfLoop).toHaveBeenCalled();
    });

    it('keeps the Edge submenu open when Add is released before its leaf', () => {
      const node = {zIndex: () => 1, label: {text: () => 'A'}, nodeShape: 'box'};
      const component = buildComponent();
      component.grow.active = true;
      component.grow.anchor = node;
      component.grow.edgeMenuActive = true;
      component.grow.selfLoopPending = false;
      component.grow.holdReleased = false;
      component.grow.holdKey = 'a';
      component.grow.keys = {
        up: 'k', left: 'h', down: 'j', right: 'l', cycle: 'o', newNode: 'f',
        search: '/', coarse: 's', fine: 'd', edgeSubmenu: 's', selfLoop: 'l',
      };
      component.grow.popup.open = false;
      component.grow.exit = jasmine.createSpy('exit');
      component.grow.commitSelfLoop = jasmine.createSpy('commitGrowSelfLoop');

      component.handleGrowKeyUp(new KeyboardEvent('keyup', {key: 'a'}));

      expect(component.grow.holdReleased).toBeTrue();
      expect(component.grow.exit).not.toHaveBeenCalled();

      component.handleGrowKeyDown(new KeyboardEvent('keydown', {key: 'l'}));
      component.handleGrowKeyUp(new KeyboardEvent('keyup', {key: 'l'}));
      expect(component.grow.commitSelfLoop).toHaveBeenCalled();
    });

    it('opens Edge for the sole selected node from blank-canvas grow mode', () => {
      const node = {zIndex: () => 1, label: {text: () => 'A'}, nodeShape: 'box'};
      const component = buildComponent({selectedNodes: [node]});
      component.grow.active = true;
      component.grow.anchor = null;
      component.grow.placement.placing = false;
      component.grow.edgeMenuActive = false;
      component.grow.keys = {
        up: 'k', left: 'h', down: 'j', right: 'l', cycle: 'o', newNode: 'f',
        search: '/', coarse: 's', fine: 'd', edgeSubmenu: 's', selfLoop: 'l',
      };
      component.getNodeCenterInLayerCoordinates = () => ({x: 100, y: 200});
      component.grow.buildGhostTargets = () => [];

      component.handleGrowKeyDown(new KeyboardEvent('keydown', {key: 's'}));

      expect(component.grow.anchor).toBe(node);
      expect(component.grow.origin).toEqual({x: 100, y: 200});
      expect(component.grow.edgeMenuActive).toBeTrue();
    });

    it('accepts a Self Loop leaf rolled just before its Edge submenu key', () => {
      const node = {zIndex: () => 1, label: {text: () => 'A'}, nodeShape: 'box'};
      const component = buildComponent();
      component.grow.active = true;
      component.grow.anchor = node;
      component.grow.edgeMenuActive = false;
      component.grow.holdKey = 'a';
      component.grow.keys = {
        up: 'k', left: 'h', down: 'j', right: 'l', cycle: 'o', newNode: 'f',
        search: '/', coarse: 's', fine: 'd', edgeSubmenu: 's', selfLoop: 'l',
      };
      component.grow.popup.open = false;
      component.grow.hop = jasmine.createSpy('growHop');
      component.grow.commitSelfLoop = jasmine.createSpy('commitGrowSelfLoop');

      component.handleGrowKeyDown(new KeyboardEvent('keydown', {key: 'l'}));
      expect(component.grow.hop).toHaveBeenCalledWith('right');
      component.handleGrowKeyDown(new KeyboardEvent('keydown', {key: 's'}));
      expect(component.grow.selfLoopPending).toBeTrue();

      component.handleGrowKeyUp(new KeyboardEvent('keyup', {key: 'l'}));
      expect(component.grow.commitSelfLoop).toHaveBeenCalled();
    });

    it('routes the grow Edge submenu through the same self-loop commit', () => {
      const node = {zIndex: () => 1, label: {text: () => 'A'}, nodeShape: 'box'};
      const component = buildComponent();
      component.grow.anchor = node;
      component.grow.dirState = 0;
      component.grow.exit = jasmine.createSpy('exit');

      component.grow.commitSelfLoop();

      expect(component.grow.exit).toHaveBeenCalled();
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
      component.grow.anchor = anchor;
      component.grow.target = null;
      component.navGrid.lastStop = null;
      component.navGrid.snapToNodeInDirection = jasmine.createSpy('snapToNodeInDirection')
        .and.callFake(() => {
          component.navGrid.lastStop = {id: 'target', kind: 'node'};
        });
      component.grow.redrawGhost = jasmine.createSpy('redrawGrowGhost');
      component.grow.hop('right');

      expect(component.navGrid.snapToNodeInDirection).toHaveBeenCalledWith('right', 'nodes');
      expect(component.grow.target).toBe(target);
      expect(component.grow.redrawGhost).toHaveBeenCalled();
    });

    /** The lattice hop needs a little more of the canvas stubbed than the
     *  engine one: it works in layer coordinates and lands the crosshairs
     *  itself. Cells are 400 across and 100 down, anchored at the origin. */
    const withLattice = (component: any, ghosts: unknown[]) => {
      component.grow.ghostTargets = ghosts;
      component.grow.origin = {x: 0, y: 0};
      component.grow.latticeStep = () => ({x: 400, y: 100});
      component.getNodeCenterInLayerCoordinates = (node: any) => node.center ?? {x: 0, y: 0};
      component.drawingLayer.x = () => 0;
      component.drawingLayer.y = () => 0;
      component.drawingLayer.scaleX = () => 1;
      component.navGrid.hideNodeGrid = jasmine.createSpy('hideNodeGrid');
      component.hideQuadrantGoalRay = jasmine.createSpy('hideQuadrantGoalRay');
      component.navGrid.jumpCrosshairsToStopCenter = jasmine.createSpy('jumpCrosshairsToStopCenter');
      component.grow.redrawGhost = jasmine.createSpy('redrawGrowGhost');
      component.navGrid.snapToNodeInDirection = jasmine.createSpy('snapToNodeInDirection');
      return component;
    };
    const box = (id: string, cx: number, cy: number) =>
      ({id, center: {x: cx, y: cy}, NODE_WIDTH: 120, NODE_HEIGHT: 60});

    it('steps one cell along the lattice, without asking Move by Node', () => {
      const anchor = box('anchor', 0, 0);
      const east = {id: 'grow-ghost:grid:1:0', x: 400, y: 0, source: 'grid'};
      const northEast = {id: 'grow-ghost:grid:1:-1', x: 400, y: -100, source: 'grid'};
      const component = withLattice(buildComponent({allNodes: [anchor]}), [east, northEast]);
      component.grow.anchor = anchor;

      component.grow.hop('right');
      expect(component.grow.insertionTarget).toBe(east);
      expect(component.grow.target).toBeNull();

      // A turn from there is the neighboring cell, not a rethink of the field.
      component.grow.hop('up');
      expect(component.grow.insertionTarget).toBe(northEast);
      expect(component.navGrid.snapToNodeInDirection).not.toHaveBeenCalled();
      expect(component.navGrid.jumpCrosshairsToStopCenter).toHaveBeenCalledTimes(2);
      expect(component.grow.redrawGhost).toHaveBeenCalledTimes(2);
    });

    it('falls through to Move by Node where the lattice has no cell', () => {
      const anchor = box('anchor', 0, 0);
      // Far past the end of the lattice, so it is neither in the way of the
      // next cell nor standing on it.
      const target = box('target', 4000, 0);
      const east = {id: 'grow-ghost:grid:1:0', x: 400, y: 0, source: 'grid'};
      const component = withLattice(
        buildComponent({allNodes: [anchor, target]}), [east]);
      component.grow.anchor = anchor;
      component.navGrid.lastStop = null;
      component.navGrid.snapToNodeInDirection = jasmine.createSpy('snapToNodeInDirection')
        .and.callFake(() => {
          component.navGrid.lastStop = {id: 'target', kind: 'node'};
        });

      component.grow.hop('right');
      expect(component.grow.insertionTarget).toBe(east);

      // Nothing further east on the lattice: the engine takes the next hop and
      // the real node beyond it stays reachable.
      component.grow.hop('right');
      expect(component.navGrid.snapToNodeInDirection).toHaveBeenCalledWith('right', 'nodes');
      expect(component.grow.target).toBe(target);
      expect(component.grow.insertionTarget).toBeNull();
    });

    it('takes an existing node standing between the aim and the next cell', () => {
      const anchor = box('anchor', 0, 0);
      // Off the lattice, half a cell short of the spot beyond it.
      const between = box('between', 200, 0);
      const east = {id: 'grow-ghost:grid:1:0', x: 400, y: 0, source: 'grid'};
      const component = withLattice(
        buildComponent({allNodes: [anchor, between]}), [east]);
      component.grow.anchor = anchor;

      component.grow.hop('right');

      expect(component.grow.target).toBe(between);
      expect(component.grow.insertionTarget).toBeNull();
      expect(component.navGrid.snapToNodeInDirection).not.toHaveBeenCalled();
    });

    it('takes the node a withheld cell is standing on', () => {
      const anchor = box('anchor', 0, 0);
      // On the cell, which is therefore not offered at all.
      const sitting = box('sitting', 400, 0);
      const component = withLattice(
        buildComponent({allNodes: [anchor, sitting]}), []);
      component.grow.anchor = anchor;

      component.grow.hop('right');

      expect(component.grow.target).toBe(sitting);
      expect(component.navGrid.snapToNodeInDirection).not.toHaveBeenCalled();
    });

    it('turns a pristine release over a node into a self-loop', () => {
      const anchor = {id: 'anchor'};
      const component = buildComponent();
      component.grow.anchor = anchor;
      component.grow.target = null;
      component.grow.insertionTarget = null;
      component.grow.dirState = 0;
      component.grow.exit = jasmine.createSpy('exit');

      component.grow.commit();

      expect(component.quickAddSelfLoop).toHaveBeenCalledWith(anchor, 0);
    });

    it('creates and edits a node when an insertion ghost is released', () => {
      const anchor = {id: 'anchor'};
      const ghost = {id: 'grow-ghost:grid:1:1', x: 250, y: 300, source: 'grid'};
      const component = buildComponent();
      component.grow.anchor = anchor;
      component.grow.insertionTarget = ghost;
      component.grow.dirState = 3;
      component.grow.exit = jasmine.createSpy('exit');
      component.grow.addNodeAt = jasmine.createSpy('addNodeAt');

      component.grow.commit();

      expect(component.grow.addNodeAt).toHaveBeenCalledWith(ghost, 'box', anchor, 3);
    });
  });

  describe('labelEdit.editAtCrosshairs (tap i)', () => {
    it('edits the node under the crosshairs', () => {
      const component = buildComponent({nodesUnderCrosshairs: [{}]});
      component.labelEdit.editAtCrosshairs();
      expect(component.selectTextUnderCrosshairs).toHaveBeenCalled();
      expect(component.labelEdit.showCarets).toHaveBeenCalledWith({x: 10, y: 20});
      expect(component.daOut.emit).toHaveBeenCalledWith(
        {kind: 'started-label-editing-mode', mode: 'vimNormal'});
    });

    it('edits a label under the crosshairs', () => {
      const component = buildComponent({labelUnderCrosshairs: {}});
      component.labelEdit.editAtCrosshairs();
      expect(component.selectTextUnderCrosshairs).toHaveBeenCalled();
      expect(component.labelEdit.showCarets).toHaveBeenCalledWith({x: 10, y: 20});
      expect(component.daOut.emit).toHaveBeenCalledWith(
        {kind: 'started-label-editing-mode', mode: 'vimNormal'});
    });

    it('selects an edge label and edits it', () => {
      const label = {isSelected: false};
      const edge = {labels: [label]};
      const component = buildComponent({edgesUnderCrosshairs: [edge]});
      component.labelEdit.editAtCrosshairs();
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
      component.labelEdit.editAtCrosshairs();
      expect(component.addLabel).toHaveBeenCalled();
      expect(component.daOut.emit).toHaveBeenCalledWith(
        {kind: 'started-label-editing-mode', mode: 'insert'});
    });

    it('stays put when addLabel fails on the edge', () => {
      const edge = {labels: [] as unknown[]};
      const component = buildComponent({edgesUnderCrosshairs: [edge]});
      component.labelEdit.editAtCrosshairs();
      expect(component.daOut.emit).not.toHaveBeenCalledWith(
        jasmine.objectContaining({kind: 'started-label-editing-mode'}));
    });

    it('hints over blank canvas', () => {
      const component = buildComponent();
      component.labelEdit.editAtCrosshairs();
      expect(component.daOut.emit).toHaveBeenCalledWith(
        jasmine.objectContaining({kind: 'status-message'}));
      expect(component.labelEdit.showCarets).not.toHaveBeenCalled();
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
      component.style.edgeDirCycle = new Map();

      component.style.cycleEdgeDirectedness();
      expect(edge.directedness).toBe('directed');
      expect([edge.src, edge.dest]).toEqual(['B', 'A']);  // reversed

      component.style.cycleEdgeDirectedness();
      expect(edge.directedness).toBe('undirected');
      expect([edge.src, edge.dest]).toEqual(['B', 'A']);  // endpoints untouched

      component.style.cycleEdgeDirectedness();
      expect(edge.directedness).toBe('bidirectional');

      component.style.cycleEdgeDirectedness();
      expect(edge.directedness).toBe('directed');
      expect([edge.src, edge.dest]).toEqual(['A', 'B']);  // back where it started
      // Each press is one undo step, taken by the command policy before the
      // command runs. Snapshotting here as well gave undo a spare step
      // (tools/qa/undo/one-step-per-change.js).
      expect(mutatesGraph(DACommandType.CYCLE_EDGE_DIRECTEDNESS)).toBeTrue();
      expect(component.undoRedoService.pushSnapshot).not.toHaveBeenCalled();
    });

    it('re-derives its place in the cycle when the edge changed behind its back', () => {
      const edge = edgeStub();
      const component = buildComponent({selectedEdges: [edge]});
      component.style.edgeDirCycle = new Map([['e1', 3]]);  // stale: says bidirectional
      // Live state says directed, so the cursor is rebuilt as 'forward' and
      // the press reverses rather than wrapping.
      component.style.cycleEdgeDirectedness();
      expect(edge.directedness).toBe('directed');
      expect([edge.src, edge.dest]).toEqual(['B', 'A']);
    });

    it('warns when no edge is selected', () => {
      const component = buildComponent();
      component.style.edgeDirCycle = new Map();
      component.style.cycleEdgeDirectedness();
      expect(component.emitStatus).toHaveBeenCalledWith(jasmine.stringContaining('Select an edge'));
      expect(component.undoRedoService.pushSnapshot).not.toHaveBeenCalled();
    });
  });
});
