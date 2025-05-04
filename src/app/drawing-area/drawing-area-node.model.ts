
export interface NodeParams {
  ctx: CanvasRenderingContext2D;
  x: number;
  y: number;
  width?: number;
  height?: number;
  labelText?: string;
  isSelected?: boolean;
}


interface Drawable {
  leftBoundLogical: number,
  rightBoundLogical: number,
  topBoundLogical: number,
  bottomBoundLogical: number,
  widthLogical: number,
  heightLogical: number
}

export class DANode implements Drawable {

  get leftBoundLogical(): number {
    return this.xLogical - this.widthLogical / 2
  }

  get rightBoundLogical(): number {
    return this.xLogical + this.widthLogical / 2
  }

  get topBoundLogical(): number {
    return this.yLogical - this.heightLogical / 2
  }

  get bottomBoundLogical(): number {
    return this.xLogical + this.heightLogical / 2
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
  private xLogical: number;
  private yLogical: number;
  private minWidthLogical: number;
  private minHeightLogical: number;
  private _label: DANodeLabel;
  private _isSelected: boolean;

  constructor(nodeParams: NodeParams) {
    this.ctx = nodeParams.ctx;
    this.xLogical = nodeParams.x;
    this.yLogical = nodeParams.y;
    this.minWidthLogical = nodeParams.width ?? 100;
    this.minHeightLogical = nodeParams.height ?? 100;
    this._label = new DANodeLabel(this.ctx, nodeParams.labelText ?? '');
    this._isSelected = nodeParams.isSelected ?? false;
  }

  draw() {



    if (this._isSelected) {
      this.ctx.lineWidth = 3;
    } else {
      this.ctx.lineWidth = 1;
    }


    this.ctx.strokeRect(this.xLogical - this.widthLogical / 2, this.yLogical - this.heightLogical / 2, this.widthLogical, this.heightLogical);

    this._label.draw(this.xLogical, this.yLogical);
  }

  get heightLogical() {
    return Math.max(this.minHeightLogical, Math.ceil(this._label.heightLogical / 50.0) * 100.0);
  }

  get widthLogical() {
    return Math.max(this.minWidthLogical, Math.ceil(this._label.widthLogical / 50.0) * 100.0);
  }
}

abstract class AbstractDrawable implements Drawable {
    abstract leftBoundLogical: number;
    abstract rightBoundLogical: number;
    abstract topBoundLogical: number;
    abstract bottomBoundLogical: number;
    get widthLogical(): number {
      return this.rightBoundLogical - this.leftBoundLogical;
    }
    get heightLogical(): number {
      return this.bottomBoundLogical - this.topBoundLogical;
    };

}

export class DANodeLabel extends AbstractDrawable {
  private _text: string;
  private ctx: CanvasRenderingContext2D;

  get text() {
    return this._text;
  }

  set text(value: string) {
    this._text = value;
  }

  constructor(ctx: CanvasRenderingContext2D, text: string) {
    super();
    this._text = text;
    this.ctx = ctx;
    //todo handle multi-line text
  }

  get leftBoundLogical(): number {
    let lbl!:number;
    this.doInContext(() => {
      lbl = this.ctx.measureText(this.text).actualBoundingBoxLeft;
      }
    );
    return lbl;
  }

  get rightBoundLogical(): number {
    let rbl!:number;
    this.doInContext(() => {
        rbl = this.ctx.measureText(this.text).actualBoundingBoxRight;
      }
    );
    return rbl;
  };

  get topBoundLogical(): number {
    let tbl!:number;
    this.doInContext(() => {
        tbl = this.ctx.measureText(this.text).actualBoundingBoxAscent;
      }
    );
    return tbl;
  }

  get bottomBoundLogical(): number {
    let bbl!:number;
    this.doInContext(() => {
        bbl = this.ctx.measureText(this.text).actualBoundingBoxDescent;
      }
    );
    return bbl;
  };


  private font = "1em Arial";
  private textAlign: CanvasTextAlign = "center";
  private textBaseline: CanvasTextBaseline = "middle"

  draw(x: number, y: number) {
    this.doInContext(() => {
      this.ctx.fillText(this.text, x, y);
    })
  }

  private doInContext(toDo: () => void) {
    const originalFont = this.ctx.font;
    const originalTextAlign = this.ctx.textAlign;
    const originalTextBaseline = this.ctx.textBaseline;

    this.ctx.font = this.font;
    this.ctx.textAlign = this.textAlign;
    this.ctx.textBaseline = this.textBaseline;

    toDo();

    this.ctx.font = originalFont;
    this.ctx.textAlign = originalTextAlign;
    this.ctx.textBaseline = originalTextBaseline;
  }
}
