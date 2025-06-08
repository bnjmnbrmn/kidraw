import {KeyMenuMode} from '../keyMenuMode';
import {
  DefaultUSStackKMModeSubmenu
} from './defaultUSStackKMModeSubmenu';
import {DefaultUSStackKMModeLabeledSubmenuConfig} from './defaultUSStackKMModeLabeledSubmenuConfig';
import {DefaultUSStackKMModeSubmenuConfig} from './defaultUSStackKMModeSubmenuConfig';


export type DefaultUSStackKMModeConfig = DefaultUSStackKMModeSubmenuConfig;

export class DefaultUSStackKMMode<T> implements KeyMenuMode<T> {

  public readonly stack: DefaultUSStackKMModeSubmenu<T>[] = [];

  constructor(config: DefaultUSStackKMModeConfig) {
    this.stack[0] = new DefaultUSStackKMModeSubmenu(this, config);
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

  highlightStackTopKey(key: keyof DefaultUSStackKMModeSubmenuConfig) {
    //todo
  }

  pushSubmenu(labeledDefaultUSKMSubmenuConfig: DefaultUSStackKMModeLabeledSubmenuConfig) {
    //todo

  }
}

