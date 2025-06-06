import {KeyMenuMode} from "./keyMenuMode";
import {KeyMenu} from "./keyMenu";
import {KeyMenuLayer} from "./keyMenuLayer";
import Konva from 'konva';

interface PrintedInstructionKeyMenuModeConfig {
  instructions: string;
}

export class PrintedInstructionKeyMenuMode<T> implements KeyMenuMode<T> {
  constructor(config: PrintedInstructionKeyMenuModeConfig) {
  }

  handleKeyDown(ke: KeyboardEvent): void {
  }

  handleKeyUp(event: KeyboardEvent): void {
  }
}
