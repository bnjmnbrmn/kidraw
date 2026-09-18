import Konva from 'konva';
import {DANode} from './da-node';
import {DrawingLayer} from './drawing.layer';
import type {GrowGhostTarget} from './grow-ghost-targets';
import {GrowAim, GrowGhost, GrowGhostHost} from './grow-ghost';

/** Overlay.clear() schedules a batchDraw; a layer outliving the suite crashes
 *  Konva in afterAll, so each one is destroyed after its test. */
const layers: DrawingLayer[] = [];
afterEach(() => {
  while (layers.length) layers.pop()!.destroy();
});

function fixture() {
  const drawingLayer = new DrawingLayer();
  layers.push(drawingLayer);
  const host = {drawingLayer, stroke: '#abcdef'} as unknown as GrowGhostHost;
  return {ghost: new GrowGhost(host), drawingLayer};
}

function spot(id: string, x: number, y: number): GrowGhostTarget {
  return {id, x, y, source: 'grid'};
}

/** An aim with nothing selected: anchored, aiming at nothing. */
function aim(over: Partial<GrowAim> = {}): GrowAim {
  const base: GrowAim = {
    anchor: new DANode(100, 100, 'anchor'),
    origin: {x: 160, y: 160},
    placing: false,
    placePos: null,
    newNodeShape: 'box',
    slotShape: 'box',
    target: null,
    insertionTarget: null,
    targets: [],
    dirState: 0,
  };
  return {...base, ...over};
}

describe('GrowGhost', () => {
  describe('what it offers', () => {
    it('offers a self-loop when anchored but aimed at nothing', () => {
      const f = fixture();

      f.ghost.show(aim());

      expect(f.ghost.node!.find('.grow-self-loop-preview').length).toBe(1);
    });

    it('outlines the anchor, and draws no edge, when aimed back at it', () => {
      const f = fixture();
      const anchor = new DANode(100, 100, 'anchor');

      f.ghost.show(aim({anchor, target: anchor}));

      expect(f.ghost.node!.find('.grow-home-target').length).toBe(1);
      // An edge here would have zero length.
      expect(f.ghost.node!.find('Arrow').length).toBe(0);
    });

    it('draws a node but no edge on an empty-canvas add', () => {
      const f = fixture();

      f.ghost.show(aim({anchor: null}));

      expect(f.ghost.node!.find('Arrow').length).toBe(0);
      expect(f.ghost.node!.find('Rect').length).toBe(1);
    });

    it('connects the anchor to an existing node it is aimed at', () => {
      const f = fixture();
      const target = new DANode(600, 100, 'target');

      f.ghost.show(aim({target}));

      expect(f.ghost.node!.find('Arrow').length).toBe(1);
      expect(f.ghost.node!.find('.grow-self-loop-preview').length).toBe(0);
    });
  });

  describe('the lattice slots', () => {
    it('draws a marker and a "+" for every spot on offer', () => {
      const f = fixture();
      const targets = [spot('a', 400, 160), spot('b', 160, 400)];

      f.ghost.show(aim({targets}));

      expect(f.ghost.node!.find('.grow-insertion-target').length).toBe(2);
      expect(f.ghost.node!.find('.grow-insertion-kind').length).toBe(2);
    });

    it('draws the aimed-at spot at full strength and the rest faint', () => {
      const f = fixture();
      const aimed = spot('a', 400, 160);
      const other = spot('b', 160, 400);

      f.ghost.show(aim({targets: [aimed, other], insertionTarget: aimed}));

      const active = f.ghost.node!.findOne<Konva.Shape>('.grow-insertion-target-active')!;
      const faint = f.ghost.node!.findOne<Konva.Shape>('.grow-insertion-target')!;
      expect(active.opacity()).toBe(1);
      expect(faint.opacity()).toBeLessThan(1);
    });

    it('hides the spots while a node is being placed freely', () => {
      const f = fixture();

      f.ghost.show(aim({
        targets: [spot('a', 400, 160)],
        placing: true,
        placePos: {x: 500, y: 500},
      }));

      expect(f.ghost.node!.find('.grow-insertion-target').length).toBe(0);
    });
  });

  describe('the node that would land', () => {
    it('draws the placing node in the shape that was picked', () => {
      const f = fixture();
      const at = {x: 500, y: 500};

      f.ghost.show(aim({placing: true, placePos: at, newNodeShape: 'circle'}));
      expect(f.ghost.node!.find('Ellipse').length).toBe(1);

      f.ghost.show(aim({placing: true, placePos: at, newNodeShape: 'diamond'}));
      expect(f.ghost.node!.find('Line').length).toBe(1);

      f.ghost.show(aim({placing: true, placePos: at, newNodeShape: 'junction'}));
      expect(f.ghost.node!.find('Circle').length).toBe(1);
    });

    it('draws the slots in the default shape, not the picked one', () => {
      const f = fixture();

      f.ghost.show(aim({targets: [spot('a', 400, 160)], slotShape: 'circle'}));

      expect(f.ghost.node!.find('Ellipse').length).toBe(1);
    });
  });

  describe('the edge it would create', () => {
    it('puts a head on the far end when the edge runs forward', () => {
      const f = fixture();
      const arrow = drawEdge(f, 0);

      expect(arrow.pointerAtEnding()).toBeTrue();
      expect(arrow.pointerAtBeginning()).toBeFalse();
    });

    it('puts a head on the near end when the edge runs back', () => {
      const arrow = drawEdge(fixture(), 1);

      expect(arrow.pointerAtEnding()).toBeFalse();
      expect(arrow.pointerAtBeginning()).toBeTrue();
    });

    it('puts a head on neither end when the edge is undirected', () => {
      const arrow = drawEdge(fixture(), 2);

      expect(arrow.pointerAtEnding()).toBeFalse();
      expect(arrow.pointerAtBeginning()).toBeFalse();
    });

    it('puts a head on both ends when the edge is bidirectional', () => {
      const arrow = drawEdge(fixture(), 3);

      expect(arrow.pointerAtEnding()).toBeTrue();
      expect(arrow.pointerAtBeginning()).toBeTrue();
    });

    it('starts and ends the arrow outside both boxes', () => {
      const f = fixture();
      const target = new DANode(600, 100, 'target');
      const anchor = new DANode(100, 100, 'anchor');

      f.ghost.show(aim({anchor, target}));

      const [x1, , x2] = f.ghost.node!.findOne<Konva.Arrow>('Arrow')!.points();
      // Clear of the anchor's right edge and short of the target's centre.
      expect(x1).toBeGreaterThan(160);
      expect(x2).toBeLessThan(660);
    });
  });

  it('replaces the previous preview rather than stacking them up', () => {
    const f = fixture();
    f.ghost.show(aim({targets: [spot('a', 400, 160)]}));
    const before = f.ghost.node;

    f.ghost.show(aim({targets: [spot('a', 400, 160), spot('b', 160, 400)]}));

    expect(f.ghost.node).not.toBe(before);
    expect(f.ghost.node!.find('.grow-insertion-target').length).toBe(2);
  });

  it('takes the preview away on clear', () => {
    const f = fixture();
    f.ghost.show(aim());

    f.ghost.clear(false);

    expect(f.ghost.node).toBeNull();
  });
});

/** Draw an anchor→node edge at the given directedness and return its arrow. */
function drawEdge(f: ReturnType<typeof fixture>, dirState: number): Konva.Arrow {
  f.ghost.show(aim({target: new DANode(600, 100, 'target'), dirState}));
  return f.ghost.node!.findOne<Konva.Arrow>('Arrow')!;
}
