import Konva from 'konva';
import { DAEdge } from './da-edge';

export class DAWaypoint {
  readonly group: Konva.Group;
  private _isSelected: boolean = false;
  private readonly _circle: Konva.Circle;
  private readonly _rect: Konva.Rect;
  private _hasText: boolean = false;
  private _text: Konva.Text | null = null;
  private _label: string = '';

  public readonly WAYPOINT_RADIUS = 8;
  public readonly WAYPOINT_STROKE_WIDTH = 2;
  public readonly WAYPOINT_COLOR = 'blue';
  public readonly SELECTED_STROKE_WIDTH = 3;
  public readonly SELECTED_COLOR = 'darkblue';

  constructor(x: number, y: number, label: string = '') {
    this.group = new Konva.Group({ x, y });
    this._label = label;
    this._hasText = label.length > 0;

    // Create circle for waypoint
    this._circle = new Konva.Circle({
      radius: this.WAYPOINT_RADIUS,
      stroke: this.WAYPOINT_COLOR,
      strokeWidth: this.WAYPOINT_STROKE_WIDTH,
      fill: 'white'
    });

    // Create rectangle for waypoints with text
    this._rect = new Konva.Rect({
      x: -25,
      y: -15,
      width: 50,
      height: 30,
      stroke: this.WAYPOINT_COLOR,
      strokeWidth: this.WAYPOINT_STROKE_WIDTH,
      fill: 'white',
      visible: this._hasText
    });

    // Create text label if provided
    if (this._hasText) {
      this._text = new Konva.Text({
        x: -20,
        y: -10,
        width: 40,
        height: 20,
        text: this._label,
        fontSize: 12,
        fontFamily: 'Arial',
        textAlign: 'center',
        verticalAlign: 'middle',
        fill: 'black'
      });
    }

    // Add shapes to group
    this.group.add(this._circle);
    this.group.add(this._rect);
    if (this._text) {
      this.group.add(this._text);
    }

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

  get hasText(): boolean {
    return this._hasText;
  }

  get label(): string {
    return this._label;
  }

  set label(value: string) {
    this._label = value;
    this._hasText = value.length > 0;
    
    // Create or update text
    if (this._hasText && !this._text) {
      this._text = new Konva.Text({
        x: -20,
        y: -10,
        width: 40,
        height: 20,
        text: this._label,
        fontSize: 12,
        fontFamily: 'Arial',
        textAlign: 'center',
        verticalAlign: 'middle',
        fill: 'black'
      });
      this.group.add(this._text);
    } else if (this._text) {
      this._text.text(this._label);
    }
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
    // Show group if visibility is toggled on OR if selected
    this.group.visible(visible || this._isSelected);
  }

  private updateAppearance(): void {
    const strokeColor = this._isSelected ? this.SELECTED_COLOR : this.WAYPOINT_COLOR;
    const strokeWidth = this._isSelected ? this.SELECTED_STROKE_WIDTH : this.WAYPOINT_STROKE_WIDTH;

    this._circle.stroke(strokeColor);
    this._circle.strokeWidth(strokeWidth);
    this._rect.stroke(strokeColor);
    this._rect.strokeWidth(strokeWidth);

    // Selected waypoints are always visible
    if (this._isSelected) {
      this.group.visible(true);
    }
  }
}
