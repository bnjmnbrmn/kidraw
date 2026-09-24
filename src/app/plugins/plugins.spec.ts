import { DrawingLayer } from '../drawing-area/drawing.layer';
import { DANode } from '../drawing-area/da-node';
import { DAEdge } from '../drawing-area/da-edge';
import {
  EXPLANATION_DEFINITION_TAG, EXPLANATION_DOESNT_FOLLOW_TAG, EXPLANATION_PLUGIN, EXPLANATION_SUPPORTS_TAG,
} from './explanation.plugin';
import { TODO_GRAPH_PLUGIN } from './todo-graph.plugin';
import { resolveIdentity, DEFAULT_PLUGIN } from './plugin-registry';
import { activeTagChoice, applyExclusiveTag } from './tag-groups';

describe('plugins (identity slot)', () => {
  function layerWithNodes(...nodes: DANode[]): DrawingLayer {
    const dl = new DrawingLayer();
    for (const n of nodes) {
      dl['daNodeGroup'].add(n.konvaGroup);
      dl['daNodes'].push(n);
    }
    return dl;
  }

  it('colours edges by kind, a marked edge by its mark, and clears both under an identity without them', () => {
    const premise = new DANode(0, 0, 'All men are mortal');
    const conclusion = new DANode(300, 0, 'Socrates is mortal');
    const dl = layerWithNodes(premise, conclusion);
    const supports = new DAEdge(premise, conclusion, '');
    supports.tags = [EXPLANATION_SUPPORTS_TAG];
    const marked = new DAEdge(premise, conclusion, '');
    marked.tags = [EXPLANATION_SUPPORTS_TAG, EXPLANATION_DOESNT_FOLLOW_TAG];
    const plain = new DAEdge(conclusion, premise, '');
    dl.addRawEdge(supports);
    dl.addRawEdge(marked);
    dl.addRawEdge(plain);
    const stroke = (edge: DAEdge) => (edge as unknown as {_line: {stroke(): string}})._line.stroke();
    const plainStroke = stroke(plain);

    dl.setDiagramType(EXPLANATION_PLUGIN);
    const supportsKind = EXPLANATION_PLUGIN.edgeKinds!.find(k => k.tag === EXPLANATION_SUPPORTS_TAG)!;
    const mark = activeTagChoice(EXPLANATION_PLUGIN, [EXPLANATION_DOESNT_FOLLOW_TAG])!;
    expect(stroke(supports)).toBe(supportsKind.color);
    expect(stroke(marked)).toBe(mark.color);
    expect(stroke(plain)).toBe(plainStroke);

    dl.setDiagramType(DEFAULT_PLUGIN);
    expect(stroke(supports)).not.toBe(supportsKind.color);
    expect(stroke(marked)).not.toBe(mark.color);
  });

  it('marks node kinds with a border colour and a badge, and clears them under an identity without them', () => {
    const definition = new DANode(0, 0, 'A token is a piece of text');
    definition.tags = ['kind/definition'];
    const dl = layerWithNodes(definition);
    const plainStroke = definition.shape.stroke();

    dl.setDiagramType(EXPLANATION_PLUGIN);
    const kind = EXPLANATION_PLUGIN.nodeKinds!.find(k => k.tag === 'kind/definition')!;
    expect(definition.shape.stroke()).toBe(kind.color);
    expect(definition.kindBadgeLabel).toBe('DEFINITION');

    dl.setDiagramType(DEFAULT_PLUGIN);
    expect(definition.shape.stroke()).toBe(plainStroke);
    expect(definition.kindBadgeLabel).toBe('');
  });

  it('draws definition links faint unless an end is selected, the link is emphasized, or it is marked', () => {
    const definition = new DANode(0, 0, 'A token is a piece of text');
    const use = new DANode(300, 0, 'The model reads tokens');
    const dl = layerWithNodes(definition, use);
    const link = new DAEdge(definition, use, '');
    link.tags = [EXPLANATION_DEFINITION_TAG];
    const supports = new DAEdge(definition, use, '');
    supports.tags = [EXPLANATION_SUPPORTS_TAG];
    dl.addRawEdge(link);
    dl.addRawEdge(supports);
    const opacity = (edge: DAEdge) => edge.konvaGroup.opacity();

    dl.setDiagramType(EXPLANATION_PLUGIN);
    expect(opacity(link)).toBe(DAEdge.FAINT_OPACITY);
    expect(opacity(supports)).toBe(1);

    use.isSelected = true;
    expect(opacity(link)).toBe(1);
    use.isSelected = false;
    expect(opacity(link)).toBe(DAEdge.FAINT_OPACITY);

    link.setEmphasized(true);
    expect(opacity(link)).toBe(1);
    link.setEmphasized(false);

    link.tags = [EXPLANATION_DEFINITION_TAG, EXPLANATION_DOESNT_FOLLOW_TAG];
    dl.refreshTagBadges();
    expect(opacity(link)).toBe(1);

    link.tags = [EXPLANATION_DEFINITION_TAG];
    dl.setDiagramType(DEFAULT_PLUGIN);
    expect(opacity(link)).toBe(1);
  });

  it('shows the reading steps a statement is read at as a number badge', () => {
    const statement = new DANode(0, 0, 'Socrates is a man');
    statement.tags = ['step/3', 'step/1', 'other'];
    const dl = layerWithNodes(statement);

    dl.setDiagramType(EXPLANATION_PLUGIN);
    expect(statement.stepBadgeLabel).toBe('1 · 3');

    dl.setDiagramType(DEFAULT_PLUGIN);
    expect(statement.stepBadgeLabel).toBe('');
  });

  it('writes labels in markdown only while the Markdown plugin is on, and math only with Math', () => {
    const node = new DANode(0, 0, 'a **b** and $x$');
    const dl = layerWithNodes(node);
    const off = new Set<string>();
    dl.isPluginEnabled = id => !off.has(id);

    dl.setDiagramType(EXPLANATION_PLUGIN);
    expect([node.labelFormat, node.labelMath]).toEqual(['markdown', true]);

    off.add('math');
    dl.refreshLabelSyntax();
    expect([node.labelFormat, node.labelMath]).toEqual(['markdown', false]);

    off.add('markdown');
    dl.refreshLabelSyntax();
    expect(node.labelFormat).toBe('plain');
  });

  it('setDiagramType restyles existing nodes to the identity defaults', () => {
    const circle = new DANode(0, 0, 'todo A', undefined, undefined, 'circle');
    const box = new DANode(300, 0, 'todo B');
    const dl = layerWithNodes(circle, box);

    dl.setDiagramType(TODO_GRAPH_PLUGIN);

    for (const n of [circle, box]) {
      expect(n.nodeShape).toBe('box');
      expect(n.textOverflowMode).toBe('fit');
      // fit mode: a short label gets a snug card, not the full 280 base width
      expect(n.NODE_WIDTH).toBeLessThan(280);
      expect(n.NODE_WIDTH).toBeGreaterThanOrEqual(n.MIN_NODE_SIZE);
      expect(n.NODE_HEIGHT).toBe(n.MIN_NODE_SIZE);
    }
    expect(dl.diagramType).toBe('todo-graph');
  });

  it('fit cards wrap long labels at the base width and grow downward', () => {
    const long = new DANode(0, 0,
      'a genuinely long todo item whose label cannot possibly fit on a single line of card text');
    const dl = layerWithNodes(long);

    dl.setDiagramType(TODO_GRAPH_PLUGIN);

    expect(long.NODE_WIDTH).toBe(280);
    expect(long.NODE_HEIGHT).toBeGreaterThan(long.MIN_NODE_SIZE);
  });

  it('junction nodes keep their fixed geometry', () => {
    const junction = new DANode(0, 0, '', undefined, undefined, 'junction');
    const dl = layerWithNodes(junction);
    const w = junction.NODE_WIDTH;

    dl.setDiagramType(TODO_GRAPH_PLUGIN);

    expect(junction.nodeShape).toBe('junction');
    expect(junction.NODE_WIDTH).toBe(w);
  });

  it('new nodes follow the identity defaults', () => {
    const dl = layerWithNodes();
    dl.setDiagramType(TODO_GRAPH_PLUGIN);

    const node = dl.createNewNode(100, 100);
    expect(node.nodeShape).toBe('box');
    expect(node.textOverflowMode).toBe('fit');
    // fit mode with an empty label collapses to the minimum card size
    expect(node.NODE_WIDTH).toBe(node.MIN_NODE_SIZE);
    expect(node.NODE_HEIGHT).toBe(node.MIN_NODE_SIZE);
  });

  it('an explicitly requested shape wins over the identity default shape', () => {
    const dl = layerWithNodes();
    dl.setDiagramType(TODO_GRAPH_PLUGIN);

    const node = dl.createNewNode(100, 100, 'diamond');
    expect(node.nodeShape).toBe('diamond');
    // style defaults still apply
    expect(node.textOverflowMode).toBe('fit');
  });

  it('the diagram type survives serialize/restore and is cleared by clearAll', () => {
    const dl = layerWithNodes(new DANode(0, 0, 'x'));
    dl.setDiagramType(TODO_GRAPH_PLUGIN);

    const snap = dl.serializeGraph();
    expect(snap.diagramType).toBe('todo-graph');
    expect(snap.plugins).toBeUndefined();

    const dl2 = new DrawingLayer();
    dl2.restoreGraph(snap);
    expect(dl2.diagramType).toBe('todo-graph');
    const fresh = dl2.createNewNode(0, 0);
    expect(fresh.textOverflowMode).toBe('fit');

    dl2.clearAll();
    expect(dl2.diagramType).toBe('default');
    expect(dl2.serializeGraph().diagramType).toBeUndefined();
  });

  it('legacy plugin-v0 snapshots migrate plugins: [todo-graph] to the identity slot', () => {
    const dl = new DrawingLayer();
    dl.restoreGraph({ nodes: [], edges: [], plugins: ['todo-graph'] });
    expect(dl.diagramType).toBe('todo-graph');
  });

  it('resolveIdentity falls back to the default identity for unknown or absent types', () => {
    expect(resolveIdentity(undefined)).toBe(DEFAULT_PLUGIN);
    expect(resolveIdentity('no-such-type')).toBe(DEFAULT_PLUGIN);
    expect(resolveIdentity('todo-graph')).toBe(TODO_GRAPH_PLUGIN);
  });
});

