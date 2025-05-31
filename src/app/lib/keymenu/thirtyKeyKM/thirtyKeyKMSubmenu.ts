import Konva from "konva";
import {KeyMenuSubmenu} from "./keyMenuSubmenu";
import {KeyMenuLayer} from "../keyMenuLayer";

import {KMKeyConfig} from './KMKeyConfig';

export abstract class ThirtyKeyKMSubmenu extends Konva.Group implements KeyMenuSubmenu {

  constructor(args: any) {
    super(args);
  }

  abstract updateLayer(layer: KeyMenuLayer): void;

  abstract kmKeyConfigs: KMKeyConfig[];

  abstract handleKeyDown(event: KeyboardEvent): void;

  abstract handleKeyUp(event: KeyboardEvent): void ;

}
