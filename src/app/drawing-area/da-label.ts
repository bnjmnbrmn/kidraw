import Konva from 'konva';
import {nextId} from './id-generator';
import {EdgeLabelSide} from './edge-label-anchor';

export class DALabel {
  readonly id: string;
  readonly group: Konva.Group;
  private _isSelected: boolean = false;
  private readonly _rect: Konva.Rect;
  private readonly _text: Konva.Text;
  private _label: string;

  /** Anchor along the parent edge's path: arc-length fraction (0..1) and
   *  which side of the line the label sits on. The owning DAEdge derives
   *  the absolute x/y from these on every geometry change; x/y is the
   *  rendered result, never the source of truth. */
  edgeT: number = 0.5;
  side: EdgeLabelSide = 'on';

  public readonly LABEL_STROKE_WIDTH = 2;
  public readonly SELECTED_STROKE_WIDTH = 3;
  /** Minimum box size — keeps short/empty labels targetable; the box grows
   *  beyond this to fit the text (no length limit). */
  public readonly MIN_RECT_WIDTH = 50;
  public readonly MIN_RECT_HEIGHT = 30;
  public readonly TEXT_PADDING = 5;
  public readonly DEFAULT_FONT_SIZE = 12;
  public readonly MIN_FONT_SIZE = 10;
  public readonly MAX_FONT_SIZE = 48;

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
      stroke: 'transparent',
      strokeWidth: 0,
      fill: 'transparent',
    });

    this._text = new Konva.Text({
      text: this._label,
      fontSize: this._fontSize,
      fontFamily: 'Arial',
      align: 'center',
      verticalAlign: 'middle',
      wrap: 'none',
      fill: this._textColor,
    });

    this.group.add(this._rect);
    this.group.add(this._text);
    this.resizeToFitText();

    // Labels are always visible
    this.group.visible(true);
  }

  /** Size the box to the text (explicit \n makes multi-line), never smaller
   *  than the minimum hit-target, keeping everything centered on the anchor.
   *  Clearing the text's width/height makes Konva report the raw measurement. */
  private resizeToFitText(): void {
    this._text.setAttrs({width: undefined, height: undefined});
    const w = Math.max(this._text.width() + this.TEXT_PADDING * 2, this.MIN_RECT_WIDTH);
    const h = Math.max(this._text.height() + this.TEXT_PADDING, this.MIN_RECT_HEIGHT);
    this._rect.setAttrs({x: -w / 2, y: -h / 2, width: w, height: h});
    this._text.setAttrs({x: -w / 2, y: -h / 2, width: w, height: h});
  }

  /** Current box size (grows with the text). */
  get width(): number {
    return this._rect.width();
  }

  get height(): number {
    return this._rect.height();
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
    this.resizeToFitText();
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
    this.resizeToFitText();
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
    this.resizeToFitText();
  }

  deleteLastChar(): void {
    if (this._label.length > 0) {
      this._label = this._label.slice(0, -1);
      this._text.text(this._label);
      this.resizeToFitText();
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
