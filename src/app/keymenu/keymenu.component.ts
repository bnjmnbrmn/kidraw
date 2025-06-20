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
            "Zoom/Pan",
            {
              i: new DefaultUSStackKMModeLabeledAction("Zoom In", () => {
                this.keyMenuOut.emit({kind: DACommandType.ZOOM_IN});
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
          }
        )
      }
    });
  }


  @HostListener('document:keydown', ["$event"])
  handleKeyDown(event: KeyboardEvent) {
    this.keyMenu.handleKeyDown(event);
  }

  @HostListener('document:keyup', ["$event"])
  handleKeyUp(event: KeyboardEvent) {
    this.keyMenu.handleKeyUp(event);
  }

}
