import Konva from 'konva';
import {nextId} from './id-generator';
import {EdgeLabelSide} from './edge-label-anchor';
import {
  clampIndex, LineRange, lineIndexAt, logicalLineEnd, logicalLineStart,
  moveVertical, wordBack, wordForward,
} from './text-cursor';

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

  /** Insertion index of the label-edit caret (0..text.length); null = end. */
  private _cursorIndex: number | null = null;
  private readonly _cursor: Konva.Line;
  private static _measureText: Konva.Text | null = null;

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

    // Label-edit caret — hidden until edit mode.
    this._cursor = new Konva.Line({
      stroke: this._textColor,
      strokeWidth: 3,
      lineCap: 'round',
      listening: false,
      visible: false,
    });
    this.group.add(this._cursor);

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
    this._cursor.stroke(this._textColor);
    this.updateAppearance();
  }

  // --- Label-edit caret: position model + rendering ---

  /** Current insertion index, clamped to the live text. */
  get cursorIndex(): number {
    return this._cursorIndex === null
      ? this._label.length : clampIndex(this._label, this._cursorIndex);
  }

  setCursorToEnd(): void {
    this._cursorIndex = null;
    this.updateCursorPosition();
  }

  showCursor(): void {
    this.updateCursorPosition();
    this._cursor.visible(true);
    this._cursor.opacity(1);
  }

  hideCursor(): void {
    this._cursor.visible(false);
  }

  appendText(text: string): void {
    this.insertAtCursor(text);
  }

  insertAtCursor(text: string): void {
    const i = this.cursorIndex;
    this._label = this._label.slice(0, i) + text + this._label.slice(i);
    this._cursorIndex = i + text.length;
    this._text.text(this._label);
    this.resizeToFitText();
    this.updateCursorPosition();
  }

  deleteLastChar(): void {
    this.deleteBeforeCursor();
  }

  /** Backspace: delete the char before the caret. */
  deleteBeforeCursor(): void {
    const i = this.cursorIndex;
    if (i === 0) return;
    this._label = this._label.slice(0, i - 1) + this._label.slice(i);
    this._cursorIndex = i - 1;
    this._text.text(this._label);
    this.resizeToFitText();
    this.updateCursorPosition();
  }

  /** Vim `x`: delete the char at the caret — or the last char when the
   *  caret sits at the very end, where vim's block cursor would be. */
  deleteAtCursor(): void {
    if (this._label.length === 0) return;
    const i = Math.min(this.cursorIndex, this._label.length - 1);
    this._label = this._label.slice(0, i) + this._label.slice(i + 1);
    this._cursorIndex = Math.min(i, this._label.length - 1);
    this._text.text(this._label);
    this.resizeToFitText();
    this.updateCursorPosition();
  }

  moveCursorH(delta: number): void {
    this._cursorIndex = clampIndex(this._label, this.cursorIndex + delta);
    this.updateCursorPosition();
  }

  /** Vim `j`/`k` over the label's explicit \n lines (labels never wrap). */
  moveCursorV(delta: number): void {
    this._cursorIndex = moveVertical(this.lineRanges(), this.cursorIndex, delta);
    this.updateCursorPosition();
  }

  cursorToLineStart(): void {
    this._cursorIndex = logicalLineStart(this._label, this.cursorIndex);
    this.updateCursorPosition();
  }

  cursorToLineEnd(): void {
    this._cursorIndex = logicalLineEnd(this._label, this.cursorIndex);
    this.updateCursorPosition();
  }

  cursorWordForward(): void {
    this._cursorIndex = wordForward(this._label, this.cursorIndex);
    this.updateCursorPosition();
  }

  cursorWordBack(): void {
    this._cursorIndex = wordBack(this._label, this.cursorIndex);
    this.updateCursorPosition();
  }

  private lineRanges(): LineRange[] {
    const ranges: LineRange[] = [];
    let start = 0;
    for (const line of this._label.split('\n')) {
      ranges.push({start, length: line.length});
      start += line.length + 1;
    }
    return ranges;
  }

  private measure(str: string): number {
    if (str.length === 0) return 0;
    if (!DALabel._measureText) {
      DALabel._measureText = new Konva.Text({visible: false, fontFamily: 'Arial'});
    }
    DALabel._measureText.fontSize(this._fontSize);
    return DALabel._measureText.measureSize(str).width;
  }

  private updateCursorPosition(): void {
    const ranges = this.lineRanges();
    const i = this.cursorIndex;
    const li = lineIndexAt(ranges, i);
    const line = ranges[li];
    const lineText = this._label.substr(line.start, line.length);
    const prefixWidth = this.measure(this._label.substr(line.start, i - line.start));

    // The text box is centered on the group origin; lines are center-aligned
    // within it and the line block is vertically centered.
    const boxW = this._rect.width();
    const boxH = this._rect.height();
    const lineHeight = this._fontSize * (this._text.lineHeight() ?? 1);
    const blockH = ranges.length * lineHeight;
    const cursorX = -boxW / 2 + (boxW - this.measure(lineText)) / 2 + prefixWidth;
    const cursorY = -boxH / 2 + (boxH - blockH) / 2 + li * lineHeight;

    this._cursor.points([cursorX, cursorY, cursorX, cursorY + this._fontSize]);
    this._cursor.stroke(this._textColor);
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
