/** A move-by-node landing point in stage (viewport) coordinates. */
export interface NavigationGridStop {
  id: string;
  kind: 'node' | 'label' | 'waypoint';
  cx: number;
  cy: number;
}

/** One spreadsheet-like row or column. Boundaries cover the whole viewport. */
export interface NavigationAxisBand<T extends NavigationGridStop = NavigationGridStop> {
  center: number;
  start: number;
  end: number;
  stops: T[];
}

export interface NavigationGrid<T extends NavigationGridStop = NavigationGridStop> {
  rows: NavigationAxisBand<T>[];
  columns: NavigationAxisBand<T>[];
}

/**
 * Cluster one axis into stable bands.
 *
 * A band's full coordinate span must fit inside `tolerance`. This bounded-span
 * rule is deliberately not single-linkage: 0, 10, 20, 30 with T=12 becomes
 * two bands instead of one 30px-wide chain. Band boundaries sit halfway
 * between adjacent centers, like variably-sized spreadsheet rows/columns.
 */
export function buildNavigationAxisBands<T extends NavigationGridStop>(
  stops: readonly T[],
  coordinate: (stop: T) => number,
  tolerance: number,
  viewportExtent: number,
): NavigationAxisBand<T>[] {
  if (stops.length === 0) return [];

  const sorted = [...stops].sort((a, b) => coordinate(a) - coordinate(b));
  const groups: T[][] = [];
  let group: T[] = [];
  let groupStart = 0;

  for (const stop of sorted) {
    const value = coordinate(stop);
    if (group.length === 0 || value - groupStart <= tolerance) {
      if (group.length === 0) groupStart = value;
      group.push(stop);
    } else {
      groups.push(group);
      group = [stop];
      groupStart = value;
    }
  }
  groups.push(group);

  const centers = groups.map(items =>
    items.reduce((sum, stop) => sum + coordinate(stop), 0) / items.length);

  return groups.map((items, index) => ({
    center: centers[index],
    start: index === 0 ? 0 : (centers[index - 1] + centers[index]) / 2,
    end: index === groups.length - 1
      ? viewportExtent
      : (centers[index] + centers[index + 1]) / 2,
    stops: items,
  }));
}

export function buildNavigationGrid<T extends NavigationGridStop>(
  stops: readonly T[],
  viewportWidth: number,
  viewportHeight: number,
  tolerance: number,
): NavigationGrid<T> {
  return {
    rows: buildNavigationAxisBands(stops, stop => stop.cy, tolerance, viewportHeight),
    columns: buildNavigationAxisBands(stops, stop => stop.cx, tolerance, viewportWidth),
  };
}

export function bandIndexForStop<T extends NavigationGridStop>(
  bands: readonly NavigationAxisBand<T>[],
  stop: T,
): number {
  return bands.findIndex(band => band.stops.includes(stop));
}

export function bandIndexAtCoordinate<T extends NavigationGridStop>(
  bands: readonly NavigationAxisBand<T>[],
  coordinate: number,
): number {
  if (bands.length === 0) return -1;
  const index = bands.findIndex((band, i) =>
    coordinate >= band.start && (coordinate < band.end || i === bands.length - 1));
  if (index >= 0) return index;
  return coordinate < bands[0].start ? 0 : bands.length - 1;
}
