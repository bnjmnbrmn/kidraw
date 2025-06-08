import {AfterViewInit, Component, ElementRef, EventEmitter, HostListener, inject, Output} from '@angular/core';
import {DACommand, DACommandType} from "../drawing-area/command.model";
import Konva from 'konva';
import {KeyMenu} from '../lib/keymenu/keyMenu';
import {DefaultUSStackKMMode, DefaultUSStackKMModeConfig} from '../lib/keymenu/defaultUSStackKMMode';
import {PrintedInstructionKMMode} from '../lib/keymenu/printedInstructionKMMode';
import {
  DefaultUSKMSubmenu,
  LabeledAction,
  LabeledDefaultUSKMSubmenuConfig
} from '../lib/keymenu/thirtyKeyKM/defaultUSKMSubmenu';


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
          h: new LabeledAction(
            'Move Left',
            () => {
              this.keyMenuOut.emit({kind: DACommandType.MOVE_CROSSHAIRS_LEFT});
            }
          ),
          j: new LabeledAction(
            'Move Down',
            () => {
              this.keyMenuOut.emit({kind: DACommandType.MOVE_CROSSHAIRS_DOWN});
            }
          ),
          z: new LabeledDefaultUSKMSubmenuConfig(
            "Zoom/Pan",
            {
              i: new LabeledAction("Zoom In", () => {
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
