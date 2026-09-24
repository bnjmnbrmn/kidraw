import Konva from 'konva';
import {DANode} from './da-node';
import {DAEdge} from './da-edge';
import {DrawingLayer} from './drawing.layer';
import {Camera} from './camera';
import {NavJourney} from './nav-journey';
import {LinkNavController, LinkNavHost} from './link-nav-controller';

/**
 * A host over a real DrawingLayer, a real crosshairs layer and a real journey,
 * so the overlay assertions read what actually landed on the layer. Everything
 * the controller only talks *at* — status, tweens, crosshairs travel — is a spy.
 */
function fixture(options: {
  crosshairsAt?: {x: number; y: number};
  under?: () => DANode[];
} = {}) {
  const drawingLayer = new DrawingLayer();
  const journey = new NavJourney();
  const at = options.crosshairsAt ?? {x: 0, y: 0};
  const crosshairsLayer = Object.assign(new Konva.Layer(), {
    crosshairsX: () => at.x,
    crosshairsY: () => at.y,
  });
  const jumpCrosshairsToStopCenter = jasmine.createSpy('jumpCrosshairsToStopCenter');
  const emitStatus = jasmine.createSpy('emitStatus');
  const host = {
    drawingLayer,
    crosshairsLayer,
    stage: {width: () => 800, height: () => 600},
    camera: new Camera(() => drawingLayer),
    probe: {nodes: options.under ?? (() => [])},
    journey,
    navGrid: {jumpCrosshairsToStopCenter},
    crosshairsStroke: '#abcdef',
    crosshairMovementDuration: 0.1,
    emitStatus,
    finishTweens: () => {},
    beginMode: () => {},
    focusEdge: (edge: DAEdge | null) => journey.focusEdge(edge),
  } as unknown as LinkNavHost;

  const nodes = (...added: DANode[]) => {
    for (const node of added) drawingLayer.addRawNode(node);
    return added;
  };
  return {
    linkNav: new LinkNavController(host),
    drawingLayer, journey, nodes, jumpCrosshairsToStopCenter, emitStatus,
    /** The quadrant overlay as it sits on the crosshairs layer. */
    quadrants: () => crosshairsLayer.findOne<Konva.Group>('.move-by-link-quadrants') ?? null,
  };
}

