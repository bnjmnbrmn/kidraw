import Konva from "konva";

export class DACrosshairs extends Konva.Group {

  constructor(p: { x: number; y: number }) {
    super({x: p.x, y: p.y, opacity: .5})
    const horiz = new Konva.Line({
      points: [-20, 0, 20, 0],
      stroke: 'black',
      strokeWidth: 3,
      // opacity: .5
    });
    this.add(horiz);
    const vert = new Konva.Line({
      points: [0, -20, 0, 20],
      stroke: 'black',
      strokeWidth: 3,
      // opacity: .5
    });
    this.add(vert)
  }

}
