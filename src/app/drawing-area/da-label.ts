import Konva from 'konva';
import {nextId} from './id-generator';

/** Path-anchored position of an edge label. See notes/idea-edge-labels.md.
 *  - `t`: fraction of arc length along the edge polyline, in [0, 1].
 *         0 = src endpoint, 1 = dest endpoint, 0.5 = midpoint.
 *  - `offset`: perpendicular displacement in px, signed. Positive = "above"
 *              the line by convention B (smaller-y on the screen). */
export interface DALabelAnchor {
  t: number;
  offset: number;
}

/** A signed perpendicular gap suitable for "above the line at this font size".
 *  Half the rect height + 4px of breathing room. POSITIVE because positive
 *  offset is interpreted as "in the direction of the convention-B normal,"
 *  which points toward smaller-y (the screen-up direction). */
export function aboveSideOffset(rectHeight: number): number {
  return rectHeight / 2 + 4;
}

/** Mirror of aboveSideOffset for the "below the line" case. */
export function belowSideOffset(rectHeight: number): number {
  return -(rectHeight / 2 + 4);
}

export class DALabel {
  readonly id: string;
  readonly group: Konva.Group;
  private _isSelected: boolean = false;
  private readonly _rect: Konva.Rect;
  private readonly _text: Konva.Text;
  private _label: string;
  /** Path-anchored position. Optional; when absent, the label is positioned
   *  by absolute (x, y) as a legacy fallback. Set by addLabel() or restore.
   *  See `applyAnchorFromPolyline` for how it drives `(x, y)`. */
  private _anchor: DALabelAnchor | null = null;

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

  // ─── Path anchoring ───────────────────────────────────────────────────

  get anchor(): DALabelAnchor | null {
    return this._anchor;
  }

  /** Set or clear the path anchor. The caller is responsible for then calling
   *  applyAnchorFromPolyline so (x, y) re-derive from (anchor + polyline). */
  setAnchor(anchor: DALabelAnchor | null): void {
    this._anchor = anchor ? {t: anchor.t, offset: anchor.offset} : null;
  }

  /** Recompute (x, y) from this.anchor against the given polyline. No-op if
   *  no anchor is set or polyline has < 2 points. */
  applyAnchorFromPolyline(polyline: readonly {x: number; y: number}[]): void {
    if (!this._anchor || polyline.length < 2) return;
    const {basePoint, tangent} = sampleAtT(polyline, this._anchor.t);
    // Convention B normal: perpendicular pointing toward smaller-y.
    // Rotate tangent (tx, ty) by -90deg → (ty, -tx). Then pick the sign that
    // gives negative y (i.e., "above" on screen). If ty == 0 (horizontal
    // tangent), the rotated vector is (0, -tx) which already has the right
    // sign for tx > 0; for vertical tangents tie-break to negative x.
    let nx = tangent.y;
    let ny = -tangent.x;
    if (ny > 0) { nx = -nx; ny = -ny; }
    if (ny === 0 && nx > 0) { nx = -nx; }
    this.group.position({
      x: basePoint.x + nx * this._anchor.offset,
      y: basePoint.y + ny * this._anchor.offset,
    });
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

// ─── Arc-length sampling helpers (free functions, exported for tests) ──────

/** Total polyline arc length. */
export function polylineArcLength(polyline: readonly {x: number; y: number}[]): number {
  let total = 0;
  for (let i = 0; i < polyline.length - 1; i++) {
    total += Math.hypot(polyline[i + 1].x - polyline[i].x, polyline[i + 1].y - polyline[i].y);
  }
  return total;
}

/** Sample the polyline at fraction t of total arc length.
 *  Returns the world point and the (unit) tangent of the local segment. */
export function sampleAtT(
  polyline: readonly {x: number; y: number}[],
  t: number,
): {basePoint: {x: number; y: number}; tangent: {x: number; y: number}} {
  const clampedT = Math.max(0, Math.min(1, t));
  const total = polylineArcLength(polyline);
  if (total === 0 || polyline.length < 2) {
    const p = polyline[0] ?? {x: 0, y: 0};
    return {basePoint: {x: p.x, y: p.y}, tangent: {x: 1, y: 0}};
  }
  const target = clampedT * total;
  let accumulated = 0;
  for (let i = 0; i < polyline.length - 1; i++) {
    const dx = polyline[i + 1].x - polyline[i].x;
    const dy = polyline[i + 1].y - polyline[i].y;
    const len = Math.hypot(dx, dy);
    if (accumulated + len >= target || i === polyline.length - 2) {
      const local = len > 0 ? (target - accumulated) / len : 0;
      const tan = len > 0 ? {x: dx / len, y: dy / len} : {x: 1, y: 0};
      return {
        basePoint: {x: polyline[i].x + local * dx, y: polyline[i].y + local * dy},
        tangent: tan,
      };
    }
    accumulated += len;
  }
  // Unreachable.
  const last = polyline[polyline.length - 1];
  return {basePoint: {x: last.x, y: last.y}, tangent: {x: 1, y: 0}};
}

/** Inverse of sampleAtT: given an absolute world point, find the t (in [0,1])
 *  whose sample is the perpendicular-foot closest to the point, plus the
 *  signed perpendicular offset from the polyline at that t. The sign is set
 *  by convention B (positive = "above" = the side toward smaller-y). */
export function projectOntoPolyline(
  polyline: readonly {x: number; y: number}[],
  point: {x: number; y: number},
): {t: number; offset: number} {
  if (polyline.length < 2) return {t: 0, offset: 0};
  const total = polylineArcLength(polyline);
  if (total === 0) return {t: 0, offset: 0};

  let bestDist = Infinity;
  let bestT = 0;
  let bestOffset = 0;
  let accumulated = 0;
  for (let i = 0; i < polyline.length - 1; i++) {
    const dx = polyline[i + 1].x - polyline[i].x;
    const dy = polyline[i + 1].y - polyline[i].y;
    const len = Math.hypot(dx, dy);
    if (len === 0) continue;
    const local = Math.max(0, Math.min(1, ((point.x - polyline[i].x) * dx + (point.y - polyline[i].y) * dy) / (len * len)));
    const projX = polyline[i].x + local * dx;
    const projY = polyline[i].y + local * dy;
    const d = Math.hypot(point.x - projX, point.y - projY);
    if (d < bestDist) {
      bestDist = d;
      bestT = (accumulated + local * len) / total;
      // Signed offset: project (point - proj) onto the convention-B normal.
      let nx = dy / len;
      let ny = -dx / len;
      if (ny > 0) { nx = -nx; ny = -ny; }
      if (ny === 0 && nx > 0) { nx = -nx; }
      bestOffset = (point.x - projX) * nx + (point.y - projY) * ny;
    }
    accumulated += len;
  }
  return {t: bestT, offset: bestOffset};
}
