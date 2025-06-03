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

  kmKeyConfigs: KMKeyConfig[] =
    [
      {
        displayableKey: DisplayableKey.h, label: "Move Left",
        action: () => console.log("Move Crosshairs Left")
      },
      {
        displayableKey: DisplayableKey.j, label: "Move Down",
        action: () => console.log("Move Crosshairs Down")
      },
      {
        displayableKey: DisplayableKey.k, label: "Move Up",
        action: () => console.log("Move Crosshairs Up")
      },
      {
        displayableKey: DisplayableKey.l, label: "Move Right",
        action: () => console.log("Move Crosshairs Right")
      },
      {
        displayableKey: DisplayableKey.i, label: "Create Node",
        action: () => {this.keyMenuMode.keyMenu.switchMode("Label Edit")}
      },
      {
        displayableKey: DisplayableKey.v, label: "Multi-Item Select",
        action: () => {this.keymenuOut.emit({kind: DACommandType.MULTI_ITEM_SELECT})}
      },
      {
        displayableKey: DisplayableKey.s, label: "Multi-Item Select",
        action: () => {this.keymenuOut.emit({kind: DACommandType.MULTI_ITEM_SELECT})}
      },
      {
        displayableKey: DisplayableKey.s, label: "Single-Item Toggle Select",
        action: () => {this.keymenuOut.emit({kind: DACommandType.SINGLE_ITEM_TOGGLE_SELECT})}
      },
      {
        displayableKey: DisplayableKey.c, label: "Connect Selected",
        action: () => {this.keymenuOut.emit({kind: DACommandType.CONNECT_SELECTED_NODES});}
      },
      {
        displayableKey: DisplayableKey.q, label: "Zoom Out",
        action: () => {this.keymenuOut.emit({kind: DACommandType.ZOOM_OUT});}
      },
      {
        displayableKey: DisplayableKey.w, label: "Zoom In",
        action: () => {this.keymenuOut.emit({kind: DACommandType.ZOOM_IN});}
      }
    ];


  public override kmKeys: KMKey[] = this.kmKeyConfigs.map(keyConfig => new KMKey(keyConfig));

  constructor(
    private keymenuOut: EventEmitter<DACommand>,
    public keyMenuMode: KeyMenuMode<DACommand>,
    x: number,
    y: number) {

    super({x, y});

    this.kmKeys.forEach(key => {
      this.add(key);
    });
    this.keyMenuMode.keyMenu.layer.add(this);
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
