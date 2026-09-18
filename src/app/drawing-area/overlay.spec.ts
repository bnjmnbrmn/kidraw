import Konva from 'konva';
import {Overlay} from './overlay';

/** A layer that records what was asked of it. */
function spyLayer() {
  const layer = new Konva.Layer();
  spyOn(layer, 'batchDraw');
  spyOn(layer, 'add').and.callThrough();
  return layer;
}

describe('Overlay', () => {
  let layer: Konva.Layer;
  let overlay: Overlay<Konva.Rect>;
  const rect = () => new Konva.Rect({width: 1, height: 1});

  beforeEach(() => {
    layer = spyLayer();
    overlay = new Overlay<Konva.Rect>(() => layer);
  });

  it('starts empty', () => {
    expect(overlay.node).toBeNull();
    expect(overlay.showing).toBeFalse();
  });

  it('adds what it is given to the layer', () => {
    const shown = overlay.show(rect);
    expect(overlay.node).toBe(shown);
    expect(overlay.showing).toBeTrue();
    expect(layer.add).toHaveBeenCalledWith(shown);
  });

  it('destroys the previous one before building the next', () => {
    const first = overlay.show(rect);
    const destroy = spyOn(first, 'destroy').and.callThrough();
    let destroyedBeforeBuild = false;
    overlay.show(() => {
      destroyedBeforeBuild = destroy.calls.any();
      return rect();
    });
    expect(destroyedBeforeBuild).withContext('old one gone before build()').toBeTrue();
    expect(overlay.node).not.toBe(first);
  });

  it('clears what is showing', () => {
    const shown = overlay.show(rect);
    const destroy = spyOn(shown, 'destroy').and.callThrough();
    expect(overlay.clear()).toBeTrue();
    expect(destroy).toHaveBeenCalled();
    expect(overlay.node).toBeNull();
  });

  it('reports that there was nothing to clear, and does not repaint', () => {
    expect(overlay.clear()).toBeFalse();
    expect(layer.batchDraw).not.toHaveBeenCalled();
  });

  it('repaints on clear, and can be told not to', () => {
    // Konva repaints of its own accord when a node is destroyed, so the
    // question is not whether batchDraw ran but whether clear() added one.
    const draws = () => (layer.batchDraw as jasmine.Spy).calls.count();

    overlay.show(rect);
    const beforeQuiet = draws();
    overlay.clear(false);
    const quiet = draws() - beforeQuiet;

    overlay.show(rect);
    const beforeLoud = draws();
    overlay.clear(true);
    const loud = draws() - beforeLoud;

    expect(loud).toBeGreaterThan(quiet);
  });

  it('puts it on top by default, and at the bottom when asked', () => {
    const under = new Konva.Rect({width: 1, height: 1});
    layer.add(under);
    const top = overlay.show(rect);
    expect(top.zIndex()).toBeGreaterThan(under.zIndex());
    const bottom = overlay.show(rect, 'bottom');
    expect(bottom.zIndex()).toBeLessThan(under.zIndex());
  });

  it('tolerates a layer that does not exist yet', () => {
    const early = new Overlay<Konva.Rect>(() => undefined);
    expect(() => early.show(rect)).not.toThrow();
    expect(() => early.clear()).not.toThrow();
  });
});
