import {AfterViewInit, Component, ElementRef, EventEmitter, HostListener, inject, Output} from '@angular/core';
import {DACommand, DACommandType} from "../drawing-area/command.model";
import Konva from 'konva';
import {KeyMenu} from './keyMenu';
import {AbstractKeyMenuMode} from './abstractKeyMenuMode';
import {KeyMenuSubmenu} from './keyMenuSubmenu';
import {KeyMenuLayer} from './keyMenuLayer';
import Stage = Konva.Stage;
import {KeyMenuMode} from './keyMenuMode';


export enum DisplayableKey {
  'a' = "a",
  'b' = "b",
  'c' = "c",
  'd' = "d",
  'e' = "e",
  'f' = "f",
  'g' = "g",
  'h' = "h",
  'i' = "i",
  'j' = "j",
  'k' = "k",
  'l' = "l",
  'm' = "m",
  'n' = "n",
  'o' = "o",
  'p' = "p",
  'q' = "q",
  'r' = "r",
  's' = "s",
  't' = "t",
  'u' = "u",
  'v' = "v",
  'w' = "w",
  'x' = "x",
  'y' = "y",
  'z' = "z"
}

export type KeyMenuKey =
  | { key: DisplayableKey.a }
  | { key: DisplayableKey.b }
  | { key: DisplayableKey.c }
  | { key: DisplayableKey.d }
  | { key: DisplayableKey.e }
  | { key: DisplayableKey.f }
  | { key: DisplayableKey.g }
  | { key: DisplayableKey.h }
  | { key: DisplayableKey.i }
  | { key: DisplayableKey.j }
  | { key: DisplayableKey.k }
  | { key: DisplayableKey.l }
  | { key: DisplayableKey.m }
  | { key: DisplayableKey.n }
  | { key: DisplayableKey.o }
  | { key: DisplayableKey.p }
  | { key: DisplayableKey.q }
  | { key: DisplayableKey.r }
  | { key: DisplayableKey.s }
  | { key: DisplayableKey.t }
  | { key: DisplayableKey.u }
  | { key: DisplayableKey.v }
  | { key: DisplayableKey.w }
  | { key: DisplayableKey.x }
  | { key: DisplayableKey.y }
  | { key: DisplayableKey.z }

class LabelEditModeRootSubmenu implements KeyMenuSubmenu {

  constructor(private keymenuOut: EventEmitter<DACommand>, private keyMenuMode: KeyMenuMode<DACommand>) {
  }


  updateLayer(layer: KeyMenuLayer): void {
  }

  handleKeyDown(ke: KeyboardEvent): void {
    const code = ke.code;

    console.log(`ke.code ${code}`);
    console.log('key is ' + ke.key)

    const key = ke.key;
    if (("Enter" === key && ke.shiftKey) || ("[" === key && ke.ctrlKey) || "Escape" === key) {
      this.keymenuOut.emit({kind: DACommandType.EXIT_LABEL_EDIT_MODE});
      this.keyMenuMode.keyMenu.switchMode("Select");
    } else if (key.length === 1 && key.match(/^[\P{Cc}\P{Cn}\P{Cs}]+$/gu)) {
       this.keymenuOut.emit({kind: DACommandType.INSERT_CHAR, value: key});
    } else if ("Enter" === key && KeyMenu.noModifier(ke)) {
      this.keymenuOut.emit( {kind: DACommandType.INSERT_CHAR, value: key});
    } else if (["Enter", "Tab"].includes(key) && KeyMenu.noModifier(ke)) {
      this.keymenuOut.emit({kind: DACommandType.INSERT_CHAR, value: key});
    }

  }

  handleKeyUp(event: KeyboardEvent): void {
  }

}

class SelectModeRootSubmenu implements KeyMenuSubmenu {
  updateLayer(layer: KeyMenuLayer): void {
  }

  constructor(private keymenuOut: EventEmitter<DACommand>, public keyMenuMode: KeyMenuMode<DACommand>) {
  }

  handleKeyUp(event: KeyboardEvent): void {
  }


