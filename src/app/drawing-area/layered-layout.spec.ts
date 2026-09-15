import {LayoutBox, layeredLayout} from './layered-layout';

const box = (id: string, width = 100, height = 40): LayoutBox => ({id, x: 500, y: 300, width, height});
const link = (from: string, to: string) => ({from, to});

describe('layeredLayout', () => {
  it('puts every node below what it depends on, and keeps the top-left corner', () => {
    const at = layeredLayout([box('c'), box('b'), box('a')], [link('a', 'b'), link('b', 'c')]);
    expect(at.get('a')!.y).toBeLessThan(at.get('b')!.y);
    expect(at.get('b')!.y).toBeLessThan(at.get('c')!.y);
    expect(Math.min(...[...at.values()].map(p => p.x))).toBe(500);
    expect(Math.min(...[...at.values()].map(p => p.y))).toBe(300);
  });

  it('sets premises side by side, with their conclusion centred below them', () => {
    const at = layeredLayout([box('p1'), box('p2'), box('c')], [link('p1', 'c'), link('p2', 'c')]);
    expect(at.get('p1')!.y).toBe(at.get('p2')!.y);
    expect(Math.abs(at.get('p1')!.x - at.get('p2')!.x)).toBeGreaterThanOrEqual(140);
    const middle = (at.get('p1')!.x + at.get('p2')!.x) / 2;
    expect(at.get('c')!.x).toBeCloseTo(middle, 5);
  });

  it('puts a definition just above its first use, not at the top', () => {
    const at = layeredLayout([box('a'), box('b'), box('c'), box('def')],
      [link('a', 'b'), link('b', 'c'), link('def', 'c')]);
    expect(at.get('def')!.y).toBe(at.get('b')!.y);
  });

  it('never overlaps nodes in a layer, even when they all want the same spot', () => {
    const boxes = [box('top', 300), box('x', 180), box('y', 220), box('z', 90)];
    const at = layeredLayout(boxes, [link('top', 'x'), link('top', 'y'), link('top', 'z')]);
    const row = ['x', 'y', 'z'].map(id => ({...at.get(id)!, w: boxes.find(b => b.id === id)!.width}))
      .sort((a, b) => a.x - b.x);
    for (let i = 1; i < row.length; i++) expect(row[i].x).toBeGreaterThanOrEqual(row[i - 1].x + row[i - 1].w + 40 - 1e-9);
  });

  it('survives a cycle and ignores unknown or self links', () => {
    const at = layeredLayout([box('a'), box('b')], [link('a', 'b'), link('b', 'a'), link('a', 'a'), link('a', 'nope')]);
    expect(at.size).toBe(2);
    expect(at.get('a')!.y).not.toBe(at.get('b')!.y);
  });
});
