import type {AgentCanvasTarget, AgentEdgeInfo, AgentNodeInfo} from '../agent/agent-canvas';
import {
  EXPLANATION_ASSUMPTION_TAG, EXPLANATION_DEFINITION_TAG, EXPLANATION_DOESNT_FOLLOW_TAG, EXPLANATION_EXAMPLE_TAG,
  EXPLANATION_SUPPORTS_TAG,
  EXPLANATION_TOO_DETAILED_TAG,
} from '../extensions/explanation.extension';
import {ReadingModeService} from './reading-mode.service';

const node = (id: string, label: string, ...steps: number[]): AgentNodeInfo =>
  ({id, label, tags: steps.map(step => `step/${step}`)});
const supports = (id: string, from: string, to: string): AgentEdgeInfo =>
  ({id, from, to, labels: [], tags: [EXPLANATION_SUPPORTS_TAG]});

describe('ReadingModeService', () => {
  let nodes: AgentNodeInfo[];
  let edges: AgentEdgeInfo[];
  let selection: {nodeIds: string[]; edgeIds: string[]; underCrosshairsId: string | null};
  let canvas: jasmine.SpyObj<AgentCanvasTarget>;
  let said: string[];
  let reading: ReadingModeService;

  beforeEach(() => {
    nodes = [node('a', 'All men are mortal', 1), node('b', 'Socrates is a man', 2), node('c', 'Socrates is mortal', 3)];
    edges = [supports('s1', 'a', 'c'), supports('s2', 'b', 'c')];
    selection = {nodeIds: [], edgeIds: [], underCrosshairsId: null};
    canvas = jasmine.createSpyObj<AgentCanvasTarget>('canvas',
      ['agentNodes', 'agentEdges', 'agentSelection', 'agentFocusNode', 'agentSetHighlights', 'agentApplyChanges']);
    canvas.agentNodes.and.callFake(() => nodes);
    canvas.agentEdges.and.callFake(() => edges);
    canvas.agentSelection.and.callFake(() => selection);
    canvas.agentFocusNode.and.returnValue(true);
    canvas.agentApplyChanges.and.resolveTo({ok: true, created: [], touchedNodeIds: []});
    said = [];
    reading = new ReadingModeService();
    reading.attach(canvas, text => said.push(text));
  });

  it('refuses to start when no statement has a step number', () => {
    nodes = nodes.map(n => ({...n, tags: []}));
    expect(reading.enter()).toBeFalse();
    expect(reading.active()).toBeFalse();
    expect(said[0]).toContain('No reading order');
  });

  it('starts at the beginning, steps in order and stops at both ends', () => {
    expect(reading.enter()).toBeTrue();
    expect(said.pop()).toBe('Step 1 of 3: All men are mortal');
    expect(canvas.agentFocusNode).toHaveBeenCalledWith('a');
    reading.previous();
    expect(said.pop()).toBe('This is the first step');
    reading.next();
    reading.next();
    expect(said.pop()).toBe('Step 3 of 3: Socrates is mortal');
    expect(canvas.agentSetHighlights).toHaveBeenCalledWith(['c']);
    reading.next();
    expect(said.pop()).toBe('That was the last step');
    expect(reading.step()).toBe(2);
  });

  it('comes back to a statement that carries two step numbers', () => {
    nodes = [node('a', 'All men are mortal', 1, 3), node('b', 'Socrates is a man', 2)];
    reading.enter();
    reading.next();
    reading.next();
    expect(said.pop()).toBe('Step 3 of 3: All men are mortal');
  });

  it('starts at the selected statement when it is in the order', () => {
    selection = {nodeIds: ['b'], edgeIds: [], underCrosshairsId: null};
    reading.enter();
    expect(reading.step()).toBe(1);
  });

  it('highlights and names what the current statement follows from', () => {
    selection = {nodeIds: ['c'], edgeIds: [], underCrosshairsId: null};
    reading.enter();
    reading.why();
    expect(canvas.agentSetHighlights).toHaveBeenCalledWith(['c', 'a', 'b']);
    expect(said.pop()).toBe('Follows from: All men are mortal · Socrates is a man');
  });

  it('names assumptions, definitions and examples along with premises, and says which kind a step is', () => {
    nodes.push({id: 'as', label: 'Everyone here is Greek', tags: ['kind/assumption']},
      {id: 'ex', label: 'Plato is mortal too', tags: ['kind/example', 'step/4']});
    edges.push({id: 'a1', from: 'as', to: 'c', labels: [], tags: [EXPLANATION_ASSUMPTION_TAG]},
      {id: 'x1', from: 'c', to: 'ex', labels: [], tags: [EXPLANATION_EXAMPLE_TAG]});
    selection = {nodeIds: ['c'], edgeIds: [], underCrosshairsId: null};
    reading.enter();
    reading.why();
    expect(said.pop()).toBe('Follows from: All men are mortal · Socrates is a man. Assumes: Everyone here is Greek. '
      + 'Example: Plato is mortal too');
    expect(canvas.agentSetHighlights).toHaveBeenCalledWith(['c', 'a', 'b', 'as', 'ex', 'a1']);
    reading.next();
    expect(said.pop()).toBe('Step 4 of 4 (example): Plato is mortal too');
  });

  it('emphasizes a definition\'s link where the reader first meets it, and not at later uses', () => {
    nodes = [node('def', 'A man is a human being', 1), node('a', 'All men are mortal', 2),
      node('b', 'Socrates is a man', 3), node('c', 'Socrates is mortal', 4)];
    edges = [...edges,
      {id: 'd1', from: 'def', to: 'b', labels: [], tags: [EXPLANATION_DEFINITION_TAG]},
      {id: 'd2', from: 'def', to: 'a', labels: [], tags: [EXPLANATION_DEFINITION_TAG]}];
    reading.enter();
    expect(canvas.agentSetHighlights.calls.mostRecent().args[0]).toEqual(['def']);
    reading.next();
    expect(canvas.agentSetHighlights.calls.mostRecent().args[0]).toEqual(['a', 'd2']);
    reading.next();
    expect(canvas.agentSetHighlights.calls.mostRecent().args[0]).toEqual(['b']);
  });

  it('keeps the reader in place when the agent inserts a step behind them', () => {
    selection = {nodeIds: ['b'], edgeIds: [], underCrosshairsId: null};
    reading.enter();
    nodes = [node('a', 'All men are mortal', 1), node('d', 'Socrates is one of all men', 2),
      node('b', 'Socrates is a man', 3), node('c', 'Socrates is mortal', 4)];
    reading.next();
    expect(said.pop()).toBe('Step 4 of 4: Socrates is mortal');
  });

  it('marks the current statement as an undoable user edit, one mark at a time', async () => {
    reading.enter();
    reading.next();
    nodes[1].tags = ['keep'];

    expect(await reading.toggleMark('doesnt-follow')).toEqual({marked: true, target: 'statement'});
    let [changes, meta] = canvas.agentApplyChanges.calls.mostRecent().args;
    expect(changes).toEqual([{kind: 'update_node', node: 'b', tags: ['keep', EXPLANATION_DOESNT_FOLLOW_TAG]}]);
    expect(meta.author).toBe('user');

    nodes[1].tags = ['keep', EXPLANATION_DOESNT_FOLLOW_TAG];
    expect(await reading.toggleMark('too-detailed')).toEqual({marked: true, target: 'statement'});
    [changes] = canvas.agentApplyChanges.calls.mostRecent().args;
    expect(changes).toEqual([{kind: 'update_node', node: 'b', tags: ['keep', EXPLANATION_TOO_DETAILED_TAG]}]);

    expect(await reading.toggleMark('doesnt-follow')).toEqual({marked: false, target: 'statement'});
    [changes] = canvas.agentApplyChanges.calls.mostRecent().args;
    expect(changes).toEqual([{kind: 'update_node', node: 'b', tags: ['keep']}]);
  });

  it('points at the links into a statement one at a time, and marks a link', async () => {
    selection = {nodeIds: ['c'], edgeIds: [], underCrosshairsId: null};
    reading.enter();

    reading.nextLink();
    expect(said.pop()).toBe('Link 1 of 2: from All men are mortal');
    expect(canvas.agentSetHighlights).toHaveBeenCalledWith(['c', 'a', 's1']);
    reading.nextLink();
    expect(said.pop()).toBe('Link 2 of 2: from Socrates is a man');

    expect(await reading.toggleMark('doesnt-follow')).toEqual({marked: true, target: 'link'});
    expect(canvas.agentApplyChanges.calls.mostRecent().args[0])
      .toEqual([{kind: 'update_edge', edge: 's2', tags: [EXPLANATION_SUPPORTS_TAG, EXPLANATION_DOESNT_FOLLOW_TAG]}]);
    expect(await reading.toggleMark('too-detailed')).toBeNull();

    reading.nextLink();
    expect(said.pop()).toBe('Back to the statement');
    expect(await reading.toggleMark('too-detailed')).toEqual({marked: true, target: 'statement'});
  });

  it('stops pointing at a link when the step changes', async () => {
    selection = {nodeIds: ['b'], edgeIds: [], underCrosshairsId: null};
    reading.enter();
    reading.next();
    reading.nextLink();
    reading.previous();
    reading.next();
    expect(await reading.toggleMark('doesnt-follow')).toEqual({marked: true, target: 'statement'});
  });

  it('does not mark anything when not reading, or when the edit is refused', async () => {
    canvas.agentApplyChanges.and.resolveTo({ok: false, error: 'conflict', created: [], touchedNodeIds: []});
    expect(await reading.toggleMark('doesnt-follow')).toBeNull();
    reading.enter();
    expect(await reading.toggleMark('doesnt-follow')).toBeNull();
    expect(said.pop()).toBe('conflict');
  });

  it('lists marked statements and links in reading order, for sending', () => {
    nodes[2].tags.push(EXPLANATION_TOO_DETAILED_TAG);
    nodes[0].tags.push(EXPLANATION_DOESNT_FOLLOW_TAG);
    edges[1] = {...edges[1], tags: [EXPLANATION_SUPPORTS_TAG, EXPLANATION_DOESNT_FOLLOW_TAG]};
    reading.enter();
    expect(reading.markedRefs()).toEqual([
      {kind: 'node', id: 'a', label: 'All men are mortal'},
      {kind: 'edge', id: 's2', label: 'Socrates is a man → Socrates is mortal'},
      {kind: 'node', id: 'c', label: 'Socrates is mortal'},
    ]);
  });

  it('clears its highlights when it stops', () => {
    reading.enter();
    reading.exit();
    expect(reading.active()).toBeFalse();
    expect(canvas.agentSetHighlights).toHaveBeenCalledWith([]);
  });
});