  handleKeyDown(event: KeyboardEvent): void {
    switch (event.key) {
      case 'h':
        this.keymenuOut.emit({kind: DACommandType.MOVE_CROSSHAIRS_LEFT});
        break;
      case 'j':
        this.keymenuOut.emit({kind: DACommandType.MOVE_CROSSHAIRS_DOWN});
        break;
      case 'k':
        this.keymenuOut.emit({kind: DACommandType.MOVE_CROSSHAIRS_UP});
        break;
      case 'l':
        this.keymenuOut.emit({kind: DACommandType.MOVE_CROSSHAIRS_RIGHT});
        break;
      case 'i':
        this.keymenuOut.emit({kind: DACommandType.CREATE_NEW_NODE});
        this.keyMenuMode.keyMenu.switchMode("Label Edit");
        break;
      case 'v':
        this.keymenuOut.emit({kind: DACommandType.MULTI_ITEM_SELECT});
        break;
      case 's':
        this.keymenuOut.emit({kind: DACommandType.SINGLE_ITEM_TOGGLE_SELECT});
        break;
      case 'q':
        this.keymenuOut.emit({kind: DACommandType.ZOOM_OUT});
        break;
      case 'w':
        this.keymenuOut.emit({kind: DACommandType.ZOOM_IN});
        break;
      case 'c':
        this.keymenuOut.emit({kind: DACommandType.CONNECT_SELECTED_NODES});
        break;
    }
  }

}

class SelectKeyMenuMode extends AbstractKeyMenuMode<DACommand> {
  constructor(args: { keyMenuOut: EventEmitter<DACommand>, keyMenu: KeyMenu<DACommand> }) {
    super({name: "Select", keyMenu: args.keyMenu});
    const selectModeRootSubmenu = new SelectModeRootSubmenu(args.keyMenuOut, this);
    this.stack.push(selectModeRootSubmenu);
  }

  override handleKeyDown(event: KeyboardEvent): void {
    this.stackTop.handleKeyDown(event)
  }

  override handleKeyUp(event: KeyboardEvent): void {
  }

}

class LabelEditKeyMenuMode extends AbstractKeyMenuMode<DACommand> {
  constructor(args: { keyMenuOut: EventEmitter<DACommand>, keyMenu: KeyMenu<DACommand> }) {
    super({name: "Label Edit", keyMenu: args.keyMenu});
    const labelEditRootSubmenu = new LabelEditModeRootSubmenu(args.keyMenuOut, this);
    this.stack.push(labelEditRootSubmenu);
  }
}

class KiDrawKeyMenu extends KeyMenu<DACommand> {
  constructor(args: { layer: KeyMenuLayer, keyMenuOut: EventEmitter<DACommand> }) {
    super({layer: args.layer, keyMenuOut: args.keyMenuOut});
    this.modes.push(new SelectKeyMenuMode({keyMenuOut: this.keyMenuOut, keyMenu: this}));
    this.modes.push(new LabelEditKeyMenuMode({keyMenuOut: this.keyMenuOut, keyMenu: this}));
    this.currentMode = this.modes[0];
  }

}

@Component({
  selector: 'app-keymenu',
  imports: [],
  templateUrl: './keymenu.component.html',
  styleUrl: './keymenu.component.css'
})
export class KeymenuComponent implements AfterViewInit {
  private keyMenu!: KiDrawKeyMenu;

  ngAfterViewInit(): void {
    this.stage = new Stage({
      container: 'keyMenu',
      width: this.componentNE.offsetWidth,
      height: this.componentNE.offsetHeight
    });
    this.stage.container().style.backgroundColor = 'lightgray'
    this.keymenuLayer = new KeyMenuLayer();
    this.stage.add(this.keymenuLayer);


    this.keyMenu = new KiDrawKeyMenu({layer: this.keymenuLayer, keyMenuOut: this.keyMenuOut});
    this.keyMenu.updateLayer()
  }

  private keymenuLayer!: KeyMenuLayer;
  private stage!: Stage;
  private componentNE = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  @Output() keyMenuOut = new EventEmitter<DACommand>;

  // @Input() mode!: KMMode;


  @HostListener('document:keydown', ["$event"])
  handleKeyDown(event: KeyboardEvent) {
    this.keyMenu.handleKeyDown(event);
  }

  @HostListener('document:keyup', ["$event"])
  handleKeyUp(event: KeyboardEvent) {
    this.keyMenu.handleKeyUp(event);
  }

}

