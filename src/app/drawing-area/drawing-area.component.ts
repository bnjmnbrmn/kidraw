import {AfterViewInit, Component, ElementRef, EventEmitter, inject, Input, Output, ViewChild} from '@angular/core';
import {Observable} from 'rxjs';
import {DACommand} from './command.model';
import {DANode} from './drawing-area-node.model';
import {DANotification} from './da-notification.model';

export class DACrosshairs {
  private hidden: boolean = false;

  constructor(public x: number, public y: number) {
  }

  hide() {
    this.hidden = true;
  }

  show() {
    this.hidden = false;
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (!this.hidden) {
      const originalStrokeStyle = ctx.strokeStyle;
      const originalLineWidth = ctx.lineWidth;

      ctx.strokeStyle = 'rgba(0,0,0,0.5)'
      ctx.lineWidth = 2;

      ctx.beginPath()
      ctx.moveTo(this.x - 20, this.y);
      ctx.lineTo(this.x + 20, this.y);
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(this.x, this.y - 20);
      ctx.lineTo(this.x, this.y + 20);
      ctx.stroke()

      ctx.strokeStyle = originalStrokeStyle;
      ctx.lineWidth = originalLineWidth;
    }
  }
}

@Component({
  selector: 'app-drawing-area',
  imports: [],
  templateUrl: './drawing-area.component.html',
  styleUrl: './drawing-area.component.css'
})
export class DrawingAreaComponent implements AfterViewInit {

  private componentER = inject<ElementRef<HTMLElement>>(ElementRef);
  private componentNE = this.componentER.nativeElement;
  @ViewChild('mainDrawingArea') private mainDrawingAreaER!: ElementRef;
  private canvas!: HTMLCanvasElement;
  private ctx!: CanvasRenderingContext2D;

  private daNodes: DANode[] = [];
  // private crosshairsX!: number;
  // private crosshairsY!: number;
  private crosshairs!: DACrosshairs;

  private resizeObserver!: ResizeObserver;


  @Input({required: true}) commands!: Observable<DACommand>;
  @Output() daOut = new EventEmitter<DANotification>()

  ngAfterViewInit(): void {
    this.canvas = this.mainDrawingAreaER.nativeElement as HTMLCanvasElement;
    this.canvas.height = this.componentNE.offsetHeight;
    this.canvas.width = this.componentNE.offsetWidth;
    this.ctx = this.canvas.getContext("2d")!;

    this.crosshairs = new DACrosshairs(this.canvas.width / 2, this.canvas.height / 2);

    this.redraw();

    this.commands.subscribe(this.handleCommands.bind(this));

    this.resizeObserver = new ResizeObserver(entries => {
      for (let entry of entries) {
        // console.log("entry: entry");
        // const { width, height } = entry.contentRect;
        // console.log(`New Size - Width: ${width}, Height: ${height}`);
        this.canvas.height = this.componentNE.offsetHeight;
        this.canvas.width = this.componentNE.offsetWidth;
        this.redraw();
      }
    });
    this.resizeObserver.observe(this.componentNE);
  }

  private redraw() {

    let ctx = this.ctx;

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.crosshairs.draw(ctx);

    for (const node of this.daNodes) {
      node.draw(ctx);
    }

  }

  private handleCommands(command: DACommand) {

    console.log("Command: " + JSON.stringify(command));
    switch (command.kind) {
      case "move-cursor-left":
        this.crosshairs.x -= 50;
        break;
      case "move-cursor-down":
        this.crosshairs.y += 50;
        break;
      case "move-cursor-right":
        this.crosshairs.x += 50;
        break;
      case "move-cursor-up":
        this.crosshairs.y -= 50;
        break;
      case "create-new-node":
        console.log("creating new node");
        let daNode = new DANode({x: this.crosshairs.x, y: this.crosshairs.y, isSelected: true});
        this.daNodes.push(daNode);
        this.daOut.emit({kind: "started-label-editing-mode"})
        break
      case "insert-char":
        const key = command.value;
        this.getSelectedDANodes().forEach(daNode => {
          daNode.label.text += key;
        })
        this.crosshairs.hide();
        break;
      case "exit-label-edit-mode":
        this.crosshairs.show();
        this.getSelectedDANodes().forEach(daNode => {
          daNode.isSelected = false;
        });
        break;
    }

    this.redraw();

  }

  private getSelectedDANodes() {
    return this.daNodes.filter((daNode) => daNode.isSelected);
  }
}
