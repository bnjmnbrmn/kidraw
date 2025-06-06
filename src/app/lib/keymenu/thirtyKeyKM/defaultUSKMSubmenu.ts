import Konva from "konva";
import {KeyMenuSubmenu} from "./keyMenuSubmenu";
import {KeyMenuLayer} from "../keyMenuLayer";

import {KMKeyConfig} from './KMKeyConfig';
import {KMKey} from './KMKey';


export class LabeledAction {
  actionLabel: string;
  action: () => void;

  constructor(actionLabel: string, action: () => void) {
    this.actionLabel = actionLabel;
    this.action = action;
  }
}

export interface DefaultUSKMSubmenuConfig {
  q: LabeledAction | DefaultUSKMSubmenu,
  w: LabeledAction | DefaultUSKMSubmenu,
  e: LabeledAction | DefaultUSKMSubmenu,
  r: LabeledAction | DefaultUSKMSubmenu,
  t: LabeledAction | DefaultUSKMSubmenu,
  y: LabeledAction | DefaultUSKMSubmenu,
  u: LabeledAction | DefaultUSKMSubmenu,
  i: LabeledAction | DefaultUSKMSubmenu,
  o: LabeledAction | DefaultUSKMSubmenu,
  p: LabeledAction | DefaultUSKMSubmenu,
  a: LabeledAction | DefaultUSKMSubmenu,
  s: LabeledAction | DefaultUSKMSubmenu,
  d: LabeledAction | DefaultUSKMSubmenu,
  f: LabeledAction | DefaultUSKMSubmenu,
  g: LabeledAction | DefaultUSKMSubmenu,
  h: LabeledAction | DefaultUSKMSubmenu,
  j: LabeledAction | DefaultUSKMSubmenu,
  k: LabeledAction | DefaultUSKMSubmenu,
  l: LabeledAction | DefaultUSKMSubmenu,
  ';': LabeledAction | DefaultUSKMSubmenu,
  z: LabeledAction | DefaultUSKMSubmenu,
  x: LabeledAction | DefaultUSKMSubmenu,
  c: LabeledAction | DefaultUSKMSubmenu,
  v: LabeledAction | DefaultUSKMSubmenu,
  b: LabeledAction | DefaultUSKMSubmenu,
  n: LabeledAction | DefaultUSKMSubmenu,
  m: LabeledAction | DefaultUSKMSubmenu,
  ',': LabeledAction | DefaultUSKMSubmenu,
  '.': LabeledAction | DefaultUSKMSubmenu,
  '/': LabeledAction | DefaultUSKMSubmenu,
}

export class DefaultUSKMSubmenu implements KeyMenuSubmenu {

  constructor(config: DefaultUSKMSubmenuConfig) {
  }


  handleKeyUp(event: KeyboardEvent): void {
    // const kmKey: KMKey | undefined = this.kmKeysForEventKeys.get(event.key);
    // if (kmKey) {
    //   kmKey.highlighted = false;
    // }
  }


  handleKeyDown(event: KeyboardEvent): void {
    // console.log("event.key", event.key);
    // const kmKey: KMKey | undefined = this.kmKeysForEventKeys.get(event.key);
    // if (kmKey) {
    //   kmKey.highlighted = true;
    // }
    // this.actionsForKeys.get(event.key)?.();
  }

  // get actionsForKeys(): Map<String, () => void> {
    // return new Map(this.kmKeyConfigs.map(
    //   kmKeyConfig => [kmKeyConfig.displayableKey.valueOf(), kmKeyConfig.action]));
  // }

  // get kmKeys(): KMKey[] {
    // return this.kmKeyConfigs.map(keyConfig => new KMKey(keyConfig));
  // }

  // get kmKeysForEventKeys(): Map<String, KMKey> {
  //   return new Map(this.kmKeys.map(
  //     kmKey => [kmKey.displayableKey.valueOf(), kmKey])
  //   );
  // }

  // updateLayer(layer: KeyMenuLayer): void {
  //   this.children = [];
  //
  //   this.parent = null;
  //
  //
  //   for (const kmKey of this.kmKeys) {
  //     kmKey.parent = null;
  //     this.add(kmKey)
  //   }
  //
  //   layer.add(this);
  // }


}
