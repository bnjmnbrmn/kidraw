import Konva from "konva";

export class DACrosshairs {
  readonly group: Konva.Group;

  public readonly CROSSHAIRS_LENGTH = 20;
  public readonly CROSSHAIRS_STROKE_WIDTH = 3;
  public readonly CROSSHAIRS_OPACITY = .5;

  constructor(p: { x: number; y: number }) {
    // Create group and position it at the crosshairs position
    this.group = new Konva.Group({ x: p.x, y: p.y, opacity: .5 });
    
    const horiz = new Konva.Line({
      points: [-this.CROSSHAIRS_LENGTH, 0, this.CROSSHAIRS_LENGTH, 0],
      stroke: 'black',
      strokeWidth: this.CROSSHAIRS_STROKE_WIDTH,
    });
    this.group.add(horiz);
    
    const vert = new Konva.Line({
      points: [0, -this.CROSSHAIRS_LENGTH, 0, this.CROSSHAIRS_LENGTH],
      stroke: 'black',
      strokeWidth: this.CROSSHAIRS_STROKE_WIDTH,
      opacity: this.CROSSHAIRS_OPACITY
    });
    this.group.add(vert);
  }

  get konvaGroup(): Konva.Group {
    return this.group;
  }

  show() {
    this.group.show();
  }

  hide() {
    this.group.hide();
  }

  getAbsolutePosition() {
    return this.group.getAbsolutePosition();
  }

  get x() {
    return this.group.x();
  }

  get y() {
    return this.group.y();
  }

  set x(value: number) {
    this.group.x(value);
  }

  set y(value: number) {
    this.group.y(value);
  }
}
