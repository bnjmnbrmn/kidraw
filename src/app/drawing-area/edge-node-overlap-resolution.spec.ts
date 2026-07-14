import { OverlapBox } from './overlap-resolution';
import { EdgeIndexPair, resolveEdgeNodeOverlaps } from './edge-node-overlap-resolution';
import { lineSegmentIntersectsRect } from './utils';

function box(x: number, y: number, w: number, h: number, movable = true): OverlapBox {
  return { x, y, w, h, movable };
}

function center(b: OverlapBox): { x: number; y: number } {
  return { x: b.x + b.w / 2, y: b.y + b.h / 2 };
}

/** Does the straight chord between two endpoint boxes' centers pass through
 *  any non-endpoint box (inflated by `clearance`)? */
function anyPierce(boxes: OverlapBox[], edges: EdgeIndexPair[], clearance: number): boolean {
  for (const e of edges) {
    const a = center(boxes[e.a]);
    const b = center(boxes[e.b]);
    for (let k = 0; k < boxes.length; k++) {
      if (k === e.a || k === e.b) continue;
      const box = boxes[k];
      if (lineSegmentIntersectsRect(a.x, a.y, b.x, b.y,
            box.x - clearance, box.y - clearance,
            box.x + box.w + clearance, box.y + box.h + clearance)) {
        return true;
      }
    }
  }
  return false;
}

describe('resolveEdgeNodeOverlaps', () => {
  it('leaves a clear layout untouched', () => {
    const boxes = [box(0, 0, 100, 50), box(400, 0, 100, 50), box(200, 300, 100, 50)];
    const edges: EdgeIndexPair[] = [{ a: 0, b: 1 }];
    const moved = resolveEdgeNodeOverlaps(boxes, edges, 10, 20);
    expect(moved).toEqual([]);
  });

  it('pushes a node off a chord that pierces it', () => {
    // A→B horizontal at y=25; C sits centered on the chord.
    const boxes = [box(0, 0, 100, 50), box(400, 0, 100, 50), box(220, 0, 100, 50)];
    const edges: EdgeIndexPair[] = [{ a: 0, b: 1 }];
    expect(anyPierce(boxes, edges, 8)).toBeTrue();
    const moved = resolveEdgeNodeOverlaps(boxes, edges, 8, 20);
    expect(moved).toContain(2);
    expect(anyPierce(boxes, edges, 8)).toBeFalse();
  });

  it('never moves a pinned (immovable) pierced node', () => {
    const boxes = [box(0, 0, 100, 50), box(400, 0, 100, 50), box(220, 0, 100, 50, false)];
    const edges: EdgeIndexPair[] = [{ a: 0, b: 1 }];
    const before = { x: boxes[2].x, y: boxes[2].y };
    const moved = resolveEdgeNodeOverlaps(boxes, edges, 8, 20);
    expect(moved).not.toContain(2);
    expect(boxes[2].x).toBe(before.x);
    expect(boxes[2].y).toBe(before.y);
  });

  it('does not treat endpoint nodes as pierced by their own edge', () => {
    // Two adjacent boxes; the chord runs between their centers and clips both
    // boxes, but they are the endpoints, so nothing should move.
    const boxes = [box(0, 0, 100, 50), box(160, 0, 100, 50)];
    const edges: EdgeIndexPair[] = [{ a: 0, b: 1 }];
    const moved = resolveEdgeNodeOverlaps(boxes, edges, 8, 20);
    expect(moved).toEqual([]);
  });

  it('resolves a node sitting exactly on the chord (deterministic side)', () => {
    const boxes = [box(0, 0, 80, 80), box(400, 0, 80, 80), box(200, 0, 80, 80)];
    const edges: EdgeIndexPair[] = [{ a: 0, b: 1 }];
    const moved = resolveEdgeNodeOverlaps(boxes, edges, 8, 20);
    expect(moved).toContain(2);
    expect(anyPierce(boxes, edges, 8)).toBeFalse();
  });

  it('keeps boxes non-overlapping after pushing off chords', () => {
    // A row of nodes all sitting on one long chord: pushing them off must not
    // stack them on top of each other.
    const boxes = [
      box(0, 0, 80, 40),      // A (src)
      box(900, 0, 80, 40),    // B (dest)
      box(200, 0, 80, 40),
      box(320, 0, 80, 40),
      box(440, 0, 80, 40),
    ];
    const edges: EdgeIndexPair[] = [{ a: 0, b: 1 }];
    resolveEdgeNodeOverlaps(boxes, edges, 8, 20);
    expect(anyPierce(boxes, edges, 8)).toBeFalse();
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i], b = boxes[j];
        const sepX = Math.abs(a.x + a.w / 2 - (b.x + b.w / 2)) - (a.w + b.w) / 2;
        const sepY = Math.abs(a.y + a.h / 2 - (b.y + b.h / 2)) - (a.h + b.h) / 2;
        expect(sepX >= 20 - 1e-3 || sepY >= 20 - 1e-3)
          .withContext(`boxes ${i} and ${j} overlap`).toBeTrue();
      }
    }
  });

  it('ignores self-loops', () => {
    const boxes = [box(0, 0, 100, 50), box(200, 0, 100, 50)];
    const edges: EdgeIndexPair[] = [{ a: 0, b: 0 }];
    const moved = resolveEdgeNodeOverlaps(boxes, edges, 8, 20);
    expect(moved).toEqual([]);
  });
});
