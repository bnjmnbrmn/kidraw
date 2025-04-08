
export interface NodeParams {
  x: number;
  y: number;
  width?: number;
  height?: number;
  label?: string;
  isSelected?: boolean;
}


export class DANode {
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
  private x: number;
  private y: number;
  private minWidth: number;
  private minHeight: number;
  private _label: DANodeLabel;
  private _isSelected: boolean;

  constructor(nodeParams: NodeParams) {
    this.x = nodeParams.x;
    this.y = nodeParams.y;
    this.minWidth = nodeParams.width ?? 100;
    this.minHeight = nodeParams.height ?? 100;
    this._label = new DANodeLabel(nodeParams.label ?? '');
    this._isSelected = nodeParams.isSelected ?? false;
  }

  draw(ctx: CanvasRenderingContext2D) {

    ctx.font = "1em Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    if (this._isSelected) {
      ctx.lineWidth = 3;
    } else {
      ctx.lineWidth = 1;
    }

    let label = this._label;
    let textWidth = label.width(ctx);
    let textHeight = label.height(ctx);

    const width = Math.max(this.minWidth, Math.ceil(textWidth / 50.0) * 100.0);
    const height = Math.max(this.minHeight, Math.ceil(textHeight / 50.0) * 100.0);

    ctx.strokeRect(this.x - width / 2, this.y - height / 2, width, height);

    label.draw(ctx, this.x, this.y);
  }

}

export class DANodeLabel {
  private _text: string;

  get text() {
    return this._text;
  }

  set text(value: string) {
    this._text = value;
  }

  constructor(text: string) {
    this._text = text;
    //todo handle multi-line text
  }

  width(ctx: CanvasRenderingContext2D) {
    return ctx.measureText(this.text).actualBoundingBoxLeft + ctx.measureText(this.text).actualBoundingBoxRight;
  }

  height(ctx: CanvasRenderingContext2D) {
    return ctx.measureText(this.text).actualBoundingBoxAscent + ctx.measureText(this.text).actualBoundingBoxDescent
  }

  draw(ctx: CanvasRenderingContext2D, x: number, y: number) {
    ctx.fillText(this.text, x, y);
  }
}
