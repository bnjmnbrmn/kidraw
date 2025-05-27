import {DACommand, DACommandType} from '../drawing-area/command.model';
import Konva from 'konva';
import {KMCommand} from './KMCommand';
import {DisplayableKey} from "./keymenu.component";

export type DAKMCommandPair = { daCommand: DACommand | undefined, kmCommand: KMCommand | undefined };



export class SelectMode {
  private static instance: SelectMode;


  private constructor() {
  }


  commandsForEvent(ke: KeyboardEvent): DAKMCommandPair {
    switch (ke.key) {
      case 'h':
        return {daCommand: {kind: DACommandType.MOVE_CROSSHAIRS_LEFT}, kmCommand: undefined};
      case 'j':
        return {daCommand: {kind: DACommandType.MOVE_CROSSHAIRS_DOWN}, kmCommand: undefined};
      case 'k':
        return {daCommand: {kind: DACommandType.MOVE_CROSSHAIRS_UP}, kmCommand: undefined};
      case 'l':
        return {daCommand: {kind: DACommandType.MOVE_CROSSHAIRS_RIGHT}, kmCommand: undefined};
      case 'i':
        return {daCommand: {kind: DACommandType.CREATE_NEW_NODE}, kmCommand: undefined};
      case 'v':
        return {daCommand: {kind: DACommandType.MULTI_ITEM_SELECT}, kmCommand: undefined};
      case 's':
        return {daCommand: {kind: DACommandType.SINGLE_ITEM_TOGGLE_SELECT}, kmCommand: undefined};
      case 'q':
        return {daCommand: {kind: DACommandType.ZOOM_OUT}, kmCommand: undefined};
      case 'w':
        return {daCommand: {kind: DACommandType.ZOOM_IN}, kmCommand: undefined};
      case 'c':
        return {daCommand: {kind: DACommandType.CONNECT_SELECTED_NODES}, kmCommand: undefined};
      default:
        return {daCommand: undefined, kmCommand: undefined};
    }
  }

  static getInstance(): SelectMode {
    if (!SelectMode.instance) {
      SelectMode.instance = new SelectMode();
    }
    return SelectMode.instance;
  }
}

export class LabelEditMode {

  commandsForEvent(ke: KeyboardEvent): DAKMCommandPair {
    const code = ke.code;

    console.log(`ke.code ${code}`);
    console.log('key is ' + ke.key)

    const key = ke.key;
    if (("Enter" === key && ke.shiftKey) || ("[" === key && ke.ctrlKey) || "Escape" === key) {
      return {daCommand: {kind: DACommandType.EXIT_LABEL_EDIT_MODE}, kmCommand: {kind: "switch-to-select-mode"}};
    } else if (key.length === 1 && key.match(/^[\P{Cc}\P{Cn}\P{Cs}]+$/gu)) {
      return {daCommand: {kind: DACommandType.INSERT_CHAR, value: key}, kmCommand: undefined};
    } else if ("Enter" === key && this.noModifier(ke)) {
      return {daCommand: {kind: DACommandType.INSERT_CHAR, value: key}, kmCommand: undefined};
    } else if (["Enter", "Tab"].includes(key) && this.noModifier(ke)) {
      return {daCommand: {kind: DACommandType.INSERT_CHAR, value: key}, kmCommand: undefined};
    }
    return {daCommand: undefined, kmCommand: undefined};
  }

  private noModifier(ke: KeyboardEvent) {
    return !ke.altKey && !ke.ctrlKey && !ke.shiftKey && !ke.metaKey;
  }

}
