import {USQwertyMode} from "../modes/us-qwerty";
import {KeyString, SubmenuConfig, rowsAndColsForKeys, xAndYForKeys, KEY_WIDTH, KEY_HEIGHT, KEY_MARGIN, ROW_OFFSETS} from '../layouts/us-qwerty';
import {
  LabeledAction,
  LabeledActionSubmenuConfig,
  LabeledActionWithRelease,
  LabeledSubmenuConfig,
} from '../layouts/us-qwerty/submenuConfig';
import type {SubmenuConfigValue} from '../layouts/us-qwerty/submenuConfig';
import {Group} from 'konva/lib/Group';
import {
  KMKey,
  KMSubmenuKey,
  isActionKey,
  isSubmenuKey,
  DefaultKMActionKey,
  DefaultKMActionSubmenuKey,
  DefaultKMSubmenuKey,
  KeyRenderStyle,
  keyRenderStyleFromPalette,
} from './kmKey';
import {ThemePalette} from '../../../services/theme.service';
import {createCardBackground, createBlankKey, getBlankKeyPositions, getDepthOffset, CardRenderConfig} from '../rendering/cardRenderer';


export class KMSubmenu<T> {

  konvaGroup: Group;
  keys: { [K in KeyString]?: KMKey };
  actionSchedulingEnabled: boolean = true;
  /** The x position this card rests at (accounts for depth offset). */
  readonly restingX: number;

  constructor(public mode: USQwertyMode<T>,
              public config: SubmenuConfig,
              private depth: number = 0,
              private palette?: ThemePalette,
              private heldKeyStrings: KeyString[] = []) {
    const offset = palette ? getDepthOffset(depth) : { x: 0, y: 0 };
    this.restingX = offset.x;
    const style = palette ? keyRenderStyleFromPalette(palette, depth) : undefined;
    this.keys = this.generateKeys(this.config, style);
    this.konvaGroup = this.generateGroup(this.keys);
    this.mode.konvaGroup.add(this.konvaGroup);
    this.konvaGroup.hide();
  }


  private generateActionKey(keyString: KeyString, actionLabel: string, action: () => void, onKeyUp: () => void = () => {}, style?: KeyRenderStyle): KMKey {
    return new DefaultKMActionKey(keyString, actionLabel, this.mode, action, onKeyUp, () => {}, () => {}, style);
  }

  private generateSubmenuKey(keyString: KeyString, submenuLabel: string, submenuConfig: SubmenuConfig, style?: KeyRenderStyle): KMKey {
    return new DefaultKMSubmenuKey(keyString, submenuLabel, this.mode, submenuConfig, style, this.depth + 1, this.palette, [...this.heldKeyStrings, keyString]);
  }

  private generateActionSubmenuKey(
    keyString: KeyString,
    submenuLabel: string,
    submenuConfig: SubmenuConfig,
    action: () => void,
    style?: KeyRenderStyle,
  ): KMKey {
    return new DefaultKMActionSubmenuKey(keyString, submenuLabel, this.mode, submenuConfig, action, () => {}, () => {}, () => {}, style, this.depth + 1, this.palette, [...this.heldKeyStrings, keyString]);
  }

  handleKeyUp(event: KeyboardEvent): void {
    const key = event.key as KeyString;
    if (this.keys[key]) {
      this.unhighlightKey(key);
      const kmKey = this.keys[key]!;
      if (isActionKey(kmKey)) {
        kmKey.onKeyUpBeforeRender();
        kmKey.onKeyUp();
      }
    }
    if (this.scheduledActions.has(key)) {
      window.clearTimeout(this.scheduledActions.get(key));
      this.scheduledActions.delete(key);
    }
  }


  scheduledActions: Map<KeyString, number> = new Map();
  readonly subsequentDelayMS = 100;
  readonly initialDelayMS = 250;

