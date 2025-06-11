import {DefaultUSStackKMMode} from "./defaultUSStackKMMode";
import {DefaultUSStackKMModeLabeledAction} from './defaultUSStackKMModeLabeledAction';
import {DefaultUSStackKMModeKeyString, DefaultUSStackKMModeSubmenuConfig} from './defaultUSStackKMModeSubmenuConfig';
import {Group} from 'konva/lib/Group';
import {DefaultUSStackKMModeLabeledSubmenuConfig} from './defaultUSStackKMModeLabeledSubmenuConfig';
import {DefaultUSStackKMModeKey} from './defaultUSStackKMModeKey';


export class DefaultUSStackKMModeSubmenu<T> {

  konvaGroup: Group;
  keys: { [K in DefaultUSStackKMModeKeyString]?: DefaultUSStackKMModeKey };

  constructor(public mode: DefaultUSStackKMMode<T>,
              public config: DefaultUSStackKMModeSubmenuConfig) {
    this.keys = this.generateKeys(this.config);
    this.konvaGroup = this.generateGroup(this.keys)
  }




  public static readonly KEY_WIDTH = 70;
  public static readonly KEY_HEIGHT = 70;
  public static readonly KEY_MARGIN = 5;
  public static readonly ROW_OFFSETS = [0, 10, 30];

  private static readonly rowsAndColsForKeys: { [K in DefaultUSStackKMModeKeyString]: { row: number; col: number } } =
    {
      'q': {row: 0, col: 0},
      'w': {row: 0, col: 1},
      'e': {row: 0, col: 2},
      'r': {row: 0, col: 3},
      't': {row: 0, col: 4},
      'y': {row: 0, col: 5},
      'u': {row: 0, col: 6},
      'i': {row: 0, col: 7},
      'o': {row: 0, col: 8},
      'p': {row: 0, col: 9},
      'a': {row: 1, col: 0},
      's': {row: 1, col: 1},
      'd': {row: 1, col: 2},
      'f': {row: 1, col: 3},
      'g': {row: 1, col: 4},
      'h': {row: 1, col: 5},
      'j': {row: 1, col: 6},
      'k': {row: 1, col: 7},
      'l': {row: 1, col: 8},
      ';': {row: 1, col: 9},
      'z': {row: 2, col: 0},
      'x': {row: 2, col: 1},
      'c': {row: 2, col: 2},
      'v': {row: 2, col: 3},
      'b': {row: 2, col: 4},
      'n': {row: 2, col: 5},
      'm': {row: 2, col: 6},
      ',': {row: 2, col: 7},
      '.': {row: 2, col: 8},
      '/': {row: 2, col: 9}
    }

  public static readonly xAndYForKeys: { [K in DefaultUSStackKMModeKeyString]: { x: number; y: number } } =
    Object.fromEntries(
      Object.entries(DefaultUSStackKMModeSubmenu.rowsAndColsForKeys).map(
        ([key, {row, col}]) =>
          [
            key,
            {
              x: col * (DefaultUSStackKMModeSubmenu.KEY_WIDTH + DefaultUSStackKMModeSubmenu.KEY_MARGIN)
                + DefaultUSStackKMModeSubmenu.ROW_OFFSETS[row],
              y: row * (DefaultUSStackKMModeSubmenu.KEY_HEIGHT + DefaultUSStackKMModeSubmenu.KEY_MARGIN)
            }
          ])
    ) as { [K in DefaultUSStackKMModeKeyString]: { x: number; y: number } };


  private generateLeafKey(key: DefaultUSStackKMModeKeyString, actionLabel: string): DefaultUSStackKMModeKey {
    return new DefaultUSStackKMModeKey(key, actionLabel);
  }

  private generateInnerKey(key: DefaultUSStackKMModeKeyString, submenuLabel: string): DefaultUSStackKMModeKey {
    return this.generateLeafKey(key, submenuLabel);
  }

  handleKeyUp(event: KeyboardEvent): void {
    console.log("event.key", event.key);
    const key = event.key as DefaultUSStackKMModeKeyString;
    if (!this.config[key]) {
      return;
    }

    this.unhighlightKey(key)
  }

  handleKeyDown(event: KeyboardEvent): void {
    console.log("event.key", event.key);
    const key = event.key as DefaultUSStackKMModeKeyString;
    if (!this.config[key]) {
      return;
    }

    this.highlightKey(key);
    if (this.config[key] instanceof DefaultUSStackKMModeLabeledAction) {
      const labeledAction = this.config[key];
      labeledAction.action();
    } else { // if this.config[key] instanceof LabeledDefaultUSKMSubmenuConfig
      const labeledDefaultUSKMSubmenuConfig = this.config[key];
      this.mode.pushSubmenu(labeledDefaultUSKMSubmenuConfig);
    }
  }

  highlightKey(keyStr: DefaultUSStackKMModeKeyString) {
    if (this.keys[keyStr]) {
      this.keys[keyStr].highlight = true;
    }
  }

  unhighlightKey(keyStr: DefaultUSStackKMModeKeyString) {
    if (this.keys[keyStr]) {
      this.keys[keyStr].highlight = false;
    }
  }

  private generateKeys(config: DefaultUSStackKMModeSubmenuConfig): { [K in DefaultUSStackKMModeKeyString]?: DefaultUSStackKMModeKey } {

    const keys: [DefaultUSStackKMModeKeyString, DefaultUSStackKMModeKey][] = [];

    (Object.entries(this.config) as
      [DefaultUSStackKMModeKeyString, DefaultUSStackKMModeLabeledAction | DefaultUSStackKMModeLabeledSubmenuConfig][])
      .forEach(([key, config])   => {
        if (config instanceof DefaultUSStackKMModeLabeledSubmenuConfig) {
          keys.push([key , this.generateInnerKey(key, config.submenuLabel)]);
        } else { //if config instanceof LabeledAction
          keys.push([key, this.generateLeafKey(key, config.actionLabel)]);
        }
      });

    return Object.fromEntries(keys);
  }

  private generateGroup(keys: { [K in DefaultUSStackKMModeKeyString]?: DefaultUSStackKMModeKey }) {
    const group = new Group()
    for (const v of Object.values(keys)) {
      group.add(v.konvaGroup);
    }
    return group;
  }

}
