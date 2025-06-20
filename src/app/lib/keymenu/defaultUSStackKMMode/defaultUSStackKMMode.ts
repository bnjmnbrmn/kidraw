import {KeyMenuMode} from '../keyMenuMode';
import {DefaultUSStackKMModeSubmenu} from './defaultUSStackKMModeSubmenu';
import {DefaultUSStackKMModeSubmenuConfig} from './defaultUSStackKMModeSubmenuConfig';
import {Group} from 'konva/lib/Group';
import {KeyMenu} from '../keyMenu';
import {DefaultUSStackKMModeInnerKey} from './defaultUSStackKMModeKey';
import {KeyMenuModeConfig} from "../keyMenuModeConfig";


// export type DefaultUSStackKMModeConfig = DefaultUSStackKMModeSubmenuConfig;

export class DefaultUSStackKMModeConfig<T> implements KeyMenuModeConfig<T, DefaultUSStackKMMode<T>> {

    constructor(public rootSubmenuConfig: DefaultUSStackKMModeSubmenuConfig) {}

    createMode(name: string, keyMenu: KeyMenu<T>): DefaultUSStackKMMode<T> {
        return new DefaultUSStackKMMode<T>(name, keyMenu, this);
    }
}


export class DefaultUSStackKMMode<T> implements KeyMenuMode<T> {

    public readonly stack: DefaultUSStackKMModeSubmenu<T>[] = [];
    public konvaGroup: Group;

    constructor(public name: string, public keyMenu: KeyMenu<T>,
                config: DefaultUSStackKMModeConfig<T>) {
        this.konvaGroup = new Group();
        this.stack.push(new DefaultUSStackKMModeSubmenu(this, config.rootSubmenuConfig));
        this.stackTop.konvaGroup.show();
        console.log(this.konvaGroup.getClientRect());
        this.konvaGroup.x((this.keyMenu.containingHTMLElement.offsetWidth - this.konvaGroup.getClientRect().width) / 2)
        this.konvaGroup.y(20)
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
        this.stackTop.handleKeyUp(event);
    }


    pushSubmenu(innerKey: DefaultUSStackKMModeInnerKey<T>) {
        this.stackTop.hideAllKeysExcept(innerKey);
        this.stack.push(innerKey.submenu)
        this.stackTop.showAllKeys();
    }


    private generateKonvaGroup(): Group {
        const group = new Group({});
        const rootSubmenu = this.stack[0];
        group.add(rootSubmenu.konvaGroup);
        return group;
    }


    popSubmenu(innerKey: DefaultUSStackKMModeInnerKey<T>) {
        //todo
    }
}

