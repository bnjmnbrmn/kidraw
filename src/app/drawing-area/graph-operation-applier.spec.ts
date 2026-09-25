import {DANode} from './da-node';
import {DrawingLayer} from './drawing.layer';
import {GraphOperationApplier} from './graph-operation-applier';
import {
  GraphOperation, invertOperations, removeNodeOperations, updateEdgeOperation, updateNodeOperation,
} from './graph-operations';
import {DANodeSnapshot} from './graph-snapshot';

function nodeSnapshot(id: string, text: string, x = 0): DANodeSnapshot {
  return {id, x, y: 0, text, width: 120, height: 60, fontSize: 14, isSelected: false, nodeShape: 'box'};
}

describe('GraphOperationApplier', () => {
  let layer: DrawingLayer;
  let applier: GraphOperationApplier;
  let changedNodes: DANode[][];
  let routed: string[];

  beforeEach(() => {
    layer = new DrawingLayer();
    changedNodes = [];
    routed = [];
    applier = new GraphOperationApplier(layer, {
      nodesChanged: nodes => changedNodes.push(nodes),
      edgeAdded: edge => routed.push(edge.id),
    });
  });

  const texts = () => layer.serializeGraph().nodes.map(n => n.text).sort();

  it('adds nodes and a labeled edge, keeping ids, and undoes them', () => {
    const ops: GraphOperation[] = [
      {op: 'add_node', node: nodeSnapshot('da-101', 'All men are mortal')},
      {op: 'add_node', node: nodeSnapshot('da-102', 'Socrates is mortal', 300)},
      {op: 'add_edge', edge: {id: 'da-103', srcNodeId: 'da-101', destNodeId: 'da-102', isSelected: false,
        labels: [{id: 'da-104', x: 0, y: 0, text: '1', fontSize: 12, isSelected: false}], tags: ['path']}},
    ];
    expect(applier.apply(ops)).toBeNull();

    const graph = layer.serializeGraph();
    expect(graph.nodes.map(n => n.id).sort()).toEqual(['da-101', 'da-102']);
    expect(graph.edges[0]).toEqual(jasmine.objectContaining({id: 'da-103', tags: ['path']}));
    expect(graph.edges[0].labels.map(l => l.text)).toEqual(['1']);
    expect(routed).toEqual(['da-103']);
    expect(changedNodes[0].length).toBe(2);

    expect(applier.apply(invertOperations(ops))).toBeNull();
    expect(layer.serializeGraph()).toEqual(jasmine.objectContaining({nodes: [], edges: []}));
  });

  it('updates text, tags and edge labels in place, and restores them', () => {
    applier.apply([
      {op: 'add_node', node: nodeSnapshot('da-201', 'P')},
      {op: 'add_node', node: nodeSnapshot('da-202', 'Q', 300)},
      {op: 'add_edge', edge: {id: 'da-203', srcNodeId: 'da-201', destNodeId: 'da-202', isSelected: false, labels: []}},
    ]);
    const before = layer.serializeGraph();
    const edit = [
      updateNodeOperation(before, 'da-201', {text: 'P, restated', tags: ['claim']}),
      updateEdgeOperation(before, 'da-203', {labels: ['2 because'], directedness: 'undirected'}),
    ];
    expect(applier.apply(edit)).toBeNull();
    const after = layer.serializeGraph();
    expect(after.nodes.find(n => n.id === 'da-201')).toEqual(jasmine.objectContaining({text: 'P, restated', tags: ['claim']}));
    expect(after.edges[0].labels.map(l => l.text)).toEqual(['2 because']);
    expect(after.edges[0].directedness).toBe('undirected');

    expect(applier.apply(invertOperations(edit))).toBeNull();
    const restored = layer.serializeGraph();
    const p = restored.nodes.find(n => n.id === 'da-201')!;
    expect(p.text).toBe('P');
    // The snapshot omits tags when there are none.
    expect(p.tags ?? []).toEqual([]);
    expect(restored.edges[0].labels).toEqual([]);
  });

  it('removes a node with its edges, and brings both back with the same ids', () => {
    applier.apply([
      {op: 'add_node', node: nodeSnapshot('da-301', 'X')},
      {op: 'add_node', node: nodeSnapshot('da-302', 'Y', 300)},
      {op: 'add_edge', edge: {id: 'da-303', srcNodeId: 'da-301', destNodeId: 'da-302', isSelected: false, labels: []}},
    ]);
    const removal = removeNodeOperations(layer.serializeGraph(), 'da-301');
    expect(applier.apply(removal)).toBeNull();
    expect(texts()).toEqual(['Y']);
    expect(layer.getDAEdges().length).toBe(0);

    expect(applier.apply(invertOperations(removal))).toBeNull();
    expect(texts()).toEqual(['X', 'Y']);
    expect(layer.getDAEdges().map(e => e.id)).toEqual(['da-303']);
  });

  it('changes nothing when any operation in the batch conflicts', () => {
    applier.apply([{op: 'add_node', node: nodeSnapshot('da-401', 'Original')}]);
    const graph = layer.serializeGraph();
    const conflict = applier.apply([
      {op: 'add_node', node: nodeSnapshot('da-402', 'Would be added')},
      {op: 'update_node', id: 'da-401', before: {text: 'Something else'}, after: {text: 'Overwrite'}},
    ]);
    expect(conflict).toContain('da-401 changed (text)');
    expect(layer.serializeGraph().nodes.map(n => n.text)).toEqual(graph.nodes.map(n => n.text));
  });
});
