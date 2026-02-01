import Konva from 'konva';
import { KeyString, SubmenuConfig, xAndYForKeys, KEY_WIDTH, KEY_HEIGHT } from '../layouts/us-qwerty';
import { USQwertyMode } from '../modes/us-qwerty';
import { KMSubmenu } from './kmSubmenu';

// ========== Interfaces ==========

export interface KMKey {
  readonly keyString: KeyString;
  readonly label: string;
  readonly konvaGroup: Konva.Group;
  highlight: boolean;
}

export interface KMActionKey extends KMKey {
  onKeyDownBeforeRender(): void;
  onKeyDown(): void;
  onKeyUpBeforeRender(): void;
  onKeyUp(): void;
}

export interface KMSubmenuKey extends KMKey {
  readonly submenu: KMSubmenu<unknown>;
}

export interface KMActionSubmenuKey extends KMActionKey, KMSubmenuKey {}

// ========== Type Guards ==========

export function isActionKey(key: KMKey): key is KMActionKey {
  return 'onKeyDown' in key && typeof (key as KMActionKey).onKeyDown === 'function';
}

export function isSubmenuKey(key: KMKey): key is KMSubmenuKey {
  return 'submenu' in key;
}

export function isActionSubmenuKey(key: KMKey): key is KMActionSubmenuKey {
  return isActionKey(key) && isSubmenuKey(key);
}

// ========== Shared Key Rendering (Composition) ==========

export interface KMKeyRenderConfig {
  keyString: KeyString;
  label: string;
}

export function createKeyKonvaGroup(config: KMKeyRenderConfig): { konvaGroup: Konva.Group; keyRect: Konva.Rect } {
  const konvaGroup = new Konva.Group({
    x: xAndYForKeys[config.keyString]!.x,
    y: xAndYForKeys[config.keyString]!.y
  });

  const keyRect = new Konva.Rect({
    width: KEY_WIDTH,
    height: KEY_HEIGHT,
    stroke: 'black',
    fill: 'white',
    shadowEnabled: false,
    shadowOffset: { x: 1, y: 1 },
  });
  konvaGroup.add(keyRect);

  const keyLabelText = new Konva.Text({
    text: config.keyString,
    width: KEY_WIDTH,
    height: 10,
    y: 4,
    align: 'center',
    verticalAlign: 'middle',
  });

  const keyLabelRect = new Konva.Rect({
    width: KEY_WIDTH,
    height: keyLabelText.height() + 10,
    fill: 'lightgreen',
    stroke: 'black',
  });
  konvaGroup.add(keyLabelRect);
  konvaGroup.add(keyLabelText);

  const actionLabelText = new Konva.Text({
    text: config.label,
    width: KEY_WIDTH - 10,
    height: KEY_HEIGHT + 20,
    align: 'center',
    verticalAlign: 'middle',
    x: 5
  });
  konvaGroup.add(actionLabelText);

  return { konvaGroup, keyRect };
}

// ========== Default Implementations ==========

export class DefaultKMActionKey<T> implements KMActionKey {
  readonly konvaGroup: Konva.Group;
  private readonly keyRect: Konva.Rect;
  private _highlight: boolean = false;

  constructor(
    public readonly keyString: KeyString,
    public readonly label: string,
    public readonly mode: USQwertyMode<T>,
    private readonly _onKeyDown: () => void = () => {},
    private readonly _onKeyUp: () => void = () => {},
    private readonly _onKeyDownBeforeRender: () => void = () => {},
    private readonly _onKeyUpBeforeRender: () => void = () => {}
  ) {
    const { konvaGroup, keyRect } = createKeyKonvaGroup({ keyString, label });
    this.konvaGroup = konvaGroup;
    this.keyRect = keyRect;
  }

  get highlight(): boolean {
    return this._highlight;
  }

  set highlight(value: boolean) {
    this._highlight = value;
    this.keyRect.shadowEnabled(this._highlight);
  }

  onKeyDownBeforeRender(): void {
    this._onKeyDownBeforeRender();
  }

  onKeyDown(): void {
    this._onKeyDown();
  }

  onKeyUpBeforeRender(): void {
    this._onKeyUpBeforeRender();
  }

  onKeyUp(): void {
    this._onKeyUp();
  }
}

export class DefaultKMSubmenuKey<T> implements KMSubmenuKey {
  readonly konvaGroup: Konva.Group;
  private readonly keyRect: Konva.Rect;
  private _highlight: boolean = false;
  readonly submenu: KMSubmenu<T>;

  constructor(
    public readonly keyString: KeyString,
    public readonly label: string,
    public readonly mode: USQwertyMode<T>,
    submenuConfig: SubmenuConfig
  ) {
    const { konvaGroup, keyRect } = createKeyKonvaGroup({ keyString, label });
    this.konvaGroup = konvaGroup;
    this.keyRect = keyRect;
    this.submenu = new KMSubmenu<T>(this.mode, submenuConfig);
  }

  get highlight(): boolean {
    return this._highlight;
  }

  set highlight(value: boolean) {
    this._highlight = value;
    this.keyRect.shadowEnabled(this._highlight);
  }
}

export class DefaultKMActionSubmenuKey<T> implements KMActionSubmenuKey {
  readonly konvaGroup: Konva.Group;
  private readonly keyRect: Konva.Rect;
  private _highlight: boolean = false;
  readonly submenu: KMSubmenu<T>;

  constructor(
    public readonly keyString: KeyString,
    public readonly label: string,
    public readonly mode: USQwertyMode<T>,
    submenuConfig: SubmenuConfig,
    private readonly _onKeyDown: () => void = () => {},
    private readonly _onKeyUp: () => void = () => {},
    private readonly _onKeyDownBeforeRender: () => void = () => {},
    private readonly _onKeyUpBeforeRender: () => void = () => {}
  ) {
    const { konvaGroup, keyRect } = createKeyKonvaGroup({ keyString, label });
    this.konvaGroup = konvaGroup;
    this.keyRect = keyRect;
    this.submenu = new KMSubmenu<T>(this.mode, submenuConfig);
  }

  get highlight(): boolean {
    return this._highlight;
  }

  set highlight(value: boolean) {
    this._highlight = value;
    this.keyRect.shadowEnabled(this._highlight);
  }

  onKeyDownBeforeRender(): void {
    this._onKeyDownBeforeRender();
  }

  onKeyDown(): void {
    this._onKeyDown();
  }

  onKeyUpBeforeRender(): void {
    this._onKeyUpBeforeRender();
  }

  onKeyUp(): void {
    this._onKeyUp();
  }
}
