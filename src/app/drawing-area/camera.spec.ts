import {Camera, CameraLayer} from './camera';

/** A layer at a known pan and zoom. */
function cameraAt(x: number, y: number, scale: number): Camera {
  const layer: CameraLayer = {x: () => x, y: () => y, scaleX: () => scale};
  return new Camera(() => layer);
}

describe('Camera', () => {
  it('reports the layer transform it is watching', () => {
    const camera = cameraAt(30, -10, 2);
    expect(camera.scale).toBe(2);
    expect(camera.origin).toEqual({x: 30, y: -10});
  });

  it('converts stage pixels to layer units', () => {
    expect(cameraAt(30, -10, 2).toLayer({x: 130, y: 90})).toEqual({x: 50, y: 50});
  });

  it('converts layer units to stage pixels', () => {
    expect(cameraAt(30, -10, 2).toStage({x: 50, y: 50})).toEqual({x: 130, y: 90});
  });

  it('round-trips a point through both spaces', () => {
    const camera = cameraAt(-17.5, 220, 0.375);
    const start = {x: 12.25, y: -430.5};
    const there = camera.toStage(start);
    const back = camera.toLayer(there);
    expect(back.x).toBeCloseTo(start.x, 10);
    expect(back.y).toBeCloseTo(start.y, 10);
  });

  it('is unaffected by pan when converting a distance', () => {
    expect(cameraAt(999, -999, 4).toLayerDistance(16)).toBe(4);
    expect(cameraAt(0, 0, 4).toStageDistance(4)).toBe(16);
  });

  it('round-trips a distance', () => {
    const camera = cameraAt(5, 5, 0.125);
    expect(camera.toStageDistance(camera.toLayerDistance(24))).toBeCloseTo(24, 10);
  });

  it('converts a stage rectangle to layer bounds', () => {
    // 100x40 box at stage (130, 90), under pan (30, -10) and zoom 2.
    expect(cameraAt(30, -10, 2).boundsToLayer({x: 130, y: 90, width: 100, height: 40}))
      .toEqual({minX: 50, minY: 50, maxX: 100, maxY: 70});
  });

  it('follows the layer as it pans and zooms', () => {
    let scale = 1, x = 0;
    const camera = new Camera(() => ({x: () => x, y: () => 0, scaleX: () => scale}));
    expect(camera.toLayer({x: 100, y: 0}).x).toBe(100);
    x = 50;
    expect(camera.toLayer({x: 100, y: 0}).x).toBe(50);
    scale = 2;
    expect(camera.toLayer({x: 100, y: 0}).x).toBe(25);
  });
});
