import Konva from "konva";
import {KeyMenuSubmenu} from "../lib/keymenu/thirtyKeyKM/keyMenuSubmenu";
import {EventEmitter} from "@angular/core";
import {DACommand, DACommandType} from "../drawing-area/command.model";
import {KeyMenuMode} from "../lib/keymenu/keyMenuMode";
import {KeyMenuLayer} from "../lib/keymenu/keyMenuLayer";
import {KeyMenu} from "../lib/keymenu/keyMenu";

export class LabelEditModeRootSubmenu extends Konva.Group implements KeyMenuSubmenu {

  constructor(private keymenuOut: EventEmitter<DACommand>, private keyMenuMode: KeyMenuMode<DACommand>) {
    super();
  }

  updateLayer(layer: KeyMenuLayer): void {
  }


  handleKeyDown(ke: KeyboardEvent): void {
    const code = ke.code;

    console.log(`ke.code ${code}`);
    console.log('key is ' + ke.key)

    const key = ke.key;
    if (("Enter" === key && ke.shiftKey) || ("[" === key && ke.ctrlKey) || "Escape" === key) {
      this.keymenuOut.emit({kind: DACommandType.EXIT_LABEL_EDIT_MODE});
      this.keyMenuMode.keyMenu.switchMode("Select");
    } else if (key.length === 1 && key.match(/^[\P{Cc}\P{Cn}\P{Cs}]+$/gu)) {
      this.keymenuOut.emit({kind: DACommandType.INSERT_CHAR, value: key});
    } else if ("Enter" === key && KeyMenu.noModifier(ke)) {
      this.keymenuOut.emit({kind: DACommandType.INSERT_CHAR, value: key});
    } else if (["Enter", "Tab"].includes(key) && KeyMenu.noModifier(ke)) {
      this.keymenuOut.emit({kind: DACommandType.INSERT_CHAR, value: key});
    }

  }

  handleKeyUp(event: KeyboardEvent): void {
  }

}
