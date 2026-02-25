import Konva from 'konva';

export class DALabel {
  readonly group: Konva.Group;
  private _isSelected: boolean = false;
  private readonly _rect: Konva.Rect;
  private readonly _text: Konva.Text;
  private _label: string;

  public readonly LABEL_COLOR = 'blue';
  public readonly LABEL_STROKE_WIDTH = 2;
  public readonly SELECTED_COLOR = 'darkblue';
  public readonly SELECTED_STROKE_WIDTH = 3;
  public readonly RECT_WIDTH = 50;
  public readonly RECT_HEIGHT = 30;
  public readonly TEXT_PADDING = 5;
  public readonly DEFAULT_FONT_SIZE = 12;
  public readonly MIN_FONT_SIZE = 10;
  public readonly MAX_FONT_SIZE = 36;

  private _fontSize = this.DEFAULT_FONT_SIZE;

  constructor(x: number, y: number, label: string) {
    this.group = new Konva.Group({ x, y });
    this._label = label;

    this._rect = new Konva.Rect({
      x: -this.RECT_WIDTH / 2,
      y: -this.RECT_HEIGHT / 2,
      width: this.RECT_WIDTH,
      height: this.RECT_HEIGHT,
      stroke: this.LABEL_COLOR,
      strokeWidth: this.LABEL_STROKE_WIDTH,
      fill: 'white'
    });

    this._text = new Konva.Text({
      x: -this.RECT_WIDTH / 2 + this.TEXT_PADDING,
      y: -this.RECT_HEIGHT / 2,
      width: this.RECT_WIDTH - this.TEXT_PADDING * 2,
      height: this.RECT_HEIGHT,
      text: this._label,
      fontSize: this._fontSize,
      fontFamily: 'Arial',
      textAlign: 'center',
      verticalAlign: 'middle',
      fill: 'black'
    });

    this.group.add(this._rect);
    this.group.add(this._text);

    // Labels are always visible
    this.group.visible(true);
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

  get label(): string {
    return this._label;
  }

  set label(value: string) {
    this._label = value;
    this._text.text(value);
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

  adjustFontSizeBy(delta: number): boolean {
    const nextSize = this.clamp(this._fontSize + delta, this.MIN_FONT_SIZE, this.MAX_FONT_SIZE);
    if (nextSize === this._fontSize) {
      return false;
    }

    this._fontSize = nextSize;
    this._text.fontSize(this._fontSize);
    return true;
  }

  private clamp(value: number, minValue: number, maxValue: number): number {
    return Math.min(Math.max(value, minValue), maxValue);
  }

  private updateAppearance(): void {
    const strokeColor = this._isSelected ? this.SELECTED_COLOR : this.LABEL_COLOR;
    const strokeWidth = this._isSelected ? this.SELECTED_STROKE_WIDTH : this.LABEL_STROKE_WIDTH;

    this._rect.stroke(strokeColor);
    this._rect.strokeWidth(strokeWidth);
  }
}
