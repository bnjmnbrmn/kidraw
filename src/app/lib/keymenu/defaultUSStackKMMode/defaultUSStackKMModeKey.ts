import {Group} from "konva/lib/Group";
import {DefaultUSStackKMModeKeyString, DefaultUSStackKMModeSubmenuConfig} from "./defaultUSStackKMModeSubmenuConfig";
import Konva from "konva";
import {DefaultUSStackKMModeSubmenu} from "./defaultUSStackKMModeSubmenu";
import Rect = Konva.Rect;
import {DefaultUSStackKMMode} from './defaultUSStackKMMode';

export abstract class DefaultUSStackKMModeKey<T> {
  public konvaGroup: Group;
  private _highlight: boolean;
  private keyRect: Rect;

  constructor(public keyString: DefaultUSStackKMModeKeyString, public label: string, public mode: DefaultUSStackKMMode<T>) {

    this._highlight = false;

    this.konvaGroup = new Group({
      x: DefaultUSStackKMModeSubmenu.xAndYForKeys[keyString]!.x,
      y: DefaultUSStackKMModeSubmenu.xAndYForKeys[keyString]!.y
    });

    this.keyRect = new Konva.Rect(
      {
        width: DefaultUSStackKMModeSubmenu.KEY_WIDTH,
        height: DefaultUSStackKMModeSubmenu.KEY_HEIGHT,
        stroke: 'black',
        fill: 'white',
        shadowEnabled: false,
        shadowOffset: {x: 1, y: 1},
      }
    );
    this.konvaGroup.add(this.keyRect);
    const keyLabelText = new Konva.Text({
      text: keyString,
      width: DefaultUSStackKMModeSubmenu.KEY_WIDTH,
      height: 10,
      y: 4,
      align: 'center',
      verticalAlign: 'middle',
    });
    const keyLabelRect = new Konva.Rect({
      width: DefaultUSStackKMModeSubmenu.KEY_WIDTH,
      height: keyLabelText.height() + 10,
      fill: 'lightgreen',
      stroke: 'black',
    });
    this.konvaGroup.add(keyLabelRect);
    this.konvaGroup.add(keyLabelText)
    const actionLabelText = new Konva.Text({
      text: label,
      width: DefaultUSStackKMModeSubmenu.KEY_WIDTH - 10,
      height: DefaultUSStackKMModeSubmenu.KEY_HEIGHT + 20,
      align: 'center',
      verticalAlign: 'middle',
      x: 5
    });
    this.konvaGroup.add(actionLabelText)
  }


  get highlight(): boolean {
    return this._highlight;
  }

  set highlight(value: boolean) {
    this._highlight = value;
    if (this._highlight) {
      this.keyRect.shadowEnabled(true);
    } else {
      this.keyRect.shadowEnabled(false);
    }
  }

}

export class DefaultUSStackKMModeLeafKey<T> extends DefaultUSStackKMModeKey<T> {
  performAction() {
      this.action();
  }
  constructor(keyString: DefaultUSStackKMModeKeyString, label: string, public action: () => void, mode: DefaultUSStackKMMode<T>) {
    super(keyString, label, mode);
  }
}

export class DefaultUSStackKMModeInnerKey<T> extends DefaultUSStackKMModeKey<T> {
  submenu: DefaultUSStackKMModeSubmenu<T>;
  constructor(keyString: DefaultUSStackKMModeKeyString, label: string, public submenuConfig: DefaultUSStackKMModeSubmenuConfig, mode: DefaultUSStackKMMode<T>) {
    super(keyString, label, mode);
    this.submenu = new DefaultUSStackKMModeSubmenu<T>(this.mode, this.submenuConfig)
  }
}
