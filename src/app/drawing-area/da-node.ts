import Konva from 'konva';
import { DAEdge } from './da-edge';
import { nextId } from './id-generator';
import { NodeShape, TextOverflowMode } from './command.model';

// Use the un-patched requestAnimationFrame so Zone.js doesn't track the blink
// loop as a pending task (which would prevent Angular test zones from stabilizing).
const _nativeRaf: (cb: FrameRequestCallback) => number =
  (typeof window !== 'undefined' && (window as any).__zone_symbol__requestAnimationFrame) ??
  (typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame : (cb) => { cb(0); return 0; });
const _nativeCaf: (id: number) => void =
  (typeof window !== 'undefined' && (window as any).__zone_symbol__cancelAnimationFrame) ??
  (typeof cancelAnimationFrame !== 'undefined' ? cancelAnimationFrame : () => {});

export class DANode {
  /** Semantic tags loaded from the graph document. */
  public tags: string[] = [];
  readonly id: string;
  private _nodeShape: NodeShape;
  get nodeShape(): NodeShape { return this._nodeShape; }
  readonly group: Konva.Group;
  private _shape: Konva.Shape;
  private readonly _label: Konva.Text;
  private readonly _cursor: Konva.Line;
  private _cursorBlinkTimer?: number;
  private _isSelected: boolean = false;
  private _pinned: boolean = false;
  private readonly _pinIndicator: Konva.Text;
  private _showPinIndicator: boolean = false;
  private readonly _resizeHandle: Konva.Circle;
  private _resizeHandleVisible: boolean = false;

  // Edge references with cache validation
  public incomingEdges: DAEdge[] = [];
  public outgoingEdges: DAEdge[] = [];
  private _edgesCacheValid = false;

  public readonly DEFAULT_NODE_WIDTH = 120;
  public readonly DEFAULT_NODE_HEIGHT = 120;
  public readonly JUNCTION_SIZE = 12;
  public readonly INVISIBLE_SIZE = 16;
  public readonly INVISIBLE_DOT_RADIUS = 8;
  public readonly STROKE_WIDTH_SELECTED = 4;
  public readonly STROKE_WIDTH_NORMAL = 2;
  public readonly DEFAULT_FONT_SIZE = 16;
  private _invisibleVisibleForGrid = false;

  public readonly MIN_NODE_SIZE = 50;
  public readonly MAX_NODE_SIZE = 320;

  public readonly SELECTION_SHADOW_COLOR = '#33aaff';
  public readonly SELECTION_SHADOW_BLUR = 22;
  private _selectionBlinkFrame: number | null = null;
  public readonly MIN_FONT_SIZE = 10;
  public readonly MAX_FONT_SIZE = 48;

  private _nodeWidth: number;
  private _nodeHeight: number;
  private _fontSize = this.DEFAULT_FONT_SIZE;

  private _textOverflowMode: TextOverflowMode = 'widen-both';
  private _baseWidth: number = this.DEFAULT_NODE_WIDTH;
  private _baseHeight: number = this.DEFAULT_NODE_HEIGHT;
  private _baseFontSize: number = this.DEFAULT_FONT_SIZE;

  private static _measureText: Konva.Text | null = null;

