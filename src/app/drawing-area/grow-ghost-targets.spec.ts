import {
  buildGrowGhostTargets,
  growGhostGridStep,
} from './grow-ghost-targets';

describe('held-Add ghost targets', () => {
  const bounds = {minX: 0, minY: 0, maxX: 800, maxY: 600};

  it('places one distinct target halfway between each pair of nodes', () => {
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
      [300, 300],
    ]);
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

  it('uses whole major-grid cells and never becomes tighter than one add slot', () => {
    expect(growGhostGridStep(50)).toBe(300);
    expect(growGhostGridStep(100)).toBe(300);
    expect(growGhostGridStep(200)).toBe(400);
    expect(growGhostGridStep(1000)).toBe(1000);
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
});
