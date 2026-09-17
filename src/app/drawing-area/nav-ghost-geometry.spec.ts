import {boxEdgePoint, ghostLandingPoint} from './nav-ghost-geometry';

/** A 100x100 viewport at the origin. */
const LO = {x: 0, y: 0};
const HI = {x: 100, y: 100};

describe('ghostLandingPoint', () => {
  it('leaves a destination that already fits where it is', () => {
    expect(ghostLandingPoint({x: 10, y: 10}, {x: 60, y: 40}, LO, HI))
      .toEqual({x: 60, y: 40});
  });

  it('slides an off-screen destination back along the ray from the source', () => {
    // Source at the centre, destination twice as far right as the viewport
    // allows: the landing point stays on the same horizontal line.
    const landing = ghostLandingPoint({x: 50, y: 50}, {x: 300, y: 50}, LO, HI);
    expect(landing.x).toBeCloseTo(100);
    expect(landing.y).toBeCloseTo(50);
  });

  it('keeps the direction of the real edge when sliding diagonally', () => {
    const source = {x: 50, y: 50};
    const destination = {x: 250, y: 150};
    const landing = ghostLandingPoint(source, destination, LO, HI);
    // Still on the source→destination ray: equal fractions along each axis.
    const tx = (landing.x - source.x) / (destination.x - source.x);
    const ty = (landing.y - source.y) / (destination.y - source.y);
    expect(tx).toBeCloseTo(ty);
    expect(landing.x).toBeLessThanOrEqual(HI.x + 1e-9);
    expect(landing.y).toBeLessThanOrEqual(HI.y + 1e-9);
  });

  it('falls back to a plain clamp when the source is off-screen too', () => {
    expect(ghostLandingPoint({x: -500, y: -500}, {x: 300, y: 300}, LO, HI))
      .toEqual({x: 100, y: 100});
  });

  it('lands inside the viewport whichever way the destination escapes', () => {
    const source = {x: 50, y: 50};
    for (const destination of [
      {x: -400, y: 50}, {x: 50, y: -400}, {x: 400, y: 50}, {x: 50, y: 400},
      {x: -300, y: 400}, {x: 400, y: -300},
    ]) {
      const landing = ghostLandingPoint(source, destination, LO, HI);
      expect(landing.x).withContext(`${JSON.stringify(destination)} x`)
        .toBeGreaterThanOrEqual(LO.x - 1e-9);
      expect(landing.x).toBeLessThanOrEqual(HI.x + 1e-9);
      expect(landing.y).withContext(`${JSON.stringify(destination)} y`)
        .toBeGreaterThanOrEqual(LO.y - 1e-9);
      expect(landing.y).toBeLessThanOrEqual(HI.y + 1e-9);
    }
  });
});

describe('boxEdgePoint', () => {
  const half = {w: 30, h: 10};

  it('crosses the vertical border for a horizontal ray', () => {
    expect(boxEdgePoint({x: 0, y: 0}, half, {x: 1, y: 0})).toEqual({x: 30, y: 0});
    expect(boxEdgePoint({x: 0, y: 0}, half, {x: -1, y: 0})).toEqual({x: -30, y: 0});
  });

  it('crosses the horizontal border for a vertical ray', () => {
    expect(boxEdgePoint({x: 0, y: 0}, half, {x: 0, y: 1})).toEqual({x: 0, y: 10});
  });

  it('leaves the point on the border of a wide box, not past it', () => {
    const p = boxEdgePoint({x: 0, y: 0}, half, {x: 1, y: 1});
    // The short axis governs: the ray exits through the top, not the side.
    expect(p.y).toBeCloseTo(10);
    expect(Math.abs(p.x)).toBeLessThanOrEqual(half.w + 1e-9);
  });

  it('is unaffected by the magnitude of the direction', () => {
    const near = boxEdgePoint({x: 5, y: 5}, half, {x: 2, y: 1});
    const far = boxEdgePoint({x: 5, y: 5}, half, {x: 200, y: 100});
    expect(near.x).toBeCloseTo(far.x);
    expect(near.y).toBeCloseTo(far.y);
  });
});
