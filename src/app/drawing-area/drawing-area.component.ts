import {AfterViewInit, Component, ElementRef, EventEmitter, inject, Input, Output} from '@angular/core';
import {Observable} from 'rxjs';
import {DANode} from './da-node';
import {DANotification} from './da-notification.model';
import Konva from 'konva';
import {DAEdge} from './da-edge';
import {DACommand, DACommandType} from './command.model';
import {DrawingLayer} from './drawing.layer';
import {CrosshairsLayer} from './crosshairs.layer';
import Stage = Konva.Stage;
import Group = Konva.Group;
import Tween = Konva.Tween;
import Easings = Konva.Easings;
import Vector2d = Konva.Vector2d;

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

  private resizeObserver!: ResizeObserver;


  private crosshairsLayer!: CrosshairsLayer;
  private drawingLayer!: DrawingLayer;
  private stage!: Stage;
  private daNodeGroup!: Group;
  private daEdgeGroup!: Group;
  private tweens: Tween[] = [];


  ngAfterViewInit(): void {
    this.stage = new Stage({
      container: 'mainDrawingArea',
      width: this.componentNE.offsetWidth,
      height: this.componentNE.offsetHeight,
    });
    this.stage.container().style.backgroundColor = 'white';


    this.drawingLayer = new DrawingLayer();
    this.stage.add(this.drawingLayer);
    this.crosshairsLayer = new CrosshairsLayer(this.stage);
    this.stage.add(this.crosshairsLayer);

    this.commands.subscribe(this.handleCommands.bind(this));

    this.resizeObserver = new ResizeObserver(entries => {
      this.stage.width(this.componentNE.offsetWidth);
      this.stage.height(this.componentNE.offsetHeight);
    });
    this.resizeObserver.observe(this.componentNE);

  }


  private handleCommands(command: DACommand) {
    console.log("handleCommands - " + JSON.stringify(command));
    switch (command.kind) {
      case DACommandType.MOVE_CROSSHAIRS_LEFT:
        this.moveCrosshairsLeft();
        break;
      case DACommandType.MOVE_CROSSHAIRS_DOWN:
        this.moveCrosshairsDown();
        break;
      case DACommandType.MOVE_CROSSHAIRS_RIGHT:
        this.moveCrosshairsRight();
        break;
      case DACommandType.MOVE_CROSSHAIRS_UP:
        this.moveCrosshairsUp();
        break;
      case DACommandType.CREATE_NEW_NODE:
        this.createNewNode();
        break
      case DACommandType.INSERT_CHAR:
        const key = command.value;
        this.insertChar(key);
        break;
      case DACommandType.EXIT_LABEL_EDIT_MODE:
        this.exitLabelEditMode();
        break;
      case DACommandType.MULTI_ITEM_SELECT:
        this.multiItemSelect();
        break;
      case DACommandType.SINGLE_ITEM_SELECT:
        this.singleItemSelect();
        break;
      case DACommandType.ZOOM_IN:
        this.zoomIn();
        break;
      case DACommandType.ZOOM_OUT:
        this.zoomOut();
        break;
      case DACommandType.CONNECT_SELECTED_NODES:
        this.connectSelectedNodes();
        break;
      case DACommandType.CONNECT_SELECTED_NODE:
        this.connectSelectedNode();
        break;
      default:
        this.assertNever(command);
    }

  }

  assertNever(x: never): never {
    throw new Error(`Unexpected object: ${x}`);
  }

  private multiItemSelect() {
    this.tweens.forEach(t => t.finish());
    this.tweens = [];
    const daNodesContainingCrosshairs: DANode[] = this.getDANodesContainingCrosshairs();

    if (daNodesContainingCrosshairs.length > 0) {
      const nodeToToggle = daNodesContainingCrosshairs.reduce((n0,n1) => n0.zIndex() > n1.zIndex() ? n0 : n1);
      nodeToToggle.isSelected = !nodeToToggle.isSelected;
      return;
    }

    const daEdgesContainingCrosshairs: DAEdge[] = this.getDAEdgesContainingCrosshairs();
    if (daEdgesContainingCrosshairs.length > 0) {
      const edgeToToggle = daEdgesContainingCrosshairs.reduce((e0,e1) => e0.zIndex() > e1.zIndex() ? e0 : e1);
      edgeToToggle.isSelected = !edgeToToggle.isSelected;
      return;

    }
    return;
  }

  private singleItemSelect() {
    this.tweens.forEach(t => t.finish());
    this.tweens = [];

    this.drawingLayer.unselectAll();

    const daNodesContainingCrosshairs: DANode[] = this.getDANodesContainingCrosshairs();

    if (daNodesContainingCrosshairs.length > 0) {
      const nodeToToggle = daNodesContainingCrosshairs.reduce((n0,n1) => n0.zIndex() > n1.zIndex() ? n0 : n1);
      nodeToToggle.isSelected = !nodeToToggle.isSelected;
      return;
    }

    const daEdgesContainingCrosshairs: DAEdge[] = this.getDAEdgesContainingCrosshairs();
    if (daEdgesContainingCrosshairs.length > 0) {
      const edgeToToggle = daEdgesContainingCrosshairs.reduce((e0,e1) => e0.zIndex() > e1.zIndex() ? e0 : e1);
      edgeToToggle.isSelected = !edgeToToggle.isSelected;
      return;

    }
    return;
  }

  private exitLabelEditMode() {
    this.finishTweens();
    console.log("case exit-label-edit-mode")
    this.crosshairsLayer.showCrosshairs();
    this.drawingLayer.unselectAll();
  }

  private insertChar(key: string) {
    this.finishTweens()
    this.crosshairsLayer.hideCrosshairs();
    this.drawingLayer.appendTextToSelected(key);
  }

  private connectSelectedNodes() {
    this.tweens.forEach(t => t.finish());
    this.tweens = [];
    const selectedDANodes = this.drawingLayer.getSelectedDANodes();

    //todo: connect to self
    if (selectedDANodes.length <= 1)
      return;

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

    return;
  }

  private connectSelectedNode() {
    this.finishTweens();

    const selectedDAEdges = this.drawingLayer.getSelectedDAEdges();
    if (selectedDAEdges.length != 0) {
      return;
    }
    const selectedDANodes = this.drawingLayer.getSelectedDANodes();
    if (selectedDANodes.length != 1) {
      return;
    }
    const selectedDANode = selectedDANodes[0];

    const daNodesContainingCrosshairs = this.getDANodesContainingCrosshairs();
    if (daNodesContainingCrosshairs.length > 1) {
      return;
    }

    if (daNodesContainingCrosshairs.length == 0) {
      //todo: insert new node and connect to it
      return;
    }

    const daNodeUnderCrosshairs = daNodesContainingCrosshairs[0];

    this.drawingLayer.addEdge(selectedDANode, daNodeUnderCrosshairs);

    return;
  }

  private zoomIn() {
    this.finishTweens()


    const oldScale = this.drawingLayer.scaleX();

    const crosshairsPointTo = {
      x: (this.crosshairsLayer.crosshairsX() - this.drawingLayer.x())/oldScale,
      y: (this.crosshairsLayer.crosshairsY() - this.drawingLayer.y())/oldScale
    };


    const newScale = oldScale * 2.0;
    this.tweens.push(new Tween({
      node: this.drawingLayer,
      duration: .1,
      scaleX: newScale,
      scaleY: newScale,
      x: this.crosshairsLayer.crosshairsX() - crosshairsPointTo.x * newScale,
      y: this.crosshairsLayer.crosshairsY() - crosshairsPointTo.y * newScale

    }).play());
  }

  private zoomOut() {
    this.finishTweens()

    const oldScale = this.drawingLayer.scaleX();

    const crosshairsPointTo = {
      x: (this.crosshairsLayer.crosshairsX() - this.drawingLayer.x())/oldScale,
      y: (this.crosshairsLayer.crosshairsY() - this.drawingLayer.y())/oldScale
    };

    const newScale = oldScale / 2.0;
    let scale: Vector2d = {x: newScale, y: newScale};
    console.log("scale", scale);
    this.tweens.push(new Tween({
      node: this.drawingLayer,
      duration: .1,
      scaleX: newScale,
      scaleY: newScale,
      x: this.crosshairsLayer.crosshairsX() - crosshairsPointTo.x * newScale,
      y: this.crosshairsLayer.crosshairsY() - crosshairsPointTo.y * newScale
    }).play());
  }

  private moveCrosshairsUp() {
    this.tweens.forEach(t => t.finish());
    this.tweens = [];
    if (this.crosshairsLayer.crosshairs.y() > 60) {
      this.tweens.push(new Tween({
        node: this.crosshairsLayer.crosshairs,
        duration: .1,
        y: this.crosshairsLayer.crosshairs.y() - 50,
        easing: Easings.Linear
      }).play());
    } else {
      this.tweens.push(new Tween({
        node: this.drawingLayer,
        duration: .1,
        y: this.drawingLayer.y() + 50,
        easing: Easings.Linear
      }).play())
    }
  }

  private moveCrosshairsRight() {
    this.tweens.forEach(t => t.finish());
    this.tweens = [];
    if (this.crosshairsLayer.crosshairs.x() < this.stage.width() - 60) {
      this.tweens.push(new Tween({
        node: this.crosshairsLayer.crosshairs,
        duration: .1,
        x: this.crosshairsLayer.crosshairs.x() + 50,
        easing: Easings.Linear
      }).play());
    } else
      this.tweens.push(new Tween({
        node: this.drawingLayer,
        duration: .1,
        x: this.drawingLayer.x() - 50,
        easing: Easings.Linear
      }).play())
  }

  private moveCrosshairsDown() {
    this.tweens.forEach(t => t.finish());
    this.tweens = [];
    if (this.crosshairsLayer.crosshairs.y() < this.stage.height())
      this.tweens.push(new Tween({
        node: this.crosshairsLayer.crosshairs,
        duration: .1,
        y: this.crosshairsLayer.crosshairs.y() + 50,
        easing: Easings.Linear
      }).play());
    else {
      this.tweens.push(new Tween({
        node: this.drawingLayer,
        duration: .1,
        y: this.drawingLayer.y() - 50,
        easing: Easings.Linear
      }).play())

    }
  }

  private moveCrosshairsLeft() {
    this.finishTweens();
    if (this.crosshairsLayer.crosshairs.x() > 60) {
      this.tweens.push(new Tween({
        node: this.crosshairsLayer.crosshairs,
        duration: .1,
        x: this.crosshairsLayer.crosshairs.x() - 50,
        easing: Easings.Linear
      }).play());
    } else {
      this.tweens.push(new Tween({
        node: this.drawingLayer,
        duration: .1,
        x: this.drawingLayer.x() + 50,
        easing: Easings.Linear
      }).play())
      // this.drawingLayer.move({x: 50, y: 0})
    }
  }

  private finishTweens() {
    this.tweens.forEach(t => t.finish());
    this.tweens = [];
  }

  private createNewNode() {
    this.finishTweens();

    this.drawingLayer.createNewNode(this.crosshairsLayer.crosshairsX(), this.crosshairsLayer.crosshairsY());

    this.daOut.emit({kind: "started-label-editing-mode"})
  }


  private getDAEdgesContainingCrosshairs(): DAEdge[] {
    return this.drawingLayer.getDaEdgesIntersectingGroup(this.crosshairsLayer.crosshairs);
  }


  private getDANodesContainingCrosshairs() {
    return this.drawingLayer.getDaNodesContainingPoint(this.crosshairsLayer.crosshairs.getAbsolutePosition());
  }

}

