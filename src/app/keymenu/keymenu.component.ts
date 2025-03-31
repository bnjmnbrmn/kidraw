import {Component, EventEmitter, HostListener, Output} from '@angular/core';
import type {Command} from "../drawing-area/command.model";

@Component({
  selector: 'app-keymenu',
  imports: [],
  templateUrl: './keymenu.component.html',
  styleUrl: './keymenu.component.css'
})
export class KeymenuComponent {

  @Output() keymenuOut = new EventEmitter<Command>;

  keyCommandMap: Map<string, Command> = new Map(Object.entries({
    h: {kind: "move-cursor-left"},
    j: {kind: "move-cursor-down"},
    k: {kind: "move-cursor-up"},
    l: {kind: "move-cursor-right"},
  }));

  @HostListener('document:keydown', ["$event"])
  handleKeyDown(event: KeyboardEvent) {
    const ek = event.key as string;
    if (this.keyCommandMap.has(ek)) {
      console.log("km: " + this.keyCommandMap.get(ek));
      this.keymenuOut.emit(this.keyCommandMap.get(ek))
    }

  }

}
