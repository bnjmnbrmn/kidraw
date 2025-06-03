import {KeyMenuLayer} from './keyMenuLayer';
import {KeyMenuMode} from './keyMenuMode';
import {EventEmitter} from '@angular/core';
import Konva from 'konva';

export class KeyMenu<T> {
  public layer: KeyMenuLayer;
  public modes: KeyMenuMode<T>[];
  protected currentMode: KeyMenuMode<T> | undefined;
  public keyMenuOut: EventEmitter<T>;

  constructor(args: { layer: KeyMenuLayer, keyMenuOut: EventEmitter<T> }) {
    this.layer = args.layer;
    this.modes = [];
    this.keyMenuOut = args.keyMenuOut;
  }

  updateLayer() {
    this.layer.children = [];
    this.layer.add(new Konva.Text({
      text: "Mode: " + this.currentMode?.name
    }));
    this.currentMode?.updateLayer(this.layer)
  }

  handleKeyDown(event: KeyboardEvent) {
    console.log("KeyMenu received " + event.key + " down")
    this.currentMode?.handleKeyDown(event)
  }

  handleKeyUp(event: KeyboardEvent) {
    console.log("KeyMenu received " + event.key + " up")
    this.currentMode?.handleKeyUp(event);
  }

  switchMode(modeName: string) {
    const keyMenuModes = this.modes.filter(mode => mode.name === modeName);
    if (keyMenuModes.length == 0) {
      console.warn("KeyMenu: no mode named " + modeName);
      return;
    }
    if (keyMenuModes.length > 1) {
      console.warn("KeyMenu: multiple modes named " + modeName);
      return;
    }

    keyMenuModes.forEach(mode => this.currentMode = mode);
    this.updateLayer();

  }

  public static noModifier(ke: KeyboardEvent) {
    return !ke.altKey && !ke.ctrlKey && !ke.shiftKey && !ke.metaKey;
  }
}
