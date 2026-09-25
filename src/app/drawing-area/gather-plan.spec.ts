import { GATHER_GAP, GatherBox, planGather } from './gather-plan';

const box = (id: string, cx: number, cy: number, w = 100, h = 50): GatherBox =>
  ({id, x: cx - w / 2, y: cy - h / 2, w, h});
const centerOf = (b: GatherBox, at: {x: number; y: number}) => ({x: at.x + b.w / 2, y: at.y + b.h / 2});
const overlap = (a: {x: number; y: number; w: number; h: number}, b: {x: number; y: number; w: number; h: number}) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe('planGather', () => {
  const anchor = box('anchor', 0, 0);

  it('pulls distant neighbors in close, each keeping its bearing', () => {
    const east = box('east', 2000, 0);
    const north = box('north', 0, -1500);
    const plan = planGather(anchor, [[east, north]], []);
    const e = centerOf(east, plan.get('east')!);
    const n = centerOf(north, plan.get('north')!);
    expect(Math.abs(e.y)).toBeLessThan(1e-6);
    expect(e.x).toBeGreaterThan(0);
    expect(e.x).toBeLessThan(300);
    expect(Math.abs(n.x)).toBeLessThan(1e-6);
    expect(n.y).toBeLessThan(0);
    expect(n.y).toBeGreaterThan(-300);
  });

  it('spreads neighbors that would land on top of each other', () => {
    const ring = [0, 1, 2, 3, 4, 5].map(i => box('n' + i, 1000, i));
    const plan = planGather(anchor, [ring], []);
    const placed = ring.map(b => ({...plan.get(b.id)!, w: b.w, h: b.h}));
    for (let i = 0; i < placed.length; i++) {
      for (let j = i + 1; j < placed.length; j++) expect(overlap(placed[i], placed[j])).toBeFalse();
      expect(overlap(placed[i], anchor)).toBeFalse();
    }
  });

  it('puts the second level on a ring outside the first', () => {
    const child = box('child', 800, 0);
    const grandchild = box('grandchild', 1600, 0);
    const plan = planGather(anchor, [[child], [grandchild]], []);
    const c = centerOf(child, plan.get('child')!);
    const g = centerOf(grandchild, plan.get('grandchild')!);
    expect(g.x).toBeGreaterThan(c.x + child.w / 2 + grandchild.w / 2);
  });

  it('pushes unrelated nodes out of the gathered circle, and leaves far ones alone', () => {
    const neighbor = box('neighbor', 900, 0);
    const inTheWay = box('stranger', 120, 10);
    const far = box('far', 5000, 5000);
    const plan = planGather(anchor, [[neighbor]], [inTheWay, far]);
    const s = centerOf(inTheWay, plan.get('stranger')!);
    const n = centerOf(neighbor, plan.get('neighbor')!);
    expect(Math.hypot(s.x, s.y)).toBeGreaterThan(Math.hypot(n.x, n.y));
    expect(overlap({...plan.get('stranger')!, w: 100, h: 50}, {...plan.get('neighbor')!, w: 100, h: 50})).toBeFalse();
    expect(plan.has('far')).toBeFalse();
    expect(GATHER_GAP).toBeGreaterThan(0);
  });
});
