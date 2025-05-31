import {AbstractKeyMenuMode} from "../lib/keymenu/abstractKeyMenuMode";
import {DACommand} from "../drawing-area/command.model";
import {EventEmitter} from "@angular/core";
import {KeyMenu} from "../lib/keymenu/keyMenu";
import {KeyMenuLayer} from "../lib/keymenu/keyMenuLayer";
import Konva from "konva";
import {SelectModeRootSubmenu} from './selectModeRootSubmenu';

export class SelectKeyMenuMode extends AbstractKeyMenuMode<DACommand> {
  private keyMenuOut: EventEmitter<DACommand>;

  constructor(args: { keyMenuOut: EventEmitter<DACommand>, keyMenu: KeyMenu<DACommand> }) {
    super({name: "Select", keyMenu: args.keyMenu});
    this.keyMenuOut = args.keyMenuOut;
    const selectModeRootSubmenu = new SelectModeRootSubmenu(args.keyMenuOut, this, 100, 100);
    this.stack.push(selectModeRootSubmenu);

  }

  override handleKeyDown(event: KeyboardEvent): void {
    this.stackTop.handleKeyDown(event)
  }

  override handleKeyUp(event: KeyboardEvent): void {
  }

  override updateLayer(layer: KeyMenuLayer): void {
    super.updateLayer(layer);
    layer.add(new Konva.Text({
      text: "Press h, j, k, l to move crosshairs, i to create new node, v to multi-item select, s to single-item toggle select, q to zoom out, w to zoom in, c to connect selected nodes",
      x: 10,
      y: 20
    }));


    this.stackTop.updateLayer(layer);


    const selectModeRootSubmenu = new SelectModeRootSubmenu(this.keyMenuOut, this, 100, 100);
    this.stack.push(selectModeRootSubmenu);


  }

}
