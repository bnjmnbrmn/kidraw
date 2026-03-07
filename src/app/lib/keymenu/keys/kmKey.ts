import Konva from 'konva';
import { KeyString, SubmenuConfig, xAndYForKeys, KEY_WIDTH, KEY_HEIGHT } from '../layouts/us-qwerty';
import { USQwertyMode } from '../modes/us-qwerty';
import { KMSubmenu } from './kmSubmenu';
import { ThemePalette } from '../../../services/theme.service';

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

// ========== Key Render Style ==========

export interface KeyRenderStyle {
  fillColor: string;
  strokeColor: string;
  labelFillColor: string;
  labelTextColor: string;
  actionTextColor: string;
  highlightShadowColor: string;
}

export function defaultKeyRenderStyle(): KeyRenderStyle {
  return {
    fillColor: 'white',
    strokeColor: 'black',
    labelFillColor: 'lightgreen',
    labelTextColor: 'black',
    actionTextColor: 'black',
    highlightShadowColor: 'black',
  };
}

export function keyRenderStyleFromPalette(palette: ThemePalette): KeyRenderStyle {
  return {
    fillColor: palette.keyFill,
    strokeColor: palette.keyStroke,
    labelFillColor: palette.keyLabelFill,
    labelTextColor: palette.keyLabelText,
    actionTextColor: palette.actionText,
    highlightShadowColor: palette.highlightShadowColor,
  };
}

// ========== Shared Key Rendering (Composition) ==========

export interface KMKeyRenderConfig {
  keyString: KeyString;
  label: string;
  style?: KeyRenderStyle;
}

export function createKeyKonvaGroup(config: KMKeyRenderConfig): { konvaGroup: Konva.Group; keyRect: Konva.Rect } {
  const style = config.style ?? defaultKeyRenderStyle();

  const konvaGroup = new Konva.Group({
    x: xAndYForKeys[config.keyString]!.x,
    y: xAndYForKeys[config.keyString]!.y
  });

  const keyRect = new Konva.Rect({
    width: KEY_WIDTH,
    height: KEY_HEIGHT,
    stroke: style.strokeColor,
    fill: style.fillColor,
    shadowEnabled: false,
    shadowOffset: { x: 1, y: 1 },
    shadowColor: style.highlightShadowColor,
  });
  konvaGroup.add(keyRect);

  const keyLabelText = new Konva.Text({
    text: config.keyString,
    width: KEY_WIDTH,
    height: 10,
    y: 4,
    align: 'center',
    verticalAlign: 'middle',
    fill: style.labelTextColor,
  });

  const keyLabelRect = new Konva.Rect({
    width: KEY_WIDTH,
    height: keyLabelText.height() + 10,
    fill: style.labelFillColor,
    stroke: style.strokeColor,
  });
  konvaGroup.add(keyLabelRect);
  konvaGroup.add(keyLabelText);

  const actionLabelText = new Konva.Text({
    text: config.label,
    width: KEY_WIDTH - 10,
    height: KEY_HEIGHT + 20,
    align: 'center',
    verticalAlign: 'middle',
    x: 5,
    fill: style.actionTextColor,
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
    private readonly _onKeyUpBeforeRender: () => void = () => {},
    style?: KeyRenderStyle,
  ) {
    const { konvaGroup, keyRect } = createKeyKonvaGroup({ keyString, label, style });
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
    submenuConfig: SubmenuConfig,
    style?: KeyRenderStyle,
    childDepth?: number,
    palette?: ThemePalette,
  ) {
    const { konvaGroup, keyRect } = createKeyKonvaGroup({ keyString, label, style });
    this.konvaGroup = konvaGroup;
    this.keyRect = keyRect;
    this.submenu = new KMSubmenu<T>(this.mode, submenuConfig, childDepth ?? 0, palette, keyString);
  }

  get highlight(): boolean {
    return this._highlight;
  }

  set highlight(value: boolean) {
    this._highlight = value;
    this.keyRect.shadowEnabled(this._highlight);
  }

  onKeyDown(): void {
    // Submenu key pressed - this is handled by KMSubmenu.handleKeyDown
    // which calls mode.pushSubmenu(this)
  }

  onKeyDownBeforeRender(): void {
    // Can be used for pre-render logic if needed
  }

  onKeyUp(): void {
    // Submenu key released
  }

  onKeyUpBeforeRender(): void {
    // Can be used for pre-render logic if needed
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
    private readonly _onKeyUpBeforeRender: () => void = () => {},
    style?: KeyRenderStyle,
    childDepth?: number,
    palette?: ThemePalette,
  ) {
    const { konvaGroup, keyRect } = createKeyKonvaGroup({ keyString, label, style });
    this.konvaGroup = konvaGroup;
    this.keyRect = keyRect;
    this.submenu = new KMSubmenu<T>(this.mode, submenuConfig, childDepth ?? 0, palette, keyString);
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
