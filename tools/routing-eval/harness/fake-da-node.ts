// Pure-JS stand-in for src/app/drawing-area/da-node.ts that the routers'
// and metrics' surface uses. No Konva, no rendering. Only the fields and
// methods read by:
//   - applyChargedSpringEdges
//   - applyFlexibleWireEdges
//   - applyWeightedChainEdges
//   - applyBezierRouteEdges
//   - applyBezierFitChargedSpringEdges
//   - computeRoutingMetrics
//
// Properties accessed: id, NODE_WIDTH, NODE_HEIGHT, konvaGroup.x(), konvaGroup.y(),
// getEdgePoint(fromX, fromY) → {x,y}.
//
// The routers also call edge.srcNode and edge.destNode, so this class is
// what FakeDAEdge holds references to.

export type NodeShape = 'box' | 'circle' | 'diamond' | 'junction' | 'invisible';

/** Minimal Konva-group surface the routers read. Only x() and y() are
 *  consumed, both as zero-argument getters that return the position in
 *  drawing-layer coordinates (top-left of the node bbox). */
class FakeKonvaGroup {
  constructor(private _x: number, private _y: number) {}
  x(): number { return this._x; }
  y(): number { return this._y; }
}

export class DANode {
  readonly id: string;
  readonly nodeShape: NodeShape;
  readonly NODE_WIDTH: number;
  readonly NODE_HEIGHT: number;
  readonly konvaGroup: FakeKonvaGroup;

  // Fields the routers don't touch but other code paths might glance at.
  incomingEdges: any[] = [];
  outgoingEdges: any[] = [];

  constructor(id: string, x: number, y: number, opts?: {
    width?: number;
    height?: number;
    shape?: NodeShape;
  }) {
    this.id = id;
    this.nodeShape = opts?.shape ?? 'box';
    const isJunction = this.nodeShape === 'junction';
    const isInvisible = this.nodeShape === 'invisible';
    this.NODE_WIDTH  = opts?.width  ?? (isJunction ? 12 : isInvisible ? 16 : 120);
    this.NODE_HEIGHT = opts?.height ?? (isJunction ? 12 : isInvisible ? 16 : 120);
    this.konvaGroup = new FakeKonvaGroup(x, y);
  }

  /** Point on this node's perimeter intersected by the line from (fromX,fromY)
   *  toward the node center. Coordinates are drawing-layer coords.
   *  Mirrors src/app/drawing-area/da-node.ts:getEdgePoint exactly. */
  getEdgePoint(fromX: number, fromY: number): { x: number; y: number } {
    const hw = this.NODE_WIDTH / 2;
    const hh = this.NODE_HEIGHT / 2;
    const cx = this.konvaGroup.x() + hw;
    const cy = this.konvaGroup.y() + hh;

    const dx = cx - fromX;
    const dy = cy - fromY;
    if (dx === 0 && dy === 0) return { x: cx, y: cy };

    switch (this.nodeShape) {
      case 'invisible':
        return { x: cx, y: cy };
      case 'circle': {
        const rx = hw;
        const ry = hh;
        const ndx = -dx;
        const ndy = -dy;
        const s = 1 / Math.sqrt((ndx * ndx) / (rx * rx) + (ndy * ndy) / (ry * ry));
        return { x: cx + s * ndx, y: cy + s * ndy };
      }
      case 'diamond': {
        const ndx = -dx;
        const ndy = -dy;
        const s = 1 / (Math.abs(ndx) / hw + Math.abs(ndy) / hh);
        return { x: cx + s * ndx, y: cy + s * ndy };
      }
      default: {
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        const tX = absDx > 0 ? hw / absDx : Infinity;
        const tY = absDy > 0 ? hh / absDy : Infinity;
        const t = Math.min(tX, tY);
        return { x: cx - t * dx, y: cy - t * dy };
      }
    }
  }
}
