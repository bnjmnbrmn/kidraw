import Konva from 'konva';
import { KeyString, SubmenuConfig, xAndYForKeys, KEY_WIDTH, KEY_HEIGHT, getKeyWidth } from '../layouts/us-qwerty';
import { USQwertyMode } from '../modes/us-qwerty';
import { KMSubmenu } from './kmSubmenu';
import { ThemePalette } from '../../../services/theme.service';
import { VisualConfig } from '../../../services/visual-config.model';

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

export function keyRenderStyleFromPalette(palette: ThemePalette, depth: number = 0): KeyRenderStyle {
  const i = Math.min(depth, palette.keyFills.length - 1);
  return {
    fillColor: palette.keyFills[i],
    strokeColor: palette.keyStrokes[i],
    labelFillColor: palette.keyLabelFills[i],
    labelTextColor: palette.keyLabelText,
    actionTextColor: palette.actionText,
    highlightShadowColor: palette.highlightShadowColor,
  };
}

// ========== Shared Key Rendering (Composition) ==========

export type KMKeyType = 'action' | 'submenu' | 'actionSubmenu';
export type KMKeyIndicator = 'repeat' | 'release' | 'none';

export interface KMKeyRenderConfig {
  keyString: KeyString;
  label: string;
  style?: KeyRenderStyle;
  keyType?: KMKeyType;
  indicator?: KMKeyIndicator;
  keyDisplayLabel?: string;
  keyWidth?: number;
}

const CORNER_RADIUS = 8;
const CHAMFER_SIZE = 12;

export function createKeyKonvaGroup(config: KMKeyRenderConfig): { konvaGroup: Konva.Group; keyRect: Konva.Rect } {
  const style = config.style ?? defaultKeyRenderStyle();
  const keyType = config.keyType ?? 'action';
  const w = config.keyWidth ?? KEY_WIDTH;

  const konvaGroup = new Konva.Group({
    x: xAndYForKeys[config.keyString]!.x,
    y: xAndYForKeys[config.keyString]!.y
  });

  const keyRect = new Konva.Rect({
    width: w,
    height: KEY_HEIGHT,
    stroke: style.strokeColor,
    fill: style.fillColor,
    shadowEnabled: false,
    shadowOffset: { x: 1, y: 1 },
    shadowColor: style.highlightShadowColor,
    // One corner radius for every key (da-477). Square corners used to mean
    // "opens a submenu and nothing else", but a 4px difference in radius is
    // not a legible way to say that — it read as two kinds of card with no
    // stated reason. The marks that carry meaning are the ones you can name:
    // a chamfered bottom-right corner means the key has children, and the
    // badge means the key repeats (↺) or fires when you let go (↑).
    cornerRadius: CORNER_RADIUS,
  });
  konvaGroup.add(keyRect);

  // Submenu indicator: chamfered (cut) corner bottom-right
  if (keyType === 'submenu' || keyType === 'actionSubmenu') {
    const chamfer = new Konva.Line({
      points: [
        w, KEY_HEIGHT - CHAMFER_SIZE,
        w - CHAMFER_SIZE, KEY_HEIGHT,
      ],
      stroke: style.strokeColor,
      strokeWidth: 2,
      listening: false,
    });
    // Fill the chamfer triangle to match the card background (covers the rounded corner area)
    const chamferFill = new Konva.Shape({
      sceneFunc: (ctx, shape) => {
        ctx.beginPath();
        ctx.moveTo(w, KEY_HEIGHT - CHAMFER_SIZE);
        ctx.lineTo(w - CHAMFER_SIZE, KEY_HEIGHT);
        ctx.lineTo(w, KEY_HEIGHT);
        ctx.closePath();
        ctx.fillStrokeShape(shape);
      },
      fill: style.strokeColor,
      opacity: 0.3,
      listening: false,
    });
    konvaGroup.add(chamferFill);
    konvaGroup.add(chamfer);
  }

  const keyLabelText = new Konva.Text({
    text: config.keyDisplayLabel ?? config.keyString,
    width: w,
    height: 10,
    y: 4,
    align: 'center',
    verticalAlign: 'middle',
    fill: style.labelTextColor,
  });

  const keyLabelRect = new Konva.Rect({
    width: w,
    height: keyLabelText.height() + 10,
    fill: style.labelFillColor,
    stroke: style.strokeColor,
    cornerRadius: [CORNER_RADIUS, CORNER_RADIUS, 0, 0],
  });
  konvaGroup.add(keyLabelRect);
  konvaGroup.add(keyLabelText);

  const actionLabelText = new Konva.Text({
    text: config.label,
    width: w - 10,
    height: KEY_HEIGHT + 20,
    align: 'center',
    verticalAlign: 'middle',
    x: 5,
    fill: style.actionTextColor,
  });
  konvaGroup.add(actionLabelText);

  // Indicator badge: repeat keeps its circular glyph; release is a drawn
  // lift arrow so it reads as a gesture rather than another piece of copy.
  const indicator = config.indicator ?? 'none';
  if (indicator === 'repeat') {
    const indicatorText = new Konva.Text({
      text: '↺',
      fontSize: 9,
      x: w - 14,
      y: KEY_HEIGHT - 14,
      fill: style.actionTextColor,
      opacity: 0.45,
      listening: false,
    });
    konvaGroup.add(indicatorText);
  } else if (indicator === 'release') {
    konvaGroup.add(new Konva.Arrow({
      name: 'key-release-indicator',
      points: [w - 11, KEY_HEIGHT - 6, w - 11, KEY_HEIGHT - 18],
      stroke: style.actionTextColor,
      fill: style.actionTextColor,
      strokeWidth: 1.5,
      pointerLength: 4,
      pointerWidth: 4,
      opacity: 0.55,
      listening: false,
    }));
  }

  return { konvaGroup, keyRect };
}

