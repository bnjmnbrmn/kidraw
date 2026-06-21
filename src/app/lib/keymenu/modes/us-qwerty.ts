import {KeyMenuMode} from '../keyMenuMode';
import {KMSubmenu} from '../keys/kmSubmenu';
import {KeyString, SubmenuConfig, KeyboardLayout} from '../layouts/us-qwerty';
import {getCardDimensions, CARD_PADDING} from '../rendering/cardRenderer';
import {Group} from 'konva/lib/Group';
import {KeyMenu} from '../keyMenu';
import {KMSubmenuKey} from '../keys/kmKey';
import {KeyMenuModeConfig} from "../keyMenuModeConfig";
import {ThemePalette} from '../../../services/theme.service';
import {VisualConfig, DEFAULT_VISUAL_CONFIG} from '../../../services/visual-config.model';
import Konva from 'konva';

type SlideOrigin = 'bottom' | 'top';

export class USQwertyModeConfig<T> implements KeyMenuModeConfig<T, USQwertyMode<T>> {

    constructor(public rootSubmenuConfig: SubmenuConfig,
                public palette?: ThemePalette,
                public hideFingerBlocked: boolean = false,
                public keyboardLayout?: KeyboardLayout,
                public capsLockSwap: boolean = false,
                public visualConfig: VisualConfig = DEFAULT_VISUAL_CONFIG) {}

    createMode(name: string, keyMenu: KeyMenu<T>): USQwertyMode<T> {
        return new USQwertyMode<T>(name, keyMenu, this);
    }
}


export class USQwertyMode<T> implements KeyMenuMode<T> {

    public readonly stack: KMSubmenu<T>[] = [];
    public konvaGroup: Group;
    actionSchedulingEnabled: boolean = true;
    private _helpModeActive: boolean = false;
    private palette?: ThemePalette;
    private hideFingerBlocked: boolean;
    private keyboardLayout?: KeyboardLayout;
    private capsLockSwap: boolean;
    private visualConfig: VisualConfig;
    private activeTweens: Map<KMSubmenu<T>, Konva.Tween> = new Map();
    private pendingDelays: Map<KMSubmenu<T>, number> = new Map();
    /** Track which direction each submenu slid in from, so slide-out reverses it. */
    private slideOrigins: Map<KMSubmenu<T>, SlideOrigin> = new Map();

    constructor(public name: string, public keyMenu: KeyMenu<T>,
                config: USQwertyModeConfig<T>) {
        this.konvaGroup = new Group();
        this.palette = config.palette;
        this.hideFingerBlocked = config.hideFingerBlocked;
        this.keyboardLayout = config.keyboardLayout;
        this.capsLockSwap = config.capsLockSwap;
        this.visualConfig = config.visualConfig;
        this.stack.push(new KMSubmenu(this, config.rootSubmenuConfig, 0, this.palette, [], this.hideFingerBlocked, this.keyboardLayout, this.capsLockSwap, this.visualConfig));
        this.stackTop.konvaGroup.show();
        const cardDims = getCardDimensions();
        this.konvaGroup.x((this.keyMenu.containingHTMLElement.offsetWidth - cardDims.width) / 2 + CARD_PADDING)
        this.konvaGroup.y((this.keyMenu.containingHTMLElement.offsetHeight - cardDims.height) / 2 + CARD_PADDING)
    }

    beforeSwitchOut(): void {
        this.cancelAllTweensAndReset();

        // Reset help mode
        if (this._helpModeActive) {
            this._helpModeActive = false;
            this.stackTop.helpModeActive = false;
            this.stackTop.hideHelpOverlay();
            this.stackTop.hideTooltip();
        }

        while (this.stack.length > 1) {
            this.stackTop.hideAllKeys();
            this.stackTop.unhighlightAllKeys();
            this.stackTop.stopAllScheduledActions();
            this.stack.pop();
        }
        this.submenuKeyStringStack.splice(1);
        this.slideOrigins.clear();
        this.stackTop.unhighlightAllKeys();
        this.stackTop.stopAllScheduledActions();
        this.actionSchedulingEnabled = false;
    }

