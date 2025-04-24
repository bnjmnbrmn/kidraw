
export interface NodeParams {
  ctx: CanvasRenderingContext2D;
  x: number;
  y: number;
  width?: number;
  height?: number;
  label?: string;
  isSelected?: boolean;
}


export class DANode {

  get left(): number {
    return this.x - this.width / 2
  }

  get right(): number {
    return this.x + this.width / 2
  }

  get top(): number {
    return this.y - this.height / 2
  }

  get bottom(): number {
    return this.x + this.height / 2
  }


  get label(): DANodeLabel {
    return this._label;
  }

  set label(value: DANodeLabel) {
    this._label = value;
  }
  get isSelected(): boolean {
    return this._isSelected;
  }

  set isSelected(value: boolean) {
    this._isSelected = value;
  }

  private ctx: CanvasRenderingContext2D;
  private x: number;
  private y: number;
  private minWidth: number;
  private minHeight: number;
  private _label: DANodeLabel;
  private _isSelected: boolean;

  constructor(nodeParams: NodeParams) {
    this.ctx = nodeParams.ctx;
    this.x = nodeParams.x;
    this.y = nodeParams.y;
    this.minWidth = nodeParams.width ?? 100;
    this.minHeight = nodeParams.height ?? 100;
    this._label = new DANodeLabel(this.ctx, nodeParams.label ?? '');
    this._isSelected = nodeParams.isSelected ?? false;
  }

  draw(ctx: CanvasRenderingContext2D) {

    this.ctx.font = "1em Arial";
    this.ctx.textAlign = "center";
    this.ctx.textBaseline = "middle";

    if (this._isSelected) {
      this.ctx.lineWidth = 3;
    } else {
      this.ctx.lineWidth = 1;
    }


    this.ctx.strokeRect(this.x - this.width / 2, this.y - this.height / 2, this.width, this.height);

    this._label.draw(this.x, this.y);
  }

  get height() {
    return Math.max(this.minHeight, Math.ceil(this._label.height() / 50.0) * 100.0);
  }

  get width() {
    return Math.max(this.minWidth, Math.ceil(this._label.width() / 50.0) * 100.0);
  }
}

export class DANodeLabel {
  private _text: string;
  private ctx: CanvasRenderingContext2D;

  get text() {
    return this._text;
  }

  set text(value: string) {
    this._text = value;
  }

  constructor(ctx: CanvasRenderingContext2D, text: string) {
    this._text = text;
    this.ctx = ctx;
    //todo handle multi-line text
  }

  width() {
    return this.ctx.measureText(this.text).actualBoundingBoxLeft + this.ctx.measureText(this.text).actualBoundingBoxRight;
  }

  height() {
    return this.ctx.measureText(this.text).actualBoundingBoxAscent + this.ctx.measureText(this.text).actualBoundingBoxDescent
  }

  draw(x: number, y: number) {
    this.ctx.fillText(this.text, x, y);
  }
}
