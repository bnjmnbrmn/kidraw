import {DefaultUSStackKMMode} from "./defaultUSStackKMMode";
import {
  DefaultUSStackKMModeSubmenu
} from "./defaultUSStackKMModeSubmenu";
import {DACommand} from "../../../drawing-area/command.model";
import Konva from "konva";
import Group = Konva.Group;
import {DefaultUSStackKMModeLabeledSubmenuConfig} from './defaultUSStackKMModeLabeledSubmenuConfig';

export class DefaultUSStackKMModeGroupGenerator<T> {
  generateGroup(mode: DefaultUSStackKMMode<T>): Group {
    const group = new Group({});
    const rootSubmenu = mode.stack[0];
    group.add(this.generateSubmenuGroup(rootSubmenu));
    return group;
  }

  private generateSubmenuGroup(submenu: DefaultUSStackKMModeSubmenu<DACommand>): Group {
    const submenuGroup = new Group({});

    Object.entries(submenu.config).forEach(([key, config]) => {
      if (config instanceof DefaultUSStackKMModeLabeledSubmenuConfig) {
        submenuGroup.add(this.generateInnerKey(key, config.submenuLabel));
      } else { //if config instanceof LabeledAction
        submenuGroup.add(this.generateLeafKey(key, config.actionLabel));
      }
    });
    return submenuGroup;
  }

  public static readonly KEY_WIDTH = 70;
  public static readonly KEY_HEIGHT = 70;
  public static readonly KEY_MARGIN = 5;
  public static readonly ROW_OFFSETS = [0, 10, 30];

  private static readonly rowsAndColsForKeys: { [name: string]: { row: number; col: number } } =
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

  protected static readonly xAndYForKeys: { [name: string]: { x: number; y: number } } =
    Object.fromEntries(
      Object.entries(DefaultUSStackKMModeGroupGenerator.rowsAndColsForKeys).map(([key, {row, col}]) =>
        [
          key,
          {
            x: col * (DefaultUSStackKMModeGroupGenerator.KEY_WIDTH + DefaultUSStackKMModeGroupGenerator.KEY_MARGIN)
              + DefaultUSStackKMModeGroupGenerator.ROW_OFFSETS[row],
            y: row * (DefaultUSStackKMModeGroupGenerator.KEY_HEIGHT + DefaultUSStackKMModeGroupGenerator.KEY_MARGIN)
          }
        ])
    );


  private generateLeafKey(key: string, actionLabel: string): Group {
    const group = new Group({
      x: DefaultUSStackKMModeGroupGenerator.xAndYForKeys[key]!.x,
      y: DefaultUSStackKMModeGroupGenerator.xAndYForKeys[key]!.y
    });

    const keyRect = new Konva.Rect(
      {
        width: DefaultUSStackKMModeGroupGenerator.KEY_WIDTH,
        height: DefaultUSStackKMModeGroupGenerator.KEY_HEIGHT,
        stroke: 'black',
        fill: 'white',
      }
    );
    group.add(keyRect);
    const keyLabelText = new Konva.Text({
      text: actionLabel,
      width: DefaultUSStackKMModeGroupGenerator.KEY_WIDTH,
      height: 10,
      y: 4,
      align: 'center',
      verticalAlign: 'middle',
    });
    const keyLabelRect = new Konva.Rect({
      width: DefaultUSStackKMModeGroupGenerator.KEY_WIDTH,
      height: keyLabelText.height() + 10,
      fill: 'lightgreen',
      stroke: 'black',
    });
    group.add(keyLabelRect);
    group.add(keyLabelText)
    const actionLabelText = new Konva.Text({
      text: actionLabel,
      width: DefaultUSStackKMModeGroupGenerator.KEY_WIDTH - 10,
      height: DefaultUSStackKMModeGroupGenerator.KEY_HEIGHT + 20,
      align: 'center',
      verticalAlign: 'middle',
      x: 5
    });
    group.add(actionLabelText)

    return group;
  }

  private generateInnerKey(key: string, submenuLabel: string): Group {
    return this.generateLeafKey(key, submenuLabel);
  }
}