  private scheduleAction(key: KeyString, action: { (): void }) {

    const timerAction = () => {
      action();
      const timerRef = window.setTimeout(timerAction, this.subsequentDelayMS);
      this.scheduledActions.set(key, timerRef)
    };
    const initialTimerRef = window.setTimeout(timerAction, this.initialDelayMS);
    this.scheduledActions.set(key, initialTimerRef);
  }

  handleKeyDown(event: KeyboardEvent): void {
    const key = event.key as KeyString;
    if (!this.keys[key]) {
      return;
    }

    // Ignore browser-level key repeat — the app manages its own repeat via scheduleAction
    if (event.repeat) {
      return;
    }

    this.highlightKey(key);
    const kmKey = this.keys[key]!;

    if (isActionKey(kmKey)) {
      kmKey.onKeyDownBeforeRender();
      kmKey.onKeyDown();

      if (!isSubmenuKey(kmKey) && this.mode.actionSchedulingEnabled) {
        this.scheduleAction(key, () => kmKey.onKeyDown());
      }
    }

    if (isSubmenuKey(kmKey)) {
      this.mode.pushSubmenu(kmKey);
    }
  }

  highlightKey(keyStr: KeyString) {
    if (this.keys[keyStr]) {
      this.keys[keyStr].highlight = true;
    }
  }

  unhighlightKey(keyStr: KeyString) {
    if (this.keys[keyStr]) {
      this.keys[keyStr].highlight = false;
    }
  }

  private generateKeys(config: SubmenuConfig, style?: KeyRenderStyle): { [K in KeyString]?: KMKey } {

    const keys: [KeyString, KMKey][] = [];

    (Object.entries(this.config) as
      [KeyString, SubmenuConfigValue][])
      .forEach(([key, config]) => {
        if (config instanceof LabeledSubmenuConfig) {
          keys.push([key, this.generateSubmenuKey(key, config.submenuLabel, config.submenuConfig, style)]);
        } else if (config instanceof LabeledActionSubmenuConfig) {
          keys.push([
            key,
            this.generateActionSubmenuKey(key, config.submenuLabel, config.submenuConfig, config.action, style),
          ]);
        } else if (config instanceof LabeledActionWithRelease) {
          keys.push([key, this.generateActionKey(key, config.actionLabel, config.action, config.onRelease, style)]);
        } else { //if config instanceof LabeledAction
          keys.push([key, this.generateActionKey(key, config.actionLabel, config.action, () => {}, style)]);
        }
      });

    return Object.fromEntries(keys);
  }

  private generateGroup(keys: { [K in KeyString]?: KMKey }) {
    const group = new Group();

    // If we have a palette, render as a card with background + blank keys + holes
    if (this.palette) {
      // Offset each depth level diagonally so the card stack is visible
      const offset = getDepthOffset(this.depth);
      group.x(offset.x);
      group.y(offset.y);

      const cardBg = createCardBackground({
        depth: this.depth,
        palette: this.palette,
        heldKeyStrings: this.heldKeyStrings,
      });
      group.add(cardBg);

      // Add blank keys for unbound positions
      const boundKeys = new Set(Object.keys(keys) as KeyString[]);
      const blankPositions = getBlankKeyPositions(boundKeys, this.heldKeyStrings);
      for (const keyString of blankPositions) {
        group.add(createBlankKey({ keyString, palette: this.palette }));
      }
    }

    // Add bound keys on top
    for (const v of Object.values(keys)) {
      if (v) {
        group.add(v.konvaGroup);
      }
    }
    return group;
  }

  showAllKeys() {
    this.konvaGroup.moveToTop();
    this.konvaGroup.show();
  }

  hideAllKeys() {
    this.konvaGroup.hide();
  }

  unhighlightAllKeys() {
    Object.values(this.keys).forEach((key) => {
      key.highlight = false;
    });

  }

  stopAllScheduledActions() {
    this.scheduledActions.forEach((value, key) => {
      window.clearTimeout(value);
    });
    this.scheduledActions.clear();
  }
}
