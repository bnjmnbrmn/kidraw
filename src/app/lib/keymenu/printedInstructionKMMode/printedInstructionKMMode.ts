import { Group } from "konva/lib/Group";
import { KeyMenu } from "../keyMenu";
import {KeyMenuMode} from "../keyMenuMode";
import Konva from 'konva';

interface PrintedInstructionKeyMenuModeConfig {
  instructions: string;
}

export class PrintedInstructionKMMode<T> implements KeyMenuMode<T> {

  name?: string | undefined;
  keyMenu?: KeyMenu<T> | undefined;
  konvaGroup: Group;

  constructor(config: PrintedInstructionKeyMenuModeConfig) {
    this.konvaGroup = new Konva.Group();
  }

  handleKeyDown(ke: KeyboardEvent): void {
  }

  handleKeyUp(ke: KeyboardEvent): void {
  }
}
