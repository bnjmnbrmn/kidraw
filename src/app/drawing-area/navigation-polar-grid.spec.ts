import {bandIndexForStop, NavigationGridStop} from './navigation-grid';
import {
  buildPolarNavigationGrid,
  choosePolarSeam,
  circularAngleDistance,
  polarDirectionForCardinal,
} from './navigation-polar-grid';

function stop(id: string, cx: number, cy: number): NavigationGridStop {
  return {id, kind: 'node', cx, cy};
}

describe('adaptive polar navigation grid', () => {
  it('puts the seam in the largest empty gap so angles around east stay together', () => {
    const degrees = (value: number) => value * Math.PI / 180;
    const seam = choosePolarSeam([degrees(358), degrees(2), degrees(6)]);

    expect(circularAngleDistance(seam, Math.PI)).toBeLessThan(degrees(5));

    const grid = buildPolarNavigationGrid([
      stop('a', 100, -3),
      stop('b', 100, 3),
      stop('c', 100, 8),
    ], {x: 0, y: 0}, 20, degrees(12));
    const unwrapped = grid.stops.map(item => item.unwrappedAngle);
    expect(Math.max(...unwrapped) - Math.min(...unwrapped)).toBeLessThan(degrees(12));
  });

  it('uses independent angular/radial tolerances and disambiguates polar cells', () => {
    const grid = buildPolarNavigationGrid([
      stop('a', 100, 0),
      stop('b', 108 * Math.cos(Math.PI / 6), 108 * Math.sin(Math.PI / 6)),
      stop('c', 200, 0),
    ], {x: 0, y: 0}, 20, 15 * Math.PI / 180);
    const cells = grid.stops.map(item =>
      `${bandIndexForStop(grid.radialBands, item)}:${bandIndexForStop(grid.angularBands, item)}`);

    expect(new Set(cells).size).toBe(3);
    expect(grid.radialBands.length).toBe(2);
  });

  it('rotates cardinal roles by quadrant without dropping a logical direction', () => {
    const cases: Array<[number, Array<'right'|'down'|'left'|'up'>]> = [
      [0, ['right', 'down', 'left', 'up']],       // east
      [Math.PI / 2, ['down', 'left', 'up', 'right']], // south
      [Math.PI, ['left', 'up', 'right', 'down']], // west
      [Math.PI * 1.5, ['up', 'right', 'down', 'left']], // north
    ];

    for (const [angle, [outward, clockwise, inward, counterclockwise]] of cases) {
      expect(polarDirectionForCardinal(angle, outward)).toBe('outward');
      expect(polarDirectionForCardinal(angle, clockwise)).toBe('clockwise');
      expect(polarDirectionForCardinal(angle, inward)).toBe('inward');
      expect(polarDirectionForCardinal(angle, counterclockwise)).toBe('counterclockwise');
    }
  });
});
