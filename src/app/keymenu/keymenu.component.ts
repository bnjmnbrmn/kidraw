import {AfterViewInit, Component, ElementRef, EventEmitter, HostListener, inject, Output} from '@angular/core';
import {DACommand, DACommandType} from "../drawing-area/command.model";
import {KeyMenu} from '../lib/keymenu/keyMenu';
import {DefaultUSStackKMMode} from '../lib/keymenu/defaultUSStackKMMode/defaultUSStackKMMode';
import {PrintedInstructionKMMode} from '../lib/keymenu/printedInstructionKMMode/printedInstructionKMMode';
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
    this.keyMenu = new KeyMenu({
      containerId: 'keyMenu',
      containingHTMLElement: this.componentNE,
      modes: {
        "normal": new DefaultUSStackKMMode({
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
        "labelEdit": new PrintedInstructionKMMode({
          instructions: "Insert/edit text.  Use ESC or Ctrl-[ to return to Normal mode."
        })
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
