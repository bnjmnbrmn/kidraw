import Konva from "konva";
import {KeyMenuSubmenu} from './thirtyKeyKM/keyMenuSubmenu';
import {KeyMenuLayer} from './keyMenuLayer';
import {KeyMenuMode} from './keyMenuMode';
import {KeyMenu} from "./keyMenu";
import {DefaultUSKMSubmenuConfig} from './thirtyKeyKM/defaultUSKMSubmenu';


export interface DefaultUSStackKMModeConfig extends DefaultUSKMSubmenuConfig {
}

export class DefaultUSStackKMMode<T> implements KeyMenuMode<T> {

  public readonly stack: KeyMenuSubmenu[] = [];

  constructor(config: DefaultUSStackKMModeConfig) {
  }


  get stackTop() {
    return this.stack[this.stack.length - 1];
  }

  handleKeyDown(event: KeyboardEvent) {
    console.log("StackKeyMenuMode/"+ this.constructor.name + " received " + event.key + " down")
    this.stackTop.handleKeyDown(event)
  }

  handleKeyUp(event: KeyboardEvent) {
    console.log("StackKeyMenuMode/"+ this.constructor.name + " received " + event.key + " up")
    this.stackTop.handleKeyUp(event);
  }
}