    beforeSwitchIn(): void {
      this.actionSchedulingEnabled = true;
      this.stackTop.showAllKeys();
    }

    cancelInputState(): void {
        this.cancelAllTweensAndReset();
        this.stack.forEach((submenu) => {
            submenu.unhighlightAllKeys();
            submenu.stopAllScheduledActions();
        });
        while (this.stack.length > 1) {
            this.stackTop.hideAllKeys();
            this.stack.pop();
        }
        this.submenuKeyStringStack.splice(1);
        this.slideOrigins.clear();
        this.stackTop.showAllKeys();
    }


    get stackTop() {
        return this.stack[this.stack.length - 1];
    }

    get helpModeActive(): boolean {
        return this._helpModeActive;
    }

    set helpModeActive(value: boolean) {
        this._helpModeActive = value;
        this.stackTop.helpModeActive = value;
        if (value) {
            this.stackTop.showHelpOverlay();
        } else {
            this.stackTop.hideHelpOverlay();
            this.stackTop.hideTooltip();
        }
    }

    handleKeyDown(event: KeyboardEvent) {
        this.stackTop.handleKeyDown(event)
    }

    private static resolveKeyString(event: KeyboardEvent): KeyString {
        switch (event.code) {
            case 'ShiftRight': return 'RShift' as KeyString;
            case 'ControlRight': return 'RControl' as KeyString;
            case 'AltRight': return 'RAlt' as KeyString;
            default: {
                // Normalize uppercase letters (CapsLock or Shift) to lowercase
                const k = event.key;
                if (k.length === 1 && k >= 'A' && k <= 'Z') {
                    return k.toLowerCase() as KeyString;
                }
                return k as KeyString;
            }
        }
    }

    handleKeyUp(event: KeyboardEvent) {
        const key = USQwertyMode.resolveKeyString(event);
        this.stackTop.handleKeyUp(event);

        if (this.submenuKeyStringStack.includes(key) && this.stack.length > 1) {
            this.popSubmenuAndChildren(key);
            return;
        }

        // Pop submenu if:
        // 1. The key is not in the current submenu AND
        // 2. The key is in the submenu key string stack (meaning it was a submenu key) AND
        // 3. We're not at the root level
        if (!this.stackTop.keys[key] &&
            this.submenuKeyStringStack.includes(key) &&
            this.stack.length > 1) {
            this.popSubmenuAndChildren(key);
        }
    }

    submenuKeyStringStack: string[] = [""];

    pushSubmenu(submenuKey: KMSubmenuKey) {
        // Guard: if a mode switch happened during the action callback (beforeSwitchOut set
        // actionSchedulingEnabled to false), skip the push to avoid stale submenu state.
        if (!this.actionSchedulingEnabled) return;

        // Finish parent's animation instantly so the child doesn't wait
        this.finishTween(this.stackTop);

        const submenu = submenuKey.submenu as KMSubmenu<T>;
        submenu.helpModeActive = this._helpModeActive;
        this.stack.push(submenu);
        this.submenuKeyStringStack.push(submenuKey.keyString);

        this.slideIn(submenu, 'bottom');
    }

    replaceTopSubmenu(newConfig: SubmenuConfig) {
        if (this.stack.length <= 1) return;

        // Cancel tween on old submenu
        this.cancelTween(this.stackTop);
        this.stackTop.hideAllKeys();
        this.stackTop.stopAllScheduledActions();
        this.slideOrigins.delete(this.stackTop);
        this.stack.pop();

        const depth = this.stack.length;
        const heldKeys = this.submenuKeyStringStack.slice(1) as KeyString[];
        const newSubmenu = new KMSubmenu<T>(this, newConfig, depth, this.palette, heldKeys, this.hideFingerBlocked, this.keyboardLayout, this.capsLockSwap, this.visualConfig);
        this.stack.push(newSubmenu);
        this.slideIn(newSubmenu, 'top');
    }

