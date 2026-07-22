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

export interface NavigationGridTolerances {
  x: number;
  y: number;
}

function bandsFromGroups<T extends NavigationGridStop>(
  groups: readonly T[][],
  coordinate: (stop: T) => number,
  viewportExtent: number,
): NavigationAxisBand<T>[] {
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

  return bandsFromGroups(groups, coordinate, viewportExtent);
}

interface SeparatingGap {
  size: number;
  after: number;
}

/** Largest real gap on one axis. Equal coordinates cannot be separated by a
 *  spatial grid, so they deliberately produce no gap. */
function largestSeparatingGap<T extends NavigationGridStop>(
  stops: readonly T[],
  coordinate: (stop: T) => number,
): SeparatingGap | null {
  const values = [...new Set(stops.map(coordinate))].sort((a, b) => a - b);
  let result: SeparatingGap | null = null;
  for (let i = 1; i < values.length; i++) {
    const size = values[i] - values[i - 1];
    if (!result || size > result.size) result = {size, after: (values[i - 1] + values[i]) / 2};
  }
  return result;
}

function ambiguousCell<T extends NavigationGridStop>(
  stops: readonly T[],
  rows: readonly NavigationAxisBand<T>[],
  columns: readonly NavigationAxisBand<T>[],
): T[] | null {
  const rowFor = new Map<T, number>();
  const columnFor = new Map<T, number>();
  rows.forEach((row, index) => row.stops.forEach(stop => rowFor.set(stop, index)));
  columns.forEach((column, index) => column.stops.forEach(stop => columnFor.set(stop, index)));

  const cells = new Map<string, T[]>();
  for (const stop of stops) {
    const key = `${rowFor.get(stop)}:${columnFor.get(stop)}`;
    const occupants = cells.get(key) ?? [];
    occupants.push(stop);
    cells.set(key, occupants);
  }
  return [...cells.values()].find(occupants => occupants.length > 1) ?? null;
}

/**
 * Refine only ambiguous cells until every spatially distinct stop owns a
 * cell. Starting with loose bands keeps genuine rows and columns together;
 * splitting at the largest local gap prevents a nearby pair from forcing the
 * entire viewport onto an unnecessarily fine global grid.
 */
function makeCellsUnambiguous<T extends NavigationGridStop>(
  stops: readonly T[],
  initialRows: NavigationAxisBand<T>[],
  initialColumns: NavigationAxisBand<T>[],
  viewportWidth: number,
  viewportHeight: number,
): NavigationGrid<T> {
  let rows = initialRows;
  let columns = initialColumns;

  // Each split adds a band, so fewer than 2N useful splits can exist. The
  // bound also protects exact-coordinate duplicates, which no spatial grid
  // can disambiguate.
  for (let attempt = 0; attempt < stops.length * 2; attempt++) {
    const occupants = ambiguousCell(stops, rows, columns);
    if (!occupants) break;

    const xGap = largestSeparatingGap(occupants, stop => stop.cx);
    const yGap = largestSeparatingGap(occupants, stop => stop.cy);
    if (!xGap && !yGap) break;

    const splitColumns = !!xGap && (!yGap || xGap.size >= yGap.size);
    const bands = splitColumns ? columns : rows;
    const coordinate = splitColumns
      ? (stop: T) => stop.cx
      : (stop: T) => stop.cy;
    const split = splitColumns ? xGap! : yGap!;
    const bandIndex = bands.findIndex(band => occupants.every(stop => band.stops.includes(stop)));
    if (bandIndex < 0) break;

    const source = bands[bandIndex].stops;
    const before = source.filter(stop => coordinate(stop) <= split.after);
    const after = source.filter(stop => coordinate(stop) > split.after);
    if (before.length === 0 || after.length === 0) break;

    const groups = bands.map(band => band.stops);
    groups.splice(bandIndex, 1, before, after);
    if (splitColumns) {
      columns = bandsFromGroups(groups, coordinate, viewportWidth);
    } else {
      rows = bandsFromGroups(groups, coordinate, viewportHeight);
    }
  }

  return {rows, columns};
}

export function buildNavigationGrid<T extends NavigationGridStop>(
  stops: readonly T[],
  viewportWidth: number,
  viewportHeight: number,
  tolerance: number | NavigationGridTolerances,
): NavigationGrid<T> {
  const xTolerance = typeof tolerance === 'number' ? tolerance : tolerance.x;
  const yTolerance = typeof tolerance === 'number' ? tolerance : tolerance.y;
  const rows = buildNavigationAxisBands(stops, stop => stop.cy, yTolerance, viewportHeight);
  const columns = buildNavigationAxisBands(stops, stop => stop.cx, xTolerance, viewportWidth);
  return makeCellsUnambiguous(stops, rows, columns, viewportWidth, viewportHeight);
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
