import {DAEdgeSnapshot, DANodeSnapshot, GraphSnapshot} from './graph-snapshot';
import {
  findConflict, GraphOperation, invertOperations, removeNodeOperations, updateEdgeOperation, updateNodeOperation,
} from './graph-operations';

function node(id: string, text: string, extra: Partial<DANodeSnapshot> = {}): DANodeSnapshot {
  return {id, x: 0, y: 0, text, width: 100, height: 50, fontSize: 14, isSelected: false, nodeShape: 'box', ...extra};
}

function edge(id: string, src: string, dest: string, labels: string[] = []): DAEdgeSnapshot {
  return {
    id, srcNodeId: src, destNodeId: dest, isSelected: false,
    labels: labels.map((text, i) => ({id: `${id}-l${i}`, x: 0, y: 0, text, fontSize: 12, isSelected: false})),
  };
}

const GRAPH: GraphSnapshot = {
  nodes: [node('da-1', 'A'), node('da-2', 'B')],
  edges: [edge('da-3', 'da-1', 'da-2', ['1'])],
};

describe('graph operations', () => {
  it('inverts a batch in reverse order', () => {
    const ops: GraphOperation[] = [
      {op: 'add_node', node: node('da-9', 'C')},
      {op: 'add_edge', edge: edge('da-10', 'da-2', 'da-9')},
    ];
    expect(invertOperations(ops)).toEqual([
      {op: 'remove_edge', edge: ops[1].op === 'add_edge' ? ops[1].edge : null!},
      {op: 'remove_node', node: node('da-9', 'C')},
    ]);
  });

  it('accepts a batch that builds on its own earlier operations', () => {
    expect(findConflict(GRAPH, [
      {op: 'add_node', node: node('da-9', 'C')},
      {op: 'add_edge', edge: edge('da-10', 'da-2', 'da-9')},
      updateNodeOperation(GRAPH, 'da-1', {text: 'A, restated'}),
    ])).toBeNull();
  });

  it('reports a conflict when the graph changed since the batch was planned', () => {
    const stale = updateNodeOperation(GRAPH, 'da-1', {text: 'new'});
    const changed: GraphSnapshot = {...GRAPH, nodes: [node('da-1', 'edited by the user'), node('da-2', 'B')]};
    expect(findConflict(changed, [stale])).toContain('da-1 changed (text)');
  });

  it('rejects duplicate ids, missing ends, and removing a node that still has edges', () => {
    expect(findConflict(GRAPH, [{op: 'add_node', node: node('da-1', 'dup')}])).toContain('already exists');
    expect(findConflict(GRAPH, [{op: 'add_edge', edge: edge('da-9', 'da-1', 'da-404')}])).toContain('da-404');
    expect(findConflict(GRAPH, [{op: 'remove_node', node: GRAPH.nodes[0]}])).toContain('still has edges');
  });

  it('plans a node removal as its edges first, which then applies cleanly', () => {
    const ops = removeNodeOperations(GRAPH, 'da-1');
    expect(ops.map(o => o.op)).toEqual(['remove_edge', 'remove_node']);
    expect(findConflict(GRAPH, ops)).toBeNull();
    // ...and its inverse applies cleanly to the graph without the node.
    const without: GraphSnapshot = {nodes: [GRAPH.nodes[1]], edges: []};
    expect(findConflict(without, invertOperations(ops))).toBeNull();
  });

  it('records the current values as the expectations of an update', () => {
    const op = updateEdgeOperation(GRAPH, 'da-3', {labels: ['2'], tags: ['path']});
    expect(op).toEqual({op: 'update_edge', id: 'da-3', before: {labels: ['1'], tags: []}, after: {labels: ['2'], tags: ['path']}});
  });
});
