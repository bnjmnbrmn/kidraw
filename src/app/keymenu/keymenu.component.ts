import {Component, EventEmitter, HostListener, Input, Output} from '@angular/core';
import type {DACommand} from "../drawing-area/command.model";

type KMCommand =
  | {kind: "switch-to-select-mode" }
  | {kind: "switch-to-label-edit-mode" }

type DAKMCommandPair = { daCommand: DACommand | undefined, kmCommand: KMCommand | undefined };

@Component({
  selector: 'app-keymenu',
  imports: [],
  templateUrl: './keymenu.component.html',
  styleUrl: './keymenu.component.css'
})
export class KeymenuComponent {

  @Output() keymenuOut = new EventEmitter<DACommand>;
  @Input() mode!: KMMode;

  selectModeCommandForKeyboardEvent = (ke: KeyboardEvent): DAKMCommandPair => {
    switch (ke.key) {
      case 'h':
        return {daCommand: {kind: "move-cursor-left"}, kmCommand: undefined};
      case 'j':
        return {daCommand: {kind: "move-cursor-down"}, kmCommand: undefined};
      case 'k':
        return {daCommand: {kind: "move-cursor-up"}, kmCommand: undefined};
      case 'l':
        return {daCommand: {kind: "move-cursor-right"}, kmCommand: undefined};
      case 'i':
        return {daCommand: {kind: "create-new-node"}, kmCommand: undefined};
      case 'v':
        return {daCommand: {kind: "toggle-item-selection"}, kmCommand: undefined};
      default:
        return {daCommand: undefined, kmCommand: undefined};
    }

  };

  private labelEditModeCommandForKeyboardEvent: (ke: KeyboardEvent) => DAKMCommandPair =
    (ke) => {

      const code = ke.code;

      console.log(`ke.code ${code}`);
      console.log('key is ' + ke.key)

      const key = ke.key;
      if (("Enter" === key && ke.shiftKey) || ("[" === key && ke.ctrlKey) || "Escape" === key) {
        return {daCommand: {kind: "exit-label-edit-mode"}, kmCommand: {kind: "switch-to-select-mode"}};
      } else if (key.length === 1 && key.match(/^[\P{Cc}\P{Cn}\P{Cs}]+$/gu)) {
        return {daCommand: {kind: "insert-char", value: key}, kmCommand: undefined};
      } else if ("Enter" === key && this.noModifier(ke)) {
        return {daCommand: {kind: "insert-char", value: key}, kmCommand: undefined};
      } else if (["Enter", "Tab"].includes(key) && this.noModifier(ke)) {
        return {daCommand: {kind: "insert-char", value: key}, kmCommand: undefined};
      }
      return {daCommand: undefined, kmCommand: undefined};
    };

  private noModifier(ke: KeyboardEvent) {
    return !ke.altKey && !ke.ctrlKey && !ke.shiftKey && !ke.metaKey;
  }

  getModeMap(kmMode: KMMode): (ke: KeyboardEvent) => DAKMCommandPair {
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
    const {daCommand, kmCommand} = modeMap(event);

    if (kmCommand) {
      switch (kmCommand.kind) {
        case "switch-to-select-mode":
          this.mode = "select";
          break;
        case "switch-to-label-edit-mode":
          this.mode = "label-edit";
          break;
      }
    }

    // console.log("km: " + JSON.stringify(daCommand));
    if (daCommand) {
      this.keymenuOut.emit(daCommand)
    }
  }

}

export type KMMode =
  | "select"
  | "label-edit"
