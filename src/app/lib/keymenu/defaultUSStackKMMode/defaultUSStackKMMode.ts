import {KeyMenuMode} from '../keyMenuMode';
import {DefaultUSStackKMModeSubmenu} from './defaultUSStackKMModeSubmenu';
import {DefaultUSStackKMModeKeyString, DefaultUSStackKMModeSubmenuConfig} from './defaultUSStackKMModeSubmenuConfig';
import {Group} from 'konva/lib/Group';
import {KeyMenu} from '../keyMenu';
import {DefaultUSStackKMModeInnerKey} from './defaultUSStackKMModeKey';
import {KeyMenuModeConfig} from "../keyMenuModeConfig";


export class DefaultUSStackKMModeConfig<T> implements KeyMenuModeConfig<T, DefaultUSStackKMMode<T>> {

    constructor(public rootSubmenuConfig: DefaultUSStackKMModeSubmenuConfig) {}

    createMode(name: string, keyMenu: KeyMenu<T>): DefaultUSStackKMMode<T> {
        return new DefaultUSStackKMMode<T>(name, keyMenu, this);
    }
}


export class DefaultUSStackKMMode<T> implements KeyMenuMode<T> {

    public readonly stack: DefaultUSStackKMModeSubmenu<T>[] = [];
    public konvaGroup: Group;
    actionSchedulingEnabled: boolean = true;

    constructor(public name: string, public keyMenu: KeyMenu<T>,
                config: DefaultUSStackKMModeConfig<T>) {
        this.konvaGroup = new Group();
        this.stack.push(new DefaultUSStackKMModeSubmenu(this, config.rootSubmenuConfig));
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
        console.log(this.constructor.name + " received " + event.key + " down")
        this.stackTop.handleKeyDown(event)
    }

    handleKeyUp(event: KeyboardEvent) {
        console.log(this.constructor.name + " received " + event.key + " up")
        const key = event.key as DefaultUSStackKMModeKeyString;
        this.stackTop.handleKeyUp(event);
        if (this.stackTop.keys[key]) {
            return;
        }

        if (this.submenuKeyStringStack.includes(key)) {
            this.popSubmenuAndChildren(key);
        }
    }

    submenuKeyStringStack: string[] = [""];

    pushSubmenu(innerKey: DefaultUSStackKMModeInnerKey<T>) {
        this.stackTop.hideAllKeysExcept(innerKey);
        this.stack.push(innerKey.submenu)
        this.submenuKeyStringStack.push(innerKey.keyString);
        this.stackTop.showAllKeys();
    }



    popSubmenuAndChildren(keyString: DefaultUSStackKMModeKeyString) {
        const index = this.submenuKeyStringStack.findIndex(
            (value) => keyString === value);

        if (index < 0) {
            return;
        }

        const submenusToHide: DefaultUSStackKMModeSubmenu<T>[] = this.stack.slice(index);
        console.log("submenusToHide", submenusToHide);
        submenusToHide.forEach((submenu: DefaultUSStackKMModeSubmenu<T>) => {
            submenu.hideAllKeys();
            submenu.unhighlightAllKeys();
        });
        this.stack.splice(index);
        this.submenuKeyStringStack.splice(index);
        this.stackTop.showAllKeys();
        this.stackTop.unhighlightAllKeys();

    }
}

