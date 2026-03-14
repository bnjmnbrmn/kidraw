import Konva from "konva";

export class DACrosshairs {
  readonly group: Konva.Group;
  private readonly headingLine: Konva.Line;

  public readonly CROSSHAIRS_LENGTH = 20;
  public readonly CROSSHAIRS_STROKE_WIDTH = 3;
  public readonly CROSSHAIRS_OPACITY = .5;
  public readonly HEADING_LENGTH = 34;

  constructor(p: { x: number; y: number }, strokeColor: string = 'black') {
    // Create group and position it at the crosshairs position
    this.group = new Konva.Group({ x: p.x, y: p.y, opacity: .7 });

    const horiz = new Konva.Line({
      points: [-this.CROSSHAIRS_LENGTH, 0, this.CROSSHAIRS_LENGTH, 0],
      stroke: strokeColor,
      strokeWidth: this.CROSSHAIRS_STROKE_WIDTH,
    });
    this.group.add(horiz);

    const vert = new Konva.Line({
      points: [0, -this.CROSSHAIRS_LENGTH, 0, this.CROSSHAIRS_LENGTH],
      stroke: strokeColor,
      strokeWidth: this.CROSSHAIRS_STROKE_WIDTH,
      opacity: this.CROSSHAIRS_OPACITY
    });
    this.group.add(vert);

    this.headingLine = new Konva.Line({
      points: [0, 0, 0, -this.HEADING_LENGTH],
      stroke: '#e4572e',
      strokeWidth: 2,
      lineCap: 'round',
      dash: [6, 4],
      visible: false,
    });
    this.group.add(this.headingLine);
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

  setHeading(angleRadians: number) {
    this.headingLine.points([
      0,
      0,
      Math.cos(angleRadians) * this.HEADING_LENGTH,
      Math.sin(angleRadians) * this.HEADING_LENGTH,
    ]);
  }

  setHeadingVisible(visible: boolean) {
    this.headingLine.visible(visible);
  }
}
