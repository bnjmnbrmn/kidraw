import Konva from 'konva';
import Group = Konva.Group;
import {DANode} from './da-node';

export class DAEdge extends Group {

  private _isSelected: boolean = true;
  private readonly _line: Konva.Line;

  get isSelected(): boolean {
    return this._isSelected;
  }

  set isSelected(value: boolean) {
    this._isSelected = value;
    this._line.strokeWidth(this.strokeWidth());
    this._line.stroke(this.stroke());
  }

  private strokeWidth() {
    return this._isSelected ? 4 : 2;
  }

  private stroke() {
    return 'black'
  }

  get line(): Konva.Line {
    return this._line;
  }

  constructor(private srcNode: DANode, private destNode: DANode, private label: string) {
    super();

    // Calculate the intersection point on the destination node's boundary
    const srcX = srcNode.x();
    const srcY = srcNode.y();
    const destX = destNode.x();
    const destY = destNode.y();
    
    // Node is 100x100 centered at its position
    const halfSize = 50;
    
    // Direction vector from src to dest
    const dx = destX - srcX;
    const dy = destY - srcY;
    
    // Find where the line from src to dest intersects the dest node's boundary
    let arrowEndX = destX;
    let arrowEndY = destY;
    
    if (dx !== 0 || dy !== 0) {
      // Calculate intersection with each edge of the destination node
      // and find the one that's on the line from src to dest
      const absDx = Math.abs(dx);
      const absDy = Math.abs(dy);
      
      // Determine which edge the line hits first
      const tX = absDx > 0 ? halfSize / absDx : Infinity;
      const tY = absDy > 0 ? halfSize / absDy : Infinity;
      const t = Math.min(tX, tY);
      
      // Calculate the intersection point (offset from dest center, toward src)
      arrowEndX = destX - t * dx;
      arrowEndY = destY - t * dy;
    }

    this._line = new Konva.Arrow({
      points: [srcX, srcY, arrowEndX, arrowEndY],
      stroke: this.stroke(),
      strokeWidth: this.strokeWidth(),
      fill: 'black',
      pointerLength: 10,
      pointerWidth: 10,
    });
    this.add(this._line);
  }
}
