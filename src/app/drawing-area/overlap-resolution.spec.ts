import { OverlapBox, resolveBoxOverlaps } from './overlap-resolution';

function box(x: number, y: number, w: number, h: number, movable = true): OverlapBox {
  return { x, y, w, h, movable };
}

function separated(a: OverlapBox, b: OverlapBox, gap: number): boolean {
  const sepX = Math.abs(a.x + a.w / 2 - (b.x + b.w / 2)) - (a.w + b.w) / 2;
  const sepY = Math.abs(a.y + a.h / 2 - (b.y + b.h / 2)) - (a.h + b.h) / 2;
  return sepX >= gap - 1e-6 || sepY >= gap - 1e-6;
}

function expectAllSeparated(boxes: OverlapBox[], gap: number): void {
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      expect(separated(boxes[i], boxes[j], gap))
        .withContext(`boxes ${i} and ${j} still overlap`)
        .toBeTrue();
    }
  }
}

describe('resolveBoxOverlaps', () => {
  it('leaves non-overlapping boxes untouched', () => {
    const boxes = [box(0, 0, 100, 50), box(200, 0, 100, 50)];
    const moved = resolveBoxOverlaps(boxes, 20);
    expect(moved).toEqual([]);
    expect(boxes[0].x).toBe(0);
    expect(boxes[1].x).toBe(200);
  });

  it('pushes two overlapping boxes apart along the least-penetration axis', () => {
    // Wide flat boxes overlapping mostly vertically: cheapest fix is vertical.
    const boxes = [box(0, 0, 280, 70), box(10, 50, 280, 70)];
    const moved = resolveBoxOverlaps(boxes, 10);
    expect(moved.length).toBe(2);
    expectAllSeparated(boxes, 10);
    // They separated vertically, not by sliding 270px horizontally.
    expect(Math.abs(boxes[0].x - 0)).toBeLessThan(1);
    expect(Math.abs(boxes[1].x - 10)).toBeLessThan(1);
  });

  it('never moves immovable boxes', () => {
    const anchor = box(0, 0, 200, 200, false);
    const other = box(50, 50, 100, 100);
    resolveBoxOverlaps([anchor, other], 10);
    expect(anchor.x).toBe(0);
    expect(anchor.y).toBe(0);
    expectAllSeparated([anchor, other], 10);
  });

  it('resolves a chain: growing box pushes neighbor into the next neighbor', () => {
    // Anchor overlaps b; pushing b right makes it overlap c; c must move too.
    const a = box(0, 0, 200, 100, false);
    const b = box(150, 10, 100, 80);
    const c = box(260, 20, 100, 80);
    const moved = resolveBoxOverlaps([a, b, c], 10);
    expect(moved).toContain(1);
    expect(moved).toContain(2);
    expectAllSeparated([a, b, c], 10);
  });

  it('separates a stack of identical boxes dropped on the same spot', () => {
    const boxes = Array.from({ length: 5 }, () => box(0, 0, 120, 120));
    resolveBoxOverlaps(boxes, 15);
    expectAllSeparated(boxes, 15);
  });

  it('handles mixed sizes without moving distant boxes', () => {
    const bystander = box(1000, 1000, 50, 50);
    const boxes = [box(0, 0, 280, 70), box(100, 20, 60, 60), bystander];
    const moved = resolveBoxOverlaps(boxes, 10);
    expect(moved).not.toContain(2);
    expect(bystander.x).toBe(1000);
    expectAllSeparated(boxes, 10);
  });

  it('does nothing when the only overlapping pair is two immovable boxes', () => {
    const boxes = [box(0, 0, 100, 100, false), box(20, 20, 100, 100, false)];
    expect(resolveBoxOverlaps(boxes, 10)).toEqual([]);
  });
});
