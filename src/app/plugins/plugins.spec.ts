import { DrawingLayer } from '../drawing-area/drawing.layer';
import { DANode } from '../drawing-area/da-node';
import { TODO_GRAPH_PLUGIN } from './todo-graph.plugin';

describe('plugins', () => {
  function layerWithNodes(...nodes: DANode[]): DrawingLayer {
    const dl = new DrawingLayer();
    for (const n of nodes) {
      dl['daNodeGroup'].add(n.konvaGroup);
      dl['daNodes'].push(n);
    }
    return dl;
  }

  it('applyPlugin restyles existing nodes to the plugin defaults', () => {
    const circle = new DANode(0, 0, 'todo A', undefined, undefined, 'circle');
    const box = new DANode(300, 0, 'todo B');
    const dl = layerWithNodes(circle, box);

    dl.applyPlugin(TODO_GRAPH_PLUGIN);

    for (const n of [circle, box]) {
      expect(n.nodeShape).toBe('box');
      expect(n.textOverflowMode).toBe('fit');
      // fit mode: a short label gets a snug card, not the full 280 base width
      expect(n.NODE_WIDTH).toBeLessThan(280);
      expect(n.NODE_WIDTH).toBeGreaterThanOrEqual(n.MIN_NODE_SIZE);
      expect(n.NODE_HEIGHT).toBe(n.MIN_NODE_SIZE);
    }
    expect(dl.getActivePlugins()).toEqual(['todo-graph']);
  });

  it('fit cards wrap long labels at the base width and grow downward', () => {
    const long = new DANode(0, 0,
      'a genuinely long todo item whose label cannot possibly fit on a single line of card text');
    const dl = layerWithNodes(long);

    dl.applyPlugin(TODO_GRAPH_PLUGIN);

    expect(long.NODE_WIDTH).toBe(280);
    expect(long.NODE_HEIGHT).toBeGreaterThan(long.MIN_NODE_SIZE);
  });

  it('junction nodes keep their fixed geometry', () => {
    const junction = new DANode(0, 0, '', undefined, undefined, 'junction');
    const dl = layerWithNodes(junction);
    const w = junction.NODE_WIDTH;

    dl.applyPlugin(TODO_GRAPH_PLUGIN);

    expect(junction.nodeShape).toBe('junction');
    expect(junction.NODE_WIDTH).toBe(w);
  });

  it('new nodes follow the active plugin defaults', () => {
    const dl = layerWithNodes();
    dl.applyPlugin(TODO_GRAPH_PLUGIN);

    const node = dl.createNewNode(100, 100);
    expect(node.nodeShape).toBe('box');
    expect(node.textOverflowMode).toBe('fit');
    // fit mode with an empty label collapses to the minimum card size
    expect(node.NODE_WIDTH).toBe(node.MIN_NODE_SIZE);
    expect(node.NODE_HEIGHT).toBe(node.MIN_NODE_SIZE);
  });

  it('an explicitly requested shape wins over the plugin default shape', () => {
    const dl = layerWithNodes();
    dl.applyPlugin(TODO_GRAPH_PLUGIN);

    const node = dl.createNewNode(100, 100, 'diamond');
    expect(node.nodeShape).toBe('diamond');
    // style defaults still apply
    expect(node.textOverflowMode).toBe('fit');
  });

  it('active plugins survive serialize/restore and are cleared by clearAll', () => {
    const dl = layerWithNodes(new DANode(0, 0, 'x'));
    dl.applyPlugin(TODO_GRAPH_PLUGIN);

    const snap = dl.serializeGraph();
    expect(snap.plugins).toEqual(['todo-graph']);

    const dl2 = new DrawingLayer();
    dl2.restoreGraph(snap);
    expect(dl2.getActivePlugins()).toEqual(['todo-graph']);
    const fresh = dl2.createNewNode(0, 0);
    expect(fresh.textOverflowMode).toBe('fit');

    dl2.clearAll();
    expect(dl2.getActivePlugins()).toEqual([]);
    expect(dl2.serializeGraph().plugins).toBeUndefined();
  });

  it('applying the same plugin twice does not duplicate the id', () => {
    const dl = layerWithNodes();
    dl.applyPlugin(TODO_GRAPH_PLUGIN);
    dl.applyPlugin(TODO_GRAPH_PLUGIN);
    expect(dl.getActivePlugins()).toEqual(['todo-graph']);
  });
});
