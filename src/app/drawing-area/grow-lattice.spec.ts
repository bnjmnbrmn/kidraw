import type {GrowGhostNodeCenter, GrowGhostTarget} from './grow-ghost-targets';
import {
  cellCenter,
  GrowHopRequest,
  latticeCellOfId,
  latticeCellOfNode,
  nodeInTheWay,
  nodeStandingOn,
  planGrowHop,
} from './grow-lattice';

const STEP = {x: 300, y: 200};
const ANCHOR = {x: 1000, y: 1000};

/** A lattice spot, named the way grow-ghost-targets names them. */
function spot(ix: number, iy: number): GrowGhostTarget {
  return {
    id: `grow-ghost:grid:${ix}:${iy}`,
    ...cellCenter(ANCHOR, {ix, iy}, STEP),
    source: 'grid',
  };
}

function box(id: string, x: number, y: number, half = 40): GrowGhostNodeCenter {
  return {id, x, y, halfW: half, halfH: half};
}

/** A request with the lattice fully on offer and nothing else around. */
function request(over: Partial<GrowHopRequest> = {}): GrowHopRequest {
  return {
    direction: 'right',
    fromTargetId: null,
    fromNodeCenter: null,
    anchorCenter: ANCHOR,
    step: STEP,
    targets: [spot(1, 0), spot(-1, 0), spot(0, 1), spot(0, -1), spot(1, 1)],
    nodes: [],
    newNodeHalf: {w: 40, h: 40},
    ...over,
  };
}

