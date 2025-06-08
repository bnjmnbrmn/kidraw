import {DefaultUSStackKMMode} from "./defaultUSStackKMMode";
import {DefaultUSStackKMModeLabeledAction} from './defaultUSStackKMModeLabeledAction';
import {DefaultUSStackKMModeSubmenuConfig} from './defaultUSStackKMModeSubmenuConfig';


export class DefaultUSStackKMModeSubmenu<T> {

  constructor(public mode: DefaultUSStackKMMode<T>,
              public config: DefaultUSStackKMModeSubmenuConfig) {
  }


  handleKeyUp(event: KeyboardEvent): void {
    //todo
  }


  handleKeyDown(event: KeyboardEvent): void {
    console.log("event.key", event.key);
    const key = event.key as keyof DefaultUSStackKMModeSubmenuConfig;
    if (this.config[key]) {
      if (this.config[key] instanceof DefaultUSStackKMModeLabeledAction) {
        this.mode.highlightStackTopKey(key);
        const labeledAction = this.config[key];
        labeledAction.action();
      } else { // if this.config[key] instanceof LabeledDefaultUSKMSubmenuConfig
        const labeledDefaultUSKMSubmenuConfig = this.config[key];
        this.mode.pushSubmenu(labeledDefaultUSKMSubmenuConfig);
      }
    }
  }

}
