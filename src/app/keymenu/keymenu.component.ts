import {AfterViewInit, Component, ElementRef, EventEmitter, HostListener, inject, Output} from '@angular/core';
import {DACommand} from "../drawing-area/command.model";
import Konva from 'konva';
import {KeyMenuLayer} from '../lib/keymenu/keyMenuLayer';
import {KiDrawKeyMenu} from './kiDrawKeyMenu';
import Stage = Konva.Stage;


@Component({
  selector: 'app-keymenu',
  imports: [],
  templateUrl: './keymenu.component.html',
  styleUrl: './keymenu.component.css'
})
export class KeymenuComponent implements AfterViewInit {

  private keyMenu!: KiDrawKeyMenu;
  private keymenuLayer!: KeyMenuLayer;
  private stage!: Stage;
  private componentNE = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  @Output() keyMenuOut = new EventEmitter<DACommand>;

  ngAfterViewInit(): void {
    this.stage = new Stage({
      container: 'keyMenu',
      width: this.componentNE.offsetWidth,
      height: this.componentNE.offsetHeight
    });
    this.stage.container().style.backgroundColor = 'lightgray'
    this.keymenuLayer = new KeyMenuLayer();
    this.stage.add(this.keymenuLayer);


    this.keyMenu = new KiDrawKeyMenu({
      layer: this.keymenuLayer,
      keyMenuOut: this.keyMenuOut,
      width: this.componentNE.offsetWidth,
      height: this.componentNE.offsetHeight
    });
    this.keyMenu.updateLayer()
  }



  @HostListener('document:keydown', ["$event"])
  handleKeyDown(event: KeyboardEvent) {
    this.keyMenu.handleKeyDown(event);
  }

  @HostListener('document:keyup', ["$event"])
  handleKeyUp(event: KeyboardEvent) {
    this.keyMenu.handleKeyUp(event);
  }

}
