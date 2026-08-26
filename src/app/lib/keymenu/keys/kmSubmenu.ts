import {USQwertyMode} from "../modes/us-qwerty";
import {KeyString, SubmenuConfig, xAndYForKeys, KEY_WIDTH, KEY_HEIGHT, KEY_MARGIN, KeyboardLayout, getKeyDisplayLabel, getKeyWidth} from '../layouts/us-qwerty';
import {
  LabeledAction,
  LabeledActionSubmenuConfig,
  LabeledActionWithRelease,
  LabeledSubmenuConfig,
} from '../layouts/us-qwerty/submenuConfig';
import type {SubmenuConfigValue} from '../layouts/us-qwerty/submenuConfig';
import Konva from 'konva';
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
  KMKeyIndicator,
} from './kmKey';
import {ThemePalette} from '../../../services/theme.service';
import {VisualConfig, DEFAULT_VISUAL_CONFIG} from '../../../services/visual-config.model';
import {createCardBackground, createBlankKey, getBlankKeyPositions, getDepthOffset, CardRenderConfig, getCardDimensions, CARD_PADDING} from '../rendering/cardRenderer';


export class KMSubmenu<T> {

  konvaGroup: Group;
  keys: { [K in KeyString]?: KMKey };
  /** Keys whose LabeledAction opted out of held-key auto-repeat. */
  private noRepeatKeys = new Set<KeyString>();
  actionSchedulingEnabled: boolean = true;
  helpModeActive: boolean = false;
  /** The x/y positions this card rests at (accounts for depth offset). */
  readonly restingX: number;
  readonly restingY: number;
  private helpOverlay?: Konva.Rect;
  private activeTooltip?: Konva.Group;
  private tooltipTimer?: number;

  constructor(public mode: USQwertyMode<T>,
              public config: SubmenuConfig,
              private depth: number = 0,
              private palette?: ThemePalette,
              private heldKeyStrings: KeyString[] = [],
              private hideFingerBlocked: boolean = false,
              private keyboardLayout?: KeyboardLayout,
              private capsLockSwap: boolean = false,
              private visualConfig: VisualConfig = DEFAULT_VISUAL_CONFIG) {
    const offset = palette ? getDepthOffset(depth, visualConfig.cardDepth) : { x: 0, y: 0 };
    this.restingX = offset.x;
    this.restingY = offset.y;
    const style = palette ? keyRenderStyleFromPalette(palette, depth) : undefined;
    this.keys = this.generateKeys(this.config, style);
    this.konvaGroup = this.generateGroup(this.keys);
    this.mode.konvaGroup.add(this.konvaGroup);
    this.konvaGroup.hide();
  }


  private getDisplayLabel(keyString: KeyString): string | undefined {
    return this.keyboardLayout ? getKeyDisplayLabel(keyString, this.keyboardLayout, this.capsLockSwap) : undefined;
  }

  private generateActionKey(keyString: KeyString, actionLabel: string, action: () => void, onKeyUp: () => void = () => {}, style?: KeyRenderStyle, indicator?: KMKeyIndicator): KMKey {
    return new DefaultKMActionKey(keyString, actionLabel, this.mode, action, onKeyUp, () => {}, () => {}, style, indicator, this.getDisplayLabel(keyString), getKeyWidth(keyString));
  }

  private generateSubmenuKey(keyString: KeyString, submenuLabel: string, submenuConfig: SubmenuConfig, style?: KeyRenderStyle): KMKey {
    return new DefaultKMSubmenuKey(keyString, submenuLabel, this.mode, submenuConfig, style, this.depth + 1, this.palette, [...this.heldKeyStrings, keyString], this.hideFingerBlocked, this.getDisplayLabel(keyString), this.keyboardLayout, getKeyWidth(keyString), this.capsLockSwap, this.visualConfig);
  }

  private generateActionSubmenuKey(
    keyString: KeyString,
    submenuLabel: string,
    submenuConfig: SubmenuConfig,
    action: () => void,
    style?: KeyRenderStyle,
  ): KMKey {
    return new DefaultKMActionSubmenuKey(keyString, submenuLabel, this.mode, submenuConfig, action, () => {}, () => {}, () => {}, style, this.depth + 1, this.palette, [...this.heldKeyStrings, keyString], this.hideFingerBlocked, this.getDisplayLabel(keyString), this.keyboardLayout, getKeyWidth(keyString), this.capsLockSwap, this.visualConfig);
  }

