import {AfterViewInit, Component, ElementRef, EventEmitter, inject, Input, Output, ViewChild} from '@angular/core';
import {Observable} from 'rxjs';
import {DACommand} from './command.model';
import {DANode} from './drawing-area-node.model';
import {DANotification} from './da-notification.model';

export class DACrosshairs {
  private hidden: boolean = false;

  constructor(public ctx: CanvasRenderingContext2D, public x: number, public y: number) {
  }

  hide() {
    this.hidden = true;
  }

  show() {
    this.hidden = false;
  }

  draw() {
    const ctx = this.ctx;
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
  private scale: number = 1.0;


  @Input({required: true}) commands!: Observable<DACommand>;
  @Output() daOut = new EventEmitter<DANotification>()
  private panX: number = 0;
  private panY: number = 0;


  ngAfterViewInit(): void {
    this.canvas = this.mainDrawingAreaER.nativeElement as HTMLCanvasElement;
    this.canvas.height = this.componentNE.offsetHeight;
    this.canvas.width = this.componentNE.offsetWidth;
    this.ctx = this.canvas.getContext("2d")!;

    this.crosshairs = new DACrosshairs(this.ctx, this.canvas.width / 2, this.canvas.height / 2);

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

    ctx.resetTransform();
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.crosshairs.draw();

    ctx.translate(this.panX + this.canvas.width/2, this.panY + this.canvas.height/2);
    ctx.scale(this.scale, this.scale);

    for (const node of this.daNodes) {
      node.draw();
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
        let daNode = new DANode({ctx: this.ctx, x: this.physicalToLogicalX(this.crosshairs.x), y: this.physicalToLogicalY(this.crosshairs.y), isSelected: true});
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
      case "toggle-item-selection":
        console.log("this.daNodes", this.daNodes)
        const daNodesContainingPoint: DANode[] = this.getDANodesContainingCrosshairs();
        console.log("daNodesContainingPoint", daNodesContainingPoint);
        daNodesContainingPoint.forEach(daNode => daNode.isSelected = !daNode.isSelected);
        break;
      case "zoom-in":
        // this.ctx.translate(-this.crosshairs.x, -this.crosshairs.y);
        // this.ctx.scale(4.0/3.0, 4.0/3.0);
        // this.ctx.translate(this.crosshairs.x, this.crosshairs.y);
        this.recenterCrossHairs();
        this.scale = this.scale*3.0/2.0
        break;
      case "zoom-out":
        this.recenterCrossHairs();
        this.scale = this.scale*2.0/3.0;
        break;
      case "pan-left":
        this.panX += 50;
        break;
      case "pan-right":
        this.panX -= 50;
        break;
      case "pan-up":
        this.panY += 50;
        break;
      case "pan-down":
        this.panY -= 50;
        break;
    }

    this.redraw();

  }

  private physicalToLogicalY(physicalY: number) {
    return physicalY - (this.panY + this.canvas.height / 2);
  }

  private physicalToLogicalX(physicalX: number) {
    return physicalX - (this.panX + this.canvas.width / 2);
  }

  private getDANodesContainingCrosshairs() {
    const crosshairsLogicalX = this.physicalToLogicalX(this.crosshairs.x);
    const crosshairsLogicalY = this.physicalToLogicalY(this.crosshairs.y);
    console.log("crosshairsLogicalX", crosshairsLogicalX);
    console.log("crosshairsLogicalY", crosshairsLogicalY);
    return this.daNodes.filter(daNode => {
      const leftBoundLogical = daNode.leftBoundLogical;
      console.log("leftBoundLogical", leftBoundLogical)
      const rightBoundLogical = daNode.rightBoundLogical;
      console.log("rightBoundLogical", rightBoundLogical)
      const topBoundLogical = daNode.topBoundLogical;
      console.log("topBoundLogical", topBoundLogical)
      const bottomBoundLogical = daNode.bottomBoundLogical;
      console.log("bottomBoundLogical", bottomBoundLogical)
      return leftBoundLogical < crosshairsLogicalX
          && crosshairsLogicalX < rightBoundLogical
          && topBoundLogical < crosshairsLogicalY
          && crosshairsLogicalY < bottomBoundLogical;
      }
    );
  }

  private getSelectedDANodes() {
    return this.daNodes.filter((daNode) => daNode.isSelected);
  }

  private recenterCrossHairs() {
    this.crosshairs.x = this.canvas.width / 2;
    this.crosshairs.y =  this.canvas.height / 2;
  }
}