  constructor(x: number, y: number, initialText: string, id?: string,
              colors?: { fill?: string; stroke?: string; text?: string },
              nodeShape: NodeShape = 'box') {
    this.id = id ?? nextId();
    this._nodeShape = nodeShape;

    const isJunction = nodeShape === 'junction';
    const isInvisible = nodeShape === 'invisible';
    const labelless = isJunction || isInvisible;
    this._nodeWidth = isJunction ? this.JUNCTION_SIZE :
                      isInvisible ? this.INVISIBLE_SIZE : this.DEFAULT_NODE_WIDTH;
    this._nodeHeight = isJunction ? this.JUNCTION_SIZE :
                       isInvisible ? this.INVISIBLE_SIZE : this.DEFAULT_NODE_HEIGHT;
    this._baseWidth = this._nodeWidth;
    this._baseHeight = this._nodeHeight;

    this.group = new Konva.Group({ x, y });

    this._shape = this.createShape(this._nodeWidth, this._nodeHeight, nodeShape, colors);
    this.group.add(this._shape);
    if (isInvisible) {
      this._shape.visible(false);
    }

    // Label — hidden for junction and invisible nodes
    this._label = new Konva.Text({
      text: initialText,
      width: this._nodeWidth,
      height: this._nodeHeight,
      fontSize: this._fontSize,
      align: 'center',
      verticalAlign: 'middle',
      fill: colors?.text,
      visible: !labelless,
    });
    this.group.add(this._label);

    // Text cursor — hidden until label edit mode
    this._cursor = new Konva.Line({
      points: [0, 0, 0, this._fontSize],
      stroke: colors?.text ?? 'black',
      strokeWidth: 2,
      visible: false,
    });
    this.group.add(this._cursor);

    // Pin indicator — small marker at top-right, hidden by default
    this._pinIndicator = new Konva.Text({
      text: '\u25A0',
      fontSize: 10,
      x: this._nodeWidth - 14,
      y: 2,
      fill: colors?.stroke ?? 'black',
      visible: false,
    });
    this.group.add(this._pinIndicator);

    // Resize handle — glowing dot at bottom-right corner, hidden by default
    this._resizeHandle = new Konva.Circle({
      x: this._nodeWidth,
      y: this._nodeHeight,
      radius: 5,
      fill: colors?.stroke ?? 'white',
      shadowColor: colors?.stroke ?? 'white',
      shadowBlur: 10,
      shadowEnabled: true,
      visible: false,
    });
    this.group.add(this._resizeHandle);
  }

  private createShape(w: number, h: number, shape: NodeShape,
                      colors?: { fill?: string; stroke?: string }): Konva.Shape {
    const fill = colors?.fill ?? 'white';
    const stroke = colors?.stroke ?? 'black';
    const sw = this.STROKE_WIDTH_NORMAL;

    switch (shape) {
      case 'box':
        return new Konva.Rect({ width: w, height: h, fill, stroke, strokeWidth: sw });

      case 'circle':
        return new Konva.Ellipse({
          x: w / 2, y: h / 2,
          radiusX: w / 2, radiusY: h / 2,
          fill, stroke, strokeWidth: sw,
        });

      case 'diamond': {
        const pts = [w / 2, 0,  w, h / 2,  w / 2, h,  0, h / 2];
        return new Konva.Line({ points: pts, closed: true, fill, stroke, strokeWidth: sw });
      }

      case 'junction':
        return new Konva.Circle({
          x: w / 2, y: h / 2,
          radius: w / 2,
          fill: stroke,   // dot filled with stroke color
          stroke: 'transparent',
          strokeWidth: 0,
        });

      case 'invisible':
        return new Konva.Circle({
          x: w / 2, y: h / 2,
          radius: this.INVISIBLE_DOT_RADIUS,
          fill,
          stroke,
          strokeWidth: sw,
        });
    }
  }

  applyColors(colors: { fill: string; stroke: string; text: string }): void {
    if (this.nodeShape === 'junction') {
      (this._shape as Konva.Circle).fill(colors.stroke);
    } else if (this.nodeShape === 'invisible') {
      this._shape.fill(colors.fill);
      this._shape.stroke(colors.stroke);
    } else {
      this._shape.fill(colors.fill);
      this._shape.stroke(colors.stroke);
      this._label.fill(colors.text);
    }
    this._pinIndicator.fill(colors.stroke);
    this._resizeHandle.fill(colors.stroke);
    this._resizeHandle.shadowColor(colors.stroke);
  }

