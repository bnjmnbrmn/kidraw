import Konva from "konva";

export class DACrosshairs {
  readonly group: Konva.Group;
  private readonly horizLine: Konva.Line;
  private readonly vertLine: Konva.Line;
  private readonly selectionCircle: Konva.Circle;
  private readonly headingLine: Konva.Line;

  public readonly CROSSHAIRS_LENGTH = 20;
  public readonly CROSSHAIRS_STROKE_WIDTH = 3;
  public readonly HEADING_LENGTH = 34;

  constructor(p: { x: number; y: number }, strokeColor: string = 'black') {
    this.group = new Konva.Group({ x: p.x, y: p.y });

    this.selectionCircle = new Konva.Circle({
      x: 0,
      y: 0,
      radius: this.CROSSHAIRS_LENGTH,
      stroke: strokeColor,
      strokeWidth: 1,
      fill: 'transparent',
    });
    this.group.add(this.selectionCircle);

    this.horizLine = new Konva.Line({
      points: [-this.CROSSHAIRS_LENGTH, 0, this.CROSSHAIRS_LENGTH, 0],
      stroke: strokeColor,
      strokeWidth: this.CROSSHAIRS_STROKE_WIDTH,
    });
    this.group.add(this.horizLine);

    this.vertLine = new Konva.Line({
      points: [0, -this.CROSSHAIRS_LENGTH, 0, this.CROSSHAIRS_LENGTH],
      stroke: strokeColor,
      strokeWidth: this.CROSSHAIRS_STROKE_WIDTH,
    });
    this.group.add(this.vertLine);

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

  updateStrokeColor(color: string) {
    this.horizLine.stroke(color);
    this.vertLine.stroke(color);
    this.selectionCircle.stroke(color);
  }
}
