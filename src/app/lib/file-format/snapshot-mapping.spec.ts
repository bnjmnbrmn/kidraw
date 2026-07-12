import { GraphSnapshot } from '../../drawing-area/graph-snapshot';
import {
  APP_NODE_DEFAULTS,
  filesToSnapshot,
  snapshotToFiles,
} from './snapshot-mapping';
import { KidrawGraphDoc, KidrawStyleSet } from './types';

function makeSnapshot(): GraphSnapshot {
  return {
    nodes: [
      {
        id: 'da-1',
        x: 100,
        y: 200,
        text: 'Auth',
        width: 120,
        height: 60,
        fontSize: 14,
        isSelected: false,
        nodeShape: 'box',
      },
      {
        id: 'da-2',
        x: 400,
        y: 200,
        text: 'DB',
        width: 130,
        height: 70,
        fontSize: 16,
        isSelected: false,
        nodeShape: 'circle',
        textOverflowMode: 'shrink-font',
      },
    ],
    edges: [
      {
        id: 'da-3',
        srcNodeId: 'da-1',
        destNodeId: 'da-2',
        isSelected: false,
        labels: [
          { id: 'da-3-label-0', x: 250, y: 195, text: 'reads', fontSize: 12, isSelected: false, edgeT: 0.42, side: 'above' },
        ],
        controlPoints: [{ x: 250, y: 200 }],
        directedness: 'directed',
        lineStyle: 'dashed',
      },
    ],
  };
}

