import {KeyMenuMode} from '../keyMenuMode';
import {KMSubmenu} from '../keys/kmSubmenu';
import {KeyString, SubmenuConfig} from '../layouts/us-qwerty';
import {Group} from 'konva/lib/Group';
import {KeyMenu} from '../keyMenu';
import {KMSubmenuKey} from '../keys/kmKey';
import {KeyMenuModeConfig} from "../keyMenuModeConfig";


export class USQwertyModeConfig<T> implements KeyMenuModeConfig<T, USQwertyMode<T>> {

    constructor(public rootSubmenuConfig: SubmenuConfig) {}

    createMode(name: string, keyMenu: KeyMenu<T>): USQwertyMode<T> {
        return new USQwertyMode<T>(name, keyMenu, this);
    }
}


export class USQwertyMode<T> implements KeyMenuMode<T> {

    public readonly stack: KMSubmenu<T>[] = [];
    public konvaGroup: Group;
    actionSchedulingEnabled: boolean = true;

    constructor(public name: string, public keyMenu: KeyMenu<T>,
                config: USQwertyModeConfig<T>) {
        this.konvaGroup = new Group();
        this.stack.push(new KMSubmenu(this, config.rootSubmenuConfig));
        this.stackTop.konvaGroup.show();
        this.konvaGroup.x((this.keyMenu.containingHTMLElement.offsetWidth - this.konvaGroup.getClientRect().width) / 2)
        this.konvaGroup.y(20)
    }

    beforeSwitchOut(): void {
        while (this.stack.length > 1) {
            this.stackTop.unhighlightAllKeys();
            this.stackTop.stopAllScheduledActions();
            this.stack.pop();
        }
        this.stackTop.unhighlightAllKeys();
        this.stackTop.stopAllScheduledActions();
        this.actionSchedulingEnabled = false;
    }

    beforeSwitchIn(): void {
      this.actionSchedulingEnabled = true;
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
        if (this.stackTop.keys[key]) {
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
        this.stackTop.hideAllKeysExcept(submenuKey);
        this.stack.push(submenuKey.submenu as KMSubmenu<T>);
        this.submenuKeyStringStack.push(submenuKey.keyString);
        this.stackTop.showAllKeys();
    }



    popSubmenuAndChildren(keyString: KeyString) {
        const index = this.submenuKeyStringStack.findIndex(
            (value) => keyString === value);

        if (index < 0) {
            return;
        }

        const submenusToHide: KMSubmenu<T>[] = this.stack.slice(index);
        console.log("submenusToHide", submenusToHide);
        submenusToHide.forEach((submenu: KMSubmenu<T>) => {
            submenu.hideAllKeys();
            submenu.unhighlightAllKeys();
        });
        this.stack.splice(index);
        this.submenuKeyStringStack.splice(index);
        this.stackTop.showAllKeys();
        this.stackTop.unhighlightAllKeys();

    }
}

