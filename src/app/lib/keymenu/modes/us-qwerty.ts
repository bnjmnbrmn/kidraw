import {KeyMenuMode} from '../keyMenuMode';
import {KMSubmenu} from '../keys/kmSubmenu';
import {KeyString, SubmenuConfig} from '../layouts/us-qwerty';
import {Group} from 'konva/lib/Group';
import {KeyMenu} from '../keyMenu';
import {KMSubmenuKey} from '../keys/kmKey';
import {KeyMenuModeConfig} from "../keyMenuModeConfig";
import {ThemePalette} from '../../../services/theme.service';
import Konva from 'konva';


export class USQwertyModeConfig<T> implements KeyMenuModeConfig<T, USQwertyMode<T>> {

    constructor(public rootSubmenuConfig: SubmenuConfig,
                public palette?: ThemePalette) {}

    createMode(name: string, keyMenu: KeyMenu<T>): USQwertyMode<T> {
        return new USQwertyMode<T>(name, keyMenu, this);
    }
}


export class USQwertyMode<T> implements KeyMenuMode<T> {

    public readonly stack: KMSubmenu<T>[] = [];
    public konvaGroup: Group;
    actionSchedulingEnabled: boolean = true;
    private palette?: ThemePalette;
    private activeTweens: Map<KMSubmenu<T>, Konva.Tween> = new Map();

    private static readonly SLIDE_IN_DURATION = 0.25;  // seconds
    private static readonly SLIDE_OUT_DURATION = 0.15;
    private static readonly SLIDE_OFFSET = 300;        // pixels from right

    constructor(public name: string, public keyMenu: KeyMenu<T>,
                config: USQwertyModeConfig<T>) {
        this.konvaGroup = new Group();
        this.palette = config.palette;
        this.stack.push(new KMSubmenu(this, config.rootSubmenuConfig, 0, this.palette));
        this.stackTop.konvaGroup.show();
        this.konvaGroup.x((this.keyMenu.containingHTMLElement.offsetWidth - this.konvaGroup.getClientRect().width) / 2)
        this.konvaGroup.y(20)
    }

    beforeSwitchOut(): void {
        this.cancelAllTweensAndReset();

        while (this.stack.length > 1) {
            this.stackTop.hideAllKeys();
            this.stackTop.unhighlightAllKeys();
            this.stackTop.stopAllScheduledActions();
            this.stack.pop();
        }
        this.submenuKeyStringStack.splice(1);
        this.stackTop.unhighlightAllKeys();
        this.stackTop.stopAllScheduledActions();
        this.actionSchedulingEnabled = false;
    }

    beforeSwitchIn(): void {
      this.actionSchedulingEnabled = true;
      this.stackTop.showAllKeys();
    }


    get stackTop() {
        return this.stack[this.stack.length - 1];
    }

    handleKeyDown(event: KeyboardEvent) {
        this.stackTop.handleKeyDown(event)
    }

    handleKeyUp(event: KeyboardEvent) {
        const key = event.key as KeyString;
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
        const submenu = submenuKey.submenu as KMSubmenu<T>;
        this.stack.push(submenu);
        this.submenuKeyStringStack.push(submenuKey.keyString);

        this.slideIn(submenu);
    }

    replaceTopSubmenu(newConfig: SubmenuConfig) {
        if (this.stack.length <= 1) return;

        // Cancel tween on old submenu
        this.cancelTween(this.stackTop);
        this.stackTop.hideAllKeys();
        this.stackTop.stopAllScheduledActions();
        this.stack.pop();

        const depth = this.stack.length;
        const heldKeys = this.submenuKeyStringStack.slice(1) as KeyString[];
        const newSubmenu = new KMSubmenu<T>(this, newConfig, depth, this.palette, heldKeys);
        this.stack.push(newSubmenu);
        this.slideIn(newSubmenu);
    }

    private slideIn(submenu: KMSubmenu<T>) {
        const group = submenu.konvaGroup;
        group.moveToTop();
        group.x(submenu.restingX + USQwertyMode.SLIDE_OFFSET);
        group.opacity(0);
        group.show();

        this.cancelTween(submenu);

        const tween = new Konva.Tween({
            node: group,
            x: submenu.restingX,
            opacity: 1,
            duration: USQwertyMode.SLIDE_IN_DURATION,
            easing: Konva.Easings.EaseOut,
            onFinish: () => {
                this.activeTweens.delete(submenu);
            }
        });
        this.activeTweens.set(submenu, tween);
        tween.play();
    }

    popSubmenuAndChildren(keyString: KeyString) {
        const index = this.submenuKeyStringStack.findIndex(
            (value) => keyString === value);

        if (index < 0) {
            return;
        }

        const submenusToRemove: KMSubmenu<T>[] = this.stack.slice(index);
        submenusToRemove.forEach((submenu: KMSubmenu<T>) => {
            submenu.unhighlightAllKeys();
            submenu.stopAllScheduledActions();

            // Cancel any existing tween
            this.cancelTween(submenu);

            // Slide out to the right
            const group = submenu.konvaGroup;
            const tween = new Konva.Tween({
                node: group,
                x: submenu.restingX + USQwertyMode.SLIDE_OFFSET,
                opacity: 0,
                duration: USQwertyMode.SLIDE_OUT_DURATION,
                easing: Konva.Easings.EaseIn,
                onFinish: () => {
                    submenu.hideAllKeys();
                    group.x(submenu.restingX);
                    group.opacity(1);
                    this.activeTweens.delete(submenu);
                }
            });
            this.activeTweens.set(submenu, tween);
            tween.play();
        });

        this.stack.splice(index);
        this.submenuKeyStringStack.splice(index);
        this.stackTop.showAllKeys();
        this.stackTop.unhighlightAllKeys();
    }

    /**
     * Cancel all active tweens, hiding and resetting each animated submenu
     * so no ghost cards remain.
     */
    cancelAllTweensAndReset() {
        this.activeTweens.forEach((tween, submenu) => {
            tween.destroy();
            submenu.hideAllKeys();
            submenu.konvaGroup.x(submenu.restingX);
            submenu.konvaGroup.opacity(1);
        });
        this.activeTweens.clear();
    }

    private cancelTween(submenu: KMSubmenu<T>) {
        const existing = this.activeTweens.get(submenu);
        if (existing) {
            existing.destroy();
            this.activeTweens.delete(submenu);
        }
    }
}
