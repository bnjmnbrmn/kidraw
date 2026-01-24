import Konva from 'konva';
import Group = Konva.Group;
import {DANode} from './da-node';
import Line = Konva.Line;
import {arrowPointForLineToGroup, Point} from './utils';

export class DAEdge extends Group {

  private _isSelected: boolean = true;
  private readonly _line: Line;

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

    const lineToGroup = new Line({points: [srcNode.x(), srcNode.y(), destNode.x(), destNode.y()]});
    const apfltg: Point|null = arrowPointForLineToGroup(lineToGroup, destNode);

    if (apfltg == null) {
      throw new Error();
    } else {
      this._line = new Konva.Arrow({
        points: [srcNode.x(), srcNode.y(), apfltg.x, apfltg.y],
        stroke: this.stroke(),
        strokeWidth: this.strokeWidth(),
      });
      this.add(this._line);

    }

  }
}
