import type {AgentCanvasTarget, AgentEdgeInfo, AgentNodeInfo} from '../agent/agent-canvas';
import {
  EXPLANATION_DOESNT_FOLLOW_TAG, EXPLANATION_PATH_TAG, EXPLANATION_SUPPORTS_TAG, EXPLANATION_TOO_DETAILED_TAG,
} from '../extensions/explanation.extension';
import {ReadingModeService} from './reading-mode.service';

const node = (id: string, label: string): AgentNodeInfo => ({id, label, tags: []});
const path = (id: string, from: string, to: string, step: number): AgentEdgeInfo =>
  ({id, from, to, labels: [String(step)], tags: [EXPLANATION_PATH_TAG]});
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
    nodes = [node('a', 'All men are mortal'), node('b', 'Socrates is a man'), node('c', 'Socrates is mortal')];
    edges = [path('p1', 'a', 'b', 1), path('p2', 'b', 'c', 2), supports('s1', 'a', 'c'), supports('s2', 'b', 'c')];
    selection = {nodeIds: [], edgeIds: [], underCrosshairsId: null};
    canvas = jasmine.createSpyObj<AgentCanvasTarget>('canvas',
      ['agentNodes', 'agentEdges', 'agentSelection', 'agentFocusNode', 'agentSetHighlights', 'agentApplyChanges']);
    canvas.agentNodes.and.callFake(() => nodes);
    canvas.agentEdges.and.callFake(() => edges);
    canvas.agentSelection.and.callFake(() => selection);
    canvas.agentFocusNode.and.returnValue(true);
    said = [];
    reading = new ReadingModeService();
    reading.attach(canvas, text => said.push(text));
  });

  it('refuses to start without a reading path', () => {
    edges = [supports('s1', 'a', 'c')];
    expect(reading.enter()).toBeFalse();
    expect(reading.active()).toBeFalse();
    expect(said[0]).toContain('No reading path');
  });

  it('starts at the beginning, steps along the path and stops at both ends', () => {
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

  it('starts at the selected statement when it is on the path', () => {
    selection = {nodeIds: ['b'], edgeIds: [], underCrosshairsId: null};
    reading.enter();
    expect(reading.step()).toBe(1);
  });

  it('marks and names what the current statement follows from', () => {
    selection = {nodeIds: ['c'], edgeIds: [], underCrosshairsId: null};
    reading.enter();
    reading.why();
    expect(canvas.agentSetHighlights).toHaveBeenCalledWith(['c', 'a', 'b']);
    expect(said.pop()).toBe('Follows from: All men are mortal · Socrates is a man');
  });

  it('keeps the reader in place when the agent inserts a step behind them', () => {
    selection = {nodeIds: ['b'], edgeIds: [], underCrosshairsId: null};
    reading.enter();
    // The agent adds an intermediate step between "All men are mortal" and "Socrates is a man".
    nodes = [...nodes, node('d', 'Socrates is one of all men')];
    edges = [path('p1', 'a', 'd', 1), path('p2', 'd', 'b', 2), path('p3', 'b', 'c', 3)];
    reading.next();
    expect(said.pop()).toBe('Step 4 of 4: Socrates is mortal');
  });

  it('marks the current statement as an undoable user edit, one mark at a time', async () => {
    canvas.agentApplyChanges.and.returnValue(Promise.resolve({ok: true, created: [], touchedNodeIds: []}));
    reading.enter();
    reading.next();
    nodes[1].tags = ['keep'];

    expect(await reading.toggleMark('doesnt-follow')).toBeTrue();
    let [changes, meta] = canvas.agentApplyChanges.calls.mostRecent().args;
    expect(changes).toEqual([{kind: 'update_node', node: 'b', tags: ['keep', EXPLANATION_DOESNT_FOLLOW_TAG]}]);
    expect(meta.author).toBe('user');

    nodes[1].tags = ['keep', EXPLANATION_DOESNT_FOLLOW_TAG];
    expect(await reading.toggleMark('too-detailed')).toBeTrue();
    [changes] = canvas.agentApplyChanges.calls.mostRecent().args;
    expect(changes).toEqual([{kind: 'update_node', node: 'b', tags: ['keep', EXPLANATION_TOO_DETAILED_TAG]}]);

    nodes[1].tags = ['keep', EXPLANATION_DOESNT_FOLLOW_TAG];
    expect(await reading.toggleMark('doesnt-follow')).toBeFalse();
    [changes] = canvas.agentApplyChanges.calls.mostRecent().args;
    expect(changes).toEqual([{kind: 'update_node', node: 'b', tags: ['keep']}]);
  });

  it('does not mark anything when not reading, or when the edit is refused', async () => {
    canvas.agentApplyChanges.and.returnValue(Promise.resolve({ok: false, error: 'conflict', created: [], touchedNodeIds: []}));
    expect(await reading.toggleMark('doesnt-follow')).toBeNull();
    reading.enter();
    expect(await reading.toggleMark('doesnt-follow')).toBeNull();
    expect(said.pop()).toBe('conflict');
  });

  it('lists marked statements in reading order, for sending', () => {
    nodes[2].tags = [EXPLANATION_TOO_DETAILED_TAG];
    nodes[0].tags = [EXPLANATION_DOESNT_FOLLOW_TAG];
    reading.enter();
    expect(reading.markedRefs()).toEqual([
      {kind: 'node', id: 'a', label: 'All men are mortal'},
      {kind: 'node', id: 'c', label: 'Socrates is mortal'},
    ]);
  });

  it('clears its marks when it stops', () => {
    reading.enter();
    reading.exit();
    expect(reading.active()).toBeFalse();
    expect(canvas.agentSetHighlights).toHaveBeenCalledWith([]);
  });
});
