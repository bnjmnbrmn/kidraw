import Konva from 'konva';
import Group = Konva.Group;
import {DANode} from './da-node';
import Line = Konva.Line;

export class DAEdge extends Group {
  private line: Line;
  constructor(srcNode: DANode, destNode: DANode, label: string) {
    super();

    this.line = new Konva.Line({
      points: [srcNode.x(), srcNode.y(), destNode.x(), destNode.y()],
      stroke: 'black',
      strokeWidth: 2
    });

    this.add(this.line);



  }
}
