import {Stage} from 'konva/lib/Stage';
import {KeyMenuMode} from './keyMenuMode';
import Konva from 'konva';
import {Layer} from 'konva/lib/Layer';
import {KeyMenuConfig} from './keyMenuConfig';
export import Group = Konva.Group;

export class KeyMenu<T> {
  containingHTMLElement: HTMLElement;
  containerId: string;

  stage: Stage;
  layer: Layer;

  modesForNames: { [p: string]: KeyMenuMode<T> };
  currentMode: KeyMenuMode<T>;

  keysDown: Set<string> = new Set();


  constructor(config: KeyMenuConfig<T>) {
    this.containingHTMLElement = config.containingHTMLElement;
    this.containerId = config.containerId;
    this.stage = new Stage({
      container: this.containerId,
      width: this.containingHTMLElement.clientWidth,
      height: this.containingHTMLElement.clientHeight
    });
    this.stage.container().style.backgroundColor = 'lightgray'
    this.layer = new Layer({});
    this.stage.add(this.layer);

    this.modesForNames = Object.fromEntries(Object.entries(config.modes)
      .map(([name, modeConfig]) =>
        [name, modeConfig.createMode(name, this)]));

    const availableModeNames = Object.keys(this.modesForNames);
    if (availableModeNames.length === 0) {
      throw new Error('KeyMenu requires at least one mode configuration.');
    }

    const configuredInitialModeName = config.initialModeName;
    const initialModeName = configuredInitialModeName && this.modesForNames[configuredInitialModeName]
      ? configuredInitialModeName
      : availableModeNames[0];
    this.currentMode = this.modesForNames[initialModeName];

    Object.values(this.modesForNames).forEach((mode) => {
      this.layer.add(mode.konvaGroup);
      mode.konvaGroup.hide();
    })

    this.currentMode.konvaGroup.show();
  }

  handleKeyDown(event: KeyboardEvent) {
    // console.log("KeyMenu received " + event.key + " down")

    if (!this.keysDown.has(event.key)) {
      this.keysDown.add(event.key);
      this.currentMode.handleKeyDown(event)
    }
  }

  handleKeyUp(event: KeyboardEvent) {
    // console.log("KeyMenu received " + event.key + " up")
    this.keysDown.delete(event.key);
    this.currentMode.handleKeyUp(event)
  }

  switchMode(modeName: string) {
    const modeForName = this.modesForNames[modeName];
    if (modeForName) {
      this.currentMode.konvaGroup.hide();
      this.currentMode.beforeSwitchOut()
      this.currentMode = modeForName;
      this.currentMode.beforeSwitchIn()
      this.currentMode.konvaGroup.show();
    }
  }

  destroy() {
    this.keysDown.clear();
    this.stage.destroy();
  }

  public static noModifier(ke: KeyboardEvent) {
    return !ke.altKey && !ke.ctrlKey && !ke.shiftKey && !ke.metaKey;
  }

}
