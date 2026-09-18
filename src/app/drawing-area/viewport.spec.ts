import {Viewport, ViewportInset} from './viewport';

function viewport(inset: Partial<ViewportInset> | undefined, w = 1000, h = 600): Viewport {
  return new Viewport(
    () => ({width: () => w, height: () => h}),
    () => inset as ViewportInset | undefined,
  );
}

describe('Viewport', () => {
  it('is the whole stage when nothing covers it', () => {
    const v = viewport({left: 0, right: 0, top: 0, bottom: 0});
    expect([v.minX, v.maxX, v.minY, v.maxY]).toEqual([0, 1000, 0, 600]);
    expect(v.center).toEqual({x: 500, y: 300});
  });

  it('shrinks away from each covered edge', () => {
    const v = viewport({left: 100, right: 50, top: 40, bottom: 10});
    expect([v.minX, v.maxX, v.minY, v.maxY]).toEqual([100, 950, 40, 590]);
    expect(v.width).toBe(850);
    expect(v.height).toBe(550);
    expect(v.center).toEqual({x: 525, y: 315});
  });

  it('degrades to the full stage when the inset is missing', () => {
    const v = viewport(undefined);
    expect([v.minX, v.maxX, v.minY, v.maxY]).toEqual([0, 1000, 0, 600]);
  });

  it('degrades edge by edge when the inset is only partly bound', () => {
    const v = viewport({left: 120} as Partial<ViewportInset>);
    expect(v.minX).toBe(120);
    expect(v.maxX).toBe(1000);
    expect(v.minY).toBe(0);
  });

  it('never lets one overlay swallow its axis', () => {
    // A panel wider than the window would otherwise freeze navigation.
    const v = viewport({left: 5000, right: 0, top: 0, bottom: 0});
    expect(v.minX).toBe(450);          // capped at 45% of 1000
    expect(v.width).toBeGreaterThan(0);
  });

  it('keeps a width of at least 1 when both edges cap out', () => {
    const v = viewport({left: 5000, right: 5000, top: 5000, bottom: 5000});
    expect(v.width).toBeGreaterThanOrEqual(1);
    expect(v.height).toBeGreaterThanOrEqual(1);
  });

  it('clamps a point inside, with a margin', () => {
    const v = viewport({left: 100, right: 50, top: 40, bottom: 10});
    expect(v.clamp({x: 0, y: 0})).toEqual({x: 100, y: 40});
    expect(v.clamp({x: 9999, y: 9999})).toEqual({x: 950, y: 590});
    expect(v.clamp({x: 0, y: 0}, {x: 20, y: 5})).toEqual({x: 120, y: 45});
  });

  it('leaves a point that is already inside alone', () => {
    const v = viewport({left: 100, right: 50, top: 40, bottom: 10});
    expect(v.clamp({x: 400, y: 300})).toEqual({x: 400, y: 300});
  });

  it('follows the stage as it resizes', () => {
    let w = 1000;
    const v = new Viewport(() => ({width: () => w, height: () => 600}),
                           () => ({left: 0, right: 100, top: 0, bottom: 0}));
    expect(v.maxX).toBe(900);
    w = 500;
    expect(v.maxX).toBe(400);
  });
});
