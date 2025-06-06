import {DisplayableKey} from "./displayableKey";
import {LabeledAction} from "./defaultUSKMSubmenu";

export class KMKeyConfig extends LabeledAction {
  keyLabel: string;
  constructor(keyLabel: string, actionLabel: string, action: () => void) {
    super(actionLabel, action);
    this.keyLabel = keyLabel;
  }
}
