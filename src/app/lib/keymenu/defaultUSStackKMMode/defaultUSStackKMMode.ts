import {KeyMenuMode} from '../keyMenuMode';
import {
  DefaultUSStackKMModeSubmenu
} from './defaultUSStackKMModeSubmenu';
import {DefaultUSStackKMModeLabeledSubmenuConfig} from './defaultUSStackKMModeLabeledSubmenuConfig';
import {DefaultUSStackKMModeSubmenuConfig} from './defaultUSStackKMModeSubmenuConfig';
import {DACommand} from '../../../drawing-area/command.model';
import Konva from 'konva';
import { Group } from 'konva/lib/Group';
import { KeyMenu } from '../keyMenu';
import {DefaultUSStackKMModeInnerKey} from './defaultUSStackKMModeKey';


export type DefaultUSStackKMModeConfig = DefaultUSStackKMModeSubmenuConfig;

export class DefaultUSStackKMMode<T> implements KeyMenuMode<T> {

  public readonly stack: DefaultUSStackKMModeSubmenu<T>[] = [];
  public name?: string;
  public keyMenu?: KeyMenu<T>;
  public konvaGroup: Group;

  constructor(config: DefaultUSStackKMModeConfig) {
    this.stack[0] = new DefaultUSStackKMModeSubmenu(this, config);
    this.konvaGroup = this.generateKonvaGroup();
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

