import {AfterViewInit, Component, ElementRef, EventEmitter, inject, Input, Output} from '@angular/core';
import {Observable} from 'rxjs';
import {DANode} from './da-node';
import {DANotification} from './da-notification.model';
import Konva from 'konva';
import {DAEdge} from './da-edge';
import {DACommand, DACommandType} from './command.model';
import {DrawingLayer} from './drawing.layer';
import {CrosshairsLayer} from './crosshairs.layer';
import {DemoDataService} from '../services/demo-data.service';
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
  @Output() zoomLevel = new EventEmitter<number>()
  private componentNE = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private resizeObserver!: ResizeObserver;
  private crosshairsLayer!: CrosshairsLayer;
  private drawingLayer!: DrawingLayer;
  private stage!: Stage;
  private tweens: Tween[] = [];
  private demoDataService = inject(DemoDataService);

  public readonly MAX_ZOOM = 2.0;
  public readonly MIN_ZOOM = 100 / Math.pow(2, 8) / 100;
  public readonly CROSSHAIR_MOVEMENT_DURATION = .1;
  public readonly CROSSHAIRS_MOVEMENT_DISTANCE = 50;
  public readonly TWEEN_DURATION = .1;
  public readonly RECENTER_DURATION = 0.3;
  public readonly RECENTER_CROSSHAIRS_DURATION = 0.2;


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

    // Check for demo flag in URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('demo') === 'true') {
      this.demoDataService.createDemoGraph(this.drawingLayer);
    }

    this.commands.subscribe(this.handleCommands.bind(this));

    // Emit initial zoom level
    this.emitZoomLevel();

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
      case DACommandType.SINGLE_ITEM_TOGGLE_SELECT:
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
      case DACommandType.RECENTER_VIEW:
        this.recenterView();
        break;
      case DACommandType.RECENTER_CROSSHAIRS:
        this.recenterCrosshairs();
        break;
      case DACommandType.UNSELECT_ALL:
        this.unselectAll();
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
    this.selectTopItem();
  }

  private selectTopItem() {
    const daNodesContainingCrosshairs: DANode[] = this.getDANodesContainingCrosshairs();

    if (daNodesContainingCrosshairs.length > 0) {
      const nodeToToggle = daNodesContainingCrosshairs.reduce((n0, n1) => n0.zIndex() > n1.zIndex() ? n0 : n1);
      nodeToToggle.isSelected = !nodeToToggle.isSelected;
      return;
    }

    const daEdgesContainingCrosshairs: DAEdge[] = this.getDAEdgesContainingCrosshairs();
    if (daEdgesContainingCrosshairs.length > 0) {
      const edgeToToggle = daEdgesContainingCrosshairs.reduce((e0, e1) => e0.zIndex() > e1.zIndex() ? e0 : e1);
      edgeToToggle.isSelected = !edgeToToggle.isSelected;
      return;

    }
    return;
  }

  private singleItemSelect() {
    this.tweens.forEach(t => t.finish());
    this.tweens = [];

    if (this.drawingLayer.getSelectedItems().length == 1) {
      this.drawingLayer.getSelectedItems()[0].isSelected = false;
      return;
    }

    this.drawingLayer.unselectAll();

    this.selectTopItem();
  }

  private exitLabelEditMode() {
    this.finishTweens();
    console.log("case exit-label-edit-mode")
    this.crosshairsLayer.showCrosshairs();
    this.drawingLayer.unselectAll();
  }

  private unselectAll() {
    this.finishTweens();
    this.drawingLayer.unselectAll();
  }

  private insertChar(key: string) {
    this.finishTweens()
    this.crosshairsLayer.hideCrosshairs();
    this.drawingLayer.appendTextToSelected(key);
  }

  private connectSelectedNodes() {
    this.finishTweens();

    const selectedDAEdges = this.drawingLayer.getSelectedDAEdges();
    if (selectedDAEdges.length != 0) {
      return;
    }

    const selectedDANodes = this.drawingLayer.getSelectedDANodes();
    const daNodesContainingCrosshairs = this.getDANodesContainingCrosshairs();

    if (selectedDANodes.length == 2) {
      if(daNodesContainingCrosshairs.length == 1) {
        const destNode = daNodesContainingCrosshairs[0];
        const srcNode = selectedDANodes[0] == destNode ? selectedDANodes[1] : selectedDANodes[0];
        this.drawingLayer.addEdge(srcNode, destNode);
      } else {
        return;
      }
    } else if (selectedDANodes.length == 1 && daNodesContainingCrosshairs.length == 1) {
      if (daNodesContainingCrosshairs[0] != selectedDANodes[0]) {
        const destNode = daNodesContainingCrosshairs[0];
        const srcNode = selectedDANodes[0];
        this.drawingLayer.addEdge(srcNode, destNode);
        return;
      } else {
        //todo: connect node to self
        return;
      }
    } else if (selectedDANodes.length == 1 && daNodesContainingCrosshairs.length == 0) {
      //todo: create new connected node
    } else {
      return;
    }
  }

  private zoomIn() {
    this.finishTweens()

    const oldScale = this.drawingLayer.scaleX();

    const crosshairsPointTo = {
      x: (this.crosshairsLayer.crosshairsX() - this.drawingLayer.x())/oldScale,
      y: (this.crosshairsLayer.crosshairsY() - this.drawingLayer.y())/oldScale
    };

    const newScale = Math.min(oldScale * 2.0, this.MAX_ZOOM);
    this.tweens.push(new Tween({
      node: this.drawingLayer,
      duration: this.TWEEN_DURATION,
      scaleX: newScale,
      scaleY: newScale,
      x: this.crosshairsLayer.crosshairsX() - crosshairsPointTo.x * newScale,
      y: this.crosshairsLayer.crosshairsY() - crosshairsPointTo.y * newScale,
      onFinish: () => {
        this.emitZoomLevel();
      }

    }).play());
  }

  private zoomOut() {
    this.finishTweens()

    const oldScale = this.drawingLayer.scaleX();

    const crosshairsPointTo = {
      x: (this.crosshairsLayer.crosshairsX() - this.drawingLayer.x())/oldScale,
      y: (this.crosshairsLayer.crosshairsY() - this.drawingLayer.y())/oldScale
    };

    const newScale = Math.max(oldScale / 2.0, this.MIN_ZOOM);
    let scale: Vector2d = {x: newScale, y: newScale};
    console.log("scale", scale);
    this.tweens.push(new Tween({
      node: this.drawingLayer,
      duration: this.TWEEN_DURATION,
      scaleX: newScale,
      scaleY: newScale,
      x: this.crosshairsLayer.crosshairsX() - crosshairsPointTo.x * newScale,
      y: this.crosshairsLayer.crosshairsY() - crosshairsPointTo.y * newScale,
      onFinish: () => {
        this.emitZoomLevel();
      }
    }).play());
  }

  private moveCrosshairsUp() {
    this.tweens.forEach(t => t.finish());
    this.tweens = [];
    if (this.crosshairsLayer.crosshairs.y() > 60) {
      this.tweens.push(new Tween({
        node: this.crosshairsLayer.crosshairs,
        duration: this.CROSSHAIR_MOVEMENT_DURATION,
        y: this.crosshairsLayer.crosshairs.y() - this.CROSSHAIRS_MOVEMENT_DISTANCE,
        easing: Easings.Linear
      }).play());
    } else {
      this.tweens.push(new Tween({
        node: this.drawingLayer,
        duration: this.CROSSHAIR_MOVEMENT_DURATION,
        y: this.drawingLayer.y() + this.CROSSHAIRS_MOVEMENT_DISTANCE,
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
        duration: this.CROSSHAIR_MOVEMENT_DURATION,
        x: this.crosshairsLayer.crosshairs.x() + this.CROSSHAIRS_MOVEMENT_DISTANCE,
        easing: Easings.Linear
      }).play());
    } else
      this.tweens.push(new Tween({
        node: this.drawingLayer,
        duration: this.CROSSHAIR_MOVEMENT_DURATION,
        x: this.drawingLayer.x() - this.CROSSHAIRS_MOVEMENT_DISTANCE,
        easing: Easings.Linear
      }).play())
  }

  private moveCrosshairsDown() {
    this.tweens.forEach(t => t.finish());
    this.tweens = [];
    if (this.crosshairsLayer.crosshairs.y() < this.stage.height())
      this.tweens.push(new Tween({
        node: this.crosshairsLayer.crosshairs,
        duration: this.CROSSHAIR_MOVEMENT_DURATION,
        y: this.crosshairsLayer.crosshairs.y() + this.CROSSHAIRS_MOVEMENT_DISTANCE,
        easing: Easings.Linear
      }).play());
    else {
      this.tweens.push(new Tween({
        node: this.drawingLayer,
        duration: this.CROSSHAIR_MOVEMENT_DURATION,
        y: this.drawingLayer.y() - this.CROSSHAIRS_MOVEMENT_DISTANCE,
        easing: Easings.Linear
      }).play())

    }
  }

  private moveCrosshairsLeft() {
    this.finishTweens();
    if (this.crosshairsLayer.crosshairs.x() > 60) {
      this.tweens.push(new Tween({
        node: this.crosshairsLayer.crosshairs,
        duration: this.CROSSHAIR_MOVEMENT_DURATION,
        x: this.crosshairsLayer.crosshairs.x() - this.CROSSHAIRS_MOVEMENT_DISTANCE,
        easing: Easings.Linear
      }).play());
    } else {
      this.tweens.push(new Tween({
        node: this.drawingLayer,
        duration: this.CROSSHAIR_MOVEMENT_DURATION,
        x: this.drawingLayer.x() + this.CROSSHAIRS_MOVEMENT_DISTANCE,
        easing: Easings.Linear
      }).play())
      // this.drawingLayer.move({x: 50, y: 0})
    }
  }

  private finishTweens() {
    this.tweens.forEach(t => t.finish());
    this.tweens = [];
  }

  private emitZoomLevel() {
    const currentScale = this.drawingLayer.scaleX();
    this.zoomLevel.emit(Math.round(currentScale * 100));
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

  private recenterView() {
    this.finishTweens();

    const children = this.drawingLayer.getChildren();
    if (children.length === 0) return;

    // Calculate the bounding box of all drawing elements in the layer's coordinate system
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    children.forEach(child => {
      // Get the bounding box in the layer's own coordinate system (not transformed)
      const clientRect = child.getClientRect({skipTransform: true});

      minX = Math.min(minX, clientRect.x);
      minY = Math.min(minY, clientRect.y);
      maxX = Math.max(maxX, clientRect.x + clientRect.width);
      maxY = Math.max(maxY, clientRect.y + clientRect.height);
    });

    // Calculate the center point of the drawing in layer coordinates
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    // Center the view on the content without changing scale
    const stageWidth = this.stage.width();
    const stageHeight = this.stage.height();
    const currentScale = this.drawingLayer.scaleX();

    const tween = new Tween({
      node: this.drawingLayer,
      duration: this.RECENTER_DURATION,
      x: stageWidth / 2 - centerX * currentScale,
      y: stageHeight / 2 - centerY * currentScale,
      easing: Easings.EaseInOut,
      onFinish: () => {
        const index = this.tweens.indexOf(tween);
        if (index > -1) {
          this.tweens.splice(index, 1);
        }
      }
    });

    this.tweens.push(tween);
    tween.play();
  }

  private recenterCrosshairs() {
    this.finishTweens();
    
    const stageWidth = this.stage.width();
    const stageHeight = this.stage.height();
    
    const tween = new Tween({
      node: this.crosshairsLayer.crosshairs,
      duration: this.RECENTER_CROSSHAIRS_DURATION,
      x: stageWidth / 2,
      y: stageHeight / 2,
      easing: Easings.EaseInOut,
      onFinish: () => {
        const index = this.tweens.indexOf(tween);
        if (index > -1) {
          this.tweens.splice(index, 1);
        }
      }
    });
    
    this.tweens.push(tween);
    tween.play();
  }

}

