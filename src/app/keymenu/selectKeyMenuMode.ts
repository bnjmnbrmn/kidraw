import {StackKeyMenuMode} from "../lib/keymenu/stackKeyMenuMode";
import {DACommand} from "../drawing-area/command.model";
import {EventEmitter} from "@angular/core";
import {KeyMenu} from "../lib/keymenu/keyMenu";
import {KeyMenuLayer} from "../lib/keymenu/keyMenuLayer";
import Konva from "konva";
import {SelectModeRootSubmenu} from './selectModeRootSubmenu';

export class SelectKeyMenuMode extends StackKeyMenuMode<DACommand> {
  // private keyMenuOut: EventEmitter<DACommand>;

  constructor(args: { keyMenuOut: EventEmitter<DACommand>, keyMenu: KeyMenu<DACommand> }) {
    super({name: "Select", keyMenu: args.keyMenu});
    // this.keyMenuOut = args.keyMenuOut;
    const selectModeRootSubmenu = new SelectModeRootSubmenu(args.keyMenuOut, this, 50, 50);
    this.stack.push(selectModeRootSubmenu);

  }

}
