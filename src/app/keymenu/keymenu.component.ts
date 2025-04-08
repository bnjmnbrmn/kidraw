import {Component, EventEmitter, HostListener, Input, Output} from '@angular/core';
import type {Command} from "../drawing-area/command.model";
import {Observable} from 'rxjs';

@Component({
  selector: 'app-keymenu',
  imports: [],
  templateUrl: './keymenu.component.html',
  styleUrl: './keymenu.component.css'
})
export class KeymenuComponent {

  @Output() keymenuOut = new EventEmitter<Command>;
  @Input() mode!: KMMode;

  selectModeCommandForKeyboardEvent = (ke: KeyboardEvent): Command | undefined => {
    switch (ke.key) {
      case 'h':
        return {kind: "move-cursor-left"};
      case 'j':
        return {kind: "move-cursor-down"};
      case 'k':
        return {kind: "move-cursor-up"};
      case 'l':
        return {kind: "move-cursor-right"};
      case 'i':
        return {kind: "create-new-node"};
      default:
        return undefined;
    }

  };

  private labelEditModeCommandForKeyboardEvent: (ke: KeyboardEvent) => (Command | undefined) =
    (ke) => {

      const code = ke.code;

      console.log(`ke.code ${code}`);
      console.log('key is ' + ke.key)

      const key = ke.key;
      if (("Enter" === key && ke.shiftKey) || ("[" === key && ke.ctrlKey) || "Escape" === key) {
        return {kind: "exit-label-edit-mode"}
      } else if (key.length === 1 && key.match(/^[\P{Cc}\P{Cn}\P{Cs}]+$/gu)) {
        return {kind: "insert-char", value: key}
      } else if ("Enter" === key && this.noModifier(ke)) {
        return {kind: "insert-char", value: key}
      } else if (["Enter", "Tab"].includes(key) && this.noModifier(ke)) {
        return {kind: "insert-char", value: key}


      }
      return undefined;
    };

  private noModifier(ke: KeyboardEvent) {
    return !ke.altKey && !ke.ctrlKey && !ke.shiftKey && !ke.metaKey;
  }

  getModeMap(kmMode: KMMode): (ke: KeyboardEvent) => Command | undefined {
    switch (kmMode) {
      case "select":
        return this.selectModeCommandForKeyboardEvent;
      case "label-edit":
        return this.labelEditModeCommandForKeyboardEvent;
    }

  }

  @HostListener('document:keydown', ["$event"])
  handleKeyDown(event: KeyboardEvent) {
    // console.log("event: " + JSON.stringify(event));
    // console.log(event.getModifierState('Control'));
    // const ek = event.key; //as string;
    // console.log("ek: " + ek)
    const modeMap = this.getModeMap(this.mode);
    const command = modeMap(event);
    // console.log("km: " + JSON.stringify(command));
    if (command) {
      this.keymenuOut.emit(command)
    }
  }

}

export type KMMode =
  | "select"
  | "label-edit"
