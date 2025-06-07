import {Stage} from 'konva/lib/Stage';
import {KeyMenuLayer} from './keyMenuLayer';
import {KeyMenuMode} from './keyMenuMode';
import {EventEmitter} from '@angular/core';
import Konva from 'konva';
import {Layer} from 'konva/lib/Layer';
import {DefaultUSStackKMMode} from './defaultUSStackKMMode';
import Group = Konva.Group;
import {PrintedInstructionKMMode} from './printedInstructionKMMode';
import {KeyMenuSubmenu} from './thirtyKeyKM/keyMenuSubmenu';
import {DefaultUSKMSubmenu, LabeledAction, LabeledDefaultUSKMSubmenuConfig} from './thirtyKeyKM/defaultUSKMSubmenu';
import {DisplayableKey} from './thirtyKeyKM/displayableKey';

export interface KeyMenuConfig<T> {
  containerId: string,
  containingHTMLElement: HTMLElement,
  modes: { [name: string]: KeyMenuMode<T> }
}

class DefaultUSStackKMModeGroupGenerator<T> {
  generateGroup(mode: DefaultUSStackKMMode<T>): Group {
    const group = new Group({});
    const rootSubmenu = mode.stack[0];
    group.add(this.generateSubmenuGroup(rootSubmenu));
    return group;
  }

  private generateSubmenuGroup(submenu: DefaultUSKMSubmenu): Group {
    const submenuGroup = new Group({});

    Object.entries(submenu.config).forEach(([key, config]) => {
      if (config instanceof LabeledDefaultUSKMSubmenuConfig) {
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

  private static readonly rowsAndColsForDisplayableKeys: Map<string, { row: number; col: number }> =
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

  protected static readonly xAndYForDisplayableKeys: Map<string, { x: number; y: number }> =
    new Map(Array.from(this.rowsAndColsForDisplayableKeys.entries())
      .map(([dk, {row, col}]) =>
        [dk, {
          x: col * (DefaultUSStackKMModeGroupGenerator.KEY_WIDTH + DefaultUSStackKMModeGroupGenerator.KEY_MARGIN)
            + DefaultUSStackKMModeGroupGenerator.ROW_OFFSETS[row],
          y: row * (DefaultUSStackKMModeGroupGenerator.KEY_HEIGHT + DefaultUSStackKMModeGroupGenerator.KEY_MARGIN)
        }])
    );

  private generateLeafKey(key: string, actionLabel: string): Group {
    const group = new Group({
      x: DefaultUSStackKMModeGroupGenerator.xAndYForDisplayableKeys.get(key)!.x,
      y: DefaultUSStackKMModeGroupGenerator.xAndYForDisplayableKeys.get(key)!.y
    });

    return group;
  }

  private generateInnerKey(key: string, submenuLabel: string): Group {
    return new Group({});
  }
}

class PrintedInstructionKMModeGroupGenerator<T> {
  generateGroup(mode: PrintedInstructionKMMode<T>): Group {
    return new Group({});
  }
}

export class KeyMenu<T> {
  // public layer: KeyMenuLayer;
  // public modes: KeyMenuMode<T>[];
  // protected currentMode: KeyMenuMode<T> | undefined;
  // public keyMenuOut: EventEmitter<T>;
  // private width: number;
  // private height: number;
  private stage: Stage;
  private containingHTMLElement: HTMLElement;
  private containerId: string;
  private modes: { [p: string]: KeyMenuMode<T> };
  private currentMode: KeyMenuMode<T>;
  private layer: Layer;
  private currentModeGroup: Group;

  private modeGroupMap: Map<KeyMenuMode<T>, Group> = new Map();


  constructor(config: KeyMenuConfig<T>) {
    this.containingHTMLElement = config.containingHTMLElement;
    this.containerId = config.containerId;
    this.stage = new Stage({
      container: this.containerId,
      width: this.containingHTMLElement.clientWidth,
      height: this.containingHTMLElement.clientHeight
    });
    this.stage.container().style.backgroundColor = 'lightgray'
    this.layer = new Layer({});
    this.stage.add(this.layer);

    this.modes = config.modes;
    this.currentMode = this.modes[0];

    for (const modeName in this.modes) {
      this.modeGroupMap.set(this.modes[modeName], this.toGroup(this.modes[modeName]));
    }

    this.currentModeGroup = this.modeGroupMap.get(this.currentMode)!;

    this.layer.add(this.currentModeGroup);
  }

  // updateLayer() {
  //   this.layer.children = [];
  //   this.layer.add(new Konva.Text({
  //     text: "Mode: " + this.currentMode?.name
  //   }));
  //   this.currentMode?.updateLayer(this.layer)
  // }

  handleKeyDown(event: KeyboardEvent) {
    console.log("KeyMenu received " + event.key + " down")
    // this.currentMode?.handleKeyDown(event)
  }

  handleKeyUp(event: KeyboardEvent) {
    console.log("KeyMenu received " + event.key + " up")
    // this.currentMode?.handleKeyUp(event);
  }

  switchMode(modeName: string) {
    // const keyMenuModes = this.modes.filter(mode => mode.name === modeName);
    // if (keyMenuModes.length == 0) {
    //   console.warn("KeyMenu: no mode named " + modeName);
    //   return;
    // }
    // if (keyMenuModes.length > 1) {
    //   console.warn("KeyMenu: multiple modes named " + modeName);
    //   return;
    // }
    //
    // keyMenuModes.forEach(mode => this.currentMode = mode);
    // this.updateLayer();
    //
  }

  public static noModifier(ke: KeyboardEvent) {
    return !ke.altKey && !ke.ctrlKey && !ke.shiftKey && !ke.metaKey;
  }

  private toGroup(mode: KeyMenuMode<T>): Group {
    if (mode instanceof DefaultUSStackKMMode) {
      return new DefaultUSStackKMModeGroupGenerator().generateGroup(mode);
    } else if (mode instanceof PrintedInstructionKMMode) {
      return new PrintedInstructionKMModeGroupGenerator().generateGroup(mode);
    }
    const modeClass = mode.constructor.name;
    throw new Error("Unknown mode class " + modeClass);

  }
}