describe('LinkNavController', () => {
  describe('entering', () => {
    it('snaps to the nearest node and immediately focuses an incident link', () => {
      const f = fixture({crosshairsAt: {x: 190, y: 180}});
      const [nearest, dest] = f.nodes(
        new DANode(100, 100, 'nearest'),
        new DANode(400, 100, 'dest'),
        new DANode(700, 500, 'farther'));
      const edge = new DAEdge(nearest, dest, '');

      f.linkNav.enter();

      expect(f.linkNav.active).toBeTrue();
      expect(f.journey.focusedEdge).toBe(edge);
      expect(f.jumpCrosshairsToStopCenter).toHaveBeenCalledWith({x: 160, y: 160});
    });

    it('starts from the node under the crosshairs without moving them', () => {
      const under = new DANode(400, 100, 'under');
      const other = new DANode(100, 100, 'other');
      const f = fixture({crosshairsAt: {x: 440, y: 130}, under: () => [under]});
      f.nodes(under, other);
      new DAEdge(under, other, '');

      f.linkNav.enter();

      expect(f.jumpCrosshairsToStopCenter).not.toHaveBeenCalled();
      expect(f.journey.lastNodeAmong([under, other])).toBe(under);
    });

    it('says so, and focuses nothing, when the node has no links', () => {
      const lone = new DANode(100, 100, 'lone');
      const f = fixture({under: () => [lone]});
      f.nodes(lone);

      f.linkNav.enter();

      expect(f.journey.focusedEdge).toBeNull();
      expect(f.emitStatus).toHaveBeenCalledWith('No edges here.');
      // Still held, and still drawing: the quadrants show there is nothing.
      expect(f.linkNav.active).toBeTrue();
      expect(f.quadrants()).not.toBeNull();
    });

    it('says so when there is no node to start from at all', () => {
      const f = fixture();

      f.linkNav.enter();

      expect(f.linkNav.active).toBeFalse();
      expect(f.emitStatus)
        .toHaveBeenCalledWith('Move the crosshairs onto a node to navigate.');
    });
  });

  describe('moving', () => {
    it('walks a quadrant holding one link, and focuses onward from the landing', () => {
      const source = new DANode(0, 0, 'source');
      const f = fixture({under: () => [source]});
      const [, landing, forward] = f.nodes(
        source, new DANode(300, 0, 'landing'), new DANode(600, 0, 'forward'));
      new DAEdge(source, landing, '');
      const forwardEdge = new DAEdge(landing, forward, '');
      f.linkNav.enter();

      f.linkNav.move('east');

      expect(f.journey.lastNodeAmong([source, landing, forward])).toBe(landing);
      // Momentum carried east, so the onward edge is focused, not the one back.
      expect(f.journey.focusedEdge).toBe(forwardEdge);
      expect(f.jumpCrosshairsToStopCenter).toHaveBeenCalled();
    });

    // Not covered here: what a press into an empty quadrant should do. With a
    // link focused elsewhere, moveLinkQuadrant's corner-crossing branch falls
    // back to the focused edge, so a north press on a lone east link re-reports
    // it as "north: east" and "No link in the north quadrant." never fires.
    // Whether that is the wanted behaviour is Ben's call, so nothing here pins
    // it either way. Written up in
    // notes/bug-empty-quadrant-announced-as-a-move.md.

    it('does nothing at all when no session is held', () => {
      const f = fixture();

      f.linkNav.move('east');

      expect(f.emitStatus).not.toHaveBeenCalled();
    });
  });

  describe('releasing', () => {
    it('clears focus and the overlay without traversing', () => {
      const source = new DANode(0, 0, 'source');
      const f = fixture({under: () => [source]});
      const [, dest] = f.nodes(source, new DANode(300, 0, 'dest'));
      new DAEdge(source, dest, '');
      f.linkNav.enter();
      expect(f.quadrants()).not.toBeNull();

      f.linkNav.release();

      expect(f.linkNav.active).toBeFalse();
      expect(f.journey.focusedEdge).toBeNull();
      expect(f.quadrants()).toBeNull();
      // Releasing is not a traversal: the walk is still at the source.
      expect(f.journey.lastNodeAmong([source, dest])).toBe(source);
    });
  });

  describe('quadrant overlay', () => {
    it('draws four zoom-stable boundary rays through the source', () => {
      const source = new DANode(340, 240, 'source');
      const f = fixture({under: () => [source]});
      const [, dest] = f.nodes(source, new DANode(640, 240, 'dest'));
      new DAEdge(source, dest, '');

      f.linkNav.enter();

      const rays = f.quadrants()!.find<Konva.Line>('.move-by-link-diagonal');
      expect(rays.length).toBe(4);
      rays.forEach(ray => {
        expect(ray.points().slice(0, 2)).toEqual([400, 300]);
        expect(ray.dash()).toEqual([7, 5]);
        expect(ray.strokeScaleEnabled()).toBeFalse();
      });
    });

    it('washes the quadrant the focused link is in', () => {
      const source = new DANode(340, 240, 'source');
      const f = fixture({under: () => [source]});
      const [, dest] = f.nodes(source, new DANode(640, 240, 'dest'));
      new DAEdge(source, dest, '');

      f.linkNav.enter();

      expect(f.quadrants()!.find('.move-by-link-active-quadrant').length).toBe(1);
    });

    it('redraws in place when the theme or the stage changes', () => {
      const source = new DANode(340, 240, 'source');
      const f = fixture({under: () => [source]});
      const [, dest] = f.nodes(source, new DANode(640, 240, 'dest'));
      new DAEdge(source, dest, '');
      f.linkNav.enter();
      const first = f.quadrants();

      f.linkNav.redraw();

      expect(f.quadrants()).not.toBe(first);
      expect(f.quadrants()!.find('.move-by-link-diagonal').length).toBe(4);
    });

    it('draws nothing on redraw when no session is held', () => {
      const f = fixture();

      f.linkNav.redraw();

      expect(f.quadrants()).toBeNull();
    });
  });
});
