import {Stage} from 'konva/lib/Stage';
import {KeyMenuMode} from './keyMenuMode';
import Konva from 'konva';
import {Layer} from 'konva/lib/Layer';
import {KeyMenuConfig} from './keyMenuConfig';
export import Group = Konva.Group;

export class KeyMenu<T> {
  private containingHTMLElement: HTMLElement;
  private containerId: string;

  private stage: Stage;
  private layer: Layer;

  private modesForNames: { [p: string]: KeyMenuMode<T> };
  private currentMode: KeyMenuMode<T>;


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

    this.modesForNames = config.modes;

    Object.entries(this.modesForNames).forEach(([name, mode]) => {
      mode.name = name;
      mode.keyMenu = this;
    })

    this.currentMode = Object.entries(this.modesForNames)[0][1];

    this.layer.add(this.currentMode.konvaGroup);
  }

  handleKeyDown(event: KeyboardEvent) {
    console.log("KeyMenu received " + event.key + " down")
    this.currentMode.handleKeyDown(event)
  }

  handleKeyUp(event: KeyboardEvent) {
    console.log("KeyMenu received " + event.key + " up")
    this.currentMode.handleKeyUp(event)
  }

  switchMode(modeName: string) {
    //todo?
  }

  public static noModifier(ke: KeyboardEvent) {
    return !ke.altKey && !ke.ctrlKey && !ke.shiftKey && !ke.metaKey;
  }

}
