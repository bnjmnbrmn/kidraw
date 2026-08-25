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
  private modeLabel: Konva.Text;
  private onModeSwitch?: (newModeName: string) => void;

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
    this.stage.container().style.backgroundColor = config.stageBackground ?? 'lightgray'
    this.onModeSwitch = config.onModeSwitch;
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

    // Mode label: sits above all mode groups, shows current mode/submenu name
    this.modeLabel = new Konva.Text({
      x: 0,
      y: 8,
      width: this.containingHTMLElement.clientWidth,
      align: 'center',
      text: '',
      fontSize: 16,
      fontFamily: 'monospace',
      fontStyle: 'bold',
      fill: '#888888',
      listening: false,
    });
    this.layer.add(this.modeLabel);

    this.currentMode.konvaGroup.show();
  }

  /**
   * Resolve a unique tracking key for keysDown: the PHYSICAL key, which also
   * gives the left/right modifiers distinct names so holding both Shifts
   * works. It must be physical because `event.key` changes with the modifier
   * state — Shift+Quote arrives as `"` on keydown but as `'` on keyup if
   * Shift comes up first, which would leave `"` in keysDown forever and
   * swallow the next press of that key.
   * Falls back to `event.key` for synthetic events that carry no code.
   */
  private static resolveTrackingKey(event: KeyboardEvent): string {
    if (event.code) return event.code;
    const k = event.key;
    if (k.length === 1 && k >= 'A' && k <= 'Z') return k.toLowerCase();
    return k;
  }

  handleKeyDown(event: KeyboardEvent) {
    const trackingKey = KeyMenu.resolveTrackingKey(event);
    if (!this.keysDown.has(trackingKey)) {
      this.keysDown.add(trackingKey);
      this.currentMode.handleKeyDown(event)
    }
  }

  handleKeyUp(event: KeyboardEvent) {
    const trackingKey = KeyMenu.resolveTrackingKey(event);
    this.keysDown.delete(trackingKey);
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
      this.onModeSwitch?.(modeName);
    }
  }

  updateModeLabel(text: string, color: string) {
    this.modeLabel.text(text);
    this.modeLabel.fill(color);
  }

  cancelAllInputState() {
    this.keysDown.clear();
    Object.values(this.modesForNames).forEach((mode) => mode.cancelInputState?.());
    this.onModeSwitch?.(this.currentMode.name);
  }

  destroy() {
    this.cancelAllInputState();
    this.stage.destroy();
  }

  public static noModifier(ke: KeyboardEvent) {
    return !ke.altKey && !ke.ctrlKey && !ke.shiftKey && !ke.metaKey;
  }

}