  changeShape(newShape: NodeShape, colors?: { fill?: string; stroke?: string; text?: string }): void {
    const wasFixed = this._nodeShape === 'junction' || this._nodeShape === 'invisible';
    const isFixed = newShape === 'junction' || newShape === 'invisible';
    const isJunction = newShape === 'junction';
    const isInvisible = newShape === 'invisible';

    this._shape.destroy();
    this._nodeShape = newShape;

    if (wasFixed && !isFixed) {
      this._nodeWidth = this.DEFAULT_NODE_WIDTH;
      this._nodeHeight = this.DEFAULT_NODE_HEIGHT;
      this._baseWidth = this.DEFAULT_NODE_WIDTH;
      this._baseHeight = this.DEFAULT_NODE_HEIGHT;
    } else if (!wasFixed && isFixed) {
      const fixedSize = isJunction ? this.JUNCTION_SIZE : this.INVISIBLE_SIZE;
      this._nodeWidth = fixedSize;
      this._nodeHeight = fixedSize;
      this._baseWidth = fixedSize;
      this._baseHeight = fixedSize;
    } else if (wasFixed && isFixed) {
      const fixedSize = isJunction ? this.JUNCTION_SIZE : this.INVISIBLE_SIZE;
      this._nodeWidth = fixedSize;
      this._nodeHeight = fixedSize;
      this._baseWidth = fixedSize;
      this._baseHeight = fixedSize;
    }

    this._shape = this.createShape(this._nodeWidth, this._nodeHeight, newShape, colors);
    this.group.add(this._shape);
    this._shape.moveToBottom();

    this._label.visible(!isFixed);
    if (!isFixed) {
      this.applySize(this._nodeWidth, this._nodeHeight);
      this._label.fontSize(this._fontSize);
    }

    if (isInvisible) {
      this.applyInvisibleVisibility();
    }

    // Re-apply selection state to new shape
    this.isSelected = this._isSelected;
  }

  get isSelected(): boolean {
    return this._isSelected;
  }

  set isSelected(value: boolean) {
    this._isSelected = value;
    if (this.nodeShape === 'junction') {
      const r = this._isSelected ? this.JUNCTION_SIZE : this.JUNCTION_SIZE / 2;
      (this._shape as Konva.Circle).radius(r);
      (this._shape as Konva.Circle).x(this.JUNCTION_SIZE / 2);
      (this._shape as Konva.Circle).y(this.JUNCTION_SIZE / 2);
    } else {
      this._shape.strokeWidth(this._isSelected ? this.STROKE_WIDTH_SELECTED : this.STROKE_WIDTH_NORMAL);
    }
    if (this.nodeShape === 'invisible') {
      this.applyInvisibleVisibility();
    }
    if (this._isSelected && typeof (globalThis as any)['jasmine'] === 'undefined') {
      this._shape.shadowColor(this.SELECTION_SHADOW_COLOR);
      this._shape.shadowBlur(this.SELECTION_SHADOW_BLUR);
      this._shape.shadowOffsetX(0);
      this._shape.shadowOffsetY(0);
      this._shape.shadowEnabled(true);
      this.startSelectionBlink();
    } else if (!this._isSelected) {
      this._shape.shadowEnabled(false);
      this.stopSelectionBlink();
    }
  }

  /** Toggle whether invisible-style nodes render as a small dot when not selected.
   *  No-op for non-invisible nodes. */
  setInvisibleVisibleForGrid(visible: boolean): void {
    this._invisibleVisibleForGrid = visible;
    if (this.nodeShape === 'invisible') {
      this.applyInvisibleVisibility();
    }
  }

  private applyInvisibleVisibility(): void {
    if (this.nodeShape !== 'invisible') return;
    this._shape.visible(this._isSelected || this._invisibleVisibleForGrid);
  }

  private startSelectionBlink(): void {
    const tick = () => {
      const layer = this.group.getLayer();
      if (!this._isSelected || !layer) {
        this._selectionBlinkFrame = null;
        return;
      }
      const phase = (Math.sin(Date.now() * Math.PI / 1000) + 1) / 2; // 2 s period, 0..1
      this._shape.shadowOpacity(0.25 + 0.75 * phase);
      layer.batchDraw();
      this._selectionBlinkFrame = _nativeRaf(tick);
    };
    if (this._selectionBlinkFrame === null) {
      this._selectionBlinkFrame = _nativeRaf(tick);
    }
  }

  private stopSelectionBlink(): void {
    if (this._selectionBlinkFrame !== null) {
      _nativeCaf(this._selectionBlinkFrame);
      this._selectionBlinkFrame = null;
    }
  }

  /** Backward-compatible accessor used by tests (always a Rect for box nodes). */
  get rect(): Konva.Rect {
    return this._shape as Konva.Rect;
  }

  get shape(): Konva.Shape {
    return this._shape;
  }

  get NODE_WIDTH(): number {
    return this._nodeWidth;
  }

  get NODE_HEIGHT(): number {
    return this._nodeHeight;
  }

  get FONT_SIZE(): number {
    return this._fontSize;
  }

  get BASE_WIDTH(): number {
    return this._baseWidth;
  }

  get BASE_HEIGHT(): number {
    return this._baseHeight;
  }

