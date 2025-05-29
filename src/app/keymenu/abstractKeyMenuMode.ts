import Konva from "konva";
import {KeyMenuSubmenu} from './keyMenuSubmenu';
import {KeyMenuLayer} from './keyMenuLayer';
import {KeyMenuMode} from './keyMenuMode';
import { KeyMenu } from "./keyMenu";

export abstract class AbstractKeyMenuMode<T> implements KeyMenuMode<T> {

  public readonly name: string;
  public readonly stack: KeyMenuSubmenu[] = [];
  public keyMenu: KeyMenu<T>;

  constructor(args: { name: string, keyMenu: KeyMenu<T>}) {
    this.name = args.name;
    this.keyMenu = args.keyMenu;
  }


  get stackTop() {
    return this.stack[this.stack.length - 1];
  }

  updateLayer(layer: KeyMenuLayer) {
    const text = new Konva.Text({
      text: "Mode: " + this.name
    });

    layer.add(text);

    this.stackTop.updateLayer(layer);
  }

  handleKeyDown(event: KeyboardEvent) {
    this.stackTop.handleKeyDown(event)
  }

  handleKeyUp(event: KeyboardEvent) {
    this.stackTop.handleKeyUp(event);
  }
}
