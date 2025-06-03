import Konva from "konva";
import {KeyMenuSubmenu} from './thirtyKeyKM/keyMenuSubmenu';
import {KeyMenuLayer} from './keyMenuLayer';
import {KeyMenuMode} from './keyMenuMode';
import {KeyMenu} from "./keyMenu";

export abstract class StackKeyMenuMode<T> implements KeyMenuMode<T> {

  public readonly name: string;
  public readonly stack: KeyMenuSubmenu[] = [];
  public keyMenu: KeyMenu<T>;

  protected constructor(args: { name: string, keyMenu: KeyMenu<T>}) {
    this.name = args.name;
    this.keyMenu = args.keyMenu;
  }


  get stackTop() {
    return this.stack[this.stack.length - 1];
  }

  updateLayer(layer: KeyMenuLayer) {
    this.stackTop.updateLayer(layer);
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

