import Konva from 'konva';
import Group = Konva.Group;
import Rect = Konva.Rect;
import Text = Konva.Text;


export class DANode extends Group {
  private readonly _rect: Rect;
  private readonly _label: Text;
  private _isSelected: boolean = true;

  get isSelected(): boolean {
    return this._isSelected;
  }

  set isSelected(value: boolean) {
    this._isSelected = value;
    this.rect.strokeWidth(this.strokeWidth());
  }

  private strokeWidth() {
    return this._isSelected ? 4 : 2;
  }

  get rect(): Rect {
    return this._rect;
  }
  get label(): Text {
    return this._label;
  }

  constructor(x: number, y: number, initialText: string) {
    super({x, y});
    const width = 100;
    const height = 100;
    this._rect = new Rect({
      width: width,
      height: height,
      fill: 'white',
      stroke: 'black',
      strokeWidth: this.strokeWidth(),
      // cornerRadius: 5,
      offsetX: width/2,
      offsetY: height/2,
    });

    this._label = new Text({
      text: initialText,
      fontSize: 16,
      width: width,
      height: height,
      align: 'center',
      verticalAlign: 'middle',
      offsetX: width/2,
      offsetY: height/2,
    });
    this.add(this._rect);
    this.add(this._label);
  }

}
