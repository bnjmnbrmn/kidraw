import {ThirtyKeyKMSubmenu} from "../lib/keymenu/thirtyKeyKM/thirtyKeyKMSubmenu";
import {KeyMenuSubmenu} from "../lib/keymenu/thirtyKeyKM/keyMenuSubmenu";
import {KMKeyConfig} from "../lib/keymenu/thirtyKeyKM/KMKeyConfig";
import {DisplayableKey} from "../lib/keymenu/thirtyKeyKM/displayableKey";
import {EventEmitter} from "@angular/core";
import {DACommand, DACommandType} from "../drawing-area/command.model";
import {KeyMenuMode} from "../lib/keymenu/keyMenuMode";
import {KeyMenuLayer} from "../lib/keymenu/keyMenuLayer";
import {KMKey} from "../lib/keymenu/thirtyKeyKM/KMKey";

export class SelectModeRootSubmenu extends ThirtyKeyKMSubmenu implements KeyMenuSubmenu {

  public override kmKeyConfigs: KMKeyConfig[] =
    [
      {
        displayableKey: DisplayableKey.q, label: "Zoom Out",
        action: () => console.log("Zoom Out")
      },
      {
        displayableKey: DisplayableKey.w, label: "Zoom In",
        action: () => console.log("Zoom In")
      }
    ];

  constructor(private keymenuOut: EventEmitter<DACommand>, public keyMenuMode: KeyMenuMode<DACommand>,
              x: number, y: number) {
    super({x, y});
  }

  handleKeyUp(event: KeyboardEvent): void {
  }


  handleKeyDown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'h':
        this.keymenuOut.emit({kind: DACommandType.MOVE_CROSSHAIRS_LEFT});
        break;
      case 'j':
        this.keymenuOut.emit({kind: DACommandType.MOVE_CROSSHAIRS_DOWN});
        break;
      case 'k':
        this.keymenuOut.emit({kind: DACommandType.MOVE_CROSSHAIRS_UP});
        break;
      case 'l':
        this.keymenuOut.emit({kind: DACommandType.MOVE_CROSSHAIRS_RIGHT});
        break;
      case 'i':
        this.keymenuOut.emit({kind: DACommandType.CREATE_NEW_NODE});
        this.keyMenuMode.keyMenu.switchMode("Label Edit");
        break;
      case 'v':
        this.keymenuOut.emit({kind: DACommandType.MULTI_ITEM_SELECT});
        break;
      case 's':
        this.keymenuOut.emit({kind: DACommandType.SINGLE_ITEM_TOGGLE_SELECT});
        break;
      case 'q':
        this.keymenuOut.emit({kind: DACommandType.ZOOM_OUT});
        break;
      case 'w':
        this.keymenuOut.emit({kind: DACommandType.ZOOM_IN});
        break;
      case 'c':
        this.keymenuOut.emit({kind: DACommandType.CONNECT_SELECTED_NODES});
        break;
    }
  }

  updateLayer(layer: KeyMenuLayer): void {

    this.children = [];

    this.parent = null;

    for (const keyConfig of this.kmKeyConfigs) {
      this.add(new KMKey(keyConfig));
    }

    console.log("SelectModeRootSubmenu updateLayer");


    layer.add(this);

    console.log("Layer details:", {
      children: layer.children,
      visible: layer.visible(),
      width: layer.width(),
      height: layer.height()
    });

  }

}
