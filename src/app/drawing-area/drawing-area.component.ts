import {AfterViewInit, Component, ElementRef, EventEmitter, inject, Input, Output} from '@angular/core';
import {Observable} from 'rxjs';
import {DACommand} from './command.model';
import {DANode} from './da-node';
import {DANotification} from './da-notification.model';
import Konva from 'konva';
import {DACrosshairs} from './da-crosshairs';
import {DAEdge} from './da-edge';
import Layer = Konva.Layer;
import Stage = Konva.Stage;
import Group = Konva.Group;

@Component({
  selector: 'app-drawing-area',
  imports: [],
  templateUrl: './drawing-area.component.html',
  styleUrl: './drawing-area.component.css'
})
export class DrawingAreaComponent implements AfterViewInit {

  @Input({required: true}) commands!: Observable<DACommand>;
  @Output() daOut = new EventEmitter<DANotification>()

  private componentNE = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  private daNodes: DANode[] = [];
  private daEdges: DAEdge[] = [];
  private crosshairs!: DACrosshairs;

  private resizeObserver!: ResizeObserver;


  private crosshairsLayer!: Layer;
  private mainLayer!: Layer;
  private stage!: Stage;
  private daNodeGroup!: Group;
  private daEdgeGroup!: Group;


  ngAfterViewInit(): void {
    this.stage = new Stage({
      container: 'mainDrawingArea',
      width: this.componentNE.offsetWidth,
      height: this.componentNE.offsetHeight,
    });
    this.stage.container().style.backgroundColor = 'white';


    this.mainLayer = new Layer();
    this.mainLayer.move(
      {x: this.stage.width() / 2, y: this.stage.height() / 2}
    );
    this.stage.add(this.mainLayer);

    this.daEdgeGroup = new Group();
    this.mainLayer.add(this.daEdgeGroup);
    this.daNodeGroup = new Group();
    this.mainLayer.add(this.daNodeGroup);

    this.crosshairsLayer = new Layer();
    this.crosshairs = new DACrosshairs();
    this.crosshairsLayer.add(this.crosshairs);
    this.crosshairsLayer.move(
      {x: this.stage.width() / 2, y: this.stage.height() / 2}
    );
    this.stage.add(this.crosshairsLayer);

    this.commands.subscribe(this.handleCommands.bind(this));

    this.resizeObserver = new ResizeObserver(entries => {
      this.stage.width(this.componentNE.offsetWidth);
      this.stage.height(this.componentNE.offsetHeight);
    });
    this.resizeObserver.observe(this.componentNE);
  }

  private handleCommands(command: DACommand) {

    console.log("Command: " + JSON.stringify(command));
    switch (command.kind) {
      case "move-cursor-left":
        if (this.crosshairs.x() > -this.stage.width() / 2 + 60)
          this.crosshairs.move({x: -50, y: 0});
        else
          this.mainLayer.move({x: 50, y: 0})
        break;
      case "move-cursor-down":
        console.log(this.crosshairs.y());
        if (this.crosshairs.y() < this.stage.height() / 2 - 60)
          this.crosshairs.move({x: 0, y: 50});
        else
          this.mainLayer.move({x: 0, y: -50})
        break;
      case "move-cursor-right":
        if (this.crosshairs.x() < this.stage.width() / 2 - 60)
          this.crosshairs.move({x: 50, y: 0});
        else
          this.mainLayer.move({x: -50, y: 0})
        break;
      case "move-cursor-up":
        if (this.crosshairs.y() > -this.stage.height() / 2 + 60)
          this.crosshairs.move({x: 0, y: -50});
        else
          this.mainLayer.move({x: 0, y: 50})
        break;
      case "create-new-node":
        console.log("creating new node");
        console.log("this.mainLayer.x(): ", this.mainLayer.x());
        console.log("this.crosshairs.getAbsolutePosition(this.crosshairsLayer).x", this.crosshairs.getAbsolutePosition(this.crosshairsLayer).x)
        let daNode = new DANode(
          (this.crosshairs.getAbsolutePosition(this.crosshairsLayer).x - (this.mainLayer.x() - this.stage.width()/2)) / this.mainLayer.scaleX(),
          (this.crosshairs.getAbsolutePosition(this.crosshairsLayer).y - (this.mainLayer.y() - this.stage.height()/2)) / this.mainLayer.scaleY(),
          "");
        this.daNodeGroup.add(daNode);
        this.daNodes.push(daNode);
        this.daOut.emit({kind: "started-label-editing-mode"})
        break
      case "insert-char":
        const key = command.value;
        this.getSelectedDANodes().forEach(daNode => {
          daNode.label.text(daNode.label.text() + key);
        })
        this.crosshairs.hide();
        break;
      case "exit-label-edit-mode":
        console.log("case exit-label-edit-mode")
        this.crosshairs.show();
        this.getSelectedDANodes().forEach(daNode => {
          daNode.isSelected = false;
        });
        break;
      case "toggle-item-selection":
        console.log("this.daNodes", this.daNodes)
        const daNodesContainingCrosshairs: DANode[] = this.getDANodesContainingCrosshairs();
        console.log("daNodesContainingCrosshairs", daNodesContainingCrosshairs);
        daNodesContainingCrosshairs.forEach(daNode => daNode.isSelected = !daNode.isSelected);
        break;
      case "zoom-in": {
        const oldScale = this.mainLayer.scaleX();
        const newScale = oldScale * 3.0 / 2.0;
        this.mainLayer.scale({x: newScale, y: newScale});
      }
        break;
      case "zoom-out": {
        const oldScale = this.mainLayer.scaleX();
        const newScale = oldScale * 2.0 / 3.0;
        this.mainLayer.scale({x: newScale, y: newScale});
      }
        break;
      case "connect-selected-nodes":
        console.log('connecting')
        const selectedDANodes = this.getSelectedDANodes();
        console.log("selectedDANodes", selectedDANodes);

        //todo: connect to self
        if (selectedDANodes.length <= 1)
          break;

        for (let selectedDANodeA of selectedDANodes) {
          for (let selectedDANodeB of selectedDANodes) {
            if (selectedDANodeA != selectedDANodeB) {

              let daEdge = new DAEdge(selectedDANodeA, selectedDANodeB, "");
              console.log(daEdge);
              this.daEdgeGroup.add(daEdge);
              this.daEdges.push(daEdge);
            }
          }
        }

        break
    }

  }

  private getDANodesContainingCrosshairs() {
    const {x: chX, y: chY} = this.crosshairs.getAbsolutePosition();
    return this.daNodes.filter(daNode => {
        const rect = daNode.rect;
        const clientRect = rect.getClientRect(
          // {relativeTo: this.crosshairs}
        );
        // console.log("clientRect", clientRect);

        //todo test this after adding panning and zooming

        // const {x: rectX, y: rectY} = rect.absolutePosition();

        return clientRect.x < chX && chX < clientRect.x + clientRect.width
          && clientRect.y < chY && chY < clientRect.y + clientRect.width;


      }
    );
  }

  private getSelectedDANodes(): DANode[] {
    return this.daNodes.filter((daNode) => daNode.isSelected);
  }

}
