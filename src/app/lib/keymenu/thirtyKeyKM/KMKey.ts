import Konva from "konva";
import {DisplayableKey} from "./displayableKey";
import {KMKeyConfig} from "./KMKeyConfig";
import Rect = Konva.Rect;

export class KMKey extends Konva.Group {

  private static readonly KEY_WIDTH = 70;
  private static readonly KEY_HEIGHT = 70;
  private static readonly KEY_MARGIN = 5;
  private static readonly ROW_OFFSETS = [0, 10, 30];  // Offset for each row to match standard keyboard


  private static readonly rowsAndColsForDisplayableKeys: Map<DisplayableKey, { row: number; col: number }> =
    new Map(
      [
        [DisplayableKey.q, {row: 0, col: 0}],
        [DisplayableKey.w, {row: 0, col: 1}],
        [DisplayableKey.e, {row: 0, col: 2}],
        [DisplayableKey.r, {row: 0, col: 3}],
        [DisplayableKey.t, {row: 0, col: 4}],
        [DisplayableKey.y, {row: 0, col: 5}],
        [DisplayableKey.u, {row: 0, col: 6}],
        [DisplayableKey.i, {row: 0, col: 7}],
        [DisplayableKey.o, {row: 0, col: 8}],
        [DisplayableKey.p, {row: 0, col: 9}],
        [DisplayableKey.a, {row: 1, col: 0}],
        [DisplayableKey.s, {row: 1, col: 1}],
        [DisplayableKey.d, {row: 1, col: 2}],
        [DisplayableKey.f, {row: 1, col: 3}],
        [DisplayableKey.g, {row: 1, col: 4}],
        [DisplayableKey.h, {row: 1, col: 5}],
        [DisplayableKey.j, {row: 1, col: 6}],
        [DisplayableKey.k, {row: 1, col: 7}],
        [DisplayableKey.l, {row: 1, col: 8}],
        [DisplayableKey.semicolon, {row: 1, col: 9}],
        [DisplayableKey.z, {row: 2, col: 0}],
        [DisplayableKey.x, {row: 2, col: 1}],
        [DisplayableKey.c, {row: 2, col: 2}],
        [DisplayableKey.v, {row: 2, col: 3}],
        [DisplayableKey.b, {row: 2, col: 4}],
        [DisplayableKey.n, {row: 2, col: 5}],
        [DisplayableKey.m, {row: 2, col: 6}],
        [DisplayableKey.comma, {row: 2, col: 7}],
        [DisplayableKey.period, {row: 2, col: 8}],
        [DisplayableKey.slash, {row: 2, col: 9}]
      ]
    );

  protected static readonly xAndYForDisplayableKeys: Map<DisplayableKey, { x: number; y: number }> =
    new Map(Array.from(KMKey.rowsAndColsForDisplayableKeys.entries())
      .map(([dk, {row, col}]) =>
        [dk, {
          x: col * (KMKey.KEY_WIDTH + KMKey.KEY_MARGIN) + KMKey.ROW_OFFSETS[row],
          y: row * (KMKey.KEY_HEIGHT + KMKey.KEY_MARGIN)
        }])
    );


  private displayableKey: DisplayableKey;
  private label: string;
  public action: () => void;
  private _rect: Konva.Rect;
  private _keyLabel: Konva.Text;
  private _actionLabel: Konva.Text;
  private _keyLabelBackground: Rect;

  constructor(config: KMKeyConfig) {
    super({
      x: KMKey.xAndYForDisplayableKeys.get(config.displayableKey)!.x,
      y: KMKey.xAndYForDisplayableKeys.get(config.displayableKey)!.y
    });
    this.displayableKey = config.displayableKey;
    this.label = config.label;
    this.action = config.action;


    this._rect = new Konva.Rect(
      {
        width: KMKey.KEY_WIDTH,
        height: KMKey.KEY_HEIGHT,
        stroke: 'black',
        fill: 'white',
      }
    );
    this.add(this._rect);


    this._keyLabel = new Konva.Text({
      text: this.displayableKey.valueOf(),
      width: KMKey.KEY_WIDTH,
      height: 10,
      y: 3,
      align: 'center',
      verticalAlign: 'middle',

    });

    this._keyLabelBackground = new Konva.Rect({
      width: KMKey.KEY_WIDTH,
      height: this._keyLabel.height() + 10,
      fill: 'lightgreen',
      stroke: 'black',
    })

    this.add(this._keyLabelBackground);


    this.add(this._keyLabel)


    this._actionLabel = new Konva.Text({
      text: this.label,
      width: KMKey.KEY_WIDTH,
      height: KMKey.KEY_HEIGHT,
      align: 'center',
      verticalAlign: 'middle',
    });
    this.add(this._actionLabel)

  }

}
