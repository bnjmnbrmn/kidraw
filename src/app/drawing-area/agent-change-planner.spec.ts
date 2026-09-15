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

  it('adds statements with handles, and supports and numbered path edges between them', () => {
    const plan = planned(planAgentChanges(graph, [
      {kind: 'add_node', handle: 'socrates', text: 'Socrates is a man', near: 'da-1'},
      {kind: 'add_node', handle: 'mortal', text: 'Socrates is mortal', near: 'socrates'},
      {kind: 'add_edge', from: 'da-1', to: 'mortal', edgeKind: 'supports'},
      {kind: 'add_edge', from: 'socrates', to: 'mortal', edgeKind: 'Supports'},
      {kind: 'add_edge', from: 'socrates', to: 'mortal', edgeKind: 'path', label: '1'},
    ], idCounter()));

    expect(plan.ops.map(o => o.op)).toEqual(['add_node', 'add_node', 'add_edge', 'add_edge', 'add_edge']);
    expect(plan.created.filter(c => c.kind === 'node')).toEqual([
      {kind: 'node', id: 'da-101', handle: 'socrates'}, {kind: 'node', id: 'da-102', handle: 'mortal'},
    ]);
    const edges = plan.ops.flatMap(o => (o.op === 'add_edge' ? [o.edge] : []));
    expect(edges[0]).toEqual(jasmine.objectContaining({srcNodeId: 'da-1', destNodeId: 'da-102', tags: ['explanation/supports']}));
    expect(edges[2].tags).toEqual(['explanation/path']);
    expect(edges[2].labels.map(l => l.text)).toEqual(['1']);
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

  it('renumbers a path edge and swaps an edge kind without losing other tags', () => {
    const withPath: GraphSnapshot = {
      ...graph,
      nodes: [...graph.nodes, node('da-2', 'B', 0, 200)],
      edges: [{id: 'da-3', srcNodeId: 'da-1', destNodeId: 'da-2', isSelected: false, tags: ['explanation/path', 'keep-me'],
        labels: [{id: 'da-4', x: 0, y: 0, text: '2', fontSize: 12, isSelected: false}]}],
    };
    const plan = planned(planAgentChanges(withPath, [
      {kind: 'update_edge', edge: 'da-3', label: '3', edgeKind: 'supports'},
    ], idCounter()));
    expect(plan.ops[0]).toEqual({
      op: 'update_edge', id: 'da-3',
      before: {labels: ['2'], tags: ['explanation/path', 'keep-me']},
      after: {labels: ['3'], tags: ['keep-me', 'explanation/supports']},
    });
  });
});
