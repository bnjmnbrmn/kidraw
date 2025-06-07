import Konva from "konva";
import {KeyMenuSubmenu} from "./keyMenuSubmenu";
import {KeyMenuLayer} from "../keyMenuLayer";

import {KMKeyConfig} from './KMKeyConfig';
import {KMKey} from './KMKey';


export class LabeledAction {
  constructor(public actionLabel: string, public action: () => void) {
  }
}


export class LabeledDefaultUSKMSubmenuConfig {
  constructor(public submenuLabel: string,
              public defaultUSKMSubmenuConfig: DefaultUSKMSubmenuConfig) {

  }

}


export type DefaultUSKMSubmenuConfig = {
  q?: LabeledAction | LabeledDefaultUSKMSubmenuConfig,
  w?: LabeledAction | LabeledDefaultUSKMSubmenuConfig,
  e?: LabeledAction | LabeledDefaultUSKMSubmenuConfig,
  r?: LabeledAction | LabeledDefaultUSKMSubmenuConfig,
  t?: LabeledAction | LabeledDefaultUSKMSubmenuConfig,
  y?: LabeledAction | LabeledDefaultUSKMSubmenuConfig,
  u?: LabeledAction | LabeledDefaultUSKMSubmenuConfig,
  i?: LabeledAction | LabeledDefaultUSKMSubmenuConfig,
  o?: LabeledAction | LabeledDefaultUSKMSubmenuConfig,
  p?: LabeledAction | LabeledDefaultUSKMSubmenuConfig,
  a?: LabeledAction | LabeledDefaultUSKMSubmenuConfig,
  s?: LabeledAction | LabeledDefaultUSKMSubmenuConfig,
  d?: LabeledAction | LabeledDefaultUSKMSubmenuConfig,
  f?: LabeledAction | LabeledDefaultUSKMSubmenuConfig,
  g?: LabeledAction | LabeledDefaultUSKMSubmenuConfig,
  h?: LabeledAction | LabeledDefaultUSKMSubmenuConfig,
  j?: LabeledAction | LabeledDefaultUSKMSubmenuConfig,
  k?: LabeledAction | LabeledDefaultUSKMSubmenuConfig,
  l?: LabeledAction | LabeledDefaultUSKMSubmenuConfig,
  ';'?: LabeledAction | LabeledDefaultUSKMSubmenuConfig,
  z?: LabeledAction | LabeledDefaultUSKMSubmenuConfig,
  x?: LabeledAction | LabeledDefaultUSKMSubmenuConfig,
  c?: LabeledAction | LabeledDefaultUSKMSubmenuConfig,
  v?: LabeledAction | LabeledDefaultUSKMSubmenuConfig,
  b?: LabeledAction | LabeledDefaultUSKMSubmenuConfig,
  n?: LabeledAction | LabeledDefaultUSKMSubmenuConfig,
  m?: LabeledAction | LabeledDefaultUSKMSubmenuConfig,
  ','?: LabeledAction | LabeledDefaultUSKMSubmenuConfig,
  '.'?: LabeledAction | LabeledDefaultUSKMSubmenuConfig,
  '/'?: LabeledAction | LabeledDefaultUSKMSubmenuConfig,
}

export class DefaultUSKMSubmenu implements KeyMenuSubmenu {
  readonly config: DefaultUSKMSubmenuConfig;

  constructor(config: DefaultUSKMSubmenuConfig) {
    this.config = config
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
