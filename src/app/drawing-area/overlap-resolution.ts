/** Axis-aligned box for overlap resolution. Position is the top-left corner,
 *  matching konvaGroup coordinates. */
export interface OverlapBox {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Immovable boxes (pinned nodes, resize anchors) push others but never move. */
  movable: boolean;
}

const EPS = 1e-6;

/**
 * Push overlapping boxes apart until every pair is separated by at least `gap`
 * along one axis. Each collision resolves along the axis of least penetration;
 * the push is split evenly when both boxes are movable, or borne entirely by
 * the movable one otherwise. Mutates box x/y in place and returns the indices
 * of the boxes that moved.
 *
 * Deliberately local and greedy: it preserves the incoming arrangement as much
 * as possible, so it works both as a post-layout safety net and as the reflow
 * step when a single node grows into its neighbors.
 */
export function resolveBoxOverlaps(boxes: OverlapBox[], gap: number): number[] {
  const moved = new Set<number>();
  const maxPasses = 10 * boxes.length + 20;

  for (let pass = 0; pass < maxPasses; pass++) {
    let collided = false;
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        if (!a.movable && !b.movable) continue;

        const penX = (a.w + b.w) / 2 + gap - Math.abs(a.x + a.w / 2 - (b.x + b.w / 2));
        const penY = (a.h + b.h) / 2 + gap - Math.abs(a.y + a.h / 2 - (b.y + b.h / 2));
        if (penX <= EPS || penY <= EPS) continue;
        collided = true;

        // Resolve along the axis needing the least movement; on a perfect tie
        // of both centers the a-before-b direction keeps things deterministic.
        let dx = 0;
        let dy = 0;
        if (penX <= penY) {
          dx = a.x + a.w / 2 <= b.x + b.w / 2 ? penX : -penX;
        } else {
          dy = a.y + a.h / 2 <= b.y + b.h / 2 ? penY : -penY;
        }

        if (a.movable && b.movable) {
          a.x -= dx / 2; a.y -= dy / 2;
          b.x += dx / 2; b.y += dy / 2;
          moved.add(i).add(j);
        } else if (b.movable) {
          b.x += dx; b.y += dy;
          moved.add(j);
        } else {
          a.x -= dx; a.y -= dy;
          moved.add(i);
        }
      }
    }
    if (!collided) break;
  }

  return [...moved];
}
