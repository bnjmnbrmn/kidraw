import Konva from 'konva';
import {nextId} from './id-generator';

export class DAWaypoint {
  readonly id: string;
  readonly group: Konva.Group;
  private _isSelected: boolean = false;
  private readonly _circle: Konva.Circle;

  public readonly WAYPOINT_RADIUS = 8;
  public readonly WAYPOINT_STROKE_WIDTH = 2;
  public readonly WAYPOINT_COLOR = 'blue';
  public readonly SELECTED_STROKE_WIDTH = 3;
  public readonly SELECTED_COLOR = 'darkblue';

  private _fillColor: string = 'white';
  private _strokeColor: string = this.WAYPOINT_COLOR;

  constructor(x: number, y: number, id?: string,
              colors?: { fill?: string; stroke?: string }) {
    this.id = id ?? nextId();
    this.group = new Konva.Group({ x, y });
    if (colors?.fill) this._fillColor = colors.fill;
    if (colors?.stroke) this._strokeColor = colors.stroke;

    this._circle = new Konva.Circle({
      radius: this.WAYPOINT_RADIUS,
      stroke: this._strokeColor,
      strokeWidth: this.WAYPOINT_STROKE_WIDTH,
      fill: this._fillColor,
    });

    this.group.add(this._circle);

    // Hidden by default until visibility is toggled on
    this.group.visible(false);
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
  }

  get position(): { x: number; y: number } {
    return this.group.position();
  }

  set position(value: { x: number; y: number }) {
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

  show(): void {
    this.group.visible(true);
  }

  hide(): void {
    this.group.visible(false);
  }

  setVisibleForSelection(visible: boolean): void {
    this.group.visible(visible || this._isSelected);
  }

  applyColors(colors: { fill: string; stroke: string }): void {
    this._fillColor = colors.fill;
    this._strokeColor = colors.stroke;
    this._circle.fill(this._fillColor);
    this.updateAppearance();
  }

  private updateAppearance(): void {
    const strokeColor = this._isSelected ? this.SELECTED_COLOR : this._strokeColor;
    const strokeWidth = this._isSelected ? this.SELECTED_STROKE_WIDTH : this.WAYPOINT_STROKE_WIDTH;

    this._circle.stroke(strokeColor);
    this._circle.strokeWidth(strokeWidth);

    if (this._isSelected) {
      this.group.visible(true);
    }
  }
}
