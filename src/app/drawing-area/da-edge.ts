import Konva from 'konva';
import {DANode} from './da-node';
import {DAWaypoint} from './da-waypoint';

export class DAEdge {
  readonly group: Konva.Group;
  private _isSelected: boolean = false;
  public readonly _line: Konva.Arrow;
  public readonly srcNode: DANode;
  public readonly destNode: DANode;
  private _waypoints: DAWaypoint[] = [];
  private _segments: (Konva.Line | Konva.Arrow)[] = [];

  public readonly STROKE_WIDTH_SELECTED = 4;
  public readonly STROKE_WIDTH_NORMAL = 2;
  public readonly NODE_HALF_SIZE = 50;
  public readonly POINTER_LENGTH = 10;
  public readonly POINTER_WIDTH = 10;

  constructor(srcNode: DANode, destNode: DANode, label: string) {
    this.group = new Konva.Group();
    this.srcNode = srcNode;
    this.destNode = destNode;

    // Register this edge with the nodes
    srcNode.addOutgoingEdge(this);
    destNode.addIncomingEdge(this);

    this._line = new Konva.Arrow({
      points: this.calculatePoints(srcNode, destNode),
      stroke: this.stroke(),
      strokeWidth: this.strokeWidth(),
      fill: 'black',
      pointerLength: this.POINTER_LENGTH,
      pointerWidth: this.POINTER_WIDTH,
    });
    this.group.add(this._line);
  }

  get isSelected(): boolean {
    return this._isSelected;
  }

  set isSelected(value: boolean) {
    this._isSelected = value;
    this.updateSegmentStyles();
  }

  private strokeWidth() {
    return this._isSelected ? this.STROKE_WIDTH_SELECTED : this.STROKE_WIDTH_NORMAL;
  }

  private stroke() {
    return 'black'
  }

  get waypoints(): DAWaypoint[] {
    return this._waypoints;
  }

  addWaypoint(waypoint: DAWaypoint): void {
    this._waypoints.push(waypoint);
    this.group.add(waypoint.konvaGroup);
    this.sortWaypointsByPosition();
    this.updateSegments();
  }

  private sortWaypointsByPosition(): void {
    const srcPos = this.srcNode.konvaGroup.position();
    const srcX = srcPos.x + this.NODE_HALF_SIZE;
    const srcY = srcPos.y + this.NODE_HALF_SIZE;
    const destPos = this.destNode.konvaGroup.position();
    const destX = destPos.x + this.NODE_HALF_SIZE;
    const destY = destPos.y + this.NODE_HALF_SIZE;

    const dx = destX - srcX;
    const dy = destY - srcY;
    const lenSq = dx * dx + dy * dy;

    this._waypoints.sort((a, b) => {
      const tA = lenSq > 0 ? ((a.x - srcX) * dx + (a.y - srcY) * dy) / lenSq : 0;
      const tB = lenSq > 0 ? ((b.x - srcX) * dx + (b.y - srcY) * dy) / lenSq : 0;
      return tA - tB;
    });
  }

  refreshSegments(): void {
    if (this._waypoints.length > 0) {
      this.updateSegments();
    }
  }

  removeWaypoint(waypoint: DAWaypoint): void {
    const index = this._waypoints.indexOf(waypoint);
    if (index > -1) {
      this._waypoints.splice(index, 1);
      waypoint.konvaGroup.remove();
      this.updateSegments();
    }
  }

  private updateSegments(): void {
    // Clear existing segments
    this._segments.forEach(segment => segment.remove());
    this._segments = [];

    // Hide the main arrow line when we have waypoints
    this._line.visible(this._waypoints.length === 0);

    if (this._waypoints.length === 0) {
      // No waypoints, use the main arrow
      return;
    }

    // Create segments between waypoints
    const points = this.getAllSegmentPoints();
    
    for (let i = 0; i < points.length - 1; i++) {
      const isLastSegment = i === points.length - 2;
      
      if (isLastSegment) {
        // Last segment with arrow - use Konva.Arrow
        const segment = new Konva.Arrow({
          points: [points[i].x, points[i].y, points[i + 1].x, points[i + 1].y],
          stroke: this.stroke(),
          strokeWidth: this.strokeWidth(),
          fill: 'black',
          pointerLength: this.POINTER_LENGTH,
          pointerWidth: this.POINTER_WIDTH,
          tension: 0,
          lineCap: 'round',
          lineJoin: 'round'
        });
        this._segments.push(segment);
        this.group.add(segment);
      } else {
        // Regular line segment without arrow
        const segment = new Konva.Line({
          points: [points[i].x, points[i].y, points[i + 1].x, points[i + 1].y],
          stroke: this.stroke(),
          strokeWidth: this.strokeWidth(),
          tension: 0,
          lineCap: 'round',
          lineJoin: 'round'
        });
        this._segments.push(segment);
        this.group.add(segment);
      }
    }

    this.updateSegmentStyles();
  }

  private updateSegmentStyles(): void {
    this._line.stroke(this.stroke());
    this._line.strokeWidth(this.strokeWidth());
    this._segments.forEach(segment => {
      segment.stroke(this.stroke());
      segment.strokeWidth(this.strokeWidth());
    });
  }

