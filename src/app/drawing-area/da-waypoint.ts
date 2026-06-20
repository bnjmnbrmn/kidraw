import Konva from 'konva';
import {nextId} from './id-generator';

/** A user-placed bend point on a `DAEdge`'s polyline. Belongs to one edge and
 *  mirrors one entry in that edge's `_controlPoints` array. Unlike router-
 *  generated beads, waypoints are selectable bend handles. They are hidden
 *  unless selected, or unless the drawing layer asks waypoint indicators to be
 *  visible while selection/grid context is active. When `pinned`, the routers
 *  won't move them. */
export class DAWaypoint {
  readonly id: string;
  readonly group: Konva.Group;
  private readonly _dot: Konva.Circle;
  private _isSelected: boolean = false;
  private _pinned: boolean = false;
  private _indicatorsVisible: boolean = false;

  public readonly RADIUS = 5;
  public readonly STROKE_WIDTH_NORMAL = 1.5;
  public readonly STROKE_WIDTH_SELECTED = 3;

  private _strokeColor: string = 'black';
  private _selectedStrokeColor: string = '#33aaff';
  private _pinnedFillColor: string = '#d4a017';

  constructor(x: number, y: number, id?: string, colors?: { stroke?: string }) {
    this.id = id ?? nextId();
    this.group = new Konva.Group({x, y, visible: false});
    if (colors?.stroke) this._strokeColor = colors.stroke;

    this._dot = new Konva.Circle({
      x: 0,
      y: 0,
      radius: this.RADIUS,
      stroke: this._strokeColor,
      strokeWidth: this.STROKE_WIDTH_NORMAL,
      fill: 'transparent',
    });
    this.group.add(this._dot);
  }

  get konvaGroup(): Konva.Group {
    return this.group;
  }

  get isSelected(): boolean {
    return this._isSelected;
  }

  set isSelected(value: boolean) {
    this._isSelected = value;
    this.updateAppearance();
    this.updateVisibility();
  }

  get pinned(): boolean {
    return this._pinned;
  }

  set pinned(value: boolean) {
    this._pinned = value;
    this.updateAppearance();
  }

  get position(): {x: number; y: number} {
    return {x: this.group.x(), y: this.group.y()};
  }

  set position(value: {x: number; y: number}) {
    this.group.position(value);
  }

  get x(): number {
    return this.group.x();
  }

  set x(value: number) {
    this.group.x(value);
  }

  get y(): number {
    return this.group.y();
  }

  set y(value: number) {
    this.group.y(value);
  }

  applyColors(colors: {stroke: string}): void {
    this._strokeColor = colors.stroke;
    this.updateAppearance();
  }

  setIndicatorsVisible(visible: boolean): void {
    this._indicatorsVisible = visible;
    this.updateVisibility();
  }

  /** Distance from the waypoint's center to the given point (in the same
   *  coordinate space as the waypoint's group position — i.e., drawing-layer
   *  coordinates if the group is added to `daEdgeGroup`). */
  distanceTo(point: {x: number; y: number}): number {
    return Math.hypot(this.x - point.x, this.y - point.y);
  }

  private updateAppearance(): void {
    this._dot.stroke(this._isSelected ? this._selectedStrokeColor : this._strokeColor);
    this._dot.strokeWidth(this._isSelected ? this.STROKE_WIDTH_SELECTED : this.STROKE_WIDTH_NORMAL);
    this._dot.fill(this._pinned ? this._pinnedFillColor : 'transparent');
  }

  private updateVisibility(): void {
    this.group.visible(this._isSelected || this._indicatorsVisible);
  }
}
