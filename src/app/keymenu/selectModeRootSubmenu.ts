import {DefaultUSKMSubmenu} from "../lib/keymenu/thirtyKeyKM/defaultUSKMSubmenu";
import {KeyMenuSubmenu} from "../lib/keymenu/thirtyKeyKM/keyMenuSubmenu";
import {KMKeyConfig} from "../lib/keymenu/thirtyKeyKM/KMKeyConfig";
import {DisplayableKey} from "../lib/keymenu/thirtyKeyKM/displayableKey";
import {EventEmitter} from "@angular/core";
import {DACommand, DACommandType} from "../drawing-area/command.model";
import {KeyMenuMode} from "../lib/keymenu/keyMenuMode";
import {KeyMenuLayer} from "../lib/keymenu/keyMenuLayer";
import {KMKey} from "../lib/keymenu/thirtyKeyKM/KMKey";
import {DefaultUSStackKMMode} from '../lib/keymenu/defaultUSStackKMMode';

class ZoomPanSubmenu extends DefaultUSKMSubmenu {
  // constructor(private keymenuOut: EventEmitter<DACommand>) {
    // super()
  // }

  // kmKeyConfigs: KMKeyConfig[] = [
  //   {
  //     displayableKey: DisplayableKey.q, label: "Zoom Out",
  //     action: () => {
  //       this.keymenuOut.emit({kind: DACommandType.ZOOM_OUT});
  //     }
  //   },
  //   {
  //     displayableKey: DisplayableKey.w, label: "Zoom In",
  //     action: () => {
  //       this.keymenuOut.emit({kind: DACommandType.ZOOM_IN});
  //     }
  //   }
  // ];


}

export class SelectModeRootSubmenu extends DefaultUSKMSubmenu {

  // kmKeyConfigs: KMKeyConfig[] =
  //   [
  //     {
  //       displayableKey: DisplayableKey.h, label: "Move Left",
  //       action: () =>
  //         this.keyMenuOut.emit({kind: DACommandType.MOVE_CROSSHAIRS_LEFT})
  //     },
  //     {
  //       displayableKey: DisplayableKey.j, label: "Move Down",
  //       action: () =>
  //         this.keyMenuOut.emit({kind: DACommandType.MOVE_CROSSHAIRS_DOWN})
  //     },
  //     {
  //       displayableKey: DisplayableKey.k, label: "Move Up",
  //       action: () =>
  //         this.keyMenuOut.emit({kind: DACommandType.MOVE_CROSSHAIRS_UP})
  //     },
  //     {
  //       displayableKey: DisplayableKey.l, label: "Move Right",
  //       action: () =>
  //         this.keyMenuOut.emit({kind: DACommandType.MOVE_CROSSHAIRS_RIGHT})
  //     },
  //     {
  //       displayableKey: DisplayableKey.i, label: "Create Node",
  //       action: () => {
  //         this.keyMenuOut.emit({kind: DACommandType.CREATE_NEW_NODE});
  //         this.kmKeys.forEach(kmKey => {
  //           kmKey.highlighted = false
  //         })
  //         this.keyMenuMode.keyMenu.switchMode("Label Edit");
  //       }
  //     },
  //     {
  //       displayableKey: DisplayableKey.v, label: "Multi-Item Select",
  //       action: () => {
  //         this.keyMenuOut.emit({kind: DACommandType.MULTI_ITEM_SELECT})
  //       }
  //     },
  //     {
  //       displayableKey: DisplayableKey.s, label: "Single-Item Select",
  //       action: () => {
  //         this.keyMenuOut.emit({kind: DACommandType.SINGLE_ITEM_TOGGLE_SELECT})
  //       }
  //     },
  //     {
  //       displayableKey: DisplayableKey.c, label: "Connect Selected",
  //       action: () => {
  //         this.keyMenuOut.emit({kind: DACommandType.CONNECT_SELECTED_NODES});
  //       }
  //     },
  //     {
  //       displayableKey: DisplayableKey.z, label: "Zoom/Pan",
  //       action: () => {
  //         this.keyMenuMode.stack.push(new ZoomPanSubmenu(this.keyMenuOut))
  //       }
  //     }
  //   ];


  // constructor(
  //   private keyMenuOut: EventEmitter<DACommand>,
  //   public keyMenuMode: StackKeyMenuMode<DACommand>,
  //   parentWidth: number,
  //   parentHeight: number) {
    // super();
    //
    // this.kmKeys.forEach(key => {
    //   this.add(key);
    // });
    // this.keyMenuMode.keyMenu.layer.add(this);
    // this.x((parentWidth - (10 * KMKey.KEY_WIDTH + 9 * KMKey.KEY_MARGIN + KMKey.ROW_OFFSETS[2])) / 2);
    // this.y((parentHeight - (3 * KMKey.KEY_HEIGHT + 2 * KMKey.KEY_MARGIN)) / 2);
  // }


}
