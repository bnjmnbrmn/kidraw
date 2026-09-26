import {CanvasPort, CanvasNode} from '../drawing-area/canvas-port';
import {CanvasChange, CanvasChangeResult} from '../drawing-area/canvas-port';
import {resolveChanges, resolveNodeRef} from './agent-changes';
import {AgentToolHost, executeAgentTool} from './agent-tools';

const NODES: CanvasNode[] = [
  {id: 'n0', label: 'Next', tags: []},
  {id: 'n1', label: 'Pre-MVP', tags: []},
  {id: 'n2', label: 'Which killer features do I need?', tags: ['status/blocked']},
  {id: 'n3', label: 'Killer features', tags: []},
];

describe('resolveNodeRef', () => {
  it('matches an exact id first', () => {
    expect(resolveNodeRef('n2', NODES)).toEqual({node: NODES[2]});
  });

  it('matches an exact label ignoring case', () => {
    expect(resolveNodeRef('pre-mvp', NODES)).toEqual({node: NODES[1]});
  });

  it('matches a unique substring', () => {
    expect(resolveNodeRef('do I need', NODES)).toEqual({node: NODES[2]});
  });

  it('reports ambiguity with candidate ids', () => {
    const result = resolveNodeRef('killer', NODES);
    expect('error' in result).toBeTrue();
    expect((result as {error: string}).error).toContain('n2');
    expect((result as {error: string}).error).toContain('n3');
  });

  it('reports no match', () => {
    const result = resolveNodeRef('zebra', NODES);
    expect((result as {error: string}).error).toContain('No node matches');
  });
});

