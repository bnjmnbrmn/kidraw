/**
 * One of the two screen axes, as an object.
 *
 * Dragging along x and dragging along y are the same algorithm reading
 * different coordinates. Written out inline that produces a
 * `axis === 'x' ? … : …` at every step — eight of them in one method, each a
 * separate chance to pick the wrong one — and the algorithm gets lost among
 * them. Asking the axis instead leaves the steps saying what they do.
 *
 * Values, not instances: there are exactly two, and `Axis.of` returns the same
 * pair every time, so they compare by identity.
 */
import { DANode } from './da-node';
import { Point } from './utils';

export type AxisKey = 'x' | 'y';

export class Axis {
  static readonly X = new Axis('x');
  static readonly Y = new Axis('y');

  static of(key: AxisKey): Axis {
    return key === 'x' ? Axis.X : Axis.Y;
  }

  private constructor(readonly key: AxisKey) {}

  get horizontal(): boolean {
    return this.key === 'x';
  }

  /** The other axis — the one a move along this axis leaves alone. */
  get cross(): Axis {
    return this.horizontal ? Axis.Y : Axis.X;
  }

  /** Choose between a pair of values by this axis. */
  pick<T>(whenX: T, whenY: T): T {
    return this.horizontal ? whenX : whenY;
  }

  /** This axis's coordinate of a point. */
  of(point: Point): number {
    return this.pick(point.x, point.y);
  }

  /** A point at `along` on this axis, keeping `rest`'s other coordinate.
   *  With `rest` at the origin this is the direction vector for a step. */
  point(along: number, rest: Point = {x: 0, y: 0}): Point {
    return this.horizontal ? {x: along, y: rest.y} : {x: rest.x, y: along};
  }

  /** Where a node sits on this axis, by its top-left corner. */
  nodePosition(node: DANode): number {
    return this.pick(node.group.x(), node.group.y());
  }

  /** Put a node's top-left corner at `to` on this axis. */
  moveNode(node: DANode, to: number): void {
    if (this.horizontal) node.group.x(to); else node.group.y(to);
  }

  /** Half the node's extent along this axis: centre minus corner. */
  halfExtent(node: DANode): number {
    return this.pick(node.NODE_WIDTH, node.NODE_HEIGHT) / 2;
  }
}