describe('grow lattice', () => {
  describe('cell ids', () => {
    it('reads the cell out of a lattice target id', () => {
      expect(latticeCellOfId('grow-ghost:grid:2:-3')).toEqual({ix: 2, iy: -3});
    });

    it('is not fooled by ids from elsewhere', () => {
      expect(latticeCellOfId('node-17')).toBeNull();
      expect(latticeCellOfId('grow-ghost:grid:x:1')).toBeNull();
      expect(latticeCellOfId(null)).toBeNull();
      expect(latticeCellOfId(undefined)).toBeNull();
    });
  });

  describe('which cell a node stands on', () => {
    it('takes a node sitting on a cell', () => {
      const center = cellCenter(ANCHOR, {ix: 2, iy: -1}, STEP);
      expect(latticeCellOfNode(center, ANCHOR, STEP)).toEqual({ix: 2, iy: -1});
    });

    it('still takes one a little off it', () => {
      const center = cellCenter(ANCHOR, {ix: 1, iy: 0}, STEP);
      expect(latticeCellOfNode({x: center.x + 90, y: center.y}, ANCHOR, STEP))
        .toEqual({ix: 1, iy: 0});
    });

    // The ON_CELL_TOLERANCE guard cannot currently reject: rounding already
    // bounds each axis at half a step. A node well off the lattice is still
    // assigned its nearest cell, which this pins as the behavior that is —
    // not as the behavior that is wanted. See the constant's comment.
    it('assigns the nearest cell however far off the lattice the node is', () => {
      const center = cellCenter(ANCHOR, {ix: 1, iy: 0}, STEP);
      expect(latticeCellOfNode({x: center.x + 140, y: center.y + 95}, ANCHOR, STEP))
        .toEqual({ix: 1, iy: 0});
    });

    it('refuses the anchor cell: the walk started there', () => {
      expect(latticeCellOfNode(ANCHOR, ANCHOR, STEP)).toBeNull();
    });
  });

  describe('planning a hop', () => {
    it('steps one cell in the direction pressed', () => {
      const hop = planGrowHop(request({direction: 'right'}));

      expect(hop).toEqual({kind: 'cell', target: spot(1, 0)});
    });

    it('carries on across the grid from a spot, not just from the anchor', () => {
      // Right from (1,0) wants (2,0) — the far column the old band-and-ring
      // reading could not reach.
      const hop = planGrowHop(request({
        fromTargetId: spot(1, 0).id,
        direction: 'right',
        targets: [spot(1, 0), spot(2, 0)],
      }));

      expect(hop).toEqual({kind: 'cell', target: spot(2, 0)});
    });

    it('reaches a diagonal spot from its orthogonal neighbor', () => {
      const hop = planGrowHop(request({
        fromTargetId: spot(1, 0).id,
        direction: 'down',
        targets: [spot(1, 0), spot(1, 1)],
      }));

      expect(hop).toEqual({kind: 'cell', target: spot(1, 1)});
    });

    it('takes a node standing on the cell the lattice therefore withheld', () => {
      const occupier = box('occupier', ...Object.values(
        cellCenter(ANCHOR, {ix: 1, iy: 0}, STEP)) as [number, number]);

      const hop = planGrowHop(request({direction: 'right', targets: [], nodes: [occupier]}));

      expect(hop).toEqual({kind: 'node', id: 'occupier'});
    });

    it('takes a node in the way before the spot beyond it', () => {
      // Half a cell along the row, so it is nearer than the (1,0) spot.
      const between = box('between', ANCHOR.x + 150, ANCHOR.y);

      const hop = planGrowHop(request({direction: 'right', nodes: [between]}));

      expect(hop).toEqual({kind: 'node', id: 'between'});
    });

    it('ignores a node beside the corridor rather than in it', () => {
      const beside = box('beside', ANCHOR.x + 150, ANCHOR.y + 400);

      const hop = planGrowHop(request({direction: 'right', nodes: [beside]}));

      expect(hop).toEqual({kind: 'cell', target: spot(1, 0)});
    });

    it('walks off the end of the lattice rather than inventing a spot', () => {
      const hop = planGrowHop(request({direction: 'right', targets: [], nodes: []}));

      expect(hop).toBeNull();
    });

    it('gives up when the aim is on a node sitting in the anchor\'s own cell', () => {
      const onTopOfTheAnchor = {x: ANCHOR.x + 137, y: ANCHOR.y + 93};

      expect(planGrowHop(request({fromNodeCenter: onTopOfTheAnchor}))).toBeNull();
    });
  });

  describe('nodeInTheWay', () => {
    it('takes the nearest of two nodes in the corridor', () => {
      const near = box('near', 100, 0);
      const far = box('far', 200, 0);

      const hit = nodeInTheWay([far, near], {x: 0, y: 0}, {x: 1, y: 0},
        {x: 300, y: 0}, STEP);

      expect(hit!.id).toBe('near');
    });

    it('ignores anything at or beyond the cell itself', () => {
      const atCell = box('atCell', 300, 0);

      expect(nodeInTheWay([atCell], {x: 0, y: 0}, {x: 1, y: 0}, {x: 300, y: 0}, STEP))
        .toBeNull();
    });

    it('ignores anything behind the step', () => {
      const behind = box('behind', -100, 0);

      expect(nodeInTheWay([behind], {x: 0, y: 0}, {x: 1, y: 0}, {x: 300, y: 0}, STEP))
        .toBeNull();
    });

    it('lets a wide box reach into the corridor it would otherwise miss', () => {
      const wide: GrowGhostNodeCenter = {id: 'wide', x: 100, y: 180, halfW: 40, halfH: 120};

      expect(nodeInTheWay([wide], {x: 0, y: 0}, {x: 1, y: 0}, {x: 300, y: 0}, STEP)!.id)
        .toBe('wide');
    });
  });

  describe('nodeStandingOn', () => {
    it('takes the nearest node whose box overlaps the spot', () => {
      const near = box('near', 10, 0);
      const far = box('far', 60, 0);

      const hit = nodeStandingOn([far, near], {x: 0, y: 0}, {w: 40, h: 40});

      expect(hit!.id).toBe('near');
    });

    it('leaves a node that clears the spot alone', () => {
      const clear = box('clear', 200, 0);

      expect(nodeStandingOn([clear], {x: 0, y: 0}, {w: 40, h: 40})).toBeNull();
    });

    it('counts the clearance the builder keeps, not just the two boxes', () => {
      // 40 + 40 = 80 apart exactly: touching, and only the clearance separates.
      const touching = box('touching', 85, 0);

      expect(nodeStandingOn([touching], {x: 0, y: 0}, {w: 40, h: 40}, 12)!.id)
        .toBe('touching');
      expect(nodeStandingOn([touching], {x: 0, y: 0}, {w: 40, h: 40}, 0)).toBeNull();
    });
  });
});