describe('executeAgentTool', () => {
  let canvas: jasmine.SpyObj<CanvasPort>;
  let host: AgentToolHost;
  let mode: 'following' | 'free';
  let lookHere: CanvasNode | null;
  let captions: {node: CanvasNode; text: string}[];
  let applied: CanvasChange[][];
  let refused: string | null;
  let applyResult: CanvasChangeResult;
  let defined: string[];

  beforeEach(() => {
    canvas = jasmine.createSpyObj<CanvasPort>('canvas', [
      'nodes', 'edges', 'selection', 'visibleNodeIds', 'zoomPercent',
      'focusNode', 'setHighlights', 'nodeClientRect', 'viewClientRect',
      'diagramTypeId', 'applyChanges', 'revertChangeSet',
    ]);
    canvas.diagramTypeId.and.returnValue('explanation');
    canvas.nodes.and.returnValue(NODES);
    canvas.edges.and.returnValue([{id: 'e1', from: 'n0', to: 'n1', labels: [], tags: []}]);
    canvas.focusNode.and.returnValue(true);
    mode = 'following';
    lookHere = null;
    captions = [];
    applied = [];
    refused = null;
    applyResult = {ok: true, created: [{kind: 'node', id: 'da-9', handle: 'h'}], touchedNodeIds: ['da-9']};
    defined = [];
    host = {
      definePlugin: source => {
        if (source.includes('bad')) throw new Error('The plugin was not added:\n- plugin.id: "bad!" is not allowed here');
        defined.push(source);
        return {id: 'kanban', name: 'Kanban'};
      },
      applyChanges: changes => {
        applied.push(changes);
        return Promise.resolve(applyResult);
      },
      editsRefused: () => refused,
      canvas,
      followMode: () => mode,
      focus: node => { canvas.focusNode(node.id); },
      showLookHere: node => { lookHere = node; },
      addCaption: (node, text) => captions.push({node, text}),
      setHighlights: nodes => canvas.setHighlights(nodes.map(n => n.id)),
      clearAnnotations: () => { captions = []; },
    };
  });

  it('adds a plugin the agent wrote, and tells it how the user switches to it', () => {
    const result = executeAgentTool('define_plugin', {source: 'id: kanban\nname: Kanban'}, host);
    expect(defined).toEqual(['id: kanban\nname: Kanban']);
    expect(result).toEqual({added: 'kanban', name: 'Kanban', next: 'Ask the user to run :type kanban to use it on their graph.'});
  });

  it('passes every problem with a plugin back to the agent', () => {
    expect(() => executeAgentTool('define_plugin', {source: 'id: bad!'}, host)).toThrowError(/bad!/);
  });

  it('adds no plugin after the user pressed Stop', () => {
    refused = 'The user stopped you.';
    expect(() => executeAgentTool('define_plugin', {source: 'id: kanban'}, host)).toThrowError(/stopped/);
    expect(defined).toEqual([]);
  });

  it('outlines nodes and edges, omitting empty tags and labels', () => {
    const outline = executeAgentTool('get_outline', {}, host) as {nodes: object[]; edges: object[]};
    expect(outline.nodes[0]).toEqual({id: 'n0', label: 'Next'});
    expect(outline.nodes[2]).toEqual({id: 'n2', label: 'Which killer features do I need?', tags: ['status/blocked']});
    expect(outline.edges).toEqual([{id: 'e1', from: 'n0', to: 'n1'}]);
  });

  it('moves the view when following', () => {
    const result = executeAgentTool('focus', {node: 'Pre-MVP'}, host) as {viewMoved: boolean};
    expect(canvas.focusNode).toHaveBeenCalledWith('n1');
    expect(result.viewMoved).toBeTrue();
  });

  it('shows a look-here hint instead of moving when the user leads', () => {
    mode = 'free';
    const result = executeAgentTool('focus', {node: 'n2'}, host) as {viewMoved: boolean};
    expect(canvas.focusNode).not.toHaveBeenCalled();
    expect(lookHere?.id).toBe('n2');
    expect(result.viewMoved).toBeFalse();
  });

  it('adds a caption and rejects unknown nodes', () => {
    executeAgentTool('caption', {node: 'Next', text: 'Start here'}, host);
    expect(captions).toEqual([{node: NODES[0], text: 'Start here'}]);
    expect(() => executeAgentTool('caption', {node: 'zebra', text: 'x'}, host)).toThrowError(/No node matches/);
  });

  it('highlights what it can resolve and reports the rest', () => {
    const result = executeAgentTool('highlight', {nodes: ['Next', 'zebra']}, host) as {notFound?: string[]};
    expect(canvas.setHighlights).toHaveBeenCalledWith(['n0']);
    expect(result.notFound?.length).toBe(1);
  });

  it('resolves labels to ids in a change batch and keeps handles for new nodes', async () => {
    const result = await executeAgentTool('apply_changes', {changes: [
      {kind: 'add_node', handle: 'h', text: 'A new step', near: 'Next'},
      {kind: 'add_edge', from: 'h', to: 'Pre-MVP', edgeKind: 'supports'},
      {kind: 'update_edge', edge: 'e1', edgeKind: null, tags: ['keep']},
      {kind: 'set_reading_order', nodes: ['Next', 'h', 'Pre-MVP']},
    ]}, host) as {applied: number};
    expect(applied[0]).toEqual([
      {kind: 'add_node', handle: 'h', text: 'A new step', near: 'n0'},
      {kind: 'add_edge', from: 'h', to: 'n1', edgeKind: 'supports'},
      {kind: 'update_edge', edge: 'e1', edgeKind: null, tags: ['keep']},
      {kind: 'set_reading_order', nodes: ['n0', 'h', 'n1']},
    ]);
    expect(result.applied).toBe(4);
  });

  it('refuses edits when the host says so, and passes on the canvas error', async () => {
    refused = 'The user stopped you.';
    expect(() => executeAgentTool('apply_changes', {changes: [{kind: 'delete_node', node: 'Next'}]}, host))
      .toThrowError(/stopped you/);
    refused = null;
    applyResult = {ok: false, error: 'the graph changed', created: [], touchedNodeIds: []};
    await expectAsync(executeAgentTool('apply_changes', {changes: [{kind: 'delete_node', node: 'Next'}]}, host) as Promise<unknown>)
      .toBeRejectedWithError(/the graph changed/);
  });

  it('passes node kinds and arrange through a change batch', () => {
    expect(resolveChanges([
      {kind: 'add_node', text: 'x', nodeKind: 'example'},
      {kind: 'update_node', node: 'Next', nodeKind: null},
      {kind: 'arrange'},
    ], NODES)).toEqual([
      {kind: 'add_node', text: 'x', nodeKind: 'example'},
      {kind: 'update_node', node: 'n0', nodeKind: null},
      {kind: 'arrange'},
    ]);
  });

  it('points at the bad entry in a change batch', () => {
    expect(() => resolveChanges([{kind: 'add_node', text: 'x'}, {kind: 'add_edge', from: 'zebra', to: 'Next'}], NODES))
      .toThrowError(/change 2 from: No node matches "zebra"/);
    expect(() => resolveChanges([], NODES)).toThrowError(/non-empty/);
  });

  it('rejects unknown tools', () => {
    expect(() => executeAgentTool('delete_everything', {}, host)).toThrowError(/Unknown KiDraw tool/);
  });
});