describe('snapshot-mapping', () => {
  // ─── snapshotToFiles ────────────────────────────────────────────────────

  it('splits a snapshot into a graph doc + style set, omitting cascade-default props', () => {
    const { doc, style } = snapshotToFiles(makeSnapshot(), { stylePath: './main.kd-style.json' });

    expect(doc.kidraw).toBe(1);
    expect(doc.styles).toEqual(['./main.kd-style.json']);
    expect(Object.keys(doc.semantics.nodes).sort()).toEqual(['da-1', 'da-2']);
    expect(doc.semantics.nodes['da-1'].label).toBe('Auth');
    expect(doc.semantics.nodes['da-2'].label).toBe('DB');

    expect(doc.semantics.edges['da-3'].from).toBe('da-1');
    expect(doc.semantics.edges['da-3'].to).toBe('da-2');
    expect(doc.semantics.edges['da-3'].directed).toBe('directed');
    expect(doc.semantics.edges['da-3'].labels).toEqual([{ text: 'reads' }]);

    expect(style.kdStyle).toBe(1);
    // w 120 and (da-2's) fontSize 16 equal the app defaults, so they're omitted
    expect(style.nodes?.['da-1']).toEqual({ x: 100, y: 200, h: 60, fontSize: 14 });
    expect(style.nodes?.['da-2']).toEqual({
      x: 400, y: 200, w: 130, h: 70,
      shape: 'circle',
      textOverflow: 'shrink-font',
    });
    expect(style.edges?.['da-3']).toEqual({
      lineStyle: 'dashed',
      waypoints: [{ x: 250, y: 200 }],
      labelAnchors: [{ t: 0.42, side: 'above' }],
    });
  });

  it('omits the default "on" side from label anchors and falls back to the midpoint without one', () => {
    const snap = makeSnapshot();
    snap.edges[0].labels[0].side = 'on';
    const { style } = snapshotToFiles(snap);
    expect(style.edges?.['da-3'].labelAnchors).toEqual([{ t: 0.42 }]);

    delete snap.edges[0].labels[0].edgeT;
    const { style: style2 } = snapshotToFiles(snap);
    expect(style2.edges?.['da-3'].labelAnchors).toEqual([{ t: 0.5 }]);
  });

  it('omits empty styles[] when no stylePath provided', () => {
    const { doc } = snapshotToFiles(makeSnapshot());
    expect(doc.styles).toEqual([]);
  });

  it('drops "box" shape from style props (it is the default)', () => {
    const { style } = snapshotToFiles(makeSnapshot());
    expect(style.nodes?.['da-1'].shape).toBeUndefined();
  });

  it('persists base values, never derived rendered sizes', () => {
    const snap: GraphSnapshot = {
      nodes: [{
        id: 'n1', x: 0, y: 0, text: 'short', isSelected: false,
        width: 89, height: 34, fontSize: 14,          // rendered (derived by fit)
        baseWidth: 200, baseHeight: 90, baseFontSize: 14,  // the inputs
        textOverflowMode: 'fit',
      }],
      edges: [],
    };
    const { style } = snapshotToFiles(snap);
    expect(style.nodes?.['n1'].w).toBe(200);
    expect(style.nodes?.['n1'].h).toBe(90);
  });

  it('a todo-graph node matching the identity defaults persists only its position', () => {
    const snap: GraphSnapshot = {
      diagramType: 'todo-graph',
      nodes: [{
        id: 'n1', x: 5, y: 6, text: 'buy milk', isSelected: false,
        width: 92, height: 50, fontSize: 14,
        baseWidth: 280, baseHeight: 70, baseFontSize: 14,
        nodeShape: 'box',
        textOverflowMode: 'fit',
      }],
      edges: [],
    };
    const { doc, style } = snapshotToFiles(snap);
    expect(doc.type).toBe('todo-graph');
    expect(style.nodes?.['n1']).toEqual({ x: 5, y: 6 });
  });

  // ─── filesToSnapshot ────────────────────────────────────────────────────

  it('reconstructs a snapshot from a doc + style', () => {
    const doc: KidrawGraphDoc = {
      kidraw: 1,
      styles: [],
      semantics: {
        nodes: {
          'a': { label: 'A' },
          'b': { label: 'B' },
        },
        edges: {
          'e1': { from: 'a', to: 'b', directed: 'directed', labels: [{ text: 'flow' }] },
        },
      },
    };
    const style: KidrawStyleSet = {
      kdStyle: 1,
      nodes: {
        'a': { x: 10, y: 20, w: 100, h: 40, fontSize: 12 },
        'b': { x: 300, y: 20, shape: 'diamond' },
      },
      edges: {
        'e1': { lineStyle: 'dotted', waypoints: [{ x: 150, y: 30 }], labelOffsets: [{ dx: 150, dy: 25 }] },
      },
    };

    const snap = filesToSnapshot(doc, style);
    expect(snap.nodes.length).toBe(2);
    expect(snap.nodes[0].id).toBe('a');
    expect(snap.nodes[0].x).toBe(10);
    expect(snap.nodes[0].width).toBe(100);
    expect(snap.nodes[0].baseWidth).toBe(100);   // file w/h are base values
    expect(snap.nodes[1].nodeShape).toBe('diamond');
    expect(snap.nodes[1].width).toBe(APP_NODE_DEFAULTS.width);    // cascade fallback
    expect(snap.nodes[1].height).toBe(APP_NODE_DEFAULTS.height);
    expect(snap.nodes[1].fontSize).toBe(APP_NODE_DEFAULTS.fontSize);
    expect(snap.nodes.every(n => n.isSelected === false)).toBe(true);

    expect(snap.edges.length).toBe(1);
    expect(snap.edges[0].srcNodeId).toBe('a');
    expect(snap.edges[0].destNodeId).toBe('b');
    expect(snap.edges[0].directedness).toBe('directed');
    expect(snap.edges[0].lineStyle).toBe('dotted');
    expect(snap.edges[0].controlPoints).toEqual([{ x: 150, y: 30 }]);
    expect(snap.edges[0].labels.length).toBe(1);
    expect(snap.edges[0].labels[0].text).toBe('flow');
    // Legacy absolute offsets survive as x/y with no anchor, so restore
    // can derive the anchor by projecting onto the path.
    expect(snap.edges[0].labels[0].x).toBe(150);
    expect(snap.edges[0].labels[0].y).toBe(25);
    expect(snap.edges[0].labels[0].edgeT).toBeUndefined();
  });

  it('restores path-relative label anchors, preferring them over legacy offsets', () => {
    const doc: KidrawGraphDoc = {
      kidraw: 1,
      styles: [],
      semantics: {
        nodes: { 'a': {}, 'b': {} },
        edges: { 'e1': { from: 'a', to: 'b', labels: [{ text: 'x' }, { text: 'y' }] } },
      },
    };
    const style: KidrawStyleSet = {
      kdStyle: 1,
      edges: { 'e1': { labelAnchors: [{ t: 0.9, side: 'below' }, { t: 0.1 }] } },
    };
    const snap = filesToSnapshot(doc, style);
    expect(snap.edges[0].labels[0].edgeT).toBe(0.9);
    expect(snap.edges[0].labels[0].side).toBe('below');
    expect(snap.edges[0].labels[1].edgeT).toBe(0.1);
    expect(snap.edges[0].labels[1].side).toBe('on');
  });

  it('a label with neither anchor nor offset lands at the path midpoint', () => {
    const doc: KidrawGraphDoc = {
      kidraw: 1,
      styles: [],
      semantics: {
        nodes: { 'a': {}, 'b': {} },
        edges: { 'e1': { from: 'a', to: 'b', labels: [{ text: 'bare' }] } },
      },
    };
    const snap = filesToSnapshot(doc, { kdStyle: 1 });
    expect(snap.edges[0].labels[0].edgeT).toBe(0.5);
    expect(snap.edges[0].labels[0].side).toBe('on');
  });

  it('fills missing props from the identity extension, not just app defaults', () => {
    const doc: KidrawGraphDoc = {
      kidraw: 1,
      type: 'todo-graph',
      styles: [],
      semantics: { nodes: { 'n1': { label: 'todo' } }, edges: {} },
    };
    const snap = filesToSnapshot(doc, { kdStyle: 1, nodes: { 'n1': { x: 1, y: 2 } } });
    const n = snap.nodes[0];
    expect(n.width).toBe(280);
    expect(n.baseWidth).toBe(280);
    expect(n.height).toBe(70);
    expect(n.fontSize).toBe(14);
    expect(n.nodeShape).toBe('box');
    expect(n.textOverflowMode).toBe('fit');
    expect(snap.diagramType).toBe('todo-graph');
  });

  it('uses app defaults when a node has no style entry at all', () => {
    const doc: KidrawGraphDoc = {
      kidraw: 1,
      styles: [],
      semantics: {
        nodes: { 'orphan': { label: 'Orphan' } },
        edges: {},
      },
    };
    const style: KidrawStyleSet = { kdStyle: 1 };

    const snap = filesToSnapshot(doc, style);
    expect(snap.nodes[0]).toEqual({
      id: 'orphan',
      x: 0,
      y: 0,
      text: 'Orphan',
      width: APP_NODE_DEFAULTS.width,
      height: APP_NODE_DEFAULTS.height,
      fontSize: APP_NODE_DEFAULTS.fontSize,
      baseWidth: APP_NODE_DEFAULTS.width,
      baseHeight: APP_NODE_DEFAULTS.height,
      baseFontSize: APP_NODE_DEFAULTS.fontSize,
      isSelected: false,
      nodeShape: APP_NODE_DEFAULTS.shape,
      textOverflowMode: APP_NODE_DEFAULTS.textOverflow,
    });
  });

  // ─── Identity / diagram type ────────────────────────────────────────────

  it('round-trips the diagram type through doc.type', () => {
    const snap = { ...makeSnapshot(), diagramType: 'todo-graph' };
    const { doc, style } = snapshotToFiles(snap);
    expect(doc.type).toBe('todo-graph');
    expect('plugins' in doc).toBeFalse();
    const back = filesToSnapshot(doc, style);
    expect(back.diagramType).toBe('todo-graph');
  });

  it('omits type entirely for the default identity', () => {
    const { doc } = snapshotToFiles(makeSnapshot());
    expect('type' in doc).toBeFalse();
    const back = filesToSnapshot(doc, { kdStyle: 1 });
    expect('diagramType' in back).toBeFalse();
  });

  it('migrates legacy plugins: [todo-graph] to the identity slot', () => {
    // legacy snapshot (e.g. old localStorage draft)
    const snap = { ...makeSnapshot(), plugins: ['todo-graph'] };
    const { doc } = snapshotToFiles(snap);
    expect(doc.type).toBe('todo-graph');
    expect('plugins' in doc).toBeFalse();

    // legacy doc (old saved file)
    const legacyDoc: KidrawGraphDoc = {
      kidraw: 1,
      styles: [],
      semantics: { nodes: { 'n1': {} }, edges: {} },
      plugins: ['todo-graph'],
    };
    const back = filesToSnapshot(legacyDoc, { kdStyle: 1 });
    expect(back.diagramType).toBe('todo-graph');
    expect(back.nodes[0].textOverflowMode).toBe('fit');
  });

  // ─── Round-trip ─────────────────────────────────────────────────────────

  it('round-trips a snapshot through files and back', () => {
    const original = makeSnapshot();
    const { doc, style } = snapshotToFiles(original);
    const restored = filesToSnapshot(doc, style);

    expect(restored.nodes.length).toBe(original.nodes.length);
    expect(restored.edges.length).toBe(original.edges.length);

    for (let i = 0; i < original.nodes.length; i++) {
      const o = original.nodes[i];
      const r = restored.nodes[i];
      expect(r.id).toBe(o.id);
      expect(r.x).toBe(o.x);
      expect(r.y).toBe(o.y);
      expect(r.text).toBe(o.text);
      // restored size is the base (original had no base set, so base = size)
      expect(r.width).toBe(o.width);
      expect(r.height).toBe(o.height);
      expect(r.fontSize).toBe(o.fontSize);
      if (o.nodeShape) expect(r.nodeShape).toBe(o.nodeShape);
      if (o.textOverflowMode) expect(r.textOverflowMode).toBe(o.textOverflowMode);
    }

    for (let i = 0; i < original.edges.length; i++) {
      const o = original.edges[i];
      const r = restored.edges[i];
      expect(r.id).toBe(o.id);
      expect(r.srcNodeId).toBe(o.srcNodeId);
      expect(r.destNodeId).toBe(o.destNodeId);
      expect(r.directedness).toBe(o.directedness);
      expect(r.lineStyle).toBe(o.lineStyle);
      expect(r.controlPoints).toEqual(o.controlPoints);
      expect(r.labels.length).toBe(o.labels.length);
      for (let j = 0; j < o.labels.length; j++) {
        expect(r.labels[j].text).toBe(o.labels[j].text);
        // Position round-trips through the path anchor, not absolute x/y.
        expect(r.labels[j].edgeT).toBe(o.labels[j].edgeT);
        expect(r.labels[j].side).toBe(o.labels[j].side);
      }
    }
  });

  it('session-only fields (pinned, isSelected) do not appear in the doc/style', () => {
    const snap: GraphSnapshot = {
      nodes: [
        {
          id: 'n1', x: 0, y: 0, text: '', width: 100, height: 50, fontSize: 12,
          isSelected: true,           // runtime
          baseWidth: 200, baseHeight: 100, baseFontSize: 24,  // persisted as w/h/fontSize
          pinned: true,               // runtime
        },
      ],
      edges: [],
    };
    const { doc, style } = snapshotToFiles(snap);
    expect(JSON.stringify(doc)).not.toContain('pinned');
    expect(JSON.stringify(doc)).not.toContain('isSelected');
    expect(JSON.stringify(style)).not.toContain('baseWidth');
    expect(JSON.stringify(style)).not.toContain('pinned');
    expect(style.nodes?.['n1'].w).toBe(200);
    expect(style.nodes?.['n1'].fontSize).toBe(24);
  });
});