  /**
   * Map a KeyboardEvent to the KeyString used in the submenu config.
   *
   * Handles two quirks:
   * 1. Shift held → browser sends uppercase letters ('H' instead of 'h');
   *    fall back to lowercase if uppercase has no binding.
   * 2. Right-side modifier keys share event.key with left-side ('Shift' for
   *    both); use event.code to resolve to 'RShift' / 'RControl' / 'RAlt'.
   */
  private static readonly CODE_TO_UNSHIFTED: Record<string, KeyString> = {
    'Digit1': '1' as KeyString, 'Digit2': '2' as KeyString, 'Digit3': '3' as KeyString,
    'Digit4': '4' as KeyString, 'Digit5': '5' as KeyString, 'Digit6': '6' as KeyString,
    'Digit7': '7' as KeyString, 'Digit8': '8' as KeyString, 'Digit9': '9' as KeyString,
    'Digit0': '0' as KeyString,
    'Minus': '-' as KeyString, 'Equal': '=' as KeyString,
    'BracketLeft': '[' as KeyString, 'BracketRight': ']' as KeyString,
    'Backslash': '\\' as KeyString, 'Semicolon': ';' as KeyString,
    'Quote': "'" as KeyString, 'Comma': ',' as KeyString,
    'Period': '.' as KeyString, 'Slash': '/' as KeyString,
    'Backquote': '`' as KeyString,
  };

  private resolveKey(event: KeyboardEvent): KeyString {
    // Right-side modifiers: prefer 'RShift'/'RControl'/'RAlt' if bound
    const codeToKeyString: Record<string, KeyString> = {
      'ShiftRight': 'RShift' as KeyString,
      'ControlRight': 'RControl' as KeyString,
      'AltRight': 'RAlt' as KeyString,
    };
    const rightKey = codeToKeyString[event.code];
    if (rightKey && this.keys[rightKey]) return rightKey;

    const key = event.key as KeyString;
    if (this.keys[key]) return key;

    // Uppercase letter fallback (Shift or CapsLock)
    if (event.key.length === 1 && event.key >= 'A' && event.key <= 'Z') {
      const lower = event.key.toLowerCase() as KeyString;
      if (this.keys[lower]) return lower;
    }

    // Shifted punctuation/number fallback: use event.code to find the unshifted key
    const unshifted = KMSubmenu.CODE_TO_UNSHIFTED[event.code];
    if (unshifted && this.keys[unshifted]) return unshifted;

    return key;
  }

