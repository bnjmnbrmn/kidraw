import {angleDiff, planGather, DEFAULT_GATHER_OPTIONS, GatherBox, GatherNeighbor, GatherPlacement} from './gather-fisheye';

describe('gather-fisheye planGather', () => {
  const anchor: GatherBox = {id: 'A', cx: 0, cy: 0, halfW: 50, halfH: 25};

  function neighborAt(
    id: string, angle: number, dist: number,
    extra?: Partial<GatherNeighbor>,
  ): GatherNeighbor {
    return {
      id,
      cx: Math.cos(angle) * dist,
      cy: Math.sin(angle) * dist,
      halfW: 50, halfH: 25,
      direction: 'out',
      kind: '',
      ...extra,
    };
  }

  function byId(placed: GatherPlacement[]): Map<string, GatherPlacement> {
    return new Map(placed.map(p => [p.id, p]));
  }

  function placedAngle(p: GatherPlacement): number {
    return Math.atan2(p.y - anchor.cy, p.x - anchor.cx);
  }

  function placedDist(p: GatherPlacement): number {
    return Math.hypot(p.x - anchor.cx, p.y - anchor.cy);
  }

  it('places sparse neighbors individually, preserving bearings on the ring', () => {
    const neighbors = [
      neighborAt('n0', 0, 900),
      neighborAt('e1', Math.PI / 2, 700, {direction: 'in'}),
      neighborAt('n2', Math.PI, 1200),
      neighborAt('n3', -Math.PI / 2, 500),
    ];
    const plan = planGather(anchor, neighbors);
    expect(plan.placed.length).toBe(4);
    const map = byId(plan.placed);
    for (const n of neighbors) {
      const p = map.get(n.id)!;
      expect(p.stack).toBeNull();
      const desired = Math.atan2(n.cy, n.cx);
      expect(Math.abs(angleDiff(placedAngle(p), desired))).toBeLessThan(1e-6);
      expect(placedDist(p)).toBeCloseTo(plan.ringRadius, 6);
    }
    // Compressed: the ring is closer than the original distances but the
    // boxes still clear each other and the anchor.
    expect(plan.ringRadius).toBeLessThan(900);
    expect(plan.ringRadius).toBeGreaterThan(
      Math.hypot(50, 25) * 2); // anchor + neighbor half-diagonals
  });

  it('pushes two near-coincident bearings apart to the minimum separation, keeping order', () => {
    const neighbors = [
      neighborAt('a', 0.00, 800),
      neighborAt('b', 0.02, 900),
      neighborAt('c', Math.PI, 700),
    ];
    const plan = planGather(anchor, neighbors);
    const map = byId(plan.placed);
    const pa = placedAngle(map.get('a')!);
    const pb = placedAngle(map.get('b')!);
    const minSep =
      (2 * Math.hypot(50, 25) + DEFAULT_GATHER_OPTIONS.perimeterGap) / plan.ringRadius;
    expect(angleDiff(pb, pa)).toBeGreaterThanOrEqual(minSep - 1e-6);
    expect(angleDiff(pb, pa)).toBeGreaterThan(0); // order preserved
    // Their midpoint stays near the shared original bearing.
    expect(Math.abs(angleDiff((pa + pb) / 2, 0.01))).toBeLessThan(0.05);
  });

  it('stacks a crowd by direction and kind, never mixing in with out', () => {
    const neighbors: GatherNeighbor[] = [];
    for (let i = 0; i < 20; i++) {
      neighbors.push(neighborAt(`out-dep-${i}`, (i / 20) * Math.PI - Math.PI / 2, 800,
        {kind: 'depends-on'}));
    }
    for (let i = 0; i < 15; i++) {
      neighbors.push(neighborAt(`out-srv-${i}`, (i / 15) * Math.PI - Math.PI / 2, 900,
        {kind: 'serves'}));
    }
    for (let i = 0; i < 12; i++) {
      neighbors.push(neighborAt(`in-dep-${i}`, Math.PI - (i / 12) * Math.PI, 700,
        {direction: 'in', kind: 'depends-on'}));
    }
    const plan = planGather(anchor, neighbors);
    expect(plan.placed.length).toBe(47);
    const stacks = new Map<string, GatherPlacement[]>();
    for (const p of plan.placed) {
      expect(p.stack).not.toBeNull();
      const list = stacks.get(p.stack!.key) ?? [];
      list.push(p);
      stacks.set(p.stack!.key, list);
    }
    expect([...stacks.keys()].sort()).toEqual(
      ['in:depends-on', 'out:depends-on', 'out:serves']);
    expect(stacks.get('out:depends-on')!.length).toBe(20);
    expect(stacks.get('in:depends-on')!.length).toBe(12);
  });

  it('keeps protected neighbors individually visible in stacking mode', () => {
    const neighbors: GatherNeighbor[] = [];
    for (let i = 0; i < 30; i++) {
      neighbors.push(neighborAt(`n${i}`, (i / 30) * 2 * Math.PI, 800,
        {kind: 'depends-on', protected: i === 7}));
    }
    const plan = planGather(anchor, neighbors);
    const map = byId(plan.placed);
    expect(map.get('n7')!.stack).toBeNull();
    expect(map.get('n8')!.stack).not.toBeNull();
  });

  it('caps the cascade: a stack of 50 has the same extent as a stack of 4', () => {
    const mk = (count: number) => {
      const neighbors: GatherNeighbor[] = [];
      for (let i = 0; i < count; i++) {
        neighbors.push(neighborAt(`n${i}`, (i / count) * 0.5, 800, {kind: 'x'}));
      }
      // Force stacking with a second crowd of a different kind.
      for (let i = 0; i < 30; i++) {
        neighbors.push(neighborAt(`m${i}`, Math.PI + (i / 30) * 0.5, 800, {kind: 'y'}));
      }
      return planGather(anchor, neighbors);
    };
    const extent = (plan: {placed: GatherPlacement[]}, prefix: string) => {
      const members = plan.placed.filter(p => p.id.startsWith(prefix));
      const base = members.find(p => p.stack!.index === 0)!;
      return Math.max(...members.map(p => Math.hypot(p.x - base.x, p.y - base.y)));
    };
    const small = mk(4);
    const large = mk(50);
    expect(extent(small, 'n')).toBeCloseTo(
      DEFAULT_GATHER_OPTIONS.stackOffset * DEFAULT_GATHER_OPTIONS.stackMaxVisible, 6);
    expect(extent(large, 'n')).toBeCloseTo(extent(small, 'n'), 6);
    // Deep members sit exactly under the last visible level.
    const deep = large.placed.filter(p => p.id.startsWith('n') && p.stack!.index >= 3);
    const positions = new Set(deep.map(p => `${p.x.toFixed(3)},${p.y.toFixed(3)}`));
    expect(positions.size).toBe(1);
  });

  it('reports a clearRadius beyond the ring for pushing strangers away', () => {
    const plan = planGather(anchor, [neighborAt('n', 1, 700)]);
    expect(plan.clearRadius).toBeGreaterThan(plan.ringRadius);
  });

  it('handles a neighbor coincident with the anchor without NaN', () => {
    const plan = planGather(anchor, [neighborAt('z', 0, 0)]);
    const p = plan.placed[0];
    expect(Number.isFinite(p.x)).toBeTrue();
    expect(Number.isFinite(p.y)).toBeTrue();
  });
});
