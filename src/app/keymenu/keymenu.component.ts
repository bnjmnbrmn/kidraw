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
import {LabeledSubmenuConfig} from '../lib/keymenu/keys/labeledSubmenuConfig';
import {LabeledAction} from '../lib/keymenu/keys/labeledAction';
import {LabeledActionWithRelease, SubmenuConfig} from '../lib/keymenu/layouts/us-qwerty/submenuConfig';


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

  // State: when true, releasing the insert submenu key switches to labelEdit
  private insertDragActive = false;

  // Shared drag submenu config (used after insert action)
  private readonly dragSubmenuConfig: SubmenuConfig = {
    e: new LabeledAction("Drag Up", () => {
      this.keyMenuOut.emit({kind: DACommandType.DRAG_SELECTED_UP});
    }),
    s: new LabeledAction("Drag Left", () => {
      this.keyMenuOut.emit({kind: DACommandType.DRAG_SELECTED_LEFT});
    }),
    d: new LabeledAction("Drag Down", () => {
      this.keyMenuOut.emit({kind: DACommandType.DRAG_SELECTED_DOWN});
    }),
    f: new LabeledAction("Drag Right", () => {
      this.keyMenuOut.emit({kind: DACommandType.DRAG_SELECTED_RIGHT});
    }),
    q: new LabeledAction("Zoom Out", () => {
      this.keyMenuOut.emit({kind: DACommandType.ZOOM_OUT});
    }),
    w: new LabeledAction("Zoom Out", () => {
      this.keyMenuOut.emit({kind: DACommandType.ZOOM_OUT});
    }),
    r: new LabeledAction("Zoom In", () => {
      this.keyMenuOut.emit({kind: DACommandType.ZOOM_IN});
    }),
    t: new LabeledAction("Zoom In", () => {
      this.keyMenuOut.emit({kind: DACommandType.ZOOM_IN});
    }),
  };

  ngAfterViewInit(): void {
    this.keyMenu = new KeyMenu<DACommand>({
      containerId: 'keyMenu',
      containingHTMLElement: this.componentNE,
      modes: {
        "normal": new USQwertyModeConfig({

          // Movement (left hand)
          e: new LabeledAction('Move Up', () => {
            this.keyMenuOut.emit({kind: DACommandType.MOVE_CROSSHAIRS_UP});
          }),
          s: new LabeledAction('Move Left', () => {
            this.keyMenuOut.emit({kind: DACommandType.MOVE_CROSSHAIRS_LEFT});
          }),
          d: new LabeledAction('Move Down', () => {
            this.keyMenuOut.emit({kind: DACommandType.MOVE_CROSSHAIRS_DOWN});
          }),
          f: new LabeledAction('Move Right', () => {
            this.keyMenuOut.emit({kind: DACommandType.MOVE_CROSSHAIRS_RIGHT});
          }),

          // Zoom (left hand, two keys each)
          q: new LabeledAction('Zoom Out', () => {
            this.keyMenuOut.emit({kind: DACommandType.ZOOM_OUT});
          }),
          w: new LabeledAction('Zoom Out', () => {
            this.keyMenuOut.emit({kind: DACommandType.ZOOM_OUT});
          }),
          r: new LabeledAction('Zoom In', () => {
            this.keyMenuOut.emit({kind: DACommandType.ZOOM_IN});
          }),
          t: new LabeledAction('Zoom In', () => {
            this.keyMenuOut.emit({kind: DACommandType.ZOOM_IN});
          }),

          // Submenus (right hand)
          i: new LabeledSubmenuConfig("Insert...", {
            f: new LabeledActionWithRelease("...Node", () => {
              this.keyMenuOut.emit({kind: DACommandType.CREATE_NEW_NODE});
              this.insertDragActive = true;
            }, () => {
              // On f release: swap to drag submenu
              const mode = this.keyMenu.currentMode as USQwertyMode<DACommand>;
              mode.replaceTopSubmenu(this.dragSubmenuConfig);
            }),
            d: new LabeledAction("...Waypoint", () => {
              this.keyMenuOut.emit({kind: DACommandType.ADD_WAYPOINT});
            }),
            s: new LabeledAction("...Edge", () => {
              this.keyMenuOut.emit({kind: DACommandType.CONNECT_SELECTED_NODES});
            }),
            a: new LabeledAction("...Label", () => {
              this.keyMenuOut.emit({kind: DACommandType.ADD_LABEL});
            }),
          }),

          j: new LabeledSubmenuConfig("Select+Drag...", {
            // Movement + zoom (left hand)
            e: new LabeledAction('Move Up', () => {
              this.keyMenuOut.emit({kind: DACommandType.MOVE_CROSSHAIRS_UP});
            }),
            s: new LabeledAction('Move Left', () => {
              this.keyMenuOut.emit({kind: DACommandType.MOVE_CROSSHAIRS_LEFT});
            }),
            d: new LabeledAction('Move Down', () => {
              this.keyMenuOut.emit({kind: DACommandType.MOVE_CROSSHAIRS_DOWN});
            }),
            f: new LabeledAction('Move Right', () => {
              this.keyMenuOut.emit({kind: DACommandType.MOVE_CROSSHAIRS_RIGHT});
            }),
            q: new LabeledAction('Zoom Out', () => {
              this.keyMenuOut.emit({kind: DACommandType.ZOOM_OUT});
            }),
            w: new LabeledAction('Zoom Out', () => {
              this.keyMenuOut.emit({kind: DACommandType.ZOOM_OUT});
            }),
            r: new LabeledAction('Zoom In', () => {
              this.keyMenuOut.emit({kind: DACommandType.ZOOM_IN});
            }),
            t: new LabeledAction('Zoom In', () => {
              this.keyMenuOut.emit({kind: DACommandType.ZOOM_IN});
            }),
            // Select (right hand)
            k: new LabeledAction("Select", () => {
              this.keyMenuOut.emit({kind: DACommandType.SINGLE_ITEM_TOGGLE_SELECT});
            }),
            l: new LabeledAction("Multi-Select", () => {
              this.keyMenuOut.emit({kind: DACommandType.MULTI_ITEM_SELECT});
            }),
          }),

          // Bottom row (remaining, may be removed)
          z: new LabeledAction('Toggle Waypoints', () => {
            this.keyMenuOut.emit({kind: DACommandType.TOGGLE_WAYPOINT_VISIBILITY});
          }),
          x: new LabeledAction('Delete', () => {
            this.keyMenuOut.emit({kind: DACommandType.DELETE});
          }),
          c: new LabeledAction('Recenter View', () => {
            this.keyMenuOut.emit({kind: DACommandType.RECENTER_VIEW});
          }),
          v: new LabeledAction('Recenter Crosshairs', () => {
            this.keyMenuOut.emit({kind: DACommandType.RECENTER_CROSSHAIRS});
          }),
          b: new LabeledAction('New Selection', () => {
            this.keyMenuOut.emit({kind: DACommandType.SINGLE_ITEM_TOGGLE_SELECT});
          }),
          n: new LabeledAction('Add Selection', () => {
            this.keyMenuOut.emit({kind: DACommandType.MULTI_ITEM_SELECT});
          }),
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

    // After insert+drag: releasing the submenu key switches to label edit
    if (this.insertDragActive && event.key === 'i') {
      this.insertDragActive = false;
      this.keyMenu.switchMode("labelEdit");
    }
  }

}