// ========== Default Implementations ==========

/**
 * Visual-only slot for a key held on the card underneath. It deliberately
 * paints no key cap: the upper card's matching hole leaves the original key
 * visible, while this outline and lift arrow explain what releasing it does.
 */
export class DefaultKMHeldKeyRelease<T> implements KMKey {
  readonly konvaGroup: Konva.Group;
  private readonly cueRect: Konva.Rect;
  private _highlight = true;

  constructor(
    public readonly keyString: KeyString,
    public readonly label: string,
    public readonly mode: USQwertyMode<T>,
    style?: KeyRenderStyle,
    keyWidth?: number,
  ) {
    const resolvedStyle = style ?? defaultKeyRenderStyle();
    const w = keyWidth ?? getKeyWidth(keyString);
    this.konvaGroup = new Konva.Group({
      x: xAndYForKeys[keyString]!.x,
      y: xAndYForKeys[keyString]!.y,
    });
    this.cueRect = new Konva.Rect({
      name: 'held-key-release-slot',
      x: -2,
      y: -2,
      width: w + 4,
      height: KEY_HEIGHT + 4,
      stroke: resolvedStyle.highlightShadowColor,
      strokeWidth: 2,
      dash: [5, 4],
      cornerRadius: CORNER_RADIUS + 2,
      shadowColor: resolvedStyle.highlightShadowColor,
      shadowBlur: 6,
      shadowOpacity: 0.6,
      listening: false,
    });
    this.konvaGroup.add(this.cueRect);
    this.konvaGroup.add(new Konva.Arrow({
      name: 'held-key-release-indicator',
      points: [w - 11, KEY_HEIGHT - 18, w - 11, KEY_HEIGHT - 32],
      stroke: resolvedStyle.highlightShadowColor,
      fill: resolvedStyle.highlightShadowColor,
      strokeWidth: 2,
      pointerLength: 5,
      pointerWidth: 5,
      listening: false,
    }));
  }

  get highlight(): boolean {
    return this._highlight;
  }

  set highlight(value: boolean) {
    this._highlight = value;
    this.cueRect.opacity(value ? 1 : 0.72);
  }
}

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
    indicator?: KMKeyIndicator,
    keyDisplayLabel?: string,
    keyWidth?: number,
  ) {
    const { konvaGroup, keyRect } = createKeyKonvaGroup({ keyString, label, style, keyType: 'action', indicator, keyDisplayLabel, keyWidth });
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
    heldKeyStrings?: KeyString[],
    hideFingerBlocked?: boolean,
    keyDisplayLabel?: string,
    keyboardLayout?: import('../layouts/us-qwerty').KeyboardLayout,
    keyWidth?: number,
    capsLockSwap?: boolean,
    visualConfig?: VisualConfig,
  ) {
    const { konvaGroup, keyRect } = createKeyKonvaGroup({ keyString, label, style, keyType: 'submenu', keyDisplayLabel, keyWidth });
    this.konvaGroup = konvaGroup;
    this.keyRect = keyRect;
    this.submenu = new KMSubmenu<T>(this.mode, submenuConfig, childDepth ?? 0, palette, heldKeyStrings ?? [keyString], hideFingerBlocked ?? false, keyboardLayout, capsLockSwap ?? false, visualConfig);
  }

  get highlight(): boolean {
    return this._highlight;
  }

  set highlight(value: boolean) {
    this._highlight = value;
    this.keyRect.shadowEnabled(this._highlight);
  }

  onKeyDown(): void {}
  onKeyDownBeforeRender(): void {}
  onKeyUp(): void {}
  onKeyUpBeforeRender(): void {}
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
    heldKeyStrings?: KeyString[],
    hideFingerBlocked?: boolean,
    keyDisplayLabel?: string,
    keyboardLayout?: import('../layouts/us-qwerty').KeyboardLayout,
    keyWidth?: number,
    capsLockSwap?: boolean,
    visualConfig?: VisualConfig,
  ) {
    // No badge. An action-submenu's action runs on key DOWN (it is passed as
    // _onKeyDown), and what it does varies: `v` acts at once, `a` arms a
    // gesture the drawing area resolves on release, and `r` only keeps the
    // crosshairs visible while held — pressing it does nothing you would
    // notice. One badge cannot say all three, and ↑ ("fires when you let go")
    // is false for every one of them. See notes/design-keymenu-card-marks.md.
    const { konvaGroup, keyRect } = createKeyKonvaGroup({ keyString, label, style, keyType: 'actionSubmenu', keyDisplayLabel, keyWidth });
    this.konvaGroup = konvaGroup;
    this.keyRect = keyRect;
    this.submenu = new KMSubmenu<T>(this.mode, submenuConfig, childDepth ?? 0, palette, heldKeyStrings ?? [keyString], hideFingerBlocked ?? false, keyboardLayout, capsLockSwap ?? false, visualConfig);
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
