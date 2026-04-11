import Konva from 'konva';
import {DANode} from './da-node';
import {DAWaypoint} from './da-waypoint';
import {DALabel} from './da-label';
import {nextId} from './id-generator';
import {EdgeDirectedness, LineStyle} from './command.model';

export class DAEdge {
  readonly id: string;
  readonly group: Konva.Group;
  private _isSelected: boolean = false;
  public readonly _line: Konva.Arrow;
  public readonly srcNode: DANode;
  public readonly destNode: DANode;
  private _waypoints: DAWaypoint[] = [];
  private _labels: DALabel[] = [];
  private _segments: (Konva.Line | Konva.Arrow)[] = [];

  public readonly STROKE_WIDTH_SELECTED = 4;
  public readonly STROKE_WIDTH_NORMAL = 2;
  public readonly POINTER_LENGTH = 10;
  public readonly POINTER_WIDTH = 10;

  private _strokeColor: string = 'black';
  private _fillColor: string = 'black';
  private _directedness: EdgeDirectedness = 'directed';
  private _lineStyle: LineStyle = 'solid';

  constructor(srcNode: DANode, destNode: DANode, label: string, id?: string,
              colors?: { stroke?: string; fill?: string }) {
    this.id = id ?? nextId();
    this.group = new Konva.Group();
    this.srcNode = srcNode;
    this.destNode = destNode;
    if (colors?.stroke) this._strokeColor = colors.stroke;
    if (colors?.fill) this._fillColor = colors.fill;

    // Register this edge with the nodes
    srcNode.addOutgoingEdge(this);
    destNode.addIncomingEdge(this);

    this._line = new Konva.Arrow({
      points: this.calculatePoints(srcNode, destNode),
      stroke: this.stroke(),
      strokeWidth: this.strokeWidth(),
      fill: this._fillColor,
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
    return this._strokeColor;
  }

  get directedness(): EdgeDirectedness {
    return this._directedness;
  }

  set directedness(value: EdgeDirectedness) {
    this._directedness = value;
    this.applyDirectedness();
  }

  get lineStyle(): LineStyle {
    return this._lineStyle;
  }

  set lineStyle(value: LineStyle) {
    this._lineStyle = value;
    this.applyLineStyle();
  }

  private applyDirectedness(): void {
    const pointerLength = this._directedness === 'undirected' ? 0 : this.POINTER_LENGTH;
    const pointerWidth = this._directedness === 'undirected' ? 0 : this.POINTER_WIDTH;
    this._line.pointerLength(pointerLength);
    this._line.pointerWidth(pointerWidth);
    // For bidirectional, we'd need a second arrowhead at the source — handled in updateSegments
    this.updateSegments();
  }

  private applyLineStyle(): void {
    const dash = this._lineStyle === 'dashed' ? [10, 5] : this._lineStyle === 'dotted' ? [2, 4] : [];
    this._line.dash(dash);
    this._line.dashEnabled(dash.length > 0);
    this._segments.forEach(segment => {
      segment.dash(dash);
      segment.dashEnabled(dash.length > 0);
    });
  }

  applyColors(colors: { stroke: string; fill: string }): void {
    this._strokeColor = colors.stroke;
    this._fillColor = colors.fill;
    this._line.stroke(this._strokeColor);
    this._line.fill(this._fillColor);
    this._segments.forEach(segment => {
      segment.stroke(this._strokeColor);
      if (segment instanceof Konva.Arrow) {
        (segment as Konva.Arrow).fill(this._fillColor);
      }
    });
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
    const srcCenter = this.getNodeCenter(this.srcNode);
    const destCenter = this.getNodeCenter(this.destNode);

    const dx = destCenter.x - srcCenter.x;
    const dy = destCenter.y - srcCenter.y;
    const lenSq = dx * dx + dy * dy;

    this._waypoints.sort((a, b) => {
      const tA = lenSq > 0 ? ((a.x - srcCenter.x) * dx + (a.y - srcCenter.y) * dy) / lenSq : 0;
      const tB = lenSq > 0 ? ((b.x - srcCenter.x) * dx + (b.y - srcCenter.y) * dy) / lenSq : 0;
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

  get labels(): DALabel[] {
    return this._labels;
  }

  addLabel(label: DALabel): void {
    this._labels.push(label);
    this.group.add(label.konvaGroup);
  }

  removeLabel(label: DALabel): void {
    const index = this._labels.indexOf(label);
    if (index > -1) {
      this._labels.splice(index, 1);
      label.konvaGroup.remove();
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
    
    const pointerLength = this._directedness === 'undirected' ? 0 : this.POINTER_LENGTH;
    const pointerWidth = this._directedness === 'undirected' ? 0 : this.POINTER_WIDTH;
    const dash = this._lineStyle === 'dashed' ? [10, 5] : this._lineStyle === 'dotted' ? [2, 4] : [];
    const dashEnabled = dash.length > 0;

    for (let i = 0; i < points.length - 1; i++) {
      const isFirstSegment = i === 0;
      const isLastSegment = i === points.length - 2;
      const needsArrow = (isLastSegment && this._directedness !== 'undirected') ||
                         (isFirstSegment && this._directedness === 'bidirectional');

      if (needsArrow) {
        // Segment with arrow pointer
        const segPoints = isFirstSegment && this._directedness === 'bidirectional' && !isLastSegment
          ? [points[i + 1].x, points[i + 1].y, points[i].x, points[i].y]  // Reverse for source arrow
          : [points[i].x, points[i].y, points[i + 1].x, points[i + 1].y];
        const segment = new Konva.Arrow({
          points: segPoints,
          stroke: this.stroke(),
          strokeWidth: this.strokeWidth(),
          fill: this._fillColor,
          pointerLength,
          pointerWidth,
          dash, dashEnabled,
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
          dash, dashEnabled,
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
    if (this.srcNode === this.destNode && this._waypoints.length === 0) {
      return this.buildSelfLoopPoints(this.srcNode);
    }

    const points: { x: number; y: number }[] = [];

    const srcCenter = this.getNodeCenter(this.srcNode);
    const destCenter = this.getNodeCenter(this.destNode);

    // Source edge point aims toward first waypoint (or dest center if none)
    const firstTarget = this._waypoints.length > 0
      ? { x: this._waypoints[0].x, y: this._waypoints[0].y }
      : { x: destCenter.x, y: destCenter.y };
    const srcPoint = this.calculateSourceEdgePoint(firstTarget.x, firstTarget.y, this.srcNode);
    points.push(srcPoint);

    // Add waypoints in order
    this._waypoints.forEach(waypoint => {
      points.push({ x: waypoint.x, y: waypoint.y });
    });

    // Dest edge point aims from last waypoint (or src center if none)
    const lastFrom = this._waypoints.length > 0
      ? { x: this._waypoints[this._waypoints.length - 1].x, y: this._waypoints[this._waypoints.length - 1].y }
      : { x: srcCenter.x, y: srcCenter.y };
    const destPoint = this.calculateNodeEdgePoint(lastFrom.x, lastFrom.y, this.destNode);
    points.push(destPoint);

    return points;
  }

  private calculateNodeEdgePoint(fromX: number, fromY: number, toNode: DANode): { x: number; y: number } {
    return toNode.getEdgePoint(fromX, fromY);
  }

  private calculateSourceEdgePoint(toX: number, toY: number, fromNode: DANode): { x: number; y: number } {
    return fromNode.getEdgePoint(toX, toY);
  }

  public calculatePoints(srcNode: DANode, destNode: DANode): number[] {
    if (srcNode === destNode) {
      return this.buildSelfLoopPoints(srcNode).flatMap((point) => [point.x, point.y]);
    }

    const srcCenter = this.getNodeCenter(srcNode);
    const destCenter = this.getNodeCenter(destNode);

    const srcPoint = srcNode.getEdgePoint(destCenter.x, destCenter.y);
    const destPoint = destNode.getEdgePoint(srcCenter.x, srcCenter.y);

    return [srcPoint.x, srcPoint.y, destPoint.x, destPoint.y];
  }

  private getNodeCenter(node: DANode): {x: number; y: number} {
    return {
      x: node.konvaGroup.x() + node.NODE_WIDTH / 2,
      y: node.konvaGroup.y() + node.NODE_HEIGHT / 2,
    };
  }

  private buildSelfLoopPoints(node: DANode): {x: number; y: number}[] {
    const x = node.konvaGroup.x();
    const y = node.konvaGroup.y();
    const width = node.NODE_WIDTH;
    const height = node.NODE_HEIGHT;
    const loopOffsetX = Math.max(28, width * 0.32);
    const loopOffsetY = Math.max(18, height * 0.2);

    return [
      {x: x + width, y: y + height * 0.35},
      {x: x + width + loopOffsetX, y: y + height * 0.22 - loopOffsetY},
      {x: x + width + loopOffsetX, y: y + height * 0.78 + loopOffsetY},
      {x: x + width, y: y + height * 0.65},
    ];
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