  getPathPoints(): { x: number; y: number }[] {
    return this.getAllSegmentPoints();
  }

  private getAllSegmentPoints(): { x: number; y: number }[] {
    const points: { x: number; y: number }[] = [];
    
    const srcPos = this.srcNode.konvaGroup.position();
    const srcCenterX = srcPos.x + this.NODE_HALF_SIZE;
    const srcCenterY = srcPos.y + this.NODE_HALF_SIZE;
    const destPos = this.destNode.konvaGroup.position();
    const destCenterX = destPos.x + this.NODE_HALF_SIZE;
    const destCenterY = destPos.y + this.NODE_HALF_SIZE;

    // Source edge point aims toward first waypoint (or dest center if none)
    const firstTarget = this._waypoints.length > 0
      ? { x: this._waypoints[0].x, y: this._waypoints[0].y }
      : { x: destCenterX, y: destCenterY };
    const srcPoint = this.calculateSourceEdgePoint(firstTarget.x, firstTarget.y, this.srcNode);
    points.push(srcPoint);

    // Add waypoints in order
    this._waypoints.forEach(waypoint => {
      points.push({ x: waypoint.x, y: waypoint.y });
    });

    // Dest edge point aims from last waypoint (or src center if none)
    const lastFrom = this._waypoints.length > 0
      ? { x: this._waypoints[this._waypoints.length - 1].x, y: this._waypoints[this._waypoints.length - 1].y }
      : { x: srcCenterX, y: srcCenterY };
    const destPoint = this.calculateNodeEdgePoint(lastFrom.x, lastFrom.y, this.destNode);
    points.push(destPoint);

    return points;
  }

  private calculateNodeEdgePoint(fromX: number, fromY: number, toNode: DANode): { x: number; y: number } {
    const toPos = toNode.konvaGroup.position();
    const toCenterX = toPos.x + this.NODE_HALF_SIZE;
    const toCenterY = toPos.y + this.NODE_HALF_SIZE;
    
    const dx = toCenterX - fromX;
    const dy = toCenterY - fromY;
    
    // Calculate the intersection point with the destination node
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    
    // Determine which edge the line hits first
    const tX = absDx > 0 ? this.NODE_HALF_SIZE / absDx : Infinity;
    const tY = absDy > 0 ? this.NODE_HALF_SIZE / absDy : Infinity;
    const t = Math.min(tX, tY);
    
    // Calculate the intersection point (offset from dest center, toward src)
    const edgeX = toCenterX - t * dx;
    const edgeY = toCenterY - t * dy;
    
    return { x: edgeX, y: edgeY };
  }

  private calculateSourceEdgePoint(toX: number, toY: number, fromNode: DANode): { x: number; y: number } {
    const fromPos = fromNode.konvaGroup.position();
    const fromCenterX = fromPos.x + this.NODE_HALF_SIZE;
    const fromCenterY = fromPos.y + this.NODE_HALF_SIZE;
    
    const dx = toX - fromCenterX;
    const dy = toY - fromCenterY;
    
    // Calculate the intersection point with the source node
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    
    // Determine which edge the line hits first
    const tX = absDx > 0 ? this.NODE_HALF_SIZE / absDx : Infinity;
    const tY = absDy > 0 ? this.NODE_HALF_SIZE / absDy : Infinity;
    const t = Math.min(tX, tY);
    
    // Calculate the intersection point (offset from src center, toward dest)
    const edgeX = fromCenterX + t * dx;
    const edgeY = fromCenterY + t * dy;
    
    return { x: edgeX, y: edgeY };
  }

  public calculatePoints(srcNode: DANode, destNode: DANode): [number, number, number, number] {
    const srcPos = srcNode.konvaGroup.position();
    const destPos = destNode.konvaGroup.position();
    
    // Calculate node centers (nodes are positioned at their top-left, so add half dimensions)
    const srcCenterX = srcPos.x + this.NODE_HALF_SIZE;
    const srcCenterY = srcPos.y + this.NODE_HALF_SIZE;
    const destCenterX = destPos.x + this.NODE_HALF_SIZE;
    const destCenterY = destPos.y + this.NODE_HALF_SIZE;
    
    const dx = destCenterX - srcCenterX;
    const dy = destCenterY - srcCenterY;
    
    // Calculate the intersection point with the destination node
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    
    // Determine which edge the line hits first
    const tX = absDx > 0 ? this.NODE_HALF_SIZE / absDx : Infinity;
    const tY = absDy > 0 ? this.NODE_HALF_SIZE / absDy : Infinity;
    const t = Math.min(tX, tY);
    
    // Calculate the intersection point (offset from dest center, toward src)
    const arrowEndX = destCenterX - t * dx;
    const arrowEndY = destCenterY - t * dy;
    
    // Calculate the intersection point with the source node
    const srcT = Math.min(tX, tY);
    const srcX = srcCenterX + srcT * dx;
    const srcY = srcCenterY + srcT * dy;
    
    return [srcX, srcY, arrowEndX, arrowEndY];
  }

  get konvaGroup(): Konva.Group {
    return this.group;
  }

  get line(): Konva.Arrow {
    return this._line;
  }

  zIndex() {
    return this.group.zIndex();
  }
}
