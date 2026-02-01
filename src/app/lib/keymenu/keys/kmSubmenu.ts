import {USQwertyMode} from "../modes/us-qwerty";
import {LabeledAction} from './labeledAction';
import {KeyString, SubmenuConfig, rowsAndColsForKeys, xAndYForKeys, KEY_WIDTH, KEY_HEIGHT, KEY_MARGIN, ROW_OFFSETS} from '../layouts/us-qwerty';
import {Group} from 'konva/lib/Group';
import {LabeledSubmenuConfig} from './labeledSubmenuConfig';
import {
  KMKey,
  KMSubmenuKey,
  isActionKey,
  isSubmenuKey,
  DefaultKMActionKey,
  DefaultKMSubmenuKey
} from './kmKey';


export class KMSubmenu<T> {

  konvaGroup: Group;
  keys: { [K in KeyString]?: KMKey };
  actionSchedulingEnabled: boolean = true;

  constructor(public mode: USQwertyMode<T>,
              public config: SubmenuConfig) {
    this.keys = this.generateKeys(this.config);
    this.konvaGroup = this.generateGroup(this.keys)
    // this.mode.keyMenu?.layer.add(this.konvaGroup)
    this.mode.konvaGroup.add(this.konvaGroup);
    this.konvaGroup.hide();
  }


  private generateActionKey(keyString: KeyString, actionLabel: string, action: () => void): KMKey {
    return new DefaultKMActionKey(keyString, actionLabel, this.mode, action);
  }

  private generateSubmenuKey(keyString: KeyString, submenuLabel: string, submenuConfig: SubmenuConfig): KMKey {
    return new DefaultKMSubmenuKey(keyString, submenuLabel, this.mode, submenuConfig);
  }

  handleKeyUp(event: KeyboardEvent): void {
    console.log("event.key", event.key);
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

    this.highlightKey(key);
    const kmKey = this.keys[key]!;
    
    // Check for submenu keys FIRST, before action keys
    if (isSubmenuKey(kmKey)) {
      this.mode.pushSubmenu(kmKey);
    }
    else if (isActionKey(kmKey)) {
      kmKey.onKeyDownBeforeRender();
      kmKey.onKeyDown();
      if (this.mode.actionSchedulingEnabled) {
        this.scheduleAction(key, () => kmKey.onKeyDown());
      }
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

  private generateKeys(config: SubmenuConfig): { [K in KeyString]?: KMKey } {

    const keys: [KeyString, KMKey][] = [];

    (Object.entries(this.config) as
      [KeyString, LabeledAction | LabeledSubmenuConfig][])
      .forEach(([key, config]) => {
        if (config instanceof LabeledSubmenuConfig) {
          keys.push([key, this.generateSubmenuKey(key, config.submenuLabel, config.submenuConfig)]);
        } else { //if config instanceof LabeledAction
          keys.push([key, this.generateActionKey(key, config.actionLabel, config.action)]);
        }
      });

    return Object.fromEntries(keys);
  }

  private generateGroup(keys: { [K in KeyString]?: KMKey }) {
    const group = new Group()
    for (const v of Object.values(keys)) {
      if (v) {
        group.add(v.konvaGroup);
      }
    }
    return group;
  }

  hideAllKeysExcept(submenuKey: KMSubmenuKey) {
    Object.values(this.keys).forEach((key) => {
      if (key && key.keyString !== submenuKey.keyString) {
        key.konvaGroup.hide();
      }
    });
  }

  showAllKeys() {
    Object.values(this.keys).forEach((key) => {
      key.konvaGroup.show();
    });
    this.konvaGroup.show();
  }

  hideAllKeys() {
    Object.values(this.keys).forEach((key) => {
      key.konvaGroup.hide();
    });
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
