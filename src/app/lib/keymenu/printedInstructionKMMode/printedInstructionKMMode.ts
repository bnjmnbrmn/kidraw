import {KeyMenuMode} from "../keyMenuMode";

interface PrintedInstructionKeyMenuModeConfig {
  instructions: string;
}

export class PrintedInstructionKMMode<T> implements KeyMenuMode<T> {
  constructor(config: PrintedInstructionKeyMenuModeConfig) {
  }

  handleKeyDown(ke: KeyboardEvent): void {
  }

  handleKeyUp(event: KeyboardEvent): void {
  }
}