  get BASE_FONT_SIZE(): number {
    return this._baseFontSize;
  }

  get label(): Konva.Text {
    return this._label;
  }

  get konvaGroup(): Konva.Group {
    return this.group;
  }

  getClientRect() {
    return this.group.getClientRect();
  }

  zIndex() {
    return this.group.zIndex();
  }

  get pinned(): boolean {
    return this._pinned;
  }

  set pinned(value: boolean) {
    this._pinned = value;
    this.updatePinIndicatorVisibility();
  }

  setPinIndicatorVisible(show: boolean): void {
    this._showPinIndicator = show;
    this.updatePinIndicatorVisibility();
  }

  private updatePinIndicatorVisibility(): void {
    const eligible = this._nodeShape !== 'junction' && this._nodeShape !== 'invisible';
    this._pinIndicator.visible(this._pinned && this._showPinIndicator && eligible);
  }

  private updatePinIndicatorPosition(): void {
    this._pinIndicator.x(this._nodeWidth - 14);
    this._pinIndicator.y(2);
  }

  /**
   * Compute the point on this node's shape boundary where a line from
   * (fromX, fromY) toward the node center intersects the shape.
   * Returns coordinates in drawing-layer space.
   */
  getEdgePoint(fromX: number, fromY: number): { x: number; y: number } {
    const pos = this.group.position();
    const hw = this.NODE_WIDTH / 2;
    const hh = this.NODE_HEIGHT / 2;
    const cx = pos.x + hw;
    const cy = pos.y + hh;

    const dx = cx - fromX;
    const dy = cy - fromY;
    if (dx === 0 && dy === 0) return { x: cx, y: cy };

    switch (this._nodeShape) {
      case 'invisible':
        // Invisible-style nodes are points: connect right at the center.
        return { x: cx, y: cy };
      case 'circle': {
        // Ellipse: (px/rx)^2 + (py/ry)^2 = 1
        // Direction from center toward fromX,fromY: (-dx, -dy)
        const rx = hw;
        const ry = hh;
        const ndx = -dx;
        const ndy = -dy;
        const s = 1 / Math.sqrt((ndx * ndx) / (rx * rx) + (ndy * ndy) / (ry * ry));
        return { x: cx + s * ndx, y: cy + s * ndy };
      }
      case 'diamond': {
        // Diamond vertices: top (cx, cy-hh), right (cx+hw, cy), bottom (cx, cy+hh), left (cx-hw, cy)
        // Line from center toward fromX,fromY intersects one of the four edges.
        // Each edge is at |px/hw| + |py/hh| = 1 in local coords.
        const ndx = -dx;
        const ndy = -dy;
        const s = 1 / (Math.abs(ndx) / hw + Math.abs(ndy) / hh);
        return { x: cx + s * ndx, y: cy + s * ndy };
      }
      default: {
        // Box (and junction): rectangular intersection
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        const tX = absDx > 0 ? hw / absDx : Infinity;
        const tY = absDy > 0 ? hh / absDy : Infinity;
        const t = Math.min(tX, tY);
        return { x: cx - t * dx, y: cy - t * dy };
      }
    }
  }

  // Edge management methods
  get connectedEdges(): DAEdge[] {
    if (!this._edgesCacheValid) {
      this._rebuildEdgesCache();
      this._edgesCacheValid = true;
    }
    return [...this.incomingEdges, ...this.outgoingEdges];
  }

  private _rebuildEdgesCache() {}

  invalidateEdgesCache() {
    this._edgesCacheValid = false;
  }

  addIncomingEdge(edge: DAEdge) {
    this.incomingEdges.push(edge);
    this.invalidateEdgesCache();
  }

  addOutgoingEdge(edge: DAEdge) {
    this.outgoingEdges.push(edge);
    this.invalidateEdgesCache();
  }

  removeIncomingEdge(edge: DAEdge) {
    const index = this.incomingEdges.indexOf(edge);
    if (index > -1) {
      this.incomingEdges.splice(index, 1);
      this.invalidateEdgesCache();
    }
  }

  removeOutgoingEdge(edge: DAEdge) {
    const index = this.outgoingEdges.indexOf(edge);
    if (index > -1) {
      this.outgoingEdges.splice(index, 1);
      this.invalidateEdgesCache();
    }
  }

