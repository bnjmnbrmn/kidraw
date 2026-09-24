import Konva from "konva";

export class DACrosshairs {
  readonly group: Konva.Group;
  private readonly horizLine: Konva.Line;
  private readonly vertLine: Konva.Line;
  private readonly selectionCircle: Konva.Circle;

  public readonly CROSSHAIRS_LENGTH = 20;
  public readonly CROSSHAIRS_STROKE_WIDTH = 3;
  private _hitRadiusX = this.CROSSHAIRS_LENGTH;
  private _hitRadiusY = this.CROSSHAIRS_LENGTH;

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

  setHitRadii(radiusX: number, radiusY: number) {
    this._hitRadiusX = radiusX;
    this._hitRadiusY = radiusY;
    this.selectionCircle.scaleX(radiusX / this.CROSSHAIRS_LENGTH);
    this.selectionCircle.scaleY(radiusY / this.CROSSHAIRS_LENGTH);
    this.horizLine.points([-radiusX, 0, radiusX, 0]);
    this.vertLine.points([0, -radiusY, 0, radiusY]);
  }

  get hitRadiusX(): number {
    return this._hitRadiusX;
  }

  get hitRadiusY(): number {
    return this._hitRadiusY;
  }

  updateStrokeColor(color: string) {
    this.horizLine.stroke(color);
    this.vertLine.stroke(color);
    this.selectionCircle.stroke(color);
  }
}
