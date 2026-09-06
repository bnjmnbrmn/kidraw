import {
  buildGrowGhostTargets,
  GrowGhostTarget,
} from './grow-ghost-targets';

describe('held-Add ghost targets', () => {
  const bounds = {minX: 0, minY: 0, maxX: 800, maxY: 600};
  const at = (list: GrowGhostTarget[], x: number, y: number) =>
    list.filter(t => Math.abs(t.x - x) < 1 && Math.abs(t.y - y) < 1).length;

  it('anchors a lattice on the source node, at the placement slot', () => {
    const anchor = {id: 'a', x: 125, y: 175};

    const grid = buildGrowGhostTargets([anchor], anchor, bounds, 300);

    expect(at(grid, 425, 175)).toBe(1);
    expect(at(grid, 125, 475)).toBe(1);
    expect(grid.every(target =>
      (target.x - anchor.x) % 300 === 0 &&
      (target.y - anchor.y) % 300 === 0)).toBeTrue();
    expect(at(grid, anchor.x, anchor.y)).toBe(0);
  });

  it('offers the diagonals, not just the anchor row and column', () => {
    const anchor = {id: 'a', x: 400, y: 300};

    const grid = buildGrowGhostTargets([anchor], anchor, bounds, 100);

    // North-east, south-east, north-west, south-west of the anchor.
    expect(at(grid, 500, 200)).toBe(1);
    expect(at(grid, 500, 400)).toBe(1);
    expect(at(grid, 300, 200)).toBe(1);
    expect(at(grid, 300, 400)).toBe(1);
    // Two out on both axes as well.
    expect(at(grid, 600, 100)).toBe(1);
  });

  it('has no halfway spots between the anchor and other nodes', () => {
    // The halfway points here — (500, 100) and (100, 500) — are deliberately
    // off the 300 lattice, so a target there could only be a midpoint.
    const nodes = [
      {id: 'a', x: 100, y: 100},
      {id: 'b', x: 900, y: 100},
      {id: 'c', x: 100, y: 900},
    ];

    const targets = buildGrowGhostTargets(nodes, nodes[0],
      {minX: 0, minY: 0, maxX: 1400, maxY: 1400}, 300);

    expect(targets.every(target => target.source === 'grid')).toBeTrue();
    expect(at(targets, 500, 100)).toBe(0);
    expect(at(targets, 100, 500)).toBe(0);
  });

  it('does not offer a target whose node would land on an existing one', () => {
    const nodes = [
      {id: 'anchor', x: 360, y: 360, halfW: 60, halfH: 60},
      // Off-lattice, so its *box* covers the grid point at (760, 360) while
      // its centre does not (da-510).
      {id: 'occupier', x: 800, y: 380, halfW: 60, halfH: 60},
    ];
    const bounds = {minX: 0, minY: 0, maxX: 1400, maxY: 900};

    const offered = buildGrowGhostTargets(nodes, nodes[0], bounds, 200, {w: 60, h: 60});
    const blind = buildGrowGhostTargets(nodes, nodes[0], bounds, 200);

    expect(at(blind, 760, 360)).toBe(1);
    expect(at(offered, 760, 360)).toBe(0);
    // Only that one goes: the rest of the lattice is still offered.
    expect(at(offered, 560, 360)).toBe(1);
    expect(at(offered, 960, 360)).toBe(1);
    expect(at(offered, 560, 160)).toBe(1);
  });

  it('leaves real node centers to the real nodes, and never repeats a spot', () => {
    const nodes = [
      {id: 'a', x: 100, y: 100},
      {id: 'middle', x: 400, y: 100},
    ];

    const targets = buildGrowGhostTargets(nodes, nodes[0], bounds, 300);

    expect(at(targets, 400, 100)).toBe(0);
    expect(new Set(targets.map(target => `${target.x}:${target.y}`)).size)
      .toBe(targets.length);
  });
});
