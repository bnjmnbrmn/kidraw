// Lightweight, Konva-free stand-ins for DANode / DAEdge, used inside the
// routing Web Worker (see routing.worker.ts). The routing pipeline
// (weighted-chain → bezier-fit-weighted-chain → desiderata) only ever reads a
// small, pure-geometry subset of the DANode/DAEdge surface and never touches
// Konva at runtime (its DANode/DAEdge imports are type-only). These classes
// reproduce that subset exactly — they are the same shapes the routing-eval
// harness routes against — so the worker computes the identical control points
// the live edges would, then posts them back to be applied on the main thread.

export type NodeShape = 'box' | 'circle' | 'diamond' | 'junction' | 'invisible';

export interface EdgeControlPoint {
  x: number;
  y: number;
  waypointId?: string;
  pinned?: boolean;
}

/** Minimal Konva-group surface the routing reads: x()/y() return the node's
 *  top-left in drawing-layer coordinates. */
class WorkerKonvaGroup {
  constructor(private _x: number, private _y: number) {}
  x(): number { return this._x; }
  y(): number { return this._y; }
}

export class RoutingNode {
  readonly id: string;
  readonly nodeShape: NodeShape;
  readonly NODE_WIDTH: number;
  readonly NODE_HEIGHT: number;
  readonly konvaGroup: WorkerKonvaGroup;
  incomingEdges: RoutingEdge[] = [];
  outgoingEdges: RoutingEdge[] = [];

  constructor(id: string, x: number, y: number, width: number, height: number, shape: NodeShape) {
    this.id = id;
    this.nodeShape = shape;
    this.NODE_WIDTH = width;
    this.NODE_HEIGHT = height;
    this.konvaGroup = new WorkerKonvaGroup(x, y);
  }

  /** Perimeter point intersected by the ray from (fromX,fromY) toward the node
   *  centre. Mirrors DANode.getEdgePoint exactly. */
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
        const ndx = -dx, ndy = -dy;
        const s = 1 / Math.sqrt((ndx * ndx) / (hw * hw) + (ndy * ndy) / (hh * hh));
        return { x: cx + s * ndx, y: cy + s * ndy };
      }
      case 'diamond': {
        const ndx = -dx, ndy = -dy;
        const s = 1 / (Math.abs(ndx) / hw + Math.abs(ndy) / hh);
        return { x: cx + s * ndx, y: cy + s * ndy };
      }
      default: {
        const absDx = Math.abs(dx), absDy = Math.abs(dy);
        const tX = absDx > 0 ? hw / absDx : Infinity;
        const tY = absDy > 0 ? hh / absDy : Infinity;
        const t = Math.min(tX, tY);
        return { x: cx - t * dx, y: cy - t * dy };
      }
    }
  }
}

export class RoutingEdge {
  readonly id: string;
  readonly srcNode: RoutingNode;
  readonly destNode: RoutingNode;
  readonly ARROW_STANDOFF = 0;
  smoothRendering = false;
  private _controlPoints: EdgeControlPoint[] = [];

  constructor(id: string, src: RoutingNode, dest: RoutingNode) {
    this.id = id;
    this.srcNode = src;
    this.destNode = dest;
    src.outgoingEdges.push(this);
    dest.incomingEdges.push(this);
  }

  get controlPoints(): readonly EdgeControlPoint[] {
    return this._controlPoints;
  }

  getPathPoints(): { x: number; y: number }[] {
    if (this.srcNode === this.destNode) return buildSelfLoopPoints(this.srcNode);
    const srcAim = this._controlPoints.length > 0 ? this._controlPoints[0] : nodeCenter(this.destNode);
    const destAim = this._controlPoints.length > 0
      ? this._controlPoints[this._controlPoints.length - 1]
      : nodeCenter(this.srcNode);
    return [
      this.srcNode.getEdgePoint(srcAim.x, srcAim.y),
      ...this._controlPoints.map(p => ({ x: p.x, y: p.y })),
      this.destNode.getEdgePoint(destAim.x, destAim.y),
    ];
  }

  setControlPoints(points: { x: number; y: number }[]): void {
    this._controlPoints = points.map(p => ({ x: p.x, y: p.y }));
  }

  clearControlPoints(): void {
    this._controlPoints = [];
  }

  setSmoothRendering(smooth: boolean): void {
    this.smoothRendering = smooth;
  }
}

function nodeCenter(node: RoutingNode): { x: number; y: number } {
  return { x: node.konvaGroup.x() + node.NODE_WIDTH / 2, y: node.konvaGroup.y() + node.NODE_HEIGHT / 2 };
}

function buildSelfLoopPoints(node: RoutingNode): { x: number; y: number }[] {
  const x = node.konvaGroup.x();
  const y = node.konvaGroup.y();
  const w = node.NODE_WIDTH;
  const h = node.NODE_HEIGHT;
  const ox = Math.max(28, w * 0.32);
  const oy = Math.max(18, h * 0.2);
  return [
    { x: x + w, y: y + h * 0.35 },
    { x: x + w + ox, y: y + h * 0.22 - oy },
    { x: x + w + ox, y: y + h * 0.78 + oy },
    { x: x + w, y: y + h * 0.65 },
  ];
}