describe('plugins (tag groups / task status)', () => {
  const statusGroup = TODO_GRAPH_PLUGIN.tagGroups!.find(g => g.id === 'status')!;

  it('todo-graph declares the five task statuses', () => {
    expect(statusGroup.choices.map(c => c.tag)).toEqual([
      'status/draft', 'status/todo', 'status/in-progress', 'status/blocked', 'status/done',
    ]);
    expect(statusGroup.choices.find(c => c.tag === 'status/done')!.dims).toBeTrue();
  });

  it('applyExclusiveTag replaces siblings and preserves unrelated tags', () => {
    const done = statusGroup.choices.find(c => c.tag === 'status/done')!;
    const blocked = statusGroup.choices.find(c => c.tag === 'status/blocked')!;

    let tags = applyExclusiveTag(['milestone'], statusGroup, blocked);
    expect(tags).toEqual(['milestone', 'status/blocked']);

    tags = applyExclusiveTag(tags, statusGroup, done);
    expect(tags).toEqual(['milestone', 'status/done']);

    tags = applyExclusiveTag(tags, statusGroup, null);
    expect(tags).toEqual(['milestone']);
  });

  it('activeTagChoice finds the status present on the node, none otherwise', () => {
    expect(activeTagChoice(TODO_GRAPH_PLUGIN, ['milestone', 'status/blocked'])!.label).toBe('BLOCKED');
    expect(activeTagChoice(TODO_GRAPH_PLUGIN, ['milestone'])).toBeNull();
    expect(activeTagChoice(DEFAULT_PLUGIN, ['status/blocked'])).toBeNull();
  });

  it('setStatusBadge shows a badge, dims done nodes, and clears cleanly', () => {
    const node = new DANode(0, 0, 'task');
    const done = statusGroup.choices.find(c => c.tag === 'status/done')!;

    node.setStatusBadge(done);
    expect(node.statusBadgeVisible).toBeTrue();
    expect(node.statusBadgeLabel).toBe('DONE');
    expect(node.konvaGroup.opacity()).toBe(node.STATUS_DIM_OPACITY);
    expect(node.label.textDecoration()).toBe('line-through');

    node.setStatusBadge(null);
    expect(node.statusBadgeVisible).toBeFalse();
    expect(node.konvaGroup.opacity()).toBe(1);
    expect(node.label.textDecoration()).toBe('');
  });

  it('junction nodes never render a status badge', () => {
    const junction = new DANode(0, 0, '', undefined, undefined, 'junction');
    junction.setStatusBadge(statusGroup.choices[0]);
    expect(junction.statusBadgeVisible).toBeFalse();
  });

  it('status tags restore into badges via restoreGraph', () => {
    const dl = new DrawingLayer();
    dl.restoreGraph({
      diagramType: 'todo-graph',
      nodes: [{
        id: 'da-1', x: 0, y: 0, text: 'task', width: 120, height: 120, fontSize: 16,
        isSelected: false, tags: ['status/in-progress'],
      }],
      edges: [],
    });
    const node = dl.getDANodes()[0];
    expect(node.statusBadgeVisible).toBeTrue();
    expect(node.statusBadgeLabel).toBe('IN PROGRESS');
  });

  it('binding the default identity hides status badges but keeps the tags', () => {
    const dl = new DrawingLayer();
    dl.restoreGraph({
      diagramType: 'todo-graph',
      nodes: [{
        id: 'da-1', x: 0, y: 0, text: 'task', width: 120, height: 120, fontSize: 16,
        isSelected: false, tags: ['status/done'],
      }],
      edges: [],
    });
    dl.setDiagramType(DEFAULT_PLUGIN);
    const node = dl.getDANodes()[0];
    expect(node.statusBadgeVisible).toBeFalse();
    expect(node.tags).toEqual(['status/done']);
  });
});
