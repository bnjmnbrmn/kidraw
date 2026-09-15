import {AgentCanvasTarget, AgentNodeInfo} from './agent-canvas';
import {AgentToolHost, executeAgentTool, resolveNodeRef} from './agent-tools';

const NODES: AgentNodeInfo[] = [
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
  let canvas: jasmine.SpyObj<AgentCanvasTarget>;
  let host: AgentToolHost;
  let mode: 'following' | 'free';
  let lookHere: AgentNodeInfo | null;
  let captions: {node: AgentNodeInfo; text: string}[];

  beforeEach(() => {
    canvas = jasmine.createSpyObj<AgentCanvasTarget>('canvas', [
      'agentNodes', 'agentEdges', 'agentSelection', 'agentVisibleNodeIds', 'agentZoomPercent',
      'agentFocusNode', 'agentSetHighlights', 'agentNodeClientRect', 'agentViewClientRect',
    ]);
    canvas.agentNodes.and.returnValue(NODES);
    canvas.agentEdges.and.returnValue([{id: 'e1', from: 'n0', to: 'n1', labels: [], tags: []}]);
    canvas.agentFocusNode.and.returnValue(true);
    mode = 'following';
    lookHere = null;
    captions = [];
    host = {
      canvas,
      followMode: () => mode,
      showLookHere: node => { lookHere = node; },
      addCaption: (node, text) => captions.push({node, text}),
      setHighlights: nodes => canvas.agentSetHighlights(nodes.map(n => n.id)),
      clearAnnotations: () => { captions = []; },
    };
  });

  it('outlines nodes and edges, omitting empty tags and labels', () => {
    const outline = executeAgentTool('get_outline', {}, host) as {nodes: object[]; edges: object[]};
    expect(outline.nodes[0]).toEqual({id: 'n0', label: 'Next'});
    expect(outline.nodes[2]).toEqual({id: 'n2', label: 'Which killer features do I need?', tags: ['status/blocked']});
    expect(outline.edges).toEqual([{id: 'e1', from: 'n0', to: 'n1'}]);
  });

  it('moves the view when following', () => {
    const result = executeAgentTool('focus', {node: 'Pre-MVP'}, host) as {viewMoved: boolean};
    expect(canvas.agentFocusNode).toHaveBeenCalledWith('n1');
    expect(result.viewMoved).toBeTrue();
  });

  it('shows a look-here hint instead of moving when the user leads', () => {
    mode = 'free';
    const result = executeAgentTool('focus', {node: 'n2'}, host) as {viewMoved: boolean};
    expect(canvas.agentFocusNode).not.toHaveBeenCalled();
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
    expect(canvas.agentSetHighlights).toHaveBeenCalledWith(['n0']);
    expect(result.notFound?.length).toBe(1);
  });

  it('rejects unknown tools', () => {
    expect(() => executeAgentTool('delete_everything', {}, host)).toThrowError(/Unknown KiDraw tool/);
  });
});
