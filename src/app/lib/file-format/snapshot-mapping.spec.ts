import { GraphSnapshot } from '../../drawing-area/graph-snapshot';
import {
  DEFAULT_FONT_SIZE,
  DEFAULT_NODE_HEIGHT,
  DEFAULT_NODE_WIDTH,
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
          { id: 'da-3-label-0', x: 250, y: 195, text: 'reads', fontSize: 12, isSelected: false },
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

  it('splits a snapshot into a graph doc + style set', () => {
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
    expect(style.nodes?.['da-1']).toEqual({ x: 100, y: 200, w: 120, h: 60, fontSize: 14 });
    expect(style.nodes?.['da-2']).toEqual({
      x: 400, y: 200, w: 130, h: 70, fontSize: 16,
      shape: 'circle',
      textOverflow: 'shrink-font',
    });
    expect(style.edges?.['da-3']).toEqual({
      lineStyle: 'dashed',
      waypoints: [{ x: 250, y: 200 }],
      labelOffsets: [{ dx: 250, dy: 195 }],
    });
  });

  it('omits empty styles[] when no stylePath provided', () => {
    const { doc } = snapshotToFiles(makeSnapshot());
    expect(doc.styles).toEqual([]);
  });

  it('drops "box" shape from style props (it is the default)', () => {
    const { style } = snapshotToFiles(makeSnapshot());
    expect(style.nodes?.['da-1'].shape).toBeUndefined();
  });

  it('produces an empty edge style entry only when at least one field is set', () => {
    const snap: GraphSnapshot = {
      nodes: [
        { id: 'n1', x: 0, y: 0, text: '', width: 100, height: 50, fontSize: 12, isSelected: false },
        { id: 'n2', x: 0, y: 0, text: '', width: 100, height: 50, fontSize: 12, isSelected: false },
      ],
      edges: [
        { id: 'e1', srcNodeId: 'n1', destNodeId: 'n2', isSelected: false, labels: [] },
      ],
    };
    const { style } = snapshotToFiles(snap);
    expect(style.edges?.['e1']).toBeUndefined();
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
    expect(snap.nodes[1].nodeShape).toBe('diamond');
    expect(snap.nodes[1].width).toBe(DEFAULT_NODE_WIDTH);    // default fallback
    expect(snap.nodes[1].height).toBe(DEFAULT_NODE_HEIGHT);
    expect(snap.nodes[1].fontSize).toBe(DEFAULT_FONT_SIZE);
    expect(snap.nodes.every(n => n.isSelected === false)).toBe(true);

    expect(snap.edges.length).toBe(1);
    expect(snap.edges[0].srcNodeId).toBe('a');
    expect(snap.edges[0].destNodeId).toBe('b');
    expect(snap.edges[0].directedness).toBe('directed');
    expect(snap.edges[0].lineStyle).toBe('dotted');
    expect(snap.edges[0].controlPoints).toEqual([{ x: 150, y: 30 }]);
    expect(snap.edges[0].labels.length).toBe(1);
    expect(snap.edges[0].labels[0].text).toBe('flow');
    expect(snap.edges[0].labels[0].x).toBe(150);
    expect(snap.edges[0].labels[0].y).toBe(25);
  });

  it('uses defaults when a node has no style entry at all', () => {
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
      width: DEFAULT_NODE_WIDTH,
      height: DEFAULT_NODE_HEIGHT,
      fontSize: DEFAULT_FONT_SIZE,
      isSelected: false,
    });
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
      expect(r.width).toBe(o.width);
      expect(r.height).toBe(o.height);
      expect(r.fontSize).toBe(o.fontSize);
      // 'box' is dropped on serialize; restored as undefined
      if (o.nodeShape && o.nodeShape !== 'box') {
        expect(r.nodeShape).toBe(o.nodeShape);
      }
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
        expect(r.labels[j].x).toBe(o.labels[j].x);
        expect(r.labels[j].y).toBe(o.labels[j].y);
      }
    }
  });

  it('runtime-only fields (pinned, baseWidth) do not appear in the doc/style', () => {
    const snap: GraphSnapshot = {
      nodes: [
        {
          id: 'n1', x: 0, y: 0, text: '', width: 100, height: 50, fontSize: 12,
          isSelected: true,           // runtime
          baseWidth: 200, baseHeight: 100, baseFontSize: 24,  // runtime
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
  });
});