  get textOverflowMode(): TextOverflowMode {
    return this._textOverflowMode;
  }

  set textOverflowMode(mode: TextOverflowMode) {
    this._textOverflowMode = mode;
    this.applyTextOverflow();
  }

  /** Apply overflow logic. Returns true if node dimensions changed (caller must update edges). */
  applyTextOverflow(): boolean {
    if (this.nodeShape === 'junction' || this.nodeShape === 'invisible') return false;

    const text = this._label.text();
    const padding = 8;

    // Reset label wrap/ellipsis settings first
    this._label.wrap('word');
    this._label.ellipsis(false);

    switch (this._textOverflowMode) {
      case 'clip': {
        const changed = this._nodeWidth !== this._baseWidth || this._nodeHeight !== this._baseHeight || this._fontSize !== this._baseFontSize;
        this._nodeWidth = this._baseWidth;
        this._nodeHeight = this._baseHeight;
        this._fontSize = this._baseFontSize;
        this._label.fontSize(this._fontSize);
        this.applySize(this._nodeWidth, this._nodeHeight);
        return changed;
      }

      case 'shrink-font': {
        const prevWidth = this._nodeWidth;
        const prevHeight = this._nodeHeight;
        this._nodeWidth = this._baseWidth;
        this._nodeHeight = this._baseHeight;
        this.applySize(this._nodeWidth, this._nodeHeight);

        // Binary search for largest font size that fits vertically
        let lo = 6;
        let hi = this._baseFontSize;
        let best = lo;
        for (let i = 0; i < 20; i++) {
          const mid = Math.floor((lo + hi) / 2);
          const h = this.measureTextHeight(text, this._baseWidth, mid);
          if (h <= this._baseHeight) {
            best = mid;
            lo = mid + 1;
          } else {
            hi = mid - 1;
          }
        }
        this._fontSize = best;
        this._label.fontSize(this._fontSize);
        return prevWidth !== this._nodeWidth || prevHeight !== this._nodeHeight;
      }

      case 'ellipsis': {
        const prevWidth = this._nodeWidth;
        const prevHeight = this._nodeHeight;
        this._nodeWidth = this._baseWidth;
        this._nodeHeight = this._baseHeight;
        this._fontSize = this._baseFontSize;
        this._label.fontSize(this._fontSize);
        this._label.wrap('none');
        this._label.ellipsis(true);
        this.applySize(this._nodeWidth, this._nodeHeight);
        return prevWidth !== this._nodeWidth || prevHeight !== this._nodeHeight;
      }

      case 'widen-h': {
        const prevWidth = this._nodeWidth;
        const prevHeight = this._nodeHeight;
        this._fontSize = this._baseFontSize;
        this._label.fontSize(this._fontSize);
        // Measure natural single-line width
        const naturalWidth = this.measureNaturalWidth(text, this._baseFontSize);
        this._nodeWidth = Math.max(this._baseWidth, naturalWidth + padding * 2);
        this._nodeHeight = this._baseHeight;
        this._label.wrap('none');
        this.applySize(this._nodeWidth, this._nodeHeight);
        return prevWidth !== this._nodeWidth || prevHeight !== this._nodeHeight;
      }

      case 'widen-v': {
        const prevWidth = this._nodeWidth;
        const prevHeight = this._nodeHeight;
        this._fontSize = this._baseFontSize;
        this._label.fontSize(this._fontSize);
        this._nodeWidth = this._baseWidth;
        const measuredH = this.measureTextHeight(text, this._baseWidth, this._baseFontSize);
        this._nodeHeight = Math.max(this._baseHeight, measuredH + padding * 2);
        this.applySize(this._nodeWidth, this._nodeHeight);
        return prevWidth !== this._nodeWidth || prevHeight !== this._nodeHeight;
      }

      case 'fit': {
        // Shrink-to-fit: the base size acts as a maximum width and minimum
        // baseline rather than a fixed size — short labels get small boxes,
        // long labels wrap at the base width and grow downward.
        const prevWidth = this._nodeWidth;
        const prevHeight = this._nodeHeight;
        this._fontSize = this._baseFontSize;
        this._label.fontSize(this._fontSize);
        const naturalWidth = this.measureNaturalWidth(text, this._baseFontSize);
        this._nodeWidth = Math.min(
          this._baseWidth,
          Math.max(this.MIN_NODE_SIZE, naturalWidth + padding * 2),
        );
        const measuredH = this.measureTextHeight(text, this._nodeWidth, this._baseFontSize);
        this._nodeHeight = Math.max(this.MIN_NODE_SIZE, measuredH + padding * 2);
        this.applySize(this._nodeWidth, this._nodeHeight);
        return prevWidth !== this._nodeWidth || prevHeight !== this._nodeHeight;
      }

      case 'widen-both': {
        const prevWidth = this._nodeWidth;
        const prevHeight = this._nodeHeight;
        this._fontSize = this._baseFontSize;
        this._label.fontSize(this._fontSize);
        const phi = 1.618;
        const MAX_AUTO_WIDTH = 80 * this._baseFontSize * 0.55;

        // Check if text fits in base dimensions
        const baseH = this.measureTextHeight(text, this._baseWidth, this._baseFontSize);
        if (baseH <= this._baseHeight) {
          this._nodeWidth = this._baseWidth;
          this._nodeHeight = this._baseHeight;
          this.applySize(this._nodeWidth, this._nodeHeight);
          return prevWidth !== this._nodeWidth || prevHeight !== this._nodeHeight;
        }

        // Binary search for width closest to golden ratio
        let lo = this.MIN_NODE_SIZE;
        let hi = MAX_AUTO_WIDTH;
        let bestW = hi;
        for (let i = 0; i < 20; i++) {
          const mid = (lo + hi) / 2;
          const h = this.measureTextHeight(text, mid, this._baseFontSize);
          const ratio = h > 0 ? mid / h : Infinity;
          if (ratio < phi) {
            lo = mid;
          } else {
            bestW = mid;
            hi = mid;
          }
        }

        const finalH = this.measureTextHeight(text, bestW, this._baseFontSize);
        this._nodeWidth = Math.max(this._baseWidth, bestW);
        this._nodeHeight = Math.max(this._baseHeight, finalH + padding * 2);
        this.applySize(this._nodeWidth, this._nodeHeight);
        return prevWidth !== this._nodeWidth || prevHeight !== this._nodeHeight;
      }
    }
  }

