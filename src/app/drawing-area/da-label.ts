import Konva from 'konva';
import {nextId} from './id-generator';
import {EdgeLabelSide} from './edge-label-anchor';
import {TextCursorMode, VimChangeMotion} from './command.model';
import {
  clampIndex, innerWordRange, LineRange, lineIndexAt, logicalLineEnd, logicalLineStart,
  moveVertical, vimChangeRange, wordBack, wordEnd, wordForward,
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
  private _cursorMode: TextCursorMode = 'insert';
  private _visualAnchor: number | null = null;
  private readonly _visualSelection: Konva.Group;
  private _cursorBlinkTimer: number | null = null;
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

    this._visualSelection = new Konva.Group({listening: false, visible: false});
    this.group.add(this._visualSelection);
    this._visualSelection.moveDown();

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
    this._visualSelection.getChildren().forEach(child => child.setAttr('fill', this._textColor));
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

  /** Place the insertion caret nearest a point in label-local coordinates. */
  setCursorFromLocalPoint(point: {x: number; y: number}): void {
    const ranges = this.lineRanges();
    const lineHeight = this._fontSize * (this._text.lineHeight() ?? 1);
    const blockHeight = ranges.length * lineHeight;
    const blockY = -this._rect.height() / 2 + (this._rect.height() - blockHeight) / 2;
    const lineIndex = Math.max(0, Math.min(
      ranges.length - 1,
      Math.floor((point.y - blockY) / Math.max(lineHeight, 1)),
    ));
    const line = ranges[lineIndex];
    const lineText = this._label.slice(line.start, line.start + line.length);
    const lineX = -this._rect.width() / 2 + (this._rect.width() - this.measure(lineText)) / 2;
    let best = line.start;
    let bestDistance = Math.abs(point.x - lineX);
    for (let offset = 1; offset <= line.length; offset++) {
      const distance = Math.abs(point.x - (lineX + this.measure(lineText.slice(0, offset))));
      if (distance < bestDistance) {
        best = line.start + offset;
        bestDistance = distance;
      }
    }
    this._cursorIndex = best;
    this.updateCursorPosition();
  }

  /** Complete Vim visual `iw` from the current caret. */
  selectInnerWord(): void {
    const range = innerWordRange(this._label, this.cursorIndex);
    if (!range) return;
    this._cursorMode = 'vimVisual';
    this._visualAnchor = range.start;
    this._cursorIndex = range.end - 1;
    this.updateCursorPosition();
  }

  showCursor(): void {
    this.updateCursorPosition();
    this._cursor.visible(true);
    this._cursor.opacity(1);
    this.startCursorBlink();
  }

  hideCursor(): void {
    this.stopCursorBlink();
    this._cursor.visible(false);
  }

  setCursorMode(mode: TextCursorMode): void {
    if (mode === 'vimVisual' && this._cursorMode !== 'vimVisual') {
      this._visualAnchor = this.visualCursorIndex();
    } else if (mode !== 'vimVisual') {
      this._visualAnchor = null;
    }
    this._cursorMode = mode;
    this.updateCursorPosition();
    this._cursor.opacity(1);
  }

  private startCursorBlink(): void {
    this.stopCursorBlink();
    this._cursorBlinkTimer = window.setInterval(() => {
      if (this._cursor.visible()) this._cursor.opacity(this._cursor.opacity() === 0 ? 1 : 0);
    }, 530);
  }

  private stopCursorBlink(): void {
    if (this._cursorBlinkTimer === null) return;
    window.clearInterval(this._cursorBlinkTimer);
    this._cursorBlinkTimer = null;
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
    const range = this.visualSelectionRange();
    if (range) {
      this._label = this._label.slice(0, range.start) + this._label.slice(range.end);
      this._cursorIndex = Math.min(range.start, Math.max(this._label.length - 1, 0));
      this._text.text(this._label);
      this.resizeToFitText();
      this.updateCursorPosition();
      return;
    }
    const i = Math.min(this.cursorIndex, this._label.length - 1);
    this._label = this._label.slice(0, i) + this._label.slice(i + 1);
    this._cursorIndex = Math.min(i, this._label.length - 1);
    this._text.text(this._label);
    this.resizeToFitText();
    this.updateCursorPosition();
  }

  /** Vim `r`: replace the character under the cursor, or every selected
   *  non-newline character in visual mode. */
  replaceAtCursor(value: string): void {
    if (this._label.length === 0 || value.length === 0) return;
    const replacement = value[0];
    const range = this.visualSelectionRange();
    if (range) {
      const selected = this._label.slice(range.start, range.end)
        .replace(/[^\n]/g, replacement);
      this._label = this._label.slice(0, range.start) + selected + this._label.slice(range.end);
      this._cursorIndex = range.start;
    } else {
      const i = Math.min(this.cursorIndex, this._label.length - 1);
      this._label = this._label.slice(0, i) + replacement + this._label.slice(i + 1);
      this._cursorIndex = i;
    }
    this._text.text(this._label);
    this.resizeToFitText();
    this.updateCursorPosition();
  }

  /** Vim `c{motion}` / visual `c`; mode switching is owned by keymenu. */
  changeAtCursor(motion: VimChangeMotion): void {
    const range = motion === 'selection'
      ? this.visualSelectionRange()
      : vimChangeRange(this._label, this.cursorIndex, motion);
    if (!range) return;
    this._label = this._label.slice(0, range.start) + this._label.slice(range.end);
    this._cursorIndex = range.start;
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

  cursorWordEnd(): void {
    this._cursorIndex = wordEnd(this._label, this.cursorIndex);
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

    if (this._cursorMode !== 'insert') {
      const visualIndex = Math.max(line.start, Math.min(i, line.start + Math.max(line.length - 1, 0)));
      const ch = line.length > 0 ? this._label[visualIndex] : ' ';
      const charWidth = Math.max(this.measure(ch || ' '), 2);
      const visualPrefixWidth = this.measure(this._label.substr(line.start, visualIndex - line.start));
      const visualX = -boxW / 2 + (boxW - this.measure(lineText)) / 2 + visualPrefixWidth;
      this._cursor.points([
        visualX, cursorY,
        visualX + charWidth, cursorY,
        visualX + charWidth, cursorY + this._fontSize,
        visualX, cursorY + this._fontSize,
      ]);
      this._cursor.closed(true);
      this._cursor.strokeWidth(2);
      this._cursor.lineCap('butt');
    } else {
      this._cursor.points([cursorX, cursorY, cursorX, cursorY + this._fontSize]);
      this._cursor.closed(false);
      this._cursor.strokeWidth(3);
      this._cursor.lineCap('round');
    }
    this._cursor.stroke(this._textColor);
    this.updateVisualSelection(ranges, boxW, boxH, lineHeight, blockH);
    if (this._cursor.visible()) this._cursor.opacity(1);
  }

  /** Caret box in label-local coordinates, plus its rendered-line height. */
  caretViewportBox(): {x: number; y: number; width: number; height: number; lineHeight: number} {
    this.updateCursorPosition();
    const points = this._cursor.points();
    const xs = points.filter((_, index) => index % 2 === 0);
    const ys = points.filter((_, index) => index % 2 === 1);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
      lineHeight: this._fontSize * (this._text.lineHeight() ?? 1),
    };
  }

  private visualCursorIndex(): number | null {
    return this._label.length === 0 ? null : Math.min(this.cursorIndex, this._label.length - 1);
  }

  private visualSelectionRange(): {start: number; end: number} | null {
    const cursor = this.visualCursorIndex();
    if (this._cursorMode !== 'vimVisual' || this._visualAnchor === null || cursor === null) return null;
    return {start: Math.min(this._visualAnchor, cursor), end: Math.max(this._visualAnchor, cursor) + 1};
  }

  private updateVisualSelection(ranges: LineRange[], boxW: number, boxH: number,
                                lineHeight: number, blockH: number): void {
    this._visualSelection.destroyChildren();
    const selection = this.visualSelectionRange();
    if (!selection) {
      this._visualSelection.visible(false);
      return;
    }
    ranges.forEach((line, lineIndex) => {
      const from = Math.max(selection.start, line.start);
      const to = Math.min(selection.end, line.start + line.length);
      if (from >= to) return;
      const lineText = this._label.slice(line.start, line.start + line.length);
      const lineX = -boxW / 2 + (boxW - this.measure(lineText)) / 2;
      const x = lineX + this.measure(this._label.slice(line.start, from));
      const width = Math.max(this.measure(this._label.slice(from, to)), 2);
      const y = -boxH / 2 + (boxH - blockH) / 2 + lineIndex * lineHeight;
      this._visualSelection.add(new Konva.Rect({
        x, y, width, height: this._fontSize,
        fill: this._textColor, opacity: 0.28, listening: false,
      }));
    });
    this._visualSelection.visible(true);
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
