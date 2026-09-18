import {Axis} from './axis';
import {DANode} from './da-node';

/** Just enough of a node for Axis: a Konva-style x()/y() pair and a size. */
function stubNode({x, y, width, height}: {x: number; y: number; width: number; height: number}): DANode {
  let px = x, py = y;
  return {
    group: {
      x: (v?: number) => (v === undefined ? px : (px = v)),
      y: (v?: number) => (v === undefined ? py : (py = v)),
    },
    NODE_WIDTH: width,
    NODE_HEIGHT: height,
  } as unknown as DANode;
}

describe('Axis', () => {
  it('has exactly two values, returned by identity', () => {
    expect(Axis.of('x')).toBe(Axis.X);
    expect(Axis.of('y')).toBe(Axis.Y);
  });

  it('knows which one it is', () => {
    expect(Axis.X.horizontal).toBeTrue();
    expect(Axis.Y.horizontal).toBeFalse();
    expect(Axis.X.cross).toBe(Axis.Y);
    expect(Axis.Y.cross).toBe(Axis.X);
  });

  it('picks the matching member of a pair', () => {
    expect(Axis.X.pick('left', 'up')).toBe('left');
    expect(Axis.Y.pick('left', 'up')).toBe('up');
  });

  it('reads its own coordinate of a point', () => {
    expect(Axis.X.of({x: 3, y: 7})).toBe(3);
    expect(Axis.Y.of({x: 3, y: 7})).toBe(7);
  });

  it('builds a point along itself, leaving the other coordinate alone', () => {
    expect(Axis.X.point(9, {x: 1, y: 2})).toEqual({x: 9, y: 2});
    expect(Axis.Y.point(9, {x: 1, y: 2})).toEqual({x: 1, y: 9});
  });

  it('builds a direction vector from the origin by default', () => {
    expect(Axis.X.point(-1)).toEqual({x: -1, y: 0});
    expect(Axis.Y.point(-1)).toEqual({x: 0, y: -1});
  });

  it('reads and writes a node along itself', () => {
    const node = stubNode({x: 10, y: 20, width: 100, height: 40});

    expect(Axis.X.nodePosition(node)).toBe(10);
    expect(Axis.Y.nodePosition(node)).toBe(20);
    expect(Axis.X.halfExtent(node)).toBe(50);
    expect(Axis.Y.halfExtent(node)).toBe(20);

    Axis.X.moveNode(node, 55);
    expect(Axis.X.nodePosition(node)).toBe(55);
    expect(Axis.Y.nodePosition(node)).withContext('cross axis untouched').toBe(20);

    Axis.Y.moveNode(node, 77);
    expect(Axis.Y.nodePosition(node)).toBe(77);
    expect(Axis.X.nodePosition(node)).withContext('cross axis untouched').toBe(55);
  });
});
