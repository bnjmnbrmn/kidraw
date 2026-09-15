/**
 * Top-down layered layout for a graph whose links run from prerequisite to
 * what builds on it (an explanation: premises, definitions and assumptions
 * above the statements that use them).
 *
 * - Every node sits below everything it depends on (longest-path layers).
 *   A node nothing points into, such as a definition, sits just above its
 *   first use rather than at the very top.
 * - Within a layer, nodes are ordered by where their neighbours are, to cut
 *   crossings, then placed as close above or below them as the layer allows.
 * - Links that close a cycle are ignored for layering.
 *
 * Pure: sizes and links in, top-left positions out. The graph keeps its
 * top-left corner.
 */

export interface LayoutBox {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface LayoutLink {
  from: string;
  to: string;
}

export interface LayeredSpacing {
  /** Between neighbours in a layer. */
  horizontal: number;
  /** Between layers; leaves room for badges above a node. */
  vertical: number;
}

const SWEEPS = 4;

export function layeredLayout(
  boxes: readonly LayoutBox[],
  links: readonly LayoutLink[],
  spacing: LayeredSpacing = {horizontal: 40, vertical: 70},
): Map<string, {x: number; y: number}> {
  const result = new Map<string, {x: number; y: number}>();
  if (boxes.length === 0) return result;
  const byId = new Map(boxes.map(box => [box.id, box]));
  const order = boxes.map(box => box.id);

  // Links between known, distinct nodes, minus those that close a cycle.
  const out = new Map(order.map(id => [id, [] as string[]]));
  const state = new Map<string, 'open' | 'done'>();
  const acyclic: LayoutLink[] = [];
  const candidates = links.filter(link => byId.has(link.from) && byId.has(link.to) && link.from !== link.to);
  const linksFrom = new Map(order.map(id => [id, candidates.filter(link => link.from === id)]));
  const visit = (id: string) => {
    state.set(id, 'open');
    for (const link of linksFrom.get(id)!) {
      const seen = state.get(link.to);
      if (seen === 'open') continue;
      acyclic.push(link);
      out.get(id)!.push(link.to);
      if (seen === undefined) visit(link.to);
    }
    state.set(id, 'done');
  };
  for (const id of order) if (!state.has(id)) visit(id);
  const into = new Map(order.map(id => [id, [] as string[]]));
  for (const link of acyclic) into.get(link.to)!.push(link.from);

  // Longest-path layers, in topological order.
  const layer = new Map<string, number>();
  const indegree = new Map(order.map(id => [id, into.get(id)!.length]));
  const queue = order.filter(id => indegree.get(id) === 0);
  const topological: string[] = [];
  while (queue.length > 0) {
    const id = queue.shift()!;
    topological.push(id);
    layer.set(id, Math.max(0, ...into.get(id)!.map(from => layer.get(from)! + 1)));
    for (const to of out.get(id)!) {
      indegree.set(to, indegree.get(to)! - 1);
      if (indegree.get(to) === 0) queue.push(to);
    }
  }
  // A node with nothing above it goes just above its first use.
  for (const id of [...topological].reverse()) {
    const children = out.get(id)!;
    if (into.get(id)!.length === 0 && children.length > 0) {
      layer.set(id, Math.min(...children.map(to => layer.get(to)!)) - 1);
    }
  }
  const lowest = Math.min(...layer.values());
  const layers: string[][] = [];
  for (const id of order) {
    const index = layer.get(id)! - lowest;
    (layers[index] ??= []).push(id);
  }
  const rows = layers.filter(row => row && row.length > 0);

  // Order each layer by the average position of its neighbours, sweeping down then up.
  const position = new Map<string, number>();
  const renumber = () => rows.forEach(row => row.forEach((id, i) => position.set(id, row.length > 1 ? i / (row.length - 1) : 0.5)));
  renumber();
  const barycenter = (id: string, neighbours: string[]) => neighbours.length === 0
    ? position.get(id)!
    : neighbours.reduce((sum, n) => sum + position.get(n)!, 0) / neighbours.length;
  for (let sweep = 0; sweep < SWEEPS; sweep++) {
    const down = sweep % 2 === 0;
    const sequence = down ? rows : [...rows].reverse();
    for (const row of sequence) {
      const keys = new Map(row.map(id => [id, barycenter(id, down ? into.get(id)! : out.get(id)!)]));
      row.sort((a, b) => keys.get(a)! - keys.get(b)!);
      row.forEach((id, i) => position.set(id, row.length > 1 ? i / (row.length - 1) : 0.5));
    }
  }

  // Coordinates: each layer packed left to right, pulled toward the nodes above.
  const originX = Math.min(...boxes.map(box => box.x));
  const originY = Math.min(...boxes.map(box => box.y));
  const centre = new Map<string, number>();
  let top = originY;
  for (const row of rows) {
    const widths = row.map(id => byId.get(id)!.width);
    const desired = row.map((id, i) => {
      const above = into.get(id)!.filter(from => centre.has(from));
      return above.length > 0 ? above.reduce((sum, from) => sum + centre.get(from)!, 0) / above.length : NaN;
    });
    // Without anything above, pack around the layer's own middle.
    const total = widths.reduce((sum, w) => sum + w, 0) + spacing.horizontal * (row.length - 1);
    let cursor = -total / 2;
    const packed = widths.map(w => {
      const x = cursor + w / 2;
      cursor += w + spacing.horizontal;
      return x;
    });
    const wanted = desired.map((d, i) => (Number.isNaN(d) ? packed[i] : d));
    const xs: number[] = [];
    row.forEach((_, i) => {
      const leftLimit = i === 0 ? -Infinity : xs[i - 1] + widths[i - 1] / 2 + spacing.horizontal + widths[i] / 2;
      xs.push(Math.max(wanted[i], leftLimit));
    });
    // Shift the layer so, on average, nodes sit where they wanted to be.
    const drift = xs.reduce((sum, x, i) => sum + (x - wanted[i]), 0) / xs.length;
    row.forEach((id, i) => centre.set(id, xs[i] - drift));
    const height = Math.max(...row.map(id => byId.get(id)!.height));
    row.forEach(id => result.set(id, {x: 0, y: top + (height - byId.get(id)!.height) / 2}));
    top += height + spacing.vertical;
  }
  const left = Math.min(...order.map(id => centre.get(id)! - byId.get(id)!.width / 2));
  for (const id of order) {
    result.get(id)!.x = originX + centre.get(id)! - byId.get(id)!.width / 2 - left;
  }
  return result;
}
