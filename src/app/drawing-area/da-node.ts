import Konva from 'konva';
import { DAEdge } from './da-edge';


export class DANode {
  readonly group: Konva.Group;
  private readonly _rect: Konva.Rect;
  private readonly _label: Konva.Text;
  private _isSelected: boolean = false;
  
  // Edge references with cache validation
  public incomingEdges: DAEdge[] = [];
  public outgoingEdges: DAEdge[] = [];
  private _edgesCacheValid = false;

  public readonly DEFAULT_NODE_WIDTH = 100;
  public readonly DEFAULT_NODE_HEIGHT = 100;
  public readonly STROKE_WIDTH_SELECTED = 4;
  public readonly STROKE_WIDTH_NORMAL = 2;
  public readonly DEFAULT_FONT_SIZE = 16;

  public readonly MIN_NODE_SIZE = 50;
  public readonly MAX_NODE_SIZE = 320;
  public readonly MIN_FONT_SIZE = 10;
  public readonly MAX_FONT_SIZE = 48;

  private _nodeWidth = this.DEFAULT_NODE_WIDTH;
  private _nodeHeight = this.DEFAULT_NODE_HEIGHT;
  private _fontSize = this.DEFAULT_FONT_SIZE;

  constructor(x: number, y: number, initialText: string) {
    // Create the main group
    this.group = new Konva.Group({ x, y });

    // Create and configure the rectangle
    this._rect = new Konva.Rect({
      width: this.NODE_WIDTH,
      height: this.NODE_HEIGHT,
      fill: 'white',
      stroke: 'black',
      strokeWidth: this.STROKE_WIDTH_NORMAL,
    });
    this.group.add(this._rect);

    // Create and configure the label
    this._label = new Konva.Text({
      text: initialText,
      width: this.NODE_WIDTH,
      height: this.NODE_HEIGHT,
      fontSize: this.FONT_SIZE,
      align: 'center',
      verticalAlign: 'middle',
    });
    this.group.add(this._label);
  }

  get isSelected(): boolean {
    return this._isSelected;
  }

  set isSelected(value: boolean) {
    this._isSelected = value;
    this.rect.strokeWidth(this.strokeWidth());
  }

  private strokeWidth() {
    return this._isSelected ? this.STROKE_WIDTH_SELECTED : this.STROKE_WIDTH_NORMAL;
  }

  get rect(): Konva.Rect {
    return this._rect;
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

  // Edge management methods
  get connectedEdges(): DAEdge[] {
    if (!this._edgesCacheValid) {
      this._rebuildEdgesCache();
      this._edgesCacheValid = true;
    }
    return [...this.incomingEdges, ...this.outgoingEdges];
  }

  private _rebuildEdgesCache() {
    // Cache is already valid since we maintain arrays directly
    // This method exists for future extensibility
  }

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

  resizeBy(delta: number): boolean {
    const nextWidth = this.clamp(this._nodeWidth + delta, this.MIN_NODE_SIZE, this.MAX_NODE_SIZE);
    const nextHeight = this.clamp(this._nodeHeight + delta, this.MIN_NODE_SIZE, this.MAX_NODE_SIZE);

    if (nextWidth === this._nodeWidth && nextHeight === this._nodeHeight) {
      return false;
    }

    this._nodeWidth = nextWidth;
    this._nodeHeight = nextHeight;

    this._rect.width(this._nodeWidth);
    this._rect.height(this._nodeHeight);
    this._label.width(this._nodeWidth);
    this._label.height(this._nodeHeight);
    return true;
  }

  adjustLabelFontSizeBy(delta: number): boolean {
    const nextSize = this.clamp(this._fontSize + delta, this.MIN_FONT_SIZE, this.MAX_FONT_SIZE);
    if (nextSize === this._fontSize) {
      return false;
    }

    this._fontSize = nextSize;
    this._label.fontSize(this._fontSize);
    return true;
  }

  private clamp(value: number, minValue: number, maxValue: number): number {
    return Math.min(Math.max(value, minValue), maxValue);
  }
}