    private slideIn(submenu: KMSubmenu<T>, origin: SlideOrigin) {
        const group = submenu.konvaGroup;
        const slideOffset = getCardDimensions().height;
        const yOffset = origin === 'bottom' ? slideOffset : -slideOffset;

        group.moveToTop();
        group.x(submenu.restingX);
        group.y(submenu.restingY + yOffset);
        group.show();

        this.cancelTween(submenu);
        this.cancelDelay(submenu);
        this.slideOrigins.set(submenu, origin);

        const slide = this.visualConfig.slideAnimation;
        const delayTimer = window.setTimeout(() => {
            this.pendingDelays.delete(submenu);
            const tween = new Konva.Tween({
                node: group,
                y: submenu.restingY,
                duration: slide.inDurationS,
                easing: Konva.Easings.StrongEaseIn,
                onFinish: () => {
                    this.activeTweens.delete(submenu);
                }
            });
            this.activeTweens.set(submenu, tween);
            tween.play();
        }, slide.delayMs);
        this.pendingDelays.set(submenu, delayTimer);
    }

    popSubmenuAndChildren(keyString: KeyString) {
        const index = this.submenuKeyStringStack.findIndex(
            (value) => keyString === value);

        if (index < 0) {
            return;
        }

        const submenusToRemove: KMSubmenu<T>[] = this.stack.slice(index);

        // Update the stack first so stackTop points to the new parent
        this.stack.splice(index);
        this.submenuKeyStringStack.splice(index);

        // Show parent card without moveToTop — it's already behind the departing cards
        this.stackTop.konvaGroup.show();
        this.stackTop.unhighlightAllKeys();

        submenusToRemove.forEach((submenu: KMSubmenu<T>) => {
            submenu.unhighlightAllKeys();
            submenu.stopAllScheduledActions();

            // Cancel any pending delay or existing tween
            this.cancelDelay(submenu);
            this.cancelTween(submenu);

            // Slide out in the direction it came from
            const origin = this.slideOrigins.get(submenu) ?? 'bottom';
            const slideOffset = getCardDimensions().height;
            const yOffset = origin === 'bottom' ? slideOffset : -slideOffset;

            const group = submenu.konvaGroup;
            const tween = new Konva.Tween({
                node: group,
                y: submenu.restingY + yOffset,
                duration: this.visualConfig.slideAnimation.outDurationS,
                easing: Konva.Easings.StrongEaseOut,
                onFinish: () => {
                    submenu.hideAllKeys();
                    group.x(submenu.restingX);
                    group.y(submenu.restingY);
                    this.activeTweens.delete(submenu);
                    this.slideOrigins.delete(submenu);
                }
            });
            this.activeTweens.set(submenu, tween);
            tween.play();
        });
    }

    /**
     * Cancel all active tweens, hiding and resetting each animated submenu
     * so no ghost cards remain.
     */
    cancelAllTweensAndReset() {
        this.pendingDelays.forEach((timer) => window.clearTimeout(timer));
        this.pendingDelays.clear();
        this.activeTweens.forEach((tween, submenu) => {
            tween.destroy();
            submenu.hideAllKeys();
            submenu.konvaGroup.x(submenu.restingX);
            submenu.konvaGroup.y(submenu.restingY);
        });
        this.activeTweens.clear();
        this.slideOrigins.clear();
    }

    private cancelTween(submenu: KMSubmenu<T>) {
        const existing = this.activeTweens.get(submenu);
        if (existing) {
            existing.destroy();
            this.activeTweens.delete(submenu);
        }
    }

    private finishTween(submenu: KMSubmenu<T>) {
        this.cancelDelay(submenu);
        const existing = this.activeTweens.get(submenu);
        if (existing) {
            existing.finish();
            this.activeTweens.delete(submenu);
        } else {
            // Delay hadn't fired yet — snap to resting position
            submenu.konvaGroup.y(submenu.restingY);
        }
    }

    private cancelDelay(submenu: KMSubmenu<T>) {
        const timer = this.pendingDelays.get(submenu);
        if (timer !== undefined) {
            window.clearTimeout(timer);
            this.pendingDelays.delete(submenu);
        }
    }
}
