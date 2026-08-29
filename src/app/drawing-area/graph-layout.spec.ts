import { applyLayout } from './graph-layout';
import { DANode } from './da-node';
import { DAEdge } from './da-edge';

/** Build nodes labelled by the given names, all starting at (0, 0). */
function makeNodes(...names: string[]): Map<string, DANode> {
  const map = new Map<string, DANode>();
  for (const name of names) {
    map.set(name, new DANode(0, 0, name));
  }
  return map;
}

function makeEdges(nodes: Map<string, DANode>, pairs: [string, string][]): DAEdge[] {
  return pairs.map(([src, dest]) => new DAEdge(nodes.get(src)!, nodes.get(dest)!, ''));
}

function x(nodes: Map<string, DANode>, name: string): number {
  return nodes.get(name)!.konvaGroup.x();
}

function y(nodes: Map<string, DANode>, name: string): number {
  return nodes.get(name)!.konvaGroup.y();
}

describe('graph-layout treeLayout', () => {
  it('returns typed non-hierarchy and parallel edges as cross-links', () => {
    const nodes = makeNodes('root', 'a', 'b');
    const [rootA, rootB, dependency, parallel, reverse] = makeEdges(nodes, [
      ['root', 'a'], ['root', 'b'], ['a', 'b'], ['root', 'a'], ['a', 'root'],
    ]);
    rootA.tags = ['component-of'];
    rootB.tags = ['component-of'];
    dependency.tags = ['depends-on'];
    parallel.tags = ['depends-on'];
    reverse.tags = ['depends-on'];

    const crossLinks = applyLayout(
      'tree-right-clear', [...nodes.values()],
      [rootA, rootB, dependency, parallel, reverse]);

    expect(crossLinks).toEqual([dependency, parallel, reverse]);
  });

  it('centers a parent horizontally over its children in tree-down-clear', () => {
    const nodes = makeNodes('root', 'a', 'b', 'c');
    const edges = makeEdges(nodes, [['root', 'a'], ['root', 'b'], ['root', 'c']]);
    applyLayout('tree-down-clear', [...nodes.values()], edges);

    const childXs = ['a', 'b', 'c'].map(n => x(nodes, n));
    const mid = (Math.min(...childXs) + Math.max(...childXs)) / 2;
    expect(x(nodes, 'root')).toBeCloseTo(mid, 6);
    // All children one level below the root
    for (const n of ['a', 'b', 'c']) {
      expect(y(nodes, n)).toBeGreaterThan(y(nodes, 'root'));
      expect(y(nodes, n)).toBeCloseTo(y(nodes, 'a'), 6);
    }
  });

  it('centers a parent vertically left of its children in tree-right', () => {
    const nodes = makeNodes('root', 'a', 'b');
    const edges = makeEdges(nodes, [['root', 'a'], ['root', 'b']]);
    applyLayout('tree-right-clear', [...nodes.values()], edges);

    const childYs = ['a', 'b'].map(n => y(nodes, n));
    expect(y(nodes, 'root')).toBeCloseTo((childYs[0] + childYs[1]) / 2, 6);
    for (const n of ['a', 'b']) {
      expect(x(nodes, n)).toBeGreaterThan(x(nodes, 'root'));
    }
  });

  it('keeps each subtree in a contiguous interval so tree edges cannot cross', () => {
    // root → A, B; A → a1, a2, a3; B → b1. The old level-based layout spread
    // all four grandchildren evenly around the global centre, putting b1 far
    // from B and crossing A's edges.
    const nodes = makeNodes('root', 'A', 'B', 'a1', 'a2', 'a3', 'b1');
    const edges = makeEdges(nodes, [
      ['root', 'A'], ['root', 'B'],
      ['A', 'a1'], ['A', 'a2'], ['A', 'a3'],
      ['B', 'b1'],
    ]);
    applyLayout('tree-down-clear', [...nodes.values()], edges);

    const aSide = ['A', 'a1', 'a2', 'a3'].map(n => x(nodes, n));
    const bSide = ['B', 'b1'].map(n => x(nodes, n));
    // A's whole subtree sits strictly on one side of B's subtree
    expect(Math.max(...aSide)).toBeLessThan(Math.min(...bSide));
    // Each parent centered over its own children
    expect(x(nodes, 'A')).toBeCloseTo(
      (Math.min(...aSide.slice(1)) + Math.max(...aSide.slice(1))) / 2, 6);
    expect(x(nodes, 'B')).toBeCloseTo(x(nodes, 'b1'), 6);
  });

  it('separates multiple roots without overlap', () => {
    const nodes = makeNodes('r1', 'r2', 'c1', 'c2');
    const edges = makeEdges(nodes, [['r1', 'c1'], ['r2', 'c2']]);
    applyLayout('tree-down-clear', [...nodes.values()], edges);

    const t1 = ['r1', 'c1'].map(n => x(nodes, n));
    const t2 = ['r2', 'c2'].map(n => x(nodes, n));
    expect(Math.max(...t1)).toBeLessThan(Math.min(...t2));
  });

  it('does not move pinned nodes', () => {
    const nodes = makeNodes('root', 'a', 'b');
    nodes.get('a')!.pinned = true;
    nodes.get('a')!.konvaGroup.x(1234);
    nodes.get('a')!.konvaGroup.y(-777);
    const edges = makeEdges(nodes, [['root', 'a'], ['root', 'b']]);
    applyLayout('tree-down-clear', [...nodes.values()], edges);

    expect(x(nodes, 'a')).toBe(1234);
    expect(y(nodes, 'a')).toBe(-777);
  });

  it('places every node exactly once when the graph contains a cycle', () => {
    const nodes = makeNodes('root', 'a', 'b', 'c');
    // root → a, then a cycle a → b → c → a
    const edges = makeEdges(nodes, [
      ['root', 'a'], ['a', 'b'], ['b', 'c'], ['c', 'a'],
    ]);
    applyLayout('tree-down-clear', [...nodes.values()], edges);

    // Cycle members hang off the tree at increasing depth, not stacked on root
    expect(y(nodes, 'a')).toBeGreaterThan(y(nodes, 'root'));
    expect(y(nodes, 'b')).toBeGreaterThan(y(nodes, 'a'));
    const positions = [...nodes.values()].map(n => `${n.konvaGroup.x()},${n.konvaGroup.y()}`);
    expect(new Set(positions).size).toBe(positions.length);
  });

  it('reorders siblings so cross-linked subtrees end up adjacent', () => {
    // R → A, B, C; S is a second root that also points at A. A's tree slot
    // comes from R, and naively S lands beside R's tree with B and C between
    // S and A, so the non-tree edge S→A crosses R's edges. After reordering,
    // A must be the sibling nearest S — whichever side S ends up on.
    const nodes = makeNodes('R', 'A', 'B', 'C', 'S');
    const edges = makeEdges(nodes, [
      ['R', 'A'], ['R', 'B'], ['R', 'C'],
      ['S', 'A'],
    ]);
    applyLayout('tree-down-clear', [...nodes.values()], edges);

    const distToS = (n: string) => Math.abs(x(nodes, n) - x(nodes, 'S'));
    expect(distToS('A')).toBeLessThan(distToS('B'));
    expect(distToS('A')).toBeLessThan(distToS('C'));
  });

  it('orders multiple roots so cross-linked trees are adjacent', () => {
    // Three separate trees; a leaf of the first links into the third.
    const nodes = makeNodes('r1', 'c1', 'r2', 'c2', 'r3', 'c3');
    const edges = makeEdges(nodes, [
      ['r1', 'c1'], ['r2', 'c2'], ['r3', 'c3'],
      ['c1', 'c3'],
    ]);
    applyLayout('tree-down-clear', [...nodes.values()], edges);

    // r1's and r3's trees share a link, so r2's tree must not sit between them
    const t1 = x(nodes, 'r1'), t2 = x(nodes, 'r2'), t3 = x(nodes, 'r3');
    const between = (a: number, b: number, m: number) =>
      m > Math.min(a, b) && m < Math.max(a, b);
    expect(between(t1, t3, t2)).toBeFalse();
  });

  it('lays out a rootless pure cycle without losing nodes', () => {
    const nodes = makeNodes('a', 'b', 'c');
    const edges = makeEdges(nodes, [['a', 'b'], ['b', 'c'], ['c', 'a']]);
    applyLayout('tree-down-clear', [...nodes.values()], edges);

    const positions = [...nodes.values()].map(n => `${n.konvaGroup.x()},${n.konvaGroup.y()}`);
    expect(new Set(positions).size).toBe(3);
  });
});
