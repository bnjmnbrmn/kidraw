import Konva from 'konva';


export class DANode {
  readonly group: Konva.Group;
  private readonly _rect: Konva.Rect;
  private readonly _label: Konva.Text;
  private _isSelected: boolean = false;

  public readonly NODE_WIDTH = 100;
  public readonly NODE_HEIGHT = 100;
  public readonly STROKE_WIDTH_SELECTED = 4;
  public readonly STROKE_WIDTH_NORMAL = 2;
  public readonly FONT_SIZE = 16;

  constructor(x: number, y: number, initialText: string) {
    // Create the main group
    this.group = new Konva.Group({ x, y });

    // Create and configure the rectangle
    this._rect = new Konva.Rect({
      width: this.NODE_WIDTH,
      height: this.NODE_HEIGHT,
      fill: 'white',
      stroke: 'black',
      strokeWidth: this.STROKE_WIDTH_NORMAL,
    });
    this.group.add(this._rect);

    // Create and configure the label
    this._label = new Konva.Text({
      text: initialText,
      width: this.NODE_WIDTH,
      height: this.NODE_HEIGHT,
      fontSize: this.FONT_SIZE,
      align: 'center',
      verticalAlign: 'middle',
    });
    this.group.add(this._label);
  }

  get isSelected(): boolean {
    return this._isSelected;
  }

  set isSelected(value: boolean) {
    this._isSelected = value;
    this.rect.strokeWidth(this.strokeWidth());
  }

  private strokeWidth() {
    return this._isSelected ? this.STROKE_WIDTH_SELECTED : this.STROKE_WIDTH_NORMAL;
  }

  get rect(): Konva.Rect {
    return this._rect;
  }

  get label(): Konva.Text {
    return this._label;
  }

  get konvaGroup(): Konva.Group {
    return this.group;
  }

  getClientRect() {
    return this.group.getClientRect();
  }

  zIndex() {
    return this.group.zIndex();
  }
}
