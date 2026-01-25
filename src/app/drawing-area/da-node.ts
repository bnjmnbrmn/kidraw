import Konva from 'konva';
import Group = Konva.Group;
import Rect = Konva.Rect;
import Text = Konva.Text;


export class DANode extends Group {
  private readonly _rect: Rect;
  private readonly _label: Text;
  private _isSelected: boolean = false;

  public readonly NODE_WIDTH = 100;
  public readonly NODE_HEIGHT = 100;
  public readonly STROKE_WIDTH_SELECTED = 4;
  public readonly STROKE_WIDTH_NORMAL = 2;
  public readonly FONT_SIZE = 16;

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

  get rect(): Rect {
    return this._rect;
  }
  get label(): Text {
    return this._label;
  }

  constructor(x: number, y: number, initialText: string) {
    super({x, y});
    this._rect = new Rect({
      width: this.NODE_WIDTH,
      height: this.NODE_HEIGHT,
      fill: 'white',
      stroke: 'black',
      strokeWidth: this.strokeWidth(),
      // cornerRadius: 5,
      offsetX: this.NODE_WIDTH/2,
      offsetY: this.NODE_HEIGHT/2,
    });

    this._label = new Text({
      text: initialText,
      fontSize: this.FONT_SIZE,
      width: this.NODE_WIDTH,
      height: this.NODE_HEIGHT,
      align: 'center',
      verticalAlign: 'middle',
      offsetX: this.NODE_WIDTH/2,
      offsetY: this.NODE_HEIGHT/2,
    });
    this.add(this._rect);
    this.add(this._label);
  }

}
