import {KeyMenu} from "../lib/keymenu/keyMenu";
import {DACommand} from "../drawing-area/command.model";
import {KeyMenuLayer} from "../lib/keymenu/keyMenuLayer";
import {EventEmitter} from "@angular/core";
import {SelectKeyMenuMode} from './selectKeyMenuMode';
import {LabelEditKeyMenuMode} from './labelEditKeyMenuMode';

export class KiDrawKeyMenu extends KeyMenu<DACommand> {
  constructor(args: { layer: KeyMenuLayer, keyMenuOut: EventEmitter<DACommand> }) {
    super({layer: args.layer, keyMenuOut: args.keyMenuOut});
    this.modes.push(new SelectKeyMenuMode({keyMenuOut: this.keyMenuOut, keyMenu: this}));
    this.modes.push(new LabelEditKeyMenuMode({keyMenuOut: this.keyMenuOut, keyMenu: this}));
    this.currentMode = this.modes[0];
  }

}
