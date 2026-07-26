import {NavigationGridStop} from './navigation-grid';
import {
  buildQuadrantRingGrid,
  nextQuadrantRingStop,
  quarterArcPoints,
} from './navigation-quadrant-rings';

function stop(id: string, cx: number, cy: number): NavigationGridStop {
  return {id, kind: 'node', cx, cy};
}

describe('adaptive quadrant-ring navigation', () => {
  it('gives every stop its own radial rank within its quadrant', () => {
    const grid = buildQuadrantRingGrid([
      stop('east-near', 40, 0),
      stop('east-middle', 80, 20),
      stop('east-far', 150, -10),
      stop('north-near', 0, -30),
      stop('north-far', 20, -100),
    ], {x: 0, y: 0});

    expect(grid.rings.east.map(ring => ring.stop.source.id)).toEqual([
      'east-near',
      'east-middle',
      'east-far',
    ]);
    expect(grid.rings.north.map(ring => ring.stop.source.id)).toEqual([
      'north-near',
      'north-far',
    ]);
    expect(grid.rings.east[0].outerRadius).toBeCloseTo(
      (40 + Math.hypot(80, 20)) / 2,
    );
    expect(grid.rings.north[0].outerRadius).toBeCloseTo(
      (30 + Math.hypot(20, 100)) / 2,
    );
    expect(grid.rings.east[0].outerRadius)
      .not.toBeCloseTo(grid.rings.north[0].outerRadius);
  });

  it('steps outward one occupied quarter-ring at a time', () => {
    const grid = buildQuadrantRingGrid([
      stop('near', 50, 10),
      stop('middle', 90, -10),
      stop('far', 140, 20),
    ], {x: 0, y: 0});

    const near = nextQuadrantRingStop(grid, 'east', null);
    const middle = nextQuadrantRingStop(grid, 'east', near);
    const far = nextQuadrantRingStop(grid, 'east', middle);

    expect(near?.source.id).toBe('near');
    expect(middle?.source.id).toBe('middle');
    expect(far?.source.id).toBe('far');
    expect(nextQuadrantRingStop(grid, 'east', far)).toBeNull();
  });

  it('keeps co-radial stops as separate, deterministically ordered rings', () => {
    const grid = buildQuadrantRingGrid([
      stop('off-axis', 80, 60),
      stop('on-axis', 100, 0),
    ], {x: 0, y: 0});

    expect(grid.rings.east.map(ring => ring.stop.source.id)).toEqual([
      'on-axis',
      'off-axis',
    ]);
  });

  it('draws an east quarter arc from northeast to southeast', () => {
    const points = quarterArcPoints({x: 0, y: 0}, 100, 'east', 2);

    expect(points[0]).toBeCloseTo(Math.SQRT1_2 * 100);
    expect(points[1]).toBeCloseTo(-Math.SQRT1_2 * 100);
    expect(points[2]).toBeCloseTo(100);
    expect(points[3]).toBeCloseTo(0);
    expect(points[4]).toBeCloseTo(Math.SQRT1_2 * 100);
    expect(points[5]).toBeCloseTo(Math.SQRT1_2 * 100);
  });
});
