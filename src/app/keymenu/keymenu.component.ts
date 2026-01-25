import {AfterViewInit, Component, ElementRef, EventEmitter, HostListener, inject, Output} from '@angular/core';
import {DACommand, DACommandType} from "../drawing-area/command.model";
import {KeyMenu} from '../lib/keymenu/keyMenu';
import {
  DefaultUSStackKMMode,
  DefaultUSStackKMModeConfig
} from '../lib/keymenu/defaultUSStackKMMode/defaultUSStackKMMode';
import {
  PrintedInstructionKeyMenuModeConfig,
  PrintedInstructionKMMode
} from '../lib/keymenu/printedInstructionKMMode/printedInstructionKMMode';
import {
  DefaultUSStackKMModeLabeledSubmenuConfig
} from '../lib/keymenu/defaultUSStackKMMode/defaultUSStackKMModeLabeledSubmenuConfig';
import {DefaultUSStackKMModeLabeledAction} from '../lib/keymenu/defaultUSStackKMMode/defaultUSStackKMModeLabeledAction';


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
        "normal": new DefaultUSStackKMModeConfig({

          s: new DefaultUSStackKMModeLabeledAction(
            'New Selection',
            () => {
              this.keyMenuOut.emit({kind: DACommandType.SINGLE_ITEM_TOGGLE_SELECT});
            }
          ),
          v: new DefaultUSStackKMModeLabeledAction(
            'Additional Selection',
            () => {
              this.keyMenuOut.emit({kind: DACommandType.MULTI_ITEM_SELECT});
            }
          ),

          c: new DefaultUSStackKMModeLabeledAction(
            'Connect',
            () => {
              this.keyMenuOut.emit({kind: DACommandType.CONNECT_SELECTED_NODES});
            }
          ),
          h: new DefaultUSStackKMModeLabeledAction(
            'Move Left',
            () => {
              this.keyMenuOut.emit({kind: DACommandType.MOVE_CROSSHAIRS_LEFT});
            }
          ),
          j: new DefaultUSStackKMModeLabeledAction(
            'Move Down',
            () => {
              this.keyMenuOut.emit({kind: DACommandType.MOVE_CROSSHAIRS_DOWN});
            }
          ),
          k: new DefaultUSStackKMModeLabeledAction(
            'Move Up',
            () => {
              this.keyMenuOut.emit({kind: DACommandType.MOVE_CROSSHAIRS_UP});
            }
          ),
          l: new DefaultUSStackKMModeLabeledAction(
            'Move Right',
            () => {
              this.keyMenuOut.emit({kind: DACommandType.MOVE_CROSSHAIRS_RIGHT});
            }
          ),
          i: new DefaultUSStackKMModeLabeledAction(
            'Insert Node',
            () => {
              this.keyMenuOut.emit({kind: DACommandType.CREATE_NEW_NODE});
              this.keyMenu.switchMode("labelEdit")
            }
          ),
          z: new DefaultUSStackKMModeLabeledSubmenuConfig(
            "Zoom...",
            {
              i: new DefaultUSStackKMModeLabeledAction("...In", () => {
                this.keyMenuOut.emit({kind: DACommandType.ZOOM_IN});
              }),
              o: new DefaultUSStackKMModeLabeledAction("...Out", () => {
                this.keyMenuOut.emit({kind: DACommandType.ZOOM_OUT});
              })
            }
          ),
          // Ergonomic single-key shortcuts for recenter operations
          f: new DefaultUSStackKMModeLabeledAction(
            'Recenter View',
            () => {
              this.keyMenuOut.emit({kind: DACommandType.RECENTER_VIEW});
            }
          ),
          d: new DefaultUSStackKMModeLabeledAction(
            'Recenter Crosshairs',
            () => {
              this.keyMenuOut.emit({kind: DACommandType.RECENTER_CROSSHAIRS});
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
