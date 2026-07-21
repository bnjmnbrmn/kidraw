import {
  bandIndexAtCoordinate,
  bandIndexForStop,
  buildNavigationAxisBands,
  buildNavigationGrid,
  NavigationGridStop,
} from './navigation-grid';

function stop(id: string, cx: number, cy: number): NavigationGridStop {
  return {id, kind: 'node', cx, cy};
}

describe('spreadsheet navigation grid', () => {
  it('uses bounded bands instead of chaining adjacent gaps indefinitely', () => {
    const stops = [stop('a', 0, 0), stop('b', 0, 10), stop('c', 0, 20), stop('d', 0, 30)];

    const rows = buildNavigationAxisBands(stops, item => item.cy, 12, 100);

    expect(rows.length).toBe(2);
    expect(rows.map(row => row.stops.map(item => item.id))).toEqual([['a', 'b'], ['c', 'd']]);
    expect(rows.map(row => row.center)).toEqual([5, 25]);
  });

  it('places spreadsheet boundaries halfway between neighboring band centers', () => {
    const stops = [stop('a', 20, 10), stop('b', 80, 40), stop('c', 160, 90)];

    const grid = buildNavigationGrid(stops, 200, 120, 5);

    expect(grid.columns.map(column => [column.start, column.end])).toEqual([
      [0, 50], [50, 120], [120, 200],
    ]);
    expect(grid.rows.map(row => [row.start, row.end])).toEqual([
      [0, 25], [25, 65], [65, 120],
    ]);
  });

  it('uses the same band membership for stop lookup and visual coordinates', () => {
    const a = stop('a', 20, 20);
    const b = stop('b', 24, 70);
    const c = stop('c', 100, 70);
    const grid = buildNavigationGrid([a, b, c], 140, 100, 10);

    expect(bandIndexForStop(grid.columns, a)).toBe(0);
    expect(bandIndexForStop(grid.columns, b)).toBe(0);
    expect(bandIndexForStop(grid.columns, c)).toBe(1);
    expect(bandIndexAtCoordinate(grid.columns, 50)).toBe(0);
    expect(bandIndexAtCoordinate(grid.columns, 80)).toBe(1);
  });
});
