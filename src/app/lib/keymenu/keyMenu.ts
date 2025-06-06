import {KeyMenuLayer} from './keyMenuLayer';
import {KeyMenuMode} from './keyMenuMode';
import {EventEmitter} from '@angular/core';
import Konva from 'konva';

export interface KeyMenuConfig<T> {
  containerId: string,
  containingHTMLElement: HTMLElement,
  modes: {[name: string]: KeyMenuMode<T>}
}

export class KeyMenu<T> {
  // public layer: KeyMenuLayer;
  // public modes: KeyMenuMode<T>[];
  // protected currentMode: KeyMenuMode<T> | undefined;
  // public keyMenuOut: EventEmitter<T>;
  // private width: number;
  // private height: number;

  constructor(config: KeyMenuConfig<T>) {
  }

  // updateLayer() {
  //   this.layer.children = [];
  //   this.layer.add(new Konva.Text({
  //     text: "Mode: " + this.currentMode?.name
  //   }));
  //   this.currentMode?.updateLayer(this.layer)
  // }

  handleKeyDown(event: KeyboardEvent) {
    console.log("KeyMenu received " + event.key + " down")
    // this.currentMode?.handleKeyDown(event)
  }

  handleKeyUp(event: KeyboardEvent) {
    console.log("KeyMenu received " + event.key + " up")
    // this.currentMode?.handleKeyUp(event);
  }

  switchMode(modeName: string) {
    // const keyMenuModes = this.modes.filter(mode => mode.name === modeName);
    // if (keyMenuModes.length == 0) {
    //   console.warn("KeyMenu: no mode named " + modeName);
    //   return;
    // }
    // if (keyMenuModes.length > 1) {
    //   console.warn("KeyMenu: multiple modes named " + modeName);
    //   return;
    // }
    //
    // keyMenuModes.forEach(mode => this.currentMode = mode);
    // this.updateLayer();
    //
  }

  public static noModifier(ke: KeyboardEvent) {
    return !ke.altKey && !ke.ctrlKey && !ke.shiftKey && !ke.metaKey;
  }
}
