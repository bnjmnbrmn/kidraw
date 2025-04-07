export interface NodeParams {
  x: number;
  y: number;
  width?: number;
  height?: number;
  label?: string;
}


export class DANode {
  private x: number;
  private y: number;
  private minWidth: number;
  private minHeight: number;
  private label: DANodeLabel;

  constructor(nodeParams: NodeParams) {
    this.x = nodeParams.x;
    this.y = nodeParams.y;
    this.minWidth = nodeParams.width ?? 100;
    this.minHeight = nodeParams.height ?? 100;
    this.label = new DANodeLabel(nodeParams.label ?? '');
  }

  draw(ctx: CanvasRenderingContext2D) {

    ctx.font = "1em Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    let label = this.label;
    let textWidth = label.width(ctx);
    let textHeight = label.height(ctx);

    const width = Math.max(this.minWidth, Math.ceil(textWidth / 50.0) * 100.0);
    const height = Math.max(this.minHeight, Math.ceil(textHeight / 50.0) * 100.0);

    ctx.strokeRect(this.x - width / 2, this.y - height / 2, width, height);

    label.draw(ctx, this.x + width / 2, this.y + height / 2);
  }

}

export class DANodeLabel {
  private _text: string;

  get text() {
    return this._text;
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