  private measureTextHeight(text: string, width: number, fontSize: number): number {
    if (!DANode._measureText) {
      DANode._measureText = new Konva.Text({ visible: false });
    }
    DANode._measureText.text(text);
    DANode._measureText.fontSize(fontSize);
    DANode._measureText.width(width);
    DANode._measureText.wrap('word');
    return DANode._measureText.height();
  }

  private measureNaturalWidth(text: string, fontSize: number): number {
    if (!DANode._measureText) {
      DANode._measureText = new Konva.Text({ visible: false });
    }
    DANode._measureText.text(text);
    DANode._measureText.fontSize(fontSize);
    DANode._measureText.width('auto' as any);
    DANode._measureText.wrap('none');
    return DANode._measureText.textWidth;
  }

  /** Bottom-right corner position in absolute (stage) coordinates. */
  getBottomRightAbsolute(): { x: number; y: number } {
    return {
      x: this.group.x() + this._nodeWidth,
      y: this.group.y() + this._nodeHeight,
    };
  }

  showResizeHandle(): void {
    if (this._resizeHandleVisible) return;
    this._resizeHandleVisible = true;
    this._resizeHandle.visible(true);
  }

  hideResizeHandle(): void {
    if (!this._resizeHandleVisible) return;
    this._resizeHandleVisible = false;
    this._resizeHandle.visible(false);
  }

  get resizeHandleVisible(): boolean {
    return this._resizeHandleVisible;
  }

  private updateResizeHandlePosition(): void {
    this._resizeHandle.x(this._nodeWidth);
    this._resizeHandle.y(this._nodeHeight);
  }

  resizeBy(delta: number): boolean {
    if (this.nodeShape === 'junction' || this.nodeShape === 'invisible') return false;

    const nextWidth = this.clamp(this._baseWidth + delta, this.MIN_NODE_SIZE, this.MAX_NODE_SIZE);
    const nextHeight = this.clamp(this._baseHeight + delta, this.MIN_NODE_SIZE, this.MAX_NODE_SIZE);

    if (nextWidth === this._baseWidth && nextHeight === this._baseHeight) return false;

    this._baseWidth = nextWidth;
    this._baseHeight = nextHeight;
    this.applyTextOverflow();
    return true;
  }

