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
        action: () =>
          this.keymenuOut.emit({kind: DACommandType.MOVE_CROSSHAIRS_LEFT})
      },
      {
        displayableKey: DisplayableKey.j, label: "Move Down",
        action: () =>
          this.keymenuOut.emit({kind: DACommandType.MOVE_CROSSHAIRS_DOWN})
      },
      {
        displayableKey: DisplayableKey.k, label: "Move Up",
        action: () =>
          this.keymenuOut.emit({kind: DACommandType.MOVE_CROSSHAIRS_UP})
      },
      {
        displayableKey: DisplayableKey.l, label: "Move Right",
        action: () =>
          this.keymenuOut.emit({kind: DACommandType.MOVE_CROSSHAIRS_RIGHT})
      },
      {
        displayableKey: DisplayableKey.i, label: "Create Node",
        action: () => {
          this.keymenuOut.emit({kind: DACommandType.CREATE_NEW_NODE});
          this.kmKeys.forEach(kmKey => {kmKey.highlighted = false})
          this.keyMenuMode.keyMenu.switchMode("Label Edit");
        }
      },
      {
        displayableKey: DisplayableKey.v, label: "Multi-Item Select",
        action: () => {
          this.keymenuOut.emit({kind: DACommandType.MULTI_ITEM_SELECT})
        }
      },
      {
        displayableKey: DisplayableKey.s, label: "Single-Item Select",
        action: () => {
          this.keymenuOut.emit({kind: DACommandType.SINGLE_ITEM_TOGGLE_SELECT})
        }
      },
      {
        displayableKey: DisplayableKey.c, label: "Connect Selected",
        action: () => {
          this.keymenuOut.emit({kind: DACommandType.CONNECT_SELECTED_NODES});
        }
      },
      {
        displayableKey: DisplayableKey.q, label: "Zoom Out",
        action: () => {
          this.keymenuOut.emit({kind: DACommandType.ZOOM_OUT});
        }
      },
      {
        displayableKey: DisplayableKey.w, label: "Zoom In",
        action: () => {
          this.keymenuOut.emit({kind: DACommandType.ZOOM_IN});
        }
      }
    ];

  private actionsForKeys : Map<String, () => void> = new Map(this.kmKeyConfigs.map(
    kmKeyConfig => [kmKeyConfig.displayableKey.valueOf(), kmKeyConfig.action]));

  public override kmKeys: KMKey[] = this.kmKeyConfigs.map(keyConfig => new KMKey(keyConfig));

  private kmKeysForEventKeys: Map<String, KMKey> = new Map(this.kmKeys.map(
    kmKey => [kmKey.displayableKey.valueOf(), kmKey])
  );



  constructor(
    private keymenuOut: EventEmitter<DACommand>,
    public keyMenuMode: KeyMenuMode<DACommand>,
    parentWidth: number,
    parentHeight: number) {

    super({});

    this.kmKeys.forEach(key => {
      this.add(key);
    });
    this.keyMenuMode.keyMenu.layer.add(this);
    this.x((parentWidth - (10 * KMKey.KEY_WIDTH + 9 * KMKey.KEY_MARGIN + KMKey.ROW_OFFSETS[2]))/2);
    this.y((parentHeight - (3 * KMKey.KEY_HEIGHT + 2 * KMKey.KEY_MARGIN))/2);
  }

  handleKeyUp(event: KeyboardEvent): void {
    const kmKey: KMKey | undefined = this.kmKeysForEventKeys.get(event.key);
    if (kmKey) {
      kmKey.highlighted = false;
    }
  }


  handleKeyDown(event: KeyboardEvent): void {
    console.log("event.key", event.key);
    const kmKey: KMKey | undefined = this.kmKeysForEventKeys.get(event.key);
    if (kmKey) {
      kmKey.highlighted = true;
    }
    this.actionsForKeys.get(event.key)?.();
  }

  updateLayer(layer: KeyMenuLayer): void {

    this.children = [];

    this.parent = null;


    for (const kmKey of this.kmKeys) {
      kmKey.parent = null;
      this.add(kmKey)
    }

    layer.add(this);


  }

}
