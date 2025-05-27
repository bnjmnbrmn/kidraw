import {AfterViewInit, Component, ElementRef, EventEmitter, HostListener, inject, Input, Output} from '@angular/core';
import {DACommand, DACommandType} from "../drawing-area/command.model";
import Konva from 'konva';
import Stage = Konva.Stage;
import Layer = Konva.Layer;


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
  | {key: DisplayableKey.a}
  | {key: DisplayableKey.b}
  | {key: DisplayableKey.c}
  | {key: DisplayableKey.d}
  | {key: DisplayableKey.e}
  | {key: DisplayableKey.f}
  | {key: DisplayableKey.g}
  | {key: DisplayableKey.h}
  | {key: DisplayableKey.i}
  | {key: DisplayableKey.j}
  | {key: DisplayableKey.k}
  | {key: DisplayableKey.l}
  | {key: DisplayableKey.m}
  | {key: DisplayableKey.n}
  | {key: DisplayableKey.o}
  | {key: DisplayableKey.p}
  | {key: DisplayableKey.q}
  | {key: DisplayableKey.r}
  | {key: DisplayableKey.s}
  | {key: DisplayableKey.t}
  | {key: DisplayableKey.u}
  | {key: DisplayableKey.v}
  | {key: DisplayableKey.w}
  | {key: DisplayableKey.x}
  | {key: DisplayableKey.y}
  | {key: DisplayableKey.z}

class KeyMenuLayer extends Layer {

}

interface KeyMenuSubmenu {
  updateLayer(layer: KeyMenuLayer): void;
}

class LabelEditModeRootSubmenu implements KeyMenuSubmenu {
  updateLayer(layer: KeyMenuLayer): void {
  }
  constructor(private keymenuOut: EventEmitter<DACommand>) {

  }

}

class SelectModeRootSubmenu implements KeyMenuSubmenu {
  updateLayer(layer: KeyMenuLayer): void {
  }
  constructor(private keymenuOut: EventEmitter<DACommand>) {

  }

}

abstract class KeyMenuMode {
  private name: string;
  private rootSubmenu: KeyMenuSubmenu;
  private stack: KeyMenuSubmenu[];
  constructor(args: { name: string; rootSubmenu: KeyMenuSubmenu }) {
    this.name = args.name;
    this.rootSubmenu = args.rootSubmenu;
    this.stack = [this.rootSubmenu];
  }

  get stackTop() {
    return this.stack[this.stack.length - 1];
  }

  updateLayer(layer: KeyMenuLayer) {
    const text = new Konva.Text({
      text: "Mode: " + this.name
    });

    layer.add(text);

    this.stackTop.updateLayer(layer);


  }

  abstract handleKeyDown(event: KeyboardEvent): void;

  abstract handleKeyUp(event: KeyboardEvent): void;
}

class KeyMenu {
  private layer: KeyMenuLayer;
  private modes: KeyMenuMode[];
  private currentMode: KeyMenuMode;

  constructor(args: { layer: KeyMenuLayer, modes: KeyMenuMode[] }) {
    this.layer = args.layer;
    this.modes = args.modes;
    this.currentMode = this.modes[0];
  }

  updateLayer() {
    this.layer.clear()
    this.currentMode.updateLayer(this.layer)
  }

  handleKeyDown(event: KeyboardEvent) {
    console.log("KeyMenu received " + event.key + " down")
    this.currentMode.handleKeyDown(event)
  }

  handleKeyUp(event: KeyboardEvent) {
    console.log("KeyMenu received " + event.key + " up")
    this.currentMode.handleKeyUp(event);
  }
}

class SelectKeyMenuMode extends KeyMenuMode {
  constructor(args: { keyMenuOut:  EventEmitter<DACommand>}) {
    super({name: "Select", rootSubmenu: new SelectModeRootSubmenu(args.keyMenuOut) });

  }

  override handleKeyDown(event: KeyboardEvent): void {
  }

  override handleKeyUp(event: KeyboardEvent): void {
  }

}

class LabelEditKeyMenuMode extends KeyMenuMode {
  constructor(args: { keyMenuOut:  EventEmitter<DACommand>}) {
    super({name: "Label Edit", rootSubmenu: new LabelEditModeRootSubmenu(args.keyMenuOut) });
  }

  override handleKeyDown(event: KeyboardEvent): void {
  }

  override handleKeyUp(event: KeyboardEvent): void {
  }

}

@Component({
  selector: 'app-keymenu',
  imports: [],
  templateUrl: './keymenu.component.html',
  styleUrl: './keymenu.component.css'
})
export class KeymenuComponent implements AfterViewInit {
  private keyMenu!: KeyMenu;

  ngAfterViewInit(): void {
    this.stage = new Stage({
      container: 'keyMenu',
      width: this.componentNE.offsetWidth,
      height: this.componentNE.offsetHeight
    });
    this.stage.container().style.backgroundColor = 'lightgray'
    this.keymenuLayer = new KeyMenuLayer();
    this.stage.add(this.keymenuLayer);


    this.keyMenu = new KeyMenu({
      layer: this.keymenuLayer,
      modes: [
        new SelectKeyMenuMode({keyMenuOut: this.keyMenuOut}),
        new LabelEditKeyMenuMode({keyMenuOut: this.keyMenuOut}),
      ]
    });
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

