import {AfterViewInit, Component, ElementRef, EventEmitter, HostListener, inject, Output} from '@angular/core';
import {DACommand, DACommandType} from "../drawing-area/command.model";
import {KeyMenu} from '../lib/keymenu/keyMenu';
import {
  USQwertyMode,
  USQwertyModeConfig
} from '../lib/keymenu/modes/us-qwerty';
import {
  PrintedInstructionKeyMenuModeConfig,
  PrintedInstructionKMMode
} from '../lib/keymenu/printedInstructionKMMode/printedInstructionKMMode';
import {
  LabeledSubmenuConfig
} from '../lib/keymenu/keys/labeledSubmenuConfig';
import {LabeledAction} from '../lib/keymenu/keys/labeledAction';


@Component({
  selector: 'app-keymenu',
  imports: [],
  templateUrl: './keymenu.component.html',
  styleUrl: './keymenu.component.css'
})
export class KeymenuComponent implements AfterViewInit {

  private keyMenu!: KeyMenu<DACommand>;
  private componentNE = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  @Output() keyMenuOut = new EventEmitter<DACommand>;

  ngAfterViewInit(): void {
    this.keyMenu = new KeyMenu<DACommand>({
      containerId: 'keyMenu',
      containingHTMLElement: this.componentNE,
      modes: {
        "normal": new USQwertyModeConfig({

          // Movement (right hand)
          j: new LabeledAction(
            'Move Left',
            () => {
              this.keyMenuOut.emit({kind: DACommandType.MOVE_CROSSHAIRS_LEFT});
            }
          ),
          k: new LabeledAction(
            'Move Down',
            () => {
              this.keyMenuOut.emit({kind: DACommandType.MOVE_CROSSHAIRS_DOWN});
            }
          ),
          i: new LabeledAction(
            'Move Up',
            () => {
              this.keyMenuOut.emit({kind: DACommandType.MOVE_CROSSHAIRS_UP});
            }
          ),
          l: new LabeledAction(
            'Move Right',
            () => {
              this.keyMenuOut.emit({kind: DACommandType.MOVE_CROSSHAIRS_RIGHT});
            }
          ),
          u: new LabeledAction(
            'Zoom Out',
            () => {
              this.keyMenuOut.emit({kind: DACommandType.ZOOM_OUT});
            }
          ),
          o: new LabeledAction(
            'Zoom In',
            () => {
              this.keyMenuOut.emit({kind: DACommandType.ZOOM_IN});
            }
          ),
          // Left-hand actions
          s: new LabeledAction(
            'New Selection',
            () => {
              this.keyMenuOut.emit({kind: DACommandType.SINGLE_ITEM_TOGGLE_SELECT});
            }
          ),
          v: new LabeledAction(
            'Additional Selection',
            () => {
              this.keyMenuOut.emit({kind: DACommandType.MULTI_ITEM_SELECT});
            }
          ),
          f: new LabeledAction(
            'Recenter View',
            () => {
              this.keyMenuOut.emit({kind: DACommandType.RECENTER_VIEW});
            }
          ),
          d: new LabeledAction(
            'Recenter Crosshairs',
            () => {
              this.keyMenuOut.emit({kind: DACommandType.RECENTER_CROSSHAIRS});
            }
          ),
          t: new LabeledAction(
            'Toggle Waypoints',
            () => {
              this.keyMenuOut.emit({kind: DACommandType.TOGGLE_WAYPOINT_VISIBILITY});
            }
          ),
          x: new LabeledAction(
            'Delete',
            () => {
              this.keyMenuOut.emit({kind: DACommandType.DELETE});
            }
          ),
          // Submenus (left hand)
          e: new LabeledSubmenuConfig(
            "Select+Drag...",
            {
              s: new LabeledAction("...Select", () => {
                this.keyMenuOut.emit({kind: DACommandType.SINGLE_ITEM_TOGGLE_SELECT});
              }),
              v: new LabeledAction("...Multi", () => {
                this.keyMenuOut.emit({kind: DACommandType.MULTI_ITEM_SELECT});
              }),
              j: new LabeledAction("Drag Left", () => {
                this.keyMenuOut.emit({kind: DACommandType.DRAG_SELECTED_LEFT});
              }),
              k: new LabeledAction("Drag Down", () => {
                this.keyMenuOut.emit({kind: DACommandType.DRAG_SELECTED_DOWN});
              }),
              i: new LabeledAction("Drag Up", () => {
                this.keyMenuOut.emit({kind: DACommandType.DRAG_SELECTED_UP});
              }),
              l: new LabeledAction("Drag Right", () => {
                this.keyMenuOut.emit({kind: DACommandType.DRAG_SELECTED_RIGHT});
              })
            }
          ),
          a: new LabeledSubmenuConfig(
            "Add...",
            {
              i: new LabeledAction("...Node", () => {
                this.keyMenuOut.emit({kind: DACommandType.CREATE_NEW_NODE});
              }),
              w: new LabeledAction("...Waypoint", () => {
                this.keyMenuOut.emit({kind: DACommandType.ADD_WAYPOINT});
              }),
              e: new LabeledAction("...Edge", () => {
                this.keyMenuOut.emit({kind: DACommandType.CONNECT_SELECTED_NODES});
              }),
              l: new LabeledAction("...Label", () => {
                this.keyMenuOut.emit({kind: DACommandType.ADD_LABEL});
              })
            }
          )
        }),
        "labelEdit": new PrintedInstructionKeyMenuModeConfig(
          "Insert/edit text.  Use ESC or Ctrl-[ to return to Normal mode.",
          (keyDownEvent: KeyboardEvent) => {
            const key = keyDownEvent.key;
            if (("Enter" === key && keyDownEvent.shiftKey)
              || ("[" === key && keyDownEvent.ctrlKey) || "Escape" === key) {
              this.keyMenuOut.emit({kind: DACommandType.EXIT_LABEL_EDIT_MODE});
              this.keyMenu.switchMode("normal");
            } else if (key.length === 1 && key.match(/^[\P{Cc}\P{Cn}\P{Cs}]+$/gu)) {
              this.keyMenuOut.emit({kind: DACommandType.INSERT_CHAR, value: key});
            } else if ("Enter" === key && KeyMenu.noModifier(keyDownEvent)) {
              this.keyMenuOut.emit({kind: DACommandType.INSERT_CHAR, value: key});
            } else if (["Enter", "Tab"].includes(key) && KeyMenu.noModifier(keyDownEvent)) {
              this.keyMenuOut.emit({kind: DACommandType.INSERT_CHAR, value: key});
            }
          }, (keyUpEvent: KeyboardEvent) => {
            //do nothing
          }
        )
      }
    });
  }


  @HostListener('document:keydown', ["$event"])
  handleKeyDown(event: KeyboardEvent) {
    // Handle special keys for unselect in normal mode
    if (this.keyMenu.currentMode.name === "normal") {
      if (event.key === "Escape" || (event.key === "[" && event.ctrlKey)) {
        this.keyMenuOut.emit({kind: DACommandType.UNSELECT_ALL});
        return;
      }
    }
    this.keyMenu.handleKeyDown(event);
  }

  @HostListener('document:keyup', ["$event"])
  handleKeyUp(event: KeyboardEvent) {
    this.keyMenu.handleKeyUp(event);
  }

}
