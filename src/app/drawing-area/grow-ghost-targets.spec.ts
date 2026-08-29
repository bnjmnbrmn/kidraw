import {
  buildGrowGhostTargets,
  growGhostGridStep,
  GrowGhostTarget,
} from './grow-ghost-targets';

describe('held-Add ghost targets', () => {
  const bounds = {minX: 0, minY: 0, maxX: 800, maxY: 600};

  it('places midpoints only between the anchor and each other node', () => {
    const nodes = [
      {id: 'a', x: 100, y: 100},
      {id: 'b', x: 500, y: 100},
      {id: 'c', x: 100, y: 500},
    ];

    const targets = buildGrowGhostTargets(nodes, nodes[0], 100, bounds);
    const midpoints = targets.filter(target => target.source === 'midpoint');

    expect(midpoints.map(target => [target.x, target.y])).toEqual([
      [300, 100],
      [100, 300],
    ]);
    expect(midpoints.map(target => target.id)).not.toContain(
      'grow-ghost:midpoint:b:c',
    );
  });

  it('anchors a viewport-spanning lattice on the source node', () => {
    const anchor = {id: 'a', x: 125, y: 175};

    const grid = buildGrowGhostTargets([anchor], anchor, 100, bounds)
      .filter(target => target.source === 'grid');

    expect(grid.some(target => target.x === 425 && target.y === 175)).toBeTrue();
    expect(grid.some(target => target.x === 125 && target.y === 475)).toBeTrue();
    expect(grid.every(target =>
      (target.x - anchor.x) % 300 === 0 &&
      (target.y - anchor.y) % 300 === 0)).toBeTrue();
    expect(grid.every(target => target.x === anchor.x || target.y === anchor.y))
      .toBeTrue();
  });

  it('uses whole major-grid cells, but never a grid coarser than the slot', () => {
    expect(growGhostGridStep(50)).toBe(300);
    expect(growGhostGridStep(100)).toBe(300);
    expect(growGhostGridStep(200)).toBe(400);
    expect(growGhostGridStep(10, 180)).toBe(180);
    // Zoomed out the major grid climbs a decade at a time. Placement must not
    // follow it out there: the slot wins and the targets go unaligned.
    expect(growGhostGridStep(1000, 180)).toBe(180);
    expect(growGhostGridStep(1000)).toBe(300);
  });

  it('does not offer a target whose node would land on an existing one', () => {
    const nodes = [
      {id: 'anchor', x: 360, y: 360, halfW: 60, halfH: 60},
      // Off-lattice, so its *box* covers the grid point at (760, 360) while
      // its centre does not (da-510).
      {id: 'occupier', x: 800, y: 380, halfW: 60, halfH: 60},
    ];
    const bounds = {minX: 0, minY: 0, maxX: 1400, maxY: 900};

    const offered = buildGrowGhostTargets(nodes, nodes[0], 100, bounds, 200, nodes,
      {w: 60, h: 60});
    const blind = buildGrowGhostTargets(nodes, nodes[0], 100, bounds, 200, nodes);

    const at = (list: GrowGhostTarget[], x: number, y: number) =>
      list.filter(t => Math.abs(t.x - x) < 1 && Math.abs(t.y - y) < 1).length;
    expect(at(blind, 760, 360)).toBe(1);
    expect(at(offered, 760, 360)).toBe(0);
    // Only that one goes: the rest of the lane is still offered.
    expect(at(offered, 560, 360)).toBe(1);
    expect(at(offered, 960, 360)).toBe(1);
  });

  it('deduplicates midpoint/grid collisions and leaves real node centers to real nodes', () => {
    const nodes = [
      {id: 'a', x: 100, y: 100},
      {id: 'b', x: 700, y: 100},
      {id: 'middle', x: 400, y: 100},
    ];

    const targets = buildGrowGhostTargets(nodes, nodes[0], 100, bounds);

    expect(targets.filter(target => target.x === 400 && target.y === 100).length).toBe(0);
    expect(new Set(targets.map(target => `${target.x}:${target.y}`)).size)
      .toBe(targets.length);
  });

  it('builds midpoints only from the caller-provided visible nodes', () => {
    const nodes = [
      {id: 'anchor', x: 100, y: 100},
      {id: 'visible', x: 500, y: 100},
      {id: 'offscreen', x: 2000, y: 100},
    ];

    const targets = buildGrowGhostTargets(nodes, nodes[0], 100, bounds, 300,
      nodes.slice(0, 2));
    const midpoints = targets.filter(target => target.source === 'midpoint');

    expect(midpoints.map(target => target.id)).toEqual([
      'grow-ghost:midpoint:anchor:visible',
    ]);
    expect(targets.some(target => target.x === 2000 && target.y === 100)).toBeFalse();
  });
});
