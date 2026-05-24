// Pure-JS stand-in for src/app/drawing-area/da-edge.ts. Only the methods/
// properties read by the routers and metrics layer are implemented.
// No Konva, no rendering, no labels, no waypoint glyphs.
//
// The "control point" array semantics match DAEdge:
//   - getPathPoints() returns [srcPerimeter, ...controlPoints, destPerimeter]
//     (with ARROW_STANDOFF = 0, matching the live edge default).
//   - setControlPoints() replaces the bend points (drops pinned-waypoint
//     splicing — the harness doesn't construct pinned waypoints).
//   - initializeStraightControlPoints(n) seeds N evenly spaced points
//     between the two perimeters, identical to the live impl.

import { DANode } from './fake-da-node';

export interface EdgeControlPoint {
  x: number;
  y: number;
  waypointId?: string;
  pinned?: boolean;
}

export class DAEdge {
  readonly id: string;
  readonly srcNode: DANode;
  readonly destNode: DANode;
  private _controlPoints: EdgeControlPoint[] = [];

  /** Match the live default — endpoints sit ON the node perimeter. */
  readonly ARROW_STANDOFF = 0;

  constructor(id: string, src: DANode, dest: DANode) {
    this.id = id;
    this.srcNode = src;
    this.destNode = dest;
    src.outgoingEdges.push(this);
    dest.incomingEdges.push(this);
  }

  get controlPoints(): readonly EdgeControlPoint[] {
    return this._controlPoints;
  }

  /** Mirrors DAEdge.getPathPoints. Self-loops return a four-point loop
   *  identical to the live impl, but the routers all skip self-loop edges
   *  before calling this, so the loop branch is mostly for parity. */
  getPathPoints(): { x: number; y: number }[] {
    if (this.srcNode === this.destNode) {
      return buildSelfLoopPoints(this.srcNode);
    }
    const srcAimTarget = this._controlPoints.length > 0
      ? this._controlPoints[0]
      : nodeCenter(this.destNode);
    const destAimTarget = this._controlPoints.length > 0
      ? this._controlPoints[this._controlPoints.length - 1]
      : nodeCenter(this.srcNode);
    const srcEdge = this.srcNode.getEdgePoint(srcAimTarget.x, srcAimTarget.y);
    const destEdge = this.destNode.getEdgePoint(destAimTarget.x, destAimTarget.y);
    return [
      applyArrowStandoff(srcEdge, srcAimTarget, this.ARROW_STANDOFF),
      ...this._controlPoints.map(p => ({ x: p.x, y: p.y })),
      applyArrowStandoff(destEdge, destAimTarget, this.ARROW_STANDOFF),
    ];
  }

  initializeStraightControlPoints(count: number): void {
    if (this.srcNode === this.destNode || count <= 0) {
      this.clearControlPoints();
      return;
    }
    const srcCenter = nodeCenter(this.srcNode);
    const destCenter = nodeCenter(this.destNode);
    const a = this.srcNode.getEdgePoint(destCenter.x, destCenter.y);
    const b = this.destNode.getEdgePoint(srcCenter.x, srcCenter.y);
    const pts: EdgeControlPoint[] = [];
    for (let i = 1; i <= count; i++) {
      const t = i / (count + 1);
      pts.push({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    }
    this._controlPoints = pts;
  }

  setControlPoints(points: { x: number; y: number }[]): void {
    // The live impl merges pinned waypoints back in here; the harness never
    // creates pinned waypoints, so the merge is a no-op and we just replace.
    this._controlPoints = points.map(p => ({ x: p.x, y: p.y }));
  }

  clearControlPoints(): void {
    this._controlPoints = [];
  }

  /** Live DAEdge toggles Konva.Arrow tension. The harness doesn't render
   *  via Konva, so this is a no-op flag we record for downstream interest. */
  smoothRendering = false;
  setSmoothRendering(smooth: boolean): void {
    this.smoothRendering = smooth;
  }

  /** Used by some downstream helpers; not strictly required by the routers,
   *  but harmless to have. */
  refreshGeometry(): void {
    // no-op in the harness
  }
}

function nodeCenter(node: DANode): { x: number; y: number } {
  return {
    x: node.konvaGroup.x() + node.NODE_WIDTH / 2,
    y: node.konvaGroup.y() + node.NODE_HEIGHT / 2,
  };
}

function applyArrowStandoff(
  endpoint: { x: number; y: number },
  aim: { x: number; y: number },
  standoff: number,
): { x: number; y: number } {
  if (standoff === 0) return endpoint;
  const dx = aim.x - endpoint.x;
  const dy = aim.y - endpoint.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 1e-6) return endpoint;
  const k = standoff / dist;
  return { x: endpoint.x + dx * k, y: endpoint.y + dy * k };
}

function buildSelfLoopPoints(node: DANode): { x: number; y: number }[] {
  const x = node.konvaGroup.x();
  const y = node.konvaGroup.y();
  const width = node.NODE_WIDTH;
  const height = node.NODE_HEIGHT;
  const loopOffsetX = Math.max(28, width * 0.32);
  const loopOffsetY = Math.max(18, height * 0.2);
  return [
    { x: x + width, y: y + height * 0.35 },
    { x: x + width + loopOffsetX, y: y + height * 0.22 - loopOffsetY },
    { x: x + width + loopOffsetX, y: y + height * 0.78 + loopOffsetY },
    { x: x + width, y: y + height * 0.65 },
  ];
}
