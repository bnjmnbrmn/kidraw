import Konva from 'konva';
import {DANode} from './da-node';
import {DAEdge} from './da-edge';
import {DrawingLayer} from './drawing.layer';
import {Camera} from './camera';
import type {NavCandidate} from './graph-nav';
import {NavGhost, NavGhostHost} from './nav-ghost';

/** Only the colours the ghost actually reads; the rest of a palette is noise. */
const PALETTE = {
  nodeFill: '#111', nodeStroke: '#222', nodeText: '#333',
  edgeStroke: '#444', edgeFill: '#555',
  labelFill: '#666', labelStroke: '#777', labelText: '#888',
  highlightShadowColor: '#999',
} as any;

/** Layers a test made. Overlay.clear() schedules a batchDraw, which crashes
 *  Konva if the layer outlives the suite, so each one is destroyed after. */
const layers: DrawingLayer[] = [];
afterEach(() => {
  while (layers.length) layers.pop()!.destroy();
});

function fixture(stage = {width: () => 800, height: () => 600}) {
  const drawingLayer = new DrawingLayer();
  layers.push(drawingLayer);
  const host = {
    drawingLayer,
    camera: new Camera(() => drawingLayer),
    stage,
    palette: PALETTE,
  } as unknown as NavGhostHost;
  return {ghost: new NavGhost(host), drawingLayer};
}

function candidate(edge: DAEdge, other: DANode, direction: 'out' | 'in'): NavCandidate {
  return {edge, direction, other};
}

describe('NavGhost', () => {
  it('draws a box for each end and an arrow between them', () => {
    const f = fixture();
    const source = new DANode(100, 100, 'source');
    const dest = new DANode(400, 100, 'dest');
    const edge = new DAEdge(source, dest, '');

    f.ghost.show(source, candidate(edge, dest, 'out'));

    const group = f.ghost.node!;
    expect(group).not.toBeNull();
    expect(group.find('Rect').length).toBe(2);
    expect(group.find('Arrow').length).toBe(1);
  });

  it('points the arrow the way the walk would travel', () => {
    const f = fixture();
    const source = new DANode(100, 100, 'source');
    const dest = new DANode(400, 100, 'dest');
    const edge = new DAEdge(source, dest, '');

    f.ghost.show(source, candidate(edge, dest, 'out'));
    const outward = f.ghost.node!.findOne<Konva.Arrow>('Arrow')!.points();

    f.ghost.show(source, candidate(edge, dest, 'in'));
    const inward = f.ghost.node!.findOne<Konva.Arrow>('Arrow')!.points();

    // Same segment, opposite ends: 'in' walks the edge backwards.
    expect(inward.slice(0, 2)).toEqual(outward.slice(2, 4));
    expect(inward.slice(2, 4)).toEqual(outward.slice(0, 2));
  });

  it('pulls an off-screen destination into the viewport along the same bearing', () => {
    const f = fixture();
    const source = new DANode(100, 100, 'source');
    const faraway = new DANode(40100, 100, 'faraway');
    const edge = new DAEdge(source, faraway, '');

    f.ghost.show(source, candidate(edge, faraway, 'out'));

    // Two boxes; the destination's is the one further right.
    const boxes = f.ghost.node!.getChildren(n => n instanceof Konva.Group) as Konva.Group[];
    const landing = boxes.map(b => b.x()).sort((a, b) => a - b)[1];
    expect(landing).toBeLessThan(40100);
    // Still due east of the source, so the bearing survived the pull-in.
    const sourceY = source.group.y() + source.NODE_HEIGHT / 2;
    expect(boxes.map(b => b.y())).toEqual([sourceY, sourceY]);
  });

  it('draws no arrow when the two boxes sit on each other', () => {
    const f = fixture();
    const source = new DANode(100, 100, 'source');
    const stacked = new DANode(100, 100, 'stacked');
    const edge = new DAEdge(source, stacked, '');

    f.ghost.show(source, candidate(edge, stacked, 'out'));

    expect(f.ghost.node!.find('Arrow').length).toBe(0);
    expect(f.ghost.node!.find('Rect').length).toBe(2);
  });

  it('stacks the edge labels as pills, one per label', () => {
    const f = fixture();
    const source = new DANode(100, 100, 'source');
    const dest = new DANode(500, 100, 'dest');
    const edge = new DAEdge(source, dest, '');
    edge.labels.push({label: 'first'} as any, {label: 'second'} as any);

    f.ghost.show(source, candidate(edge, dest, 'out'));

    // Two ghost boxes plus one pill per label.
    expect(f.ghost.node!.find('Rect').length).toBe(4);
    const texts = f.ghost.node!.find<Konva.Text>('Text').map(t => t.text());
    expect(texts).toContain('first');
    expect(texts).toContain('second');
  });

  it('ignores a blank edge label rather than drawing an empty pill', () => {
    const f = fixture();
    const source = new DANode(100, 100, 'source');
    const dest = new DANode(500, 100, 'dest');
    const edge = new DAEdge(source, dest, '');
    edge.labels.push({label: '   '} as any);

    f.ghost.show(source, candidate(edge, dest, 'out'));

    expect(f.ghost.node!.find('Rect').length).toBe(2);
  });

  it('inflates the ghost when zoomed out, so it stays legible', () => {
    const f = fixture();
    const source = new DANode(100, 100, 'source');
    const dest = new DANode(400, 100, 'dest');
    const edge = new DAEdge(source, dest, '');

    f.ghost.show(source, candidate(edge, dest, 'out'));
    const atFullZoom = f.ghost.node!
      .getChildren(n => n instanceof Konva.Group)[0].scaleX();

    f.drawingLayer.scale({x: 0.25, y: 0.25});
    f.ghost.show(source, candidate(edge, dest, 'out'));
    const zoomedOut = f.ghost.node!
      .getChildren(n => n instanceof Konva.Group)[0].scaleX();

    expect(atFullZoom).toBe(1);
    expect(zoomedOut).toBe(4);
  });

  it('never shrinks below its 100% size when zoomed in', () => {
    const f = fixture();
    const source = new DANode(100, 100, 'source');
    const dest = new DANode(400, 100, 'dest');
    const edge = new DAEdge(source, dest, '');
    f.drawingLayer.scale({x: 4, y: 4});

    f.ghost.show(source, candidate(edge, dest, 'out'));

    expect(f.ghost.node!.getChildren(n => n instanceof Konva.Group)[0].scaleX()).toBe(1);
  });

  it('replaces the previous preview rather than stacking them up', () => {
    const f = fixture();
    const source = new DANode(100, 100, 'source');
    const first = new DANode(400, 100, 'first');
    const second = new DANode(100, 400, 'second');
    const toFirst = new DAEdge(source, first, '');
    const toSecond = new DAEdge(source, second, '');

    f.ghost.show(source, candidate(toFirst, first, 'out'));
    const before = f.ghost.node;
    f.ghost.show(source, candidate(toSecond, second, 'out'));

    expect(f.ghost.node).not.toBe(before);
    expect(f.ghost.node!.find('Rect').length).toBe(2);
  });

  it('takes the preview away on clear', () => {
    const f = fixture();
    const source = new DANode(100, 100, 'source');
    const dest = new DANode(400, 100, 'dest');
    const edge = new DAEdge(source, dest, '');
    f.ghost.show(source, candidate(edge, dest, 'out'));

    f.ghost.clear();

    expect(f.ghost.node).toBeNull();
  });
});
