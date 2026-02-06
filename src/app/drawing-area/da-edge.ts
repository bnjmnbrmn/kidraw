import Konva from 'konva';
import {DANode} from './da-node';

export class DAEdge {
  readonly group: Konva.Group;
  private _isSelected: boolean = true;
  public readonly _line: Konva.Arrow;
  public readonly srcNode: DANode;
  public readonly destNode: DANode;

  public readonly STROKE_WIDTH_SELECTED = 4;
  public readonly STROKE_WIDTH_NORMAL = 2;
  public readonly NODE_HALF_SIZE = 50;
  public readonly POINTER_LENGTH = 10;
  public readonly POINTER_WIDTH = 10;

  constructor(srcNode: DANode, destNode: DANode, label: string) {
    this.group = new Konva.Group();
    this.srcNode = srcNode;
    this.destNode = destNode;

    // Register this edge with the nodes
    srcNode.addOutgoingEdge(this);
    destNode.addIncomingEdge(this);

    this._line = new Konva.Arrow({
      points: this.calculatePoints(srcNode, destNode),
      stroke: this.stroke(),
      strokeWidth: this.strokeWidth(),
      fill: 'black',
      pointerLength: this.POINTER_LENGTH,
      pointerWidth: this.POINTER_WIDTH,
    });
    this.group.add(this._line);
  }

  get isSelected(): boolean {
    return this._isSelected;
  }

  set isSelected(value: boolean) {
    this._isSelected = value;
    this._line.strokeWidth(this.strokeWidth());
    this._line.stroke(this.stroke());
  }

  private strokeWidth() {
    return this._isSelected ? this.STROKE_WIDTH_SELECTED : this.STROKE_WIDTH_NORMAL;
  }

  private stroke() {
    return 'black'
  }

  public calculatePoints(srcNode: DANode, destNode: DANode): [number, number, number, number] {
    const srcPos = srcNode.konvaGroup.position();
    const destPos = destNode.konvaGroup.position();
    
    // Calculate node centers (nodes are positioned at their top-left, so add half dimensions)
    const srcCenterX = srcPos.x + this.NODE_HALF_SIZE;
    const srcCenterY = srcPos.y + this.NODE_HALF_SIZE;
    const destCenterX = destPos.x + this.NODE_HALF_SIZE;
    const destCenterY = destPos.y + this.NODE_HALF_SIZE;
    
    const dx = destCenterX - srcCenterX;
    const dy = destCenterY - srcCenterY;
    
    // Calculate the intersection point with the destination node
    const absDx = Math.abs(dx);
    const absDy = Math.abs(dy);
    
    // Determine which edge the line hits first
    const tX = absDx > 0 ? this.NODE_HALF_SIZE / absDx : Infinity;
    const tY = absDy > 0 ? this.NODE_HALF_SIZE / absDy : Infinity;
    const t = Math.min(tX, tY);
    
    // Calculate the intersection point (offset from dest center, toward src)
    const arrowEndX = destCenterX - t * dx;
    const arrowEndY = destCenterY - t * dy;
    
    // Calculate the intersection point with the source node
    const srcT = Math.min(tX, tY);
    const srcX = srcCenterX + srcT * dx;
    const srcY = srcCenterY + srcT * dy;
    
    return [srcX, srcY, arrowEndX, arrowEndY];
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
