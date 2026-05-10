import Konva from 'konva';
import {nextId} from './id-generator';

export class DALabel {
  readonly id: string;
  readonly group: Konva.Group;
  private _isSelected: boolean = false;
  private readonly _rect: Konva.Rect;
  private readonly _text: Konva.Text;
  private _label: string;

  public readonly LABEL_STROKE_WIDTH = 2;
  public readonly SELECTED_STROKE_WIDTH = 3;
  public readonly RECT_WIDTH = 50;
  public readonly RECT_HEIGHT = 30;
  public readonly TEXT_PADDING = 5;
  public readonly DEFAULT_FONT_SIZE = 12;
  public readonly MIN_FONT_SIZE = 10;
  public readonly MAX_FONT_SIZE = 36;

  private _fontSize = this.DEFAULT_FONT_SIZE;

  private _fillColor: string = 'white';
  private _strokeColor: string = 'blue';
  private _textColor: string = 'black';

  constructor(x: number, y: number, label: string, id?: string,
              colors?: { fill?: string; stroke?: string; text?: string }) {
    this.id = id ?? nextId();
    this.group = new Konva.Group({ x, y });
    this._label = label;
    if (colors?.fill) this._fillColor = colors.fill;
    if (colors?.stroke) this._strokeColor = colors.stroke;
    if (colors?.text) this._textColor = colors.text;

    this._rect = new Konva.Rect({
      x: -this.RECT_WIDTH / 2,
      y: -this.RECT_HEIGHT / 2,
      width: this.RECT_WIDTH,
      height: this.RECT_HEIGHT,
      stroke: 'transparent',
      strokeWidth: 0,
      fill: 'transparent',
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
      fill: this._textColor,
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

  get fontSize(): number {
    return this._fontSize;
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

  applyColors(colors: { fill: string; stroke: string; text: string }): void {
    this._fillColor = colors.fill;
    this._strokeColor = colors.stroke;
    this._textColor = colors.text;
    this._rect.fill(this._fillColor);
    this._text.fill(this._textColor);
    this.updateAppearance();
  }

  appendText(text: string): void {
    this._label += text;
    this._text.text(this._label);
  }

  deleteLastChar(): void {
    if (this._label.length > 0) {
      this._label = this._label.slice(0, -1);
      this._text.text(this._label);
    }
  }

  private updateAppearance(): void {
    if (this._isSelected) {
      this._rect.stroke(this._strokeColor);
      this._rect.strokeWidth(this.SELECTED_STROKE_WIDTH);
      this._rect.fill(this._fillColor);
    } else {
      this._rect.stroke('transparent');
      this._rect.strokeWidth(0);
      this._rect.fill('transparent');
    }
  }
}