  adjustLabelFontSizeBy(delta: number): boolean {
    if (this.nodeShape === 'junction' || this.nodeShape === 'invisible') return false;
    const nextSize = this.clamp(this._baseFontSize + delta, this.MIN_FONT_SIZE, this.MAX_FONT_SIZE);
    if (nextSize === this._baseFontSize) return false;
    this._baseFontSize = nextSize;
    this._fontSize = nextSize;
    this.applyTextOverflow();
    return true;
  }

  restoreState(width: number, height: number, fontSize: number, textOverflowMode?: TextOverflowMode, baseWidth?: number, baseHeight?: number, baseFontSize?: number): void {
    this._baseWidth = baseWidth ?? width;
    this._baseHeight = baseHeight ?? height;
    this._baseFontSize = baseFontSize ?? fontSize;
    this._textOverflowMode = textOverflowMode ?? 'widen-both';
    this._nodeWidth = width;
    this._nodeHeight = height;
    this._fontSize = fontSize;
    this.applySize(width, height);
    if (this.nodeShape !== 'junction' && this.nodeShape !== 'invisible') {
      this._label.fontSize(fontSize);
    }
  }

  private applySize(w: number, h: number): void {
    switch (this.nodeShape) {
      case 'box':
        (this._shape as Konva.Rect).width(w);
        (this._shape as Konva.Rect).height(h);
        break;
      case 'circle':
        (this._shape as Konva.Ellipse).radiusX(w / 2);
        (this._shape as Konva.Ellipse).radiusY(h / 2);
        (this._shape as Konva.Ellipse).x(w / 2);
        (this._shape as Konva.Ellipse).y(h / 2);
        break;
      case 'diamond':
        (this._shape as Konva.Line).points([w / 2, 0,  w, h / 2,  w / 2, h,  0, h / 2]);
        break;
      case 'junction':
        break;
      case 'invisible':
        (this._shape as Konva.Circle).x(w / 2);
        (this._shape as Konva.Circle).y(h / 2);
        break;
    }
    this._label.width(w);
    this._label.height(h);
    this.updatePinIndicatorPosition();
    this.updateResizeHandlePosition();
  }

  showCursor(): void {
    if (this.nodeShape === 'junction' || this.nodeShape === 'invisible') return;
    this.updateCursorPosition();
    this._cursor.visible(true);
    this._cursor.opacity(1);
    this._cursorBlinkTimer = window.setInterval(() => {
      this._cursor.opacity(this._cursor.opacity() > 0 ? 0 : 1);
    }, 530);
  }

  hideCursor(): void {
    this._cursor.visible(false);
    if (this._cursorBlinkTimer !== undefined) {
      window.clearInterval(this._cursorBlinkTimer);
      this._cursorBlinkTimer = undefined;
    }
  }

  updateCursorPosition(): void {
    const text = this._label.text();

    // Use measurement text to get word-wrapped lines matching the label's layout
    if (!DANode._measureText) {
      DANode._measureText = new Konva.Text({ visible: false });
    }
    DANode._measureText.text(text);
    DANode._measureText.fontSize(this._fontSize);
    DANode._measureText.width(this._nodeWidth);
    DANode._measureText.wrap('word');

    // textArr contains the rendered lines after word-wrapping
    const textArr: { text: string; width: number; lastInParagraph: boolean }[] =
      (DANode._measureText as any).textArr ?? [];
    const lastEntry = textArr.length > 0 ? textArr[textArr.length - 1] : { text: '', width: 0 };

    // For center-aligned text: cursor goes at the right edge of the last rendered line
    const cursorX = (this._nodeWidth + lastEntry.width) / 2;

    // Total height from the measurement text (already configured with wrap/width/fontSize)
    const totalHeight = DANode._measureText.height();
    // verticalAlign: 'middle' → text starts at (nodeHeight - totalHeight) / 2
    const textStartY = (this._nodeHeight - totalHeight) / 2;
    const cursorY = textStartY + totalHeight - this._fontSize;

    this._cursor.points([cursorX, cursorY, cursorX, cursorY + this._fontSize]);
  }

  private clamp(value: number, minValue: number, maxValue: number): number {
    return Math.min(Math.max(value, minValue), maxValue);
  }
}
