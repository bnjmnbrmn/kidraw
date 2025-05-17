import {AfterViewInit, Component, ElementRef, EventEmitter, inject, Input, Output} from '@angular/core';
import {Observable} from 'rxjs';
import {DANode} from './da-node';
import {DANotification} from './da-notification.model';
import Konva from 'konva';
import {DACrosshairs} from './da-crosshairs';
import {DAEdge} from './da-edge';
import {DACommand, DACommandType} from './command.model';
import Layer = Konva.Layer;
import Stage = Konva.Stage;
import Group = Konva.Group;
import Tween = Konva.Tween;
import Easings = Konva.Easings;
import Vector2d = Konva.Vector2d;
import {IRect} from 'konva/lib/types';
import {doesLineIntersectGroup} from './utils';

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
  private tweens: Tween[] = [];


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

    //todo: remove
    // this.createNewNode();
    // this.insertChar("fdsa");
    // this.exitLabelEditMode();
    // this.moveCrosshairsLeft();
    // this.moveCrosshairsLeft();
    // this.moveCrosshairsLeft();
    // this.moveCrosshairsLeft();
    // this.moveCrosshairsLeft();
    // this.createNewNode();
    // this.insertChar("fdsa");
    // this.exitLabelEditMode();
    // this.moveCrosshairsUp();
    // this.moveCrosshairsUp();
    // this.moveCrosshairsUp();
    // this.moveCrosshairsUp();

  }


  private handleCommands(command: DACommand) {
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
      case DACommandType.TOGGLE_ITEM_SELECTION:
        this.toggleItemSelection();
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
      default:
        this.assertNever(command);
    }

  }
  assertNever(x: never): never {
    throw new Error(`Unexpected object: ${x}`);
  }

  private toggleItemSelection() {
    this.tweens.forEach(t => t.finish());
    this.tweens = [];
    console.log("this.daNodes", this.daNodes)
    const daNodesContainingCrosshairs: DANode[] = this.getDANodesContainingCrosshairs();
    console.log("daNodesContainingCrosshairs", daNodesContainingCrosshairs);
    daNodesContainingCrosshairs.forEach(daNode => daNode.isSelected = !daNode.isSelected);
    const daEdgesContainingCrosshairs: DAEdge[] = this.getDAEdgesContainingCrosshairs();
    daEdgesContainingCrosshairs.forEach(daEdge => daEdge.isSelected = !daEdge.isSelected);

  }

  private exitLabelEditMode() {
    this.tweens.forEach(t => t.finish());
    this.tweens = [];
    console.log("case exit-label-edit-mode")
    this.crosshairs.show();
    this.getSelectedDANodes().forEach(daNode => {
      daNode.isSelected = false;
    });
  }

  private insertChar(key: string) {
    this.tweens.forEach(t => t.finish());
    this.tweens = [];
    this.getSelectedDANodes().forEach(daNode => {
      daNode.label.text(daNode.label.text() + key);
    })
    this.crosshairs.hide();
  }

  private connectSelectedNodes() {
    this.tweens.forEach(t => t.finish());
    this.tweens = [];
    const selectedDANodes = this.getSelectedDANodes();

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

  private zoomIn() {
    this.tweens.forEach(t => t.finish());
    this.tweens = [];
    const oldScale = this.mainLayer.scaleX();
    const newScale = oldScale * 2.0;
    this.tweens.push(new Tween({
      node: this.mainLayer,
      duration: .1,
      // todo: why doesn't
      // scale: {x: newScale, y: newScale},
      // work?
      scaleX: newScale,
      scaleY: newScale
    }).play());
    // this.mainLayer.scale({x: newScale, y: newScale});
  }

  private zoomOut() {
    this.tweens.forEach(t => t.finish());
    this.tweens = [];
    const oldScale = this.mainLayer.scaleX();
    const newScale = oldScale * 1.0 / 2.0;
    let scale: Vector2d = {x: newScale, y: newScale};
    console.log("scale", scale);
    this.tweens.push(new Tween({
      node: this.mainLayer,
      duration: .1,
      scaleX: newScale,
      scaleY: newScale
    }).play());
    // this.mainLayer.scale({x: newScale, y: newScale});
  }

  private moveCrosshairsUp() {
    this.tweens.forEach(t => t.finish());
    this.tweens = [];
    if (this.crosshairs.y() > -this.stage.height() / 2 + 60) {
      this.tweens.push(new Tween({
        node: this.crosshairs,
        duration: .1,
        y: this.crosshairs.y() - 50,
        easing: Easings.Linear
      }).play());
    } else {
      this.tweens.push(new Tween({
        node: this.mainLayer,
        duration: .1,
        y: this.mainLayer.y() + 50,
        easing: Easings.Linear
      }).play())
    }
  }

  private moveCrosshairsRight() {
    this.tweens.forEach(t => t.finish());
    this.tweens = [];
    if (this.crosshairs.x() < this.stage.width() / 2 - 60) {
      this.tweens.push(new Tween({
        node: this.crosshairs,
        duration: .1,
        x: this.crosshairs.x() + 50,
        easing: Easings.Linear
      }).play());
    } else
      this.tweens.push(new Tween({
        node: this.mainLayer,
        duration: .1,
        x: this.mainLayer.x() - 50,
        easing: Easings.Linear
      }).play())
    // this.mainLayer.move({x: -50, y: 0})
  }

  private moveCrosshairsDown() {
    this.tweens.forEach(t => t.finish());
    this.tweens = [];
    if (this.crosshairs.y() < this.stage.height() / 2 - 60)
      this.tweens.push(new Tween({
        node: this.crosshairs,
        duration: .1,
        y: this.crosshairs.y() + 50,
        easing: Easings.Linear
      }).play());
    // this.crosshairs.move({x: 0, y: 50});
    else {
      this.tweens.push(new Tween({
        node: this.mainLayer,
        duration: .1,
        y: this.mainLayer.y() - 50,
        easing: Easings.Linear
      }).play())

    }
  }

  private moveCrosshairsLeft() {
    this.tweens.forEach(t => t.finish());
    this.tweens = [];
    if (this.crosshairs.x() > -this.stage.width() / 2 + 60) {
      this.tweens.push(new Tween({
        node: this.crosshairs,
        duration: .1,
        x: this.crosshairs.x() - 50,
        easing: Easings.Linear
      }).play());
    } else {
      this.tweens.push(new Tween({
        node: this.mainLayer,
        duration: .1,
        x: this.mainLayer.x() + 50,
        easing: Easings.Linear
      }).play())
      // this.mainLayer.move({x: 50, y: 0})
    }
  }

  private createNewNode() {
    this.tweens.forEach(t => t.finish());
    this.tweens = [];
    console.log("creating new node");
    console.log("this.mainLayer.x(): ", this.mainLayer.x());
    console.log("this.crosshairs.getAbsolutePosition(this.crosshairsLayer).x", this.crosshairs.getAbsolutePosition(this.crosshairsLayer).x)
    let daNode = new DANode(
      (this.crosshairs.getAbsolutePosition(this.crosshairsLayer).x - (this.mainLayer.x() - this.stage.width() / 2)) / this.mainLayer.scaleX(),
      (this.crosshairs.getAbsolutePosition(this.crosshairsLayer).y - (this.mainLayer.y() - this.stage.height() / 2)) / this.mainLayer.scaleY(),
      "");
    this.daNodeGroup.add(daNode);
    this.daNodes.push(daNode);
    this.daOut.emit({kind: "started-label-editing-mode"})
  }

  private getDANodesContainingCrosshairs() {
    const {x: chX, y: chY} = this.crosshairs.getAbsolutePosition();
    return this.daNodes.filter(daNode => {
      const clientRect = daNode.rect.getClientRect();
        return clientRect.x < chX && chX < clientRect.x + clientRect.width
          && clientRect.y < chY && chY < clientRect.y + clientRect.width;
      }
    );
  }

  private getSelectedDANodes(): DANode[] {
    return this.daNodes.filter((daNode) => daNode.isSelected);
  }

  private getDAEdgesContainingCrosshairs(): DAEdge[]{
    return this.daEdges.filter(daEdge => {
      return doesLineIntersectGroup(daEdge.line, this.crosshairs);
    });
  }

}

