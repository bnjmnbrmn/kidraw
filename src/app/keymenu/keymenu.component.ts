import {AfterViewInit, Component, ElementRef, EventEmitter, HostListener, inject, Input, Output} from '@angular/core';
import {DACommand, DACommandType} from "../drawing-area/command.model";
import Konva from 'konva';
import Stage = Konva.Stage;
import {KMMode, LabelEditMode, SelectMode} from './KMMode';


@Component({
  selector: 'app-keymenu',
  imports: [],
  templateUrl: './keymenu.component.html',
  styleUrl: './keymenu.component.css'
})
export class KeymenuComponent implements  AfterViewInit {

  ngAfterViewInit(): void {
    this.stage = new Stage({
      container: 'keyMenu',
      width: 100,
      height: 100
    });
    this.stage.container().style.backgroundColor = 'lightgray'
    this.mode.updateStage(this.stage);


  }

  private stage!: Stage;
  private componentNE = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  @Output() keymenuOut = new EventEmitter<DACommand>;
  @Input() mode!: KMMode;


  @HostListener('document:keydown', ["$event"])
  handleKeyDown(event: KeyboardEvent) {
    // console.log("event: " + JSON.stringify(event));
    // console.log(event.getModifierState('Control'));
    // const ek = event.key; //as string;
    // console.log("ek: " + ek)
    const {daCommand, kmCommand} = this.mode.commandsForEvent(event);

    if (kmCommand) {
      switch (kmCommand.kind) {
        case "switch-to-select-mode":
          this.mode = SelectMode.getInstance();
          break;
        case "switch-to-label-edit-mode":
          this.mode = LabelEditMode.getInstance();
          break;
      }
      this.mode.updateStage(this.stage);
    }

    // console.log("km: " + JSON.stringify(daCommand));
    if (daCommand) {
      this.keymenuOut.emit(daCommand)
    }
  }

}

