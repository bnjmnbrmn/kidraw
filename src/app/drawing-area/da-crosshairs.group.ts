import Konva from "konva";

export class DACrosshairs extends Konva.Group {

    public readonly CROSSHAIRS_LENGTH = 20;
    public readonly CROSSHAIRS_STROKE_WIDTH = 3;
    public readonly CROSSHAIRS_OPACITY = .5;

    constructor(p: { x: number; y: number }) {
      super({ x: p.x, y: p.y, opacity: .5 })
      const horiz = new Konva.Line({
        points: [-this.CROSSHAIRS_LENGTH, 0, this.CROSSHAIRS_LENGTH, 0],
        stroke: 'black',
        strokeWidth: this.CROSSHAIRS_STROKE_WIDTH,
        // opacity: .5
      });
      this.add(horiz);
      const vert = new Konva.Line({
        points: [0, -this.CROSSHAIRS_LENGTH, 0, this.CROSSHAIRS_LENGTH],
        stroke: 'black',
        strokeWidth: this.CROSSHAIRS_STROKE_WIDTH,
        opacity: this.CROSSHAIRS_OPACITY
      });
      this.add(vert)
    }
  }
