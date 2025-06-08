import {Stage} from 'konva/lib/Stage';
import {KeyMenuMode} from './keyMenuMode';
import Konva from 'konva';
import {Layer} from 'konva/lib/Layer';
import {DefaultUSStackKMMode} from './defaultUSStackKMMode/defaultUSStackKMMode';
import {PrintedInstructionKMMode} from './printedInstructionKMMode/printedInstructionKMMode';
import {KeyMenuConfig} from './keyMenuConfig';
import {DefaultUSStackKMModeGroupGenerator} from './defaultUSStackKMMode/defaultUSStackKMModeGroupGenerator';
import {PrintedInstructionKMModeGroupGenerator} from './printedInstructionKMMode/printedInstructionKMModeGroupGenerator';
export import Group = Konva.Group;

export class KeyMenu<T> {
  private stage: Stage;
  private containingHTMLElement: HTMLElement;
  private containerId: string;
  private modesForNames: { [p: string]: KeyMenuMode<T> };
  private modeGroupsForNames: { [p: string]: Group };
  private currentModeName: string;
  private layer: Layer;
  private currentModeGroup: Group;
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
    this.currentModeName = Object.entries(config.modes)[0][0];

    this.currentMode = this.modesForNames[this.currentModeName];

    this.modeGroupsForNames = Object.fromEntries(
      Object.entries(this.modesForNames)
        .map(([key, mode]) => [ key, this.toGroup(mode) ] )
    );

    this.currentModeGroup = this.modeGroupsForNames[this.currentModeName];

    this.layer.add(this.currentModeGroup);
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

  private toGroup(mode: KeyMenuMode<T>): Group {
    if (mode instanceof DefaultUSStackKMMode) {
      return new DefaultUSStackKMModeGroupGenerator().generateGroup(mode);
    } else if (mode instanceof PrintedInstructionKMMode) {
      return new PrintedInstructionKMModeGroupGenerator().generateGroup(mode);
    }
    const modeClass = mode.constructor.name;
    throw new Error("Unknown mode class " + modeClass);

  }
}
