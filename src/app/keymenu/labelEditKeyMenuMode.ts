import {DACommand, DACommandType} from "../drawing-area/command.model";
import {EventEmitter} from "@angular/core";
import {KeyMenu} from "../lib/keymenu/keyMenu";
import {PrintedInstructionKMMode} from '../lib/keymenu/printedInstructionKMMode';

export class LabelEditKeyMenuMode extends PrintedInstructionKMMode<DACommand> {
  // constructor(args: { keyMenuOut: EventEmitter<DACommand>; keyMenu: KeyMenu<DACommand>; parentWidth: number; parentHeight: number }) {
  //   super({name: "Label Edit", keyMenu: args.keyMenu,
  //     instruction: "Press Escape, or Ctrl-[, to exit label edit mode",
  //     parentWidth: args.parentWidth, parentHeight: args.parentHeight
  //
  //   });
  // }
  //
  // override handleKeyDown(ke: KeyboardEvent) {
  //   const key = ke.key;
  //   if (("Enter" === key && ke.shiftKey) || ("[" === key && ke.ctrlKey) || "Escape" === key) {
  //     this.keyMenu.keyMenuOut.emit({kind: DACommandType.EXIT_LABEL_EDIT_MODE});
  //     this.keyMenu.switchMode("Select");
  //   } else if (key.length === 1 && key.match(/^[\P{Cc}\P{Cn}\P{Cs}]+$/gu)) {
  //     this.keyMenu.keyMenuOut.emit({kind: DACommandType.INSERT_CHAR, value: key});
  //   } else if ("Enter" === key && KeyMenu.noModifier(ke)) {
  //     this.keyMenu.keyMenuOut.emit({kind: DACommandType.INSERT_CHAR, value: key});
  //   } else if (["Enter", "Tab"].includes(key) && KeyMenu.noModifier(ke)) {
  //     this.keyMenu.keyMenuOut.emit({kind: DACommandType.INSERT_CHAR, value: key});
  //   }
  // }
  //
  // override handleKeyUp(event: KeyboardEvent): void {
  // }

}
