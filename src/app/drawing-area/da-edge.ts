import Konva from 'konva';
import {DANode} from './da-node';
import {DALabel} from './da-label';
import {nextId} from './id-generator';
import {EdgeDirectedness, LineStyle} from './command.model';

export class DAEdge {
  readonly id: string;
  readonly group: Konva.Group;
  private _isSelected: boolean = false;
  public readonly _line: Konva.Arrow;
  public readonly srcNode: DANode;
  public readonly destNode: DANode;
  private _labels: DALabel[] = [];

  public readonly STROKE_WIDTH_SELECTED = 4;
  public readonly STROKE_WIDTH_NORMAL = 2;
  public readonly POINTER_LENGTH = 10;
  public readonly POINTER_WIDTH = 10;

  private _strokeColor: string = 'black';
  private _fillColor: string = 'black';
  private _directedness: EdgeDirectedness = 'directed';
  private _lineStyle: LineStyle = 'solid';

  constructor(srcNode: DANode, destNode: DANode, label: string, id?: string,
              colors?: { stroke?: string; fill?: string }) {
    this.id = id ?? nextId();
    this.group = new Konva.Group();
    this.srcNode = srcNode;
    this.destNode = destNode;
    if (colors?.stroke) this._strokeColor = colors.stroke;
    if (colors?.fill) this._fillColor = colors.fill;

    srcNode.addOutgoingEdge(this);
    destNode.addIncomingEdge(this);

    this._line = new Konva.Arrow({
      points: this.calculatePoints(srcNode, destNode),
      stroke: this.stroke(),
      strokeWidth: this.strokeWidth(),
      fill: this._fillColor,
      pointerLength: this.POINTER_LENGTH,
      pointerWidth: this.POINTER_WIDTH,
    });
    this.group.add(this._line);
    this.applyDirectedness();
    this.applyLineStyle();
  }

  get isSelected(): boolean {
    return this._isSelected;
  }

  set isSelected(value: boolean) {
    this._isSelected = value;
    this._line.strokeWidth(this.strokeWidth());
  }

  private strokeWidth() {
    return this._isSelected ? this.STROKE_WIDTH_SELECTED : this.STROKE_WIDTH_NORMAL;
  }

  private stroke() {
    return this._strokeColor;
  }

  get directedness(): EdgeDirectedness {
    return this._directedness;
  }

  set directedness(value: EdgeDirectedness) {
    this._directedness = value;
    this.applyDirectedness();
  }

  get lineStyle(): LineStyle {
    return this._lineStyle;
  }

  set lineStyle(value: LineStyle) {
    this._lineStyle = value;
    this.applyLineStyle();
  }

  private applyDirectedness(): void {
    const pointerLength = this._directedness === 'undirected' ? 0 : this.POINTER_LENGTH;
    const pointerWidth = this._directedness === 'undirected' ? 0 : this.POINTER_WIDTH;
    this._line.pointerLength(pointerLength);
    this._line.pointerWidth(pointerWidth);
    this._line.pointerAtBeginning(this._directedness === 'bidirectional');
  }

  private applyLineStyle(): void {
    const dash = this._lineStyle === 'dashed' ? [10, 5] : this._lineStyle === 'dotted' ? [2, 4] : [];
    this._line.dash(dash);
    this._line.dashEnabled(dash.length > 0);
  }

  applyColors(colors: { stroke: string; fill: string }): void {
    this._strokeColor = colors.stroke;
    this._fillColor = colors.fill;
    this._line.stroke(this._strokeColor);
    this._line.fill(this._fillColor);
  }

  get labels(): DALabel[] {
    return this._labels;
  }

  addLabel(label: DALabel): void {
    this._labels.push(label);
    this.group.add(label.konvaGroup);
  }

  removeLabel(label: DALabel): void {
    const index = this._labels.indexOf(label);
    if (index > -1) {
      this._labels.splice(index, 1);
      label.konvaGroup.remove();
    }
  }

  /** Returns the polyline points the edge currently renders along.
   *  Phase 1: just src and dest endpoints; Phase 2 will insert control points. */
  getPathPoints(): { x: number; y: number }[] {
    if (this.srcNode === this.destNode) {
      return this.buildSelfLoopPoints(this.srcNode);
    }
    const srcCenter = this.getNodeCenter(this.srcNode);
    const destCenter = this.getNodeCenter(this.destNode);
    return [
      this.srcNode.getEdgePoint(destCenter.x, destCenter.y),
      this.destNode.getEdgePoint(srcCenter.x, srcCenter.y),
    ];
  }

  public calculatePoints(srcNode: DANode, destNode: DANode): number[] {
    return this.getPathPoints().flatMap(p => [p.x, p.y]);
  }

  private getNodeCenter(node: DANode): {x: number; y: number} {
    return {
      x: node.konvaGroup.x() + node.NODE_WIDTH / 2,
      y: node.konvaGroup.y() + node.NODE_HEIGHT / 2,
    };
  }

  private buildSelfLoopPoints(node: DANode): {x: number; y: number}[] {
    const x = node.konvaGroup.x();
    const y = node.konvaGroup.y();
    const width = node.NODE_WIDTH;
    const height = node.NODE_HEIGHT;
    const loopOffsetX = Math.max(28, width * 0.32);
    const loopOffsetY = Math.max(18, height * 0.2);

    return [
      {x: x + width, y: y + height * 0.35},
      {x: x + width + loopOffsetX, y: y + height * 0.22 - loopOffsetY},
      {x: x + width + loopOffsetX, y: y + height * 0.78 + loopOffsetY},
      {x: x + width, y: y + height * 0.65},
    ];
  }

  get konvaGroup(): Konva.Group {
    return this.group;
  }

  get line(): Konva.Arrow {
    return this._line;
  }

  zIndex() {
    return this.group.zIndex();
  }
}
