import {planAgentChanges, ChangePlan} from './agent-change-planner';
import {findConflict} from './graph-operations';
import {DANodeSnapshot, GraphSnapshot} from './graph-snapshot';

function node(id: string, text: string, x = 0, y = 0): DANodeSnapshot {
  return {id, x, y, text, width: 260, height: 60, fontSize: 14, isSelected: false, nodeShape: 'box'};
}

function idCounter(start = 100) {
  let n = start;
  return () => `da-${++n}`;
}

const planned = (result: ChangePlan | {error: string}): ChangePlan => {
  if ('error' in result) throw new Error(result.error);
  return result;
};

describe('planAgentChanges', () => {
  const graph: GraphSnapshot = {
    diagramType: 'explanation',
    nodes: [node('da-1', 'All men are mortal')],
    edges: [],
  };

  it('adds statements with handles, and supports edges between them', () => {
    const plan = planned(planAgentChanges(graph, [
      {kind: 'add_node', handle: 'socrates', text: 'Socrates is a man', near: 'da-1'},
      {kind: 'add_node', handle: 'mortal', text: 'Socrates is mortal', near: 'socrates'},
      {kind: 'add_edge', from: 'da-1', to: 'mortal', edgeKind: 'supports'},
      {kind: 'add_edge', from: 'socrates', to: 'mortal', edgeKind: 'Supports', label: 'because'},
    ], idCounter()));

    expect(plan.ops.map(o => o.op)).toEqual(['add_node', 'add_node', 'add_edge', 'add_edge']);
    expect(plan.created.filter(c => c.kind === 'node')).toEqual([
      {kind: 'node', id: 'da-101', handle: 'socrates'}, {kind: 'node', id: 'da-102', handle: 'mortal'},
    ]);
    const edges = plan.ops.flatMap(o => (o.op === 'add_edge' ? [o.edge] : []));
    expect(edges[0]).toEqual(jasmine.objectContaining({srcNodeId: 'da-1', destNodeId: 'da-102', tags: ['explanation/supports']}));
    expect(edges[1].labels.map(l => l.text)).toEqual(['because']);
    // The batch applies cleanly to the graph it was planned against.
    expect(findConflict(graph, plan.ops)).toBeNull();
  });

  it('places a new statement below the node it is near, and moves it clear of overlaps', () => {
    const plan = planned(planAgentChanges(graph, [
      {kind: 'add_node', text: 'first'},
      {kind: 'add_node', text: 'second', near: 'da-1'},
    ], idCounter()));
    const [first, second] = plan.ops.flatMap(o => (o.op === 'add_node' ? [o.node] : []));
    expect(first.y).toBeGreaterThan(60);
    // "second" wanted the same spot below da-1, so it moved right.
    expect(second.y).toBe(first.y);
    expect(second.x).toBeGreaterThan(first.x + first.width);
  });

  it('reports unknown references and edge kinds with what the agent can use instead', () => {
    const missing = planAgentChanges(graph, [{kind: 'add_edge', from: 'da-1', to: 'nope'}], idCounter());
    expect(missing).toEqual({error: 'change 1 (add_edge): no node "nope"'});
    const badKind = planAgentChanges(graph, [
      {kind: 'add_node', handle: 'x', text: 'x'},
      {kind: 'add_edge', from: 'da-1', to: 'x', edgeKind: 'implies'},
    ], idCounter()) as {error: string};
    expect(badKind.error).toContain('unknown edge kind "implies"');
    expect(badKind.error).toContain('"supports"');
  });

  it('deletes a statement together with its edges', () => {
    const withEdge: GraphSnapshot = {
      ...graph,
      nodes: [...graph.nodes, node('da-2', 'Socrates is mortal', 0, 200)],
      edges: [{id: 'da-3', srcNodeId: 'da-1', destNodeId: 'da-2', isSelected: false, labels: [], tags: ['explanation/supports']}],
    };
    const plan = planned(planAgentChanges(withEdge, [{kind: 'delete_node', node: 'da-1'}], idCounter()));
    expect(plan.ops.map(o => o.op)).toEqual(['remove_edge', 'remove_node']);
    expect(findConflict(withEdge, plan.ops)).toBeNull();
  });

  it('relabels an edge and drops its kind without losing other tags, or replaces its tags outright', () => {
    const withEdge: GraphSnapshot = {
      ...graph,
      nodes: [...graph.nodes, node('da-2', 'B', 0, 200)],
      edges: [{id: 'da-3', srcNodeId: 'da-1', destNodeId: 'da-2', isSelected: false, tags: ['explanation/supports', 'keep-me'],
        labels: [{id: 'da-4', x: 0, y: 0, text: '2', fontSize: 12, isSelected: false}]}],
    };
    const plan = planned(planAgentChanges(withEdge, [
      {kind: 'update_edge', edge: 'da-3', label: '3', edgeKind: null},
    ], idCounter()));
    expect(plan.ops[0]).toEqual({
      op: 'update_edge', id: 'da-3',
      before: {labels: ['2'], tags: ['explanation/supports', 'keep-me']},
      after: {labels: ['3'], tags: ['keep-me']},
    });

    const cleared = planned(planAgentChanges(withEdge, [
      {kind: 'update_edge', edge: 'da-3', tags: ['explanation/supports']},
    ], idCounter()));
    expect(cleared.ops[0]).toEqual({
      op: 'update_edge', id: 'da-3',
      before: {tags: ['explanation/supports', 'keep-me']},
      after: {tags: ['explanation/supports']},
    });
  });

  it('gives nodes a kind, and changes or clears it without losing other tags', () => {
    const plan = planned(planAgentChanges(graph, [
      {kind: 'add_node', handle: 'def', text: 'A **token** is a piece of text.', nodeKind: 'definition', tags: ['keep']},
    ], idCounter()));
    expect(plan.ops.flatMap(o => (o.op === 'add_node' ? [o.node.tags] : []))).toEqual([['keep', 'kind/definition']]);

    const withKind: GraphSnapshot = {...graph, nodes: [{...node('da-1', 'All men are mortal'), tags: ['kind/assumption', 'step/1']}]};
    const changed = planned(planAgentChanges(withKind, [{kind: 'update_node', node: 'da-1', nodeKind: 'Example'}], idCounter()));
    expect(changed.ops[0]).toEqual(jasmine.objectContaining({op: 'update_node', after: {tags: ['step/1', 'kind/example']}}));
    const cleared = planned(planAgentChanges(withKind, [{kind: 'update_node', node: 'da-1', nodeKind: null}], idCounter()));
    expect(cleared.ops[0]).toEqual(jasmine.objectContaining({after: {tags: ['step/1']}}));

    const bad = planAgentChanges(graph, [{kind: 'add_node', text: 'x', nodeKind: 'axiom'}], idCounter()) as {error: string};
    expect(bad.error).toContain('unknown node kind "axiom"');
    expect(bad.error).toContain('"definition"');
  });

  it('flags a batch for arranging without adding operations for it', () => {
    const plan = planned(planAgentChanges(graph, [{kind: 'arrange'}], idCounter()));
    expect(plan.ops).toEqual([]);
    expect(plan.arrange).toBeTrue();
    expect(planned(planAgentChanges(graph, [{kind: 'add_node', text: 'x'}], idCounter())).arrange).toBeFalse();
  });

  it('sets the whole reading order as step tags, for statements read twice and ones added in the batch', () => {
    const three: GraphSnapshot = {
      ...graph,
      nodes: [
        {...node('da-1', 'All men are mortal'), tags: ['step/1']},
        {...node('da-2', 'Socrates is a man', 0, 200), tags: ['step/2', 'feedback/doesnt-follow']},
        node('da-3', 'Socrates is mortal', 0, 400),
      ],
    };
    const plan = planned(planAgentChanges(three, [
      {kind: 'add_node', handle: 'between', text: 'Socrates is one of all men', near: 'da-1'},
      {kind: 'set_reading_order', nodes: ['da-1', 'between', 'da-2', 'da-3', 'da-1']},
    ], idCounter()));

    const added = plan.ops.flatMap(o => (o.op === 'add_node' ? [o.node] : []));
    expect(added.map(n => n.tags)).toEqual([['step/2']]);
    const updates = plan.ops.flatMap(o => (o.op === 'update_node' ? [[o.id, o.after.tags]] : []));
    expect(updates).toEqual([
      ['da-1', ['step/1', 'step/5']],
      ['da-2', ['feedback/doesnt-follow', 'step/3']],
      ['da-3', ['step/4']],
    ]);
    expect(findConflict(three, plan.ops)).toBeNull();
  });

  it('refuses a reading order for a diagram type without one, or naming an unknown statement', () => {
    expect(planAgentChanges({...graph, diagramType: 'default'}, [{kind: 'set_reading_order', nodes: ['da-1']}], idCounter()))
      .toEqual({error: 'change 1 (set_reading_order): this diagram type has no reading order'});
    expect(planAgentChanges(graph, [{kind: 'set_reading_order', nodes: ['da-1', 'nope']}], idCounter()))
      .toEqual({error: 'change 1 (set_reading_order): no node "nope"'});
  });
});
