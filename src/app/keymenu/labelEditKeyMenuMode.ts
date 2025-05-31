import {AbstractKeyMenuMode} from "../lib/keymenu/abstractKeyMenuMode";
import {DACommand} from "../drawing-area/command.model";
import {EventEmitter} from "@angular/core";
import {KeyMenu} from "../lib/keymenu/keyMenu";
import {KeyMenuLayer} from "../lib/keymenu/keyMenuLayer";
import Konva from "konva";
import {LabelEditModeRootSubmenu} from './labelEditModeRootSubmenu';

export class LabelEditKeyMenuMode extends AbstractKeyMenuMode<DACommand> {
  constructor(args: { keyMenuOut: EventEmitter<DACommand>, keyMenu: KeyMenu<DACommand> }) {
    super({name: "Label Edit", keyMenu: args.keyMenu});
    const labelEditRootSubmenu = new LabelEditModeRootSubmenu(args.keyMenuOut, this);
    this.stack.push(labelEditRootSubmenu);
  }

  override updateLayer(layer: KeyMenuLayer) {
    super.updateLayer(layer);
    layer.add(new Konva.Text({
      text: "Press Escape, or Ctrl-[, to exit label edit mode",
      x: 10,
      y: 20
    }));
  }
}
