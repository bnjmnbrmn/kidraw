import {KeyMenuMode} from "./keyMenuMode";
import {KeyMenu} from "./keyMenu";
import {KeyMenuLayer} from "./keyMenuLayer";
import Konva from 'konva';

export abstract class PrintedInstructionKeyMenuMode<T> implements KeyMenuMode<T> {
  public name: string;
  public keyMenu: KeyMenu<T>;
  private instruction: string;

  protected constructor(args: { name: string, keyMenu: KeyMenu<T>, instruction: string}) {
    this.name = args.name;
    this.keyMenu = args.keyMenu;
    this.instruction = args.instruction;
  }

  abstract handleKeyDown(ke: KeyboardEvent): void;

  abstract handleKeyUp(event: KeyboardEvent): void;

  updateLayer(layer: KeyMenuLayer): void {
    layer.add(new Konva.Text({
      text: this.instruction,
      x: 10,
      y: 20
    }))
  }
}