  handleKeyUp(event: KeyboardEvent): void {
    const key = this.resolveKey(event);
    if (this.keys[key]) {
      this.unhighlightKey(key);
      const kmKey = this.keys[key]!;
      if (this.helpModeActive) {
        this.hideTooltip();
      } else if (isActionKey(kmKey)) {
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

  private get initialDelayMS(): number {
    return this.config._repeatConfig?.initialDelayMs ?? this.visualConfig.cursor.initialRepeatDelayMs;
  }

  private get subsequentDelayMS(): number {
    return this.config._repeatConfig?.intervalMs ?? this.visualConfig.cursor.repeatIntervalMs;
  }

  private get repeatEnabled(): boolean {
    return this.config._repeatConfig?.enabled !== false;
  }

  private scheduleAction(key: KeyString, action: { (): void }) {
    // Overwriting a map entry must not orphan a live timer chain — an orphaned
    // chain re-arms itself forever and no key-up can reach it.
    const existing = this.scheduledActions.get(key);
    if (existing !== undefined) {
      window.clearTimeout(existing);
    }

    // The configured interval is the PERIOD between repeats, not the pause
    // after each one finishes. Firing costs real time — a crosshair move is
    // tens of milliseconds of tweening and redrawing — and adding that to
    // the wait made the observed cadence always slower than the setting, and
    // barely responsive to it once the interval approached the work time
    // (da-347: 100ms configured measured 177ms; 10ms measured 112ms).
    // Subtracting the work keeps the period honest; it can still only
    // saturate at however long one repeat actually takes.
    const timerAction = () => {
      const started = performance.now();
      action();
      const wait = Math.max(0, this.subsequentDelayMS - (performance.now() - started));
      const timerRef = window.setTimeout(timerAction, wait);
      this.scheduledActions.set(key, timerRef)
    };
    const initialTimerRef = window.setTimeout(timerAction, this.initialDelayMS);
    this.scheduledActions.set(key, initialTimerRef);
  }

  handleKeyDown(event: KeyboardEvent): void {
    const key = this.resolveKey(event);
    if (!this.keys[key]) {
      return;
    }

    // Ignore browser-level key repeat — the app manages its own repeat via scheduleAction
    if (event.repeat) {
      return;
    }

    this.highlightKey(key);
    const kmKey = this.keys[key]!;

    if (this.helpModeActive) {
      // In help mode: show tooltip instead of firing actions
      if (isActionKey(kmKey) && !isSubmenuKey(kmKey)) {
        this.showTooltip(key, kmKey.label);
        return; // No action, no repeat
      }
      // Submenu navigation still works in help mode
      if (isSubmenuKey(kmKey)) {
        this.mode.pushSubmenu(kmKey);
        return;
      }
      return;
    }

    if (isActionKey(kmKey)) {
      kmKey.onKeyDownBeforeRender();
      kmKey.onKeyDown();

      if (!isSubmenuKey(kmKey) && this.mode.actionSchedulingEnabled &&
          this.repeatEnabled && !this.noRepeatKeys.has(key)) {
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
      .filter(([key]) => !key.startsWith('_'))
      .forEach(([key, config]) => {
        if (config instanceof LabeledSubmenuConfig) {
          keys.push([key, this.generateSubmenuKey(key, config.submenuLabel, config.submenuConfig, style)]);
        } else if (config instanceof LabeledActionSubmenuConfig) {
          keys.push([
            key,
            this.generateActionSubmenuKey(key, config.submenuLabel, config.submenuConfig, config.action, style),
          ]);
        } else if (config instanceof LabeledActionWithRelease) {
          keys.push([key, this.generateActionKey(key, config.actionLabel, config.action, config.onRelease, style, 'release')]);
        } else { //if config instanceof LabeledAction
          const repeats = this.config._repeatConfig?.enabled !== false && config.repeat;
          if (!repeats) this.noRepeatKeys.add(key);
          keys.push([key, this.generateActionKey(key, config.actionLabel, config.action, () => {}, style,
            repeats ? 'repeat' : 'none')]);
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

      const cardConfig: CardRenderConfig = {
        depth: this.depth,
        palette: this.palette,
        heldKeyStrings: this.heldKeyStrings,
        shadowConfig: this.visualConfig.cardShadow,
      };
      group.add(createCardBackground(cardConfig));

      // Add blank keys for unbound positions
      const boundKeys = new Set(Object.keys(keys) as KeyString[]);
      const blankPositions = getBlankKeyPositions(boundKeys, this.heldKeyStrings, this.hideFingerBlocked);
      for (const keyString of blankPositions) {
        group.add(createBlankKey({ keyString, palette: this.palette, keyboardLayout: this.keyboardLayout, capsLockSwap: this.capsLockSwap }));
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

  private showTooltip(keyString: KeyString, label: string): void {
    this.hideTooltip();
    const pos = xAndYForKeys[keyString];
    if (!pos) return;

    const padding = 6;
    const tooltipText = new Konva.Text({
      text: label,
      fontSize: 13,
      fontStyle: 'bold',
      x: padding,
      y: padding,
      fill: this.palette?.actionText ?? '#000',
    });

    const bg = new Konva.Rect({
      width: tooltipText.width() + padding * 2,
      height: tooltipText.height() + padding * 2,
      fill: this.palette?.cardBackgrounds[0] ?? '#fff',
      stroke: this.palette?.highlightShadowColor ?? '#38bdf8',
      strokeWidth: 2,
      cornerRadius: 4,
    });

    const group = new Konva.Group({
      x: pos.x,
      y: pos.y - bg.height() - 4,
    });
    group.add(bg);
    group.add(tooltipText);

    this.konvaGroup.add(group);
    this.activeTooltip = group;

    this.tooltipTimer = window.setTimeout(() => this.hideTooltip(), 2000);
  }

  hideTooltip(): void {
    if (this.tooltipTimer) {
      window.clearTimeout(this.tooltipTimer);
      this.tooltipTimer = undefined;
    }
    if (this.activeTooltip) {
      this.activeTooltip.destroy();
      this.activeTooltip = undefined;
    }
  }

  showHelpOverlay(): void {
    if (this.helpOverlay) return;
    const { width, height } = getCardDimensions();
    this.helpOverlay = new Konva.Rect({
      x: -CARD_PADDING,
      y: -CARD_PADDING,
      width: width,
      height: height,
      stroke: '#f59e0b', // amber-500
      strokeWidth: 3,
      fill: 'rgba(245, 158, 11, 0.06)',
      cornerRadius: 4,
      listening: false,
    });
    this.konvaGroup.add(this.helpOverlay);
  }

  hideHelpOverlay(): void {
    if (this.helpOverlay) {
      this.helpOverlay.destroy();
      this.helpOverlay = undefined;
    }
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
