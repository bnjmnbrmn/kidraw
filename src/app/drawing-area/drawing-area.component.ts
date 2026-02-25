import {AfterViewInit, Component, ElementRef, EventEmitter, inject, Input, OnChanges, Output, SimpleChanges} from '@angular/core';
import { DemoDataService } from '../services/demo-data.service';
import { DrawingLayer } from './drawing.layer';
import { CrosshairsLayer } from './crosshairs.layer';
import { DANode } from './da-node';
import { DAEdge } from './da-edge';
import { DAWaypoint } from './da-waypoint';
import { DALabel } from './da-label';
import { DACommand, DACommandType } from './command.model';
import { lineSegmentIntersectsRect, closestPointOnSegment as closestPointOnSeg } from './utils';
import { DANotification } from './da-notification.model';
import { Observable } from 'rxjs';
import Konva from 'konva';

@Component({
  selector: 'app-drawing-area',
  imports: [],
  templateUrl: './drawing-area.component.html',
  styleUrl: './drawing-area.component.css'
})
export class DrawingAreaComponent implements AfterViewInit, OnChanges {

  @Input({required: true}) commands!: Observable<DACommand>;
  @Output() daOut = new EventEmitter<DANotification>()
  @Output() zoomLevel = new EventEmitter<number>()
  @Output() waypointsVisibleChange = new EventEmitter<boolean>()
  @Output() movementSpeedChange = new EventEmitter<number>()
  @Output() canEditChange = new EventEmitter<boolean>();
  private componentNE = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private resizeObserver!: ResizeObserver;
  private crosshairsLayer!: CrosshairsLayer;
  private drawingLayer!: DrawingLayer;
  private stage!: Konva.Stage;
  private tweens: Konva.Tween[] = [];
  private currentDragRafId: number | null = null;
  private demoDataService = inject(DemoDataService);
  private waypointsVisible: boolean = false;
  private hasDragged = false;

  public readonly MAX_ZOOM = 8.0;
  public readonly MIN_ZOOM = 0.125;
  public readonly CROSSHAIR_MOVEMENT_DURATION = .1;
  public readonly CROSSHAIRS_MOVEMENT_DISTANCE = 50;
  public readonly TWEEN_DURATION = .1;
  public readonly RECENTER_DURATION = 0.3;
  public readonly RECENTER_CROSSHAIRS_DURATION = 0.2;
  public readonly STEERING_ROTATION_STEP_RADIANS = Math.PI / 18;
  public readonly STEERING_SPEED_STEP = 10;
  public readonly MIN_STEERING_SPEED = 20;
  public readonly MAX_STEERING_SPEED = 200;
  public readonly NODE_SIZE_STEP = 20;
  public readonly TEXT_SIZE_STEP = 2;

  private headingRadians = -Math.PI / 2;
  private steeringMoveDistance = this.CROSSHAIRS_MOVEMENT_DISTANCE;
  private outgoingTraversalIndexByNode = new Map<DANode, number>();
  private incomingTraversalIndexByNode = new Map<DANode, number>();


  ngAfterViewInit(): void {
    this.stage = new Konva.Stage({
      container: 'mainDrawingArea',
      width: this.componentNE.offsetWidth,
      height: this.componentNE.offsetHeight,
    });
    this.stage.container().style.backgroundColor = 'white';

    this.drawingLayer = new DrawingLayer();
    this.stage.add(this.drawingLayer);
    this.crosshairsLayer = new CrosshairsLayer(this.stage);
    this.stage.add(this.crosshairsLayer);

    this.crosshairsLayer.setHeading(this.headingRadians);
    this.crosshairsLayer.setHeadingVisible(false);

    // Check for demo flag in URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('demo') as string === 'true') {
      this.demoDataService.createDemoGraph(this.drawingLayer);
    }

    this.commands.subscribe(this.handleCommands.bind(this));

    // Emit initial zoom level
    this.emitZoomLevel();
    this.emitMovementSpeed();

    this.resizeObserver = new ResizeObserver(entries => {
      this.stage.width(this.componentNE.offsetWidth);
      this.stage.height(this.componentNE.offsetHeight);
    });
    this.resizeObserver.observe(this.componentNE);

  }

  ngOnChanges(changes: SimpleChanges): void {
  }

  private canEdit = false;

  private checkAndEmitEditState() {
    const hasSelection = this.drawingLayer.getSelectedDANodes().length > 0 ||
      this.getSelectedLabels().length > 0;

    let canEditNow = hasSelection;

    if (!canEditNow) {
      // Check hover if no selection
      // Waypoints don't have editable text, so don't trigger edit state
      const label = this.getLabelUnderCrosshairs();
      if (label) canEditNow = true;
      else {
        const nodes = this.getDANodesContainingCrosshairs();
        if (nodes.length > 0) canEditNow = true;
      }
    }

    if (this.canEdit !== canEditNow) {
      this.canEdit = canEditNow;
      this.canEditChange.emit(this.canEdit);
    }
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
      case DACommandType.STEER_FORWARD:
        this.steerForward();
        break;
      case DACommandType.STEER_BACKWARD:
        this.steerBackward();
        break;
      case DACommandType.STRAFE_LEFT:
        this.strafeLeft();
        break;
      case DACommandType.STRAFE_RIGHT:
        this.strafeRight();
        break;
      case DACommandType.ROTATE_HEADING_LEFT:
        this.rotateHeadingLeft();
        break;
      case DACommandType.ROTATE_HEADING_RIGHT:
        this.rotateHeadingRight();
        break;
      case DACommandType.INCREASE_MOVE_SPEED:
        this.increaseMoveSpeed();
        break;
      case DACommandType.DECREASE_MOVE_SPEED:
        this.decreaseMoveSpeed();
        break;
      case DACommandType.TRAVERSE_OUTGOING_NEXT:
        this.traverseOutgoingNext();
        break;
      case DACommandType.TRAVERSE_INCOMING_NEXT:
        this.traverseIncomingNext();
        break;
      case DACommandType.SNAP_TO_NEAREST_NODE:
        this.snapToNearestNode();
        break;
      case DACommandType.INCREASE_SELECTED_NODE_SIZE:
        this.increaseSelectedNodeSize();
        break;
      case DACommandType.DECREASE_SELECTED_NODE_SIZE:
        this.decreaseSelectedNodeSize();
        break;
      case DACommandType.INCREASE_SELECTED_TEXT_SIZE:
        this.increaseSelectedTextSize();
        break;
      case DACommandType.DECREASE_SELECTED_TEXT_SIZE:
        this.decreaseSelectedTextSize();
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
      case DACommandType.SINGLE_ITEM_TOGGLE_SELECT:
        this.singleItemSelect();
        this.checkAndEmitEditState();
        break;
      case DACommandType.MULTI_ITEM_SELECT:
        this.multiItemSelect();
        this.checkAndEmitEditState();
        break;
      case DACommandType.ZOOM_IN:
        this.zoomIn();
        break;
      case DACommandType.ZOOM_OUT:
        this.zoomOut();
        break;
      case DACommandType.CONNECT_SELECTED_NODES:
        this.connectSelectedNodes();
        this.checkAndEmitEditState();
        break;
      case DACommandType.RECENTER_VIEW:
        this.recenterView();
        break;
      case DACommandType.RECENTER_CROSSHAIRS:
        this.recenterCrosshairs();
        this.checkAndEmitEditState();
        break;
      case DACommandType.UNSELECT_ALL:
        this.unselectAll();
        this.checkAndEmitEditState();
        break;
      case DACommandType.DRAG_SELECTED_LEFT:
        this.dragSelectedLeft();
        break;
      case DACommandType.DRAG_SELECTED_RIGHT:
        this.dragSelectedRight();
        break;
      case DACommandType.DRAG_SELECTED_UP:
        this.dragSelectedUp();
        break;
      case DACommandType.DRAG_SELECTED_DOWN:
        this.dragSelectedDown();
        break;
      case DACommandType.ENTER_DRAG_MODE:
        this.enterDragMode();
        break;
      case DACommandType.EXIT_DRAG_MODE:
        this.exitDragMode();
        break;
      case DACommandType.ADD_WAYPOINT:
        this.addWaypoint();
        break;
      case DACommandType.TOGGLE_WAYPOINT_VISIBILITY:
        this.toggleWaypointVisibility();
        break;
      case DACommandType.ADD_LABEL:
        this.addLabel();
        break;
      case DACommandType.EDIT_SELECTED:
        this.handleEditSelected();
        break;
      case DACommandType.DELETE_LAST_CHAR:
        this.deleteLastChar();
        break;
      case DACommandType.DELETE:
        this.deleteSelected();
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
    const waypointUnderCrosshairs = this.getWaypointUnderCrosshairs();
    if (waypointUnderCrosshairs) {
      waypointUnderCrosshairs.isSelected = !waypointUnderCrosshairs.isSelected;
      return;
    }

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
  }

  private singleItemSelect() {
    this.tweens.forEach(t => t.finish());
    this.tweens = [];
    this.drawingLayer.unselectAll();
    this.unselectAllWaypoints();
    this.unselectAllLabels();

    const waypointUnderCrosshairs = this.getWaypointUnderCrosshairs();
    if (waypointUnderCrosshairs) {
      waypointUnderCrosshairs.isSelected = true;
      return;
    }

    const labelUnderCrosshairs = this.getLabelUnderCrosshairs();
    if (labelUnderCrosshairs) {
      labelUnderCrosshairs.isSelected = true;
      return;
    }

    const daNodesContainingCrosshairs: DANode[] = this.getDANodesContainingCrosshairs();

    if (daNodesContainingCrosshairs.length > 0) {
      daNodesContainingCrosshairs[0].isSelected = true;
      return;
    }

    const daEdgesContainingCrosshairs: DAEdge[] = this.getDAEdgesContainingCrosshairs();
    if (daEdgesContainingCrosshairs.length > 0) {
      daEdgesContainingCrosshairs[0].isSelected = true;
      return;
    }
  }

  private exitLabelEditMode() {
    this.finishTweens();
    console.log("case exit-label-edit-mode")
    this.crosshairsLayer.showCrosshairs();
    this.drawingLayer.unselectAll();
    this.unselectAllWaypoints();
    this.unselectAllLabels();
  }

  private unselectAll() {
    this.finishTweens();
    this.drawingLayer.unselectAll();
    this.unselectAllWaypoints();
    this.unselectAllLabels();
  }

  private insertChar(key: string) {
    this.finishTweens()
    this.crosshairsLayer.hideCrosshairs();
    this.drawingLayer.appendTextToSelected(key);
  }

  private deleteLastChar() {
    this.finishTweens();
    this.drawingLayer.deleteLastCharFromSelected();
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
        this.unselectAll();
      } else {
        return;
      }
    } else if (selectedDANodes.length == 1 && daNodesContainingCrosshairs.length == 1) {
      const destNode = daNodesContainingCrosshairs[0];
      const srcNode = selectedDANodes[0];
      this.drawingLayer.addEdge(srcNode, destNode);
      this.unselectAll();
      return;
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
    this.tweens.push(new Konva.Tween({
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
    let scale: Konva.Vector2d = {x: newScale, y: newScale};
    console.log("scale", scale);
    this.tweens.push(new Konva.Tween({
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
    this.moveCrosshairsBy(0, -this.CROSSHAIRS_MOVEMENT_DISTANCE);
  }

  private moveCrosshairsRight() {
    this.moveCrosshairsBy(this.CROSSHAIRS_MOVEMENT_DISTANCE, 0);
  }

  private moveCrosshairsDown() {
    this.moveCrosshairsBy(0, this.CROSSHAIRS_MOVEMENT_DISTANCE);
  }

  private moveCrosshairsLeft() {
    this.moveCrosshairsBy(-this.CROSSHAIRS_MOVEMENT_DISTANCE, 0);
  }

  private moveCrosshairsBy(deltaX: number, deltaY: number) {
    this.finishTweens();

    const edgeMargin = 60;
    const currentX = this.crosshairsLayer.crosshairs.x;
    const currentY = this.crosshairsLayer.crosshairs.y;

    const targetX = currentX + deltaX;
    const targetY = currentY + deltaY;

    const minX = edgeMargin;
    const maxX = this.stage.width() - edgeMargin;
    const minY = edgeMargin;
    const maxY = this.stage.height() - edgeMargin;

    const clampedX = Math.min(Math.max(targetX, minX), maxX);
    const clampedY = Math.min(Math.max(targetY, minY), maxY);

    const overflowX = targetX - clampedX;
    const overflowY = targetY - clampedY;

    if (clampedX !== currentX || clampedY !== currentY) {
      this.tweens.push(new Konva.Tween({
        node: this.crosshairsLayer.crosshairs.konvaGroup,
        duration: this.CROSSHAIR_MOVEMENT_DURATION,
        x: clampedX,
        y: clampedY,
        easing: Konva.Easings.Linear,
      }).play());
    }

    if (overflowX !== 0 || overflowY !== 0) {
      this.tweens.push(new Konva.Tween({
        node: this.drawingLayer,
        duration: this.CROSSHAIR_MOVEMENT_DURATION,
        x: this.drawingLayer.x() - overflowX,
        y: this.drawingLayer.y() - overflowY,
        easing: Konva.Easings.Linear,
      }).play());
    }
  }

  private steerForward() {
    this.moveCrosshairsBy(
      Math.cos(this.headingRadians) * this.steeringMoveDistance,
      Math.sin(this.headingRadians) * this.steeringMoveDistance,
    );
  }

  private steerBackward() {
    this.moveCrosshairsBy(
      -Math.cos(this.headingRadians) * this.steeringMoveDistance,
      -Math.sin(this.headingRadians) * this.steeringMoveDistance,
    );
  }

  private strafeLeft() {
    const leftAngle = this.headingRadians - Math.PI / 2;
    this.moveCrosshairsBy(
      Math.cos(leftAngle) * this.steeringMoveDistance,
      Math.sin(leftAngle) * this.steeringMoveDistance,
    );
  }

  private strafeRight() {
    const rightAngle = this.headingRadians + Math.PI / 2;
    this.moveCrosshairsBy(
      Math.cos(rightAngle) * this.steeringMoveDistance,
      Math.sin(rightAngle) * this.steeringMoveDistance,
    );
  }

  private rotateHeadingLeft() {
    this.headingRadians = this.normalizeHeading(this.headingRadians - this.STEERING_ROTATION_STEP_RADIANS);
    this.crosshairsLayer.setHeading(this.headingRadians);
  }

  private rotateHeadingRight() {
    this.headingRadians = this.normalizeHeading(this.headingRadians + this.STEERING_ROTATION_STEP_RADIANS);
    this.crosshairsLayer.setHeading(this.headingRadians);
  }

  private increaseMoveSpeed() {
    this.steeringMoveDistance = Math.min(
      this.steeringMoveDistance + this.STEERING_SPEED_STEP,
      this.MAX_STEERING_SPEED,
    );
    this.emitMovementSpeed();
  }

  private decreaseMoveSpeed() {
    this.steeringMoveDistance = Math.max(
      this.steeringMoveDistance - this.STEERING_SPEED_STEP,
      this.MIN_STEERING_SPEED,
    );
    this.emitMovementSpeed();
  }

  private emitMovementSpeed() {
    this.movementSpeedChange.emit(this.steeringMoveDistance);
  }

  private normalizeHeading(angleRadians: number): number {
    if (angleRadians <= -Math.PI) {
      return angleRadians + Math.PI * 2;
    }

    if (angleRadians > Math.PI) {
      return angleRadians - Math.PI * 2;
    }

    return angleRadians;
  }

  private traverseOutgoingNext() {
    this.traverseFromAnchorNode('outgoing');
  }

  private traverseIncomingNext() {
    this.traverseFromAnchorNode('incoming');
  }

  private snapToNearestNode() {
    const nodes = this.drawingLayer.getDANodes();
    if (nodes.length === 0) {
      return;
    }

    const crosshairsPosition = {
      x: this.crosshairsLayer.crosshairsX(),
      y: this.crosshairsLayer.crosshairsY(),
    };

    let nearestNode = nodes[0];
    let nearestDistanceSquared = Number.POSITIVE_INFINITY;

    nodes.forEach((node) => {
      const center = this.getNodeCenterInStageCoordinates(node);
      const dx = center.x - crosshairsPosition.x;
      const dy = center.y - crosshairsPosition.y;
      const distanceSquared = dx * dx + dy * dy;

      if (distanceSquared < nearestDistanceSquared) {
        nearestDistanceSquared = distanceSquared;
        nearestNode = node;
      }
    });

    this.focusNode(nearestNode);
  }

  private traverseFromAnchorNode(direction: 'outgoing' | 'incoming') {
    this.finishTweens();

    const anchorNode = this.getTraversalAnchorNode();
    if (!anchorNode) {
      return;
    }

    const candidateEdges = direction === 'outgoing' ? anchorNode.outgoingEdges : anchorNode.incomingEdges;
    if (candidateEdges.length === 0) {
      return;
    }

    const indexMap = direction === 'outgoing'
      ? this.outgoingTraversalIndexByNode
      : this.incomingTraversalIndexByNode;
    const currentIndex = indexMap.get(anchorNode) ?? 0;
    const edge = candidateEdges[currentIndex % candidateEdges.length];
    indexMap.set(anchorNode, (currentIndex + 1) % candidateEdges.length);

    const targetNode = direction === 'outgoing' ? edge.destNode : edge.srcNode;
    this.focusNode(targetNode);
  }

  private getTraversalAnchorNode(): DANode | null {
    const selectedNodes = this.drawingLayer.getSelectedDANodes();
    if (selectedNodes.length > 0) {
      return selectedNodes[0];
    }

    const nodesUnderCrosshairs = this.getDANodesContainingCrosshairs();
    if (nodesUnderCrosshairs.length > 0) {
      return nodesUnderCrosshairs[0];
    }

    return null;
  }

  private focusNode(node: DANode) {
    this.drawingLayer.unselectAll();
    this.unselectAllWaypoints();
    this.unselectAllLabels();
    node.isSelected = true;

    const nodeCenterInStage = this.getNodeCenterInStageCoordinates(node);
    const deltaX = nodeCenterInStage.x - this.crosshairsLayer.crosshairs.x;
    const deltaY = nodeCenterInStage.y - this.crosshairsLayer.crosshairs.y;
    this.moveCrosshairsBy(deltaX, deltaY);
    this.checkAndEmitEditState();
  }

  private getNodeCenterInStageCoordinates(node: DANode): {x: number; y: number} {
    const scale = this.drawingLayer.scaleX();
    return {
      x: this.drawingLayer.x() + (node.group.x() + node.NODE_WIDTH / 2) * scale,
      y: this.drawingLayer.y() + (node.group.y() + node.NODE_HEIGHT / 2) * scale,
    };
  }

  private increaseSelectedNodeSize() {
    this.adjustSelectedNodeSize(this.NODE_SIZE_STEP);
  }

  private decreaseSelectedNodeSize() {
    this.adjustSelectedNodeSize(-this.NODE_SIZE_STEP);
  }

  private adjustSelectedNodeSize(delta: number) {
    const targetNodes = this.getSelectedNodesOrNodeUnderCrosshairs();
    if (targetNodes.length === 0) {
      return;
    }

    let changed = false;
    const connectedEdges = new Set<DAEdge>();

    targetNodes.forEach((node) => {
      if (node.resizeBy(delta)) {
        changed = true;
        node.connectedEdges.forEach((edge) => connectedEdges.add(edge));
      }
    });

    if (!changed) {
      return;
    }

    connectedEdges.forEach((edge) => this.updateEdgePoints(edge));
    this.drawingLayer.batchDraw();
  }

  private getSelectedNodesOrNodeUnderCrosshairs(): DANode[] {
    const selectedNodes = this.drawingLayer.getSelectedDANodes();
    if (selectedNodes.length > 0) {
      return selectedNodes;
    }

    const nodesUnderCrosshairs = this.getDANodesContainingCrosshairs();
    return nodesUnderCrosshairs.length > 0 ? [nodesUnderCrosshairs[0]] : [];
  }

  private increaseSelectedTextSize() {
    this.adjustSelectedTextSize(this.TEXT_SIZE_STEP);
  }

  private decreaseSelectedTextSize() {
    this.adjustSelectedTextSize(-this.TEXT_SIZE_STEP);
  }

  private adjustSelectedTextSize(delta: number) {
    let changed = false;
    const selectedNodes = this.drawingLayer.getSelectedDANodes();
    const selectedLabels = this.getSelectedLabels();

    if (selectedNodes.length === 0 && selectedLabels.length === 0) {
      const nodeUnderCrosshairs = this.getDANodesContainingCrosshairs()[0];
      if (nodeUnderCrosshairs) {
        changed = nodeUnderCrosshairs.adjustLabelFontSizeBy(delta) || changed;
      }

      const labelUnderCrosshairs = this.getLabelUnderCrosshairs();
      if (labelUnderCrosshairs) {
        changed = labelUnderCrosshairs.adjustFontSizeBy(delta) || changed;
      }
    } else {
      selectedNodes.forEach((node) => {
        changed = node.adjustLabelFontSizeBy(delta) || changed;
      });

      selectedLabels.forEach((label) => {
        changed = label.adjustFontSizeBy(delta) || changed;
      });
    }

    if (changed) {
      this.drawingLayer.batchDraw();
    }
  }

  private finishTweens() {
    this.tweens.forEach(t => t.finish());
    this.tweens = [];
  }

  private cancelDragAnimation() {
    if (this.currentDragRafId !== null) {
      cancelAnimationFrame(this.currentDragRafId);
      this.currentDragRafId = null;
    }
  }

  private emitZoomLevel() {
    const currentScale = this.drawingLayer.scaleX();
    this.zoomLevel.emit(Math.round(currentScale * 100));
  }

  private createNewNode() {
    this.finishTweens();

    // Get currently selected nodes (sources for auto-connect edges)
    const selectedNodes = this.drawingLayer.getSelectedDANodes();

    // Unselect all before creating (new node will auto-select)
    this.drawingLayer.unselectAll();
    this.unselectAllWaypoints();
    this.unselectAllLabels();

    const newNode = this.drawingLayer.createNewNode(this.crosshairsLayer.crosshairsX(), this.crosshairsLayer.crosshairsY());

    // Create edges from each previously selected node to the new node
    for (const srcNode of selectedNodes) {
      this.drawingLayer.addEdge(srcNode, newNode);
    }

    this.drawingLayer.batchDraw();
    this.checkAndEmitEditState();
  }


  private getCrosshairsBBoxInDrawingLayer(): { minX: number; minY: number; maxX: number; maxY: number; cx: number; cy: number } {
    const rect = this.crosshairsLayer.crosshairs.konvaGroup.getClientRect();
    const scale = this.drawingLayer.scaleX();
    const layerX = this.drawingLayer.x();
    const layerY = this.drawingLayer.y();
    const minX = (rect.x - layerX) / scale;
    const minY = (rect.y - layerY) / scale;
    const maxX = (rect.x + rect.width - layerX) / scale;
    const maxY = (rect.y + rect.height - layerY) / scale;
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    console.log(`crosshairs bbox (local): min(${minX.toFixed(1)},${minY.toFixed(1)}) max(${maxX.toFixed(1)},${maxY.toFixed(1)}) scale=${scale} layerPos=(${layerX},${layerY})`);
    return { minX, minY, maxX, maxY, cx, cy };
  }

  private edgeIntersectsBox(edge: DAEdge, box: { minX: number; minY: number; maxX: number; maxY: number }): boolean {
    const pathPoints = edge.getPathPoints();
    for (let i = 0; i < pathPoints.length - 1; i++) {
      const p1 = pathPoints[i];
      const p2 = pathPoints[i + 1];
      if (lineSegmentIntersectsRect(p1.x, p1.y, p2.x, p2.y, box.minX, box.minY, box.maxX, box.maxY)) {
        return true;
      }
    }
    return false;
  }

  private getDAEdgesContainingCrosshairs(): DAEdge[] {
    const box = this.getCrosshairsBBoxInDrawingLayer();

    const edges = this.drawingLayer.getDAEdges();
    return edges.filter(edge => {
      const hit = this.edgeIntersectsBox(edge, box);
      if (hit) console.log(`  edge hit (${edge.waypoints.length} waypoints)`);
      return hit;
    });
  }


  private getDANodesContainingCrosshairs(): DANode[] {
    return this.drawingLayer.getDaNodesContainingPoint(this.crosshairsLayer.crosshairs.getAbsolutePosition());
  }

  private recenterView() {
    this.finishTweens();

    const nodes = this.drawingLayer.getSelectedDANodes().length > 0
      ? this.drawingLayer.getSelectedDANodes()
      : this.drawingLayer.getDANodes();
    const edges = this.drawingLayer.getDAEdges();

    if (nodes.length === 0 && edges.length === 0) return;

    // Calculate bounding box from actual DANodes/DAEdges in layer coordinates
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

    nodes.forEach(node => {
      const x = node.group.x();
      const y = node.group.y();
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x + node.NODE_WIDTH);
      maxY = Math.max(maxY, y + node.NODE_HEIGHT);
    });

    edges.forEach(edge => {
      const points = edge.getPathPoints();
      points.forEach(p => {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      });
    });

    if (minX === Infinity) return;

    // Calculate the center point of the drawing in layer coordinates
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    // Center the view on the content without changing scale
    const stageWidth = this.stage.width();
    const stageHeight = this.stage.height();
    const currentScale = this.drawingLayer.scaleX();

    const tween = new Konva.Tween({
      node: this.drawingLayer,
      duration: this.RECENTER_DURATION,
      x: stageWidth / 2 - centerX * currentScale,
      y: stageHeight / 2 - centerY * currentScale,
      easing: Konva.Easings.EaseInOut,
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
    
    const tween = new Konva.Tween({
      node: this.crosshairsLayer.crosshairs.konvaGroup,
      duration: this.RECENTER_CROSSHAIRS_DURATION,
      x: stageWidth / 2,
      y: stageHeight / 2,
      easing: Konva.Easings.EaseInOut,
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

  private dragSelectedLeft() {
    this.cancelDragAnimation();
    this.finishTweens();
    this.hasDragged = true;
    const selectedNodes = this.drawingLayer.getSelectedDANodes();
    const selectedWaypoints = this.getSelectedWaypoints();
    const dragDistance = 50;
    
    // Collect all connected edges to move
    const edgesToMove = new Set<DAEdge>();
    selectedNodes.forEach(node => {
      node.connectedEdges.forEach(edge => edgesToMove.add(edge));
    });
    
    // Also collect edges from selected waypoints
    selectedWaypoints.forEach(waypoint => {
      const edges = this.getEdgesContainingWaypoint(waypoint);
      edges.forEach(edge => edgesToMove.add(edge));
    });
    
    // Store initial crosshairs position
    const initialCrosshairsX = this.crosshairsLayer.crosshairs.x;
    const initialCrosshairsY = this.crosshairsLayer.crosshairs.y;
    
    // Store initial positions for all nodes and waypoints
    const initialNodePositions = selectedNodes.map(node => ({
      node,
      initialX: node.group.x(),
      targetX: node.group.x() - dragDistance
    }));
    
    const initialWaypointPositions = selectedWaypoints.map(waypoint => ({
      waypoint,
      initialX: waypoint.x,
      targetX: waypoint.x - dragDistance
    }));
    
    // Single animation loop for all items
    const duration = this.TWEEN_DURATION * 1000; // Convert to milliseconds
    const startTime = Date.now();
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Update all nodes
      initialNodePositions.forEach(({ node, initialX, targetX }) => {
        const newX = initialX + (targetX - initialX) * progress;
        node.group.x(newX);
      });
      
      // Update all waypoints
      initialWaypointPositions.forEach(({ waypoint, initialX, targetX }) => {
        const newX = initialX + (targetX - initialX) * progress;
        waypoint.x = newX;
      });
      
      // Update edges smoothly during animation
      edgesToMove.forEach(edge => {
        this.updateEdgePoints(edge);
      });
      
      // Update crosshairs to move the same distance as nodes (scaled to stage coords)
      const scale = this.drawingLayer.scaleX();
      const currentDragDistance = dragDistance * scale * progress;
      this.crosshairsLayer.crosshairs.x = initialCrosshairsX - currentDragDistance;
      this.crosshairsLayer.crosshairs.y = initialCrosshairsY;
      
      if (progress < 1) {
        this.currentDragRafId = requestAnimationFrame(animate);
      } else {
        this.currentDragRafId = null;
      }
    };
    
    animate();
  }

  private dragSelectedRight() {
    this.cancelDragAnimation();
    this.finishTweens();
    this.hasDragged = true;
    const selectedNodes = this.drawingLayer.getSelectedDANodes();
    const selectedWaypoints = this.getSelectedWaypoints();
    const dragDistance = 50;
    
    // Collect all connected edges to move
    const edgesToMove = new Set<DAEdge>();
    selectedNodes.forEach(node => {
      node.connectedEdges.forEach(edge => edgesToMove.add(edge));
    });
    
    // Also collect edges from selected waypoints
    selectedWaypoints.forEach((waypoint: DAWaypoint) => {
      const edges = this.getEdgesContainingWaypoint(waypoint);
      edges.forEach((edge: DAEdge) => edgesToMove.add(edge));
    });
    
    // Store initial crosshairs position
    const initialCrosshairsX = this.crosshairsLayer.crosshairs.x;
    const initialCrosshairsY = this.crosshairsLayer.crosshairs.y;
    
    // Store initial positions for all nodes and waypoints
    const initialNodePositions = selectedNodes.map(node => ({
      node,
      initialX: node.group.x(),
      targetX: node.group.x() + dragDistance
    }));
    
    const initialWaypointPositions = selectedWaypoints.map((waypoint: DAWaypoint) => ({
      waypoint,
      initialX: waypoint.x,
      targetX: waypoint.x + dragDistance
    }));
    
    // Single animation loop for all items
    const duration = this.TWEEN_DURATION * 1000; // Convert to milliseconds
    const startTime = Date.now();
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Update all nodes
      initialNodePositions.forEach(({ node, initialX, targetX }) => {
        const newX = initialX + (targetX - initialX) * progress;
        node.group.x(newX);
      });
      
      // Update all waypoints
      initialWaypointPositions.forEach(({ waypoint, initialX, targetX }) => {
        const newX = initialX + (targetX - initialX) * progress;
        waypoint.x = newX;
      });
      
      // Update edges smoothly during animation
      edgesToMove.forEach(edge => {
        this.updateEdgePoints(edge);
      });
      
      // Update crosshairs to move the same distance as nodes (scaled to stage coords)
      const scale = this.drawingLayer.scaleX();
      const currentDragDistance = dragDistance * scale * progress;
      this.crosshairsLayer.crosshairs.x = initialCrosshairsX + currentDragDistance;
      this.crosshairsLayer.crosshairs.y = initialCrosshairsY;
      
      if (progress < 1) {
        this.currentDragRafId = requestAnimationFrame(animate);
      } else {
        this.currentDragRafId = null;
      }
    };
    
    animate();
  }

  private dragSelectedUp() {
    this.cancelDragAnimation();
    this.finishTweens();
    this.hasDragged = true;
    const selectedNodes = this.drawingLayer.getSelectedDANodes();
    const selectedWaypoints = this.getSelectedWaypoints();
    const dragDistance = 50;
    
    // Collect all connected edges to move
    const edgesToMove = new Set<DAEdge>();
    selectedNodes.forEach(node => {
      node.connectedEdges.forEach(edge => edgesToMove.add(edge));
    });
    
    // Also collect edges from selected waypoints
    selectedWaypoints.forEach((waypoint: DAWaypoint) => {
      const edges = this.getEdgesContainingWaypoint(waypoint);
      edges.forEach((edge: DAEdge) => edgesToMove.add(edge));
    });
    
    // Store initial crosshairs position
    const initialCrosshairsX = this.crosshairsLayer.crosshairs.x;
    const initialCrosshairsY = this.crosshairsLayer.crosshairs.y;
    
    // Store initial positions for all nodes and waypoints
    const initialNodePositions = selectedNodes.map(node => ({
      node,
      initialY: node.group.y(),
      targetY: node.group.y() - dragDistance
    }));
    
    const initialWaypointPositions = selectedWaypoints.map((waypoint: DAWaypoint) => ({
      waypoint,
      initialY: waypoint.y,
      targetY: waypoint.y - dragDistance
    }));
    
    // Single animation loop for all items
    const duration = this.TWEEN_DURATION * 1000; // Convert to milliseconds
    const startTime = Date.now();
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Update all nodes
      initialNodePositions.forEach(({ node, initialY, targetY }) => {
        const newY = initialY + (targetY - initialY) * progress;
        node.group.y(newY);
      });
      
      // Update all waypoints
      initialWaypointPositions.forEach(({ waypoint, initialY, targetY }) => {
        const newY = initialY + (targetY - initialY) * progress;
        waypoint.y = newY;
      });
      
      // Update edges smoothly during animation
      edgesToMove.forEach(edge => {
        this.updateEdgePoints(edge);
      });
      
      // Update crosshairs to move the same distance as nodes (scaled to stage coords)
      const scale = this.drawingLayer.scaleX();
      const currentDragDistance = dragDistance * scale * progress;
      this.crosshairsLayer.crosshairs.x = initialCrosshairsX;
      this.crosshairsLayer.crosshairs.y = initialCrosshairsY - currentDragDistance;
      
      if (progress < 1) {
        this.currentDragRafId = requestAnimationFrame(animate);
      } else {
        this.currentDragRafId = null;
      }
    };
    
    animate();
  }

  private dragSelectedDown() {
    this.cancelDragAnimation();
    this.finishTweens();
    this.hasDragged = true;
    const selectedNodes = this.drawingLayer.getSelectedDANodes();
    const selectedWaypoints = this.getSelectedWaypoints();
    const dragDistance = 50;
    
    // Collect all connected edges to move
    const edgesToMove = new Set<DAEdge>();
    selectedNodes.forEach(node => {
      node.connectedEdges.forEach(edge => edgesToMove.add(edge));
    });
    
    // Also collect edges from selected waypoints
    selectedWaypoints.forEach((waypoint: DAWaypoint) => {
      const edges = this.getEdgesContainingWaypoint(waypoint);
      edges.forEach((edge: DAEdge) => edgesToMove.add(edge));
    });
    
    // Store initial crosshairs position
    const initialCrosshairsX = this.crosshairsLayer.crosshairs.x;
    const initialCrosshairsY = this.crosshairsLayer.crosshairs.y;
    
    // Store initial positions for all nodes and waypoints
    const initialNodePositions = selectedNodes.map(node => ({
      node,
      initialY: node.group.y(),
      targetY: node.group.y() + dragDistance
    }));
    
    const initialWaypointPositions = selectedWaypoints.map((waypoint: DAWaypoint) => ({
      waypoint,
      initialY: waypoint.y,
      targetY: waypoint.y + dragDistance
    }));
    
    // Single animation loop for all items
    const duration = this.TWEEN_DURATION * 1000; // Convert to milliseconds
    const startTime = Date.now();
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Update all nodes
      initialNodePositions.forEach(({ node, initialY, targetY }) => {
        const newY = initialY + (targetY - initialY) * progress;
        node.group.y(newY);
      });
      
      // Update all waypoints
      initialWaypointPositions.forEach(({ waypoint, initialY, targetY }) => {
        const newY = initialY + (targetY - initialY) * progress;
        waypoint.y = newY;
      });
      
      // Update edges smoothly during animation
      edgesToMove.forEach(edge => {
        this.updateEdgePoints(edge);
      });
      
      // Update crosshairs to move the same distance as nodes (scaled to stage coords)
      const scale = this.drawingLayer.scaleX();
      const currentDragDistance = dragDistance * scale * progress;
      this.crosshairsLayer.crosshairs.x = initialCrosshairsX;
      this.crosshairsLayer.crosshairs.y = initialCrosshairsY + currentDragDistance;
      
      if (progress < 1) {
        this.currentDragRafId = requestAnimationFrame(animate);
      } else {
        this.currentDragRafId = null;
      }
    };
    
    animate();
  }

  private updateEdgePoints(edge: DAEdge) {
    const points = edge.calculatePoints(edge.srcNode, edge.destNode);
    edge._line.points(points);
    edge.refreshSegments();
    // Force redraw
    this.drawingLayer.batchDraw();
  }

  private checkAutoPan() {
    const selectedNodes = this.drawingLayer.getSelectedDANodes();
    if (selectedNodes.length === 0) return;

    const stageWidth = this.stage.width();
    const stageHeight = this.stage.height();
    const panDistance = 100;
    const margin = 50;

    // Get crosshairs position for auto-pan calculations
    const crosshairsX = this.crosshairsLayer.crosshairs.x;
    const crosshairsY = this.crosshairsLayer.crosshairs.y;

    let panX = 0;
    let panY = 0;

    // Check if crosshairs go off screen and set pan values
    if (crosshairsX < margin) {
      panX = panDistance; // Pan right
    } else if (crosshairsX > stageWidth - margin) {
      panX = -panDistance; // Pan left
    }

    if (crosshairsY < margin) {
      panY = panDistance; // Pan down
    } else if (crosshairsY > stageHeight - margin) {
      panY = -panDistance; // Pan up
    }

    // Apply auto-pan if needed
    if (panX !== 0 || panY !== 0) {
      const layerX = this.drawingLayer.x();
      const layerY = this.drawingLayer.y();
      this.tweens.push(new Konva.Tween({
        node: this.drawingLayer,
        duration: this.TWEEN_DURATION,
        x: layerX + panX,
        y: layerY + panY,
        easing: Konva.Easings.Linear
      }).play());
    }
  }

  private addWaypoint(): void {
    const box = this.getCrosshairsBBoxInDrawingLayer();

    const edges: DAEdge[] = this.drawingLayer.getDAEdges();

    for (const edge of edges) {
      const pathPoints = edge.getPathPoints();
      for (let i = 0; i < pathPoints.length - 1; i++) {
        const p1 = pathPoints[i];
        const p2 = pathPoints[i + 1];
        if (lineSegmentIntersectsRect(p1.x, p1.y, p2.x, p2.y, box.minX, box.minY, box.maxX, box.maxY)) {
          // Place waypoint at the point on this segment closest to crosshairs center
          const point = closestPointOnSeg(box.cx, box.cy, p1.x, p1.y, p2.x, p2.y);
          console.log(`addWaypoint: placing at (${point.x.toFixed(1)},${point.y.toFixed(1)}) on segment ${i}`);
          const waypoint = new DAWaypoint(point.x, point.y);
          edge.addWaypoint(waypoint);
          if (!this.waypointsVisible) {
            this.waypointsVisible = true;
            this.updateWaypointVisibility();
            this.emitWaypointVisibility();
          } else {
            waypoint.setVisibleForSelection(true);
          }
          this.drawingLayer.batchDraw();
          this.unselectAll();
          return;
        }
      }
    }
    console.log('addWaypoint: no edge found under crosshairs');
  }

  private addLabel(): void {
    const box = this.getCrosshairsBBoxInDrawingLayer();

    const edges: DAEdge[] = this.drawingLayer.getDAEdges();

    for (const edge of edges) {
      const pathPoints = edge.getPathPoints();
      for (let i = 0; i < pathPoints.length - 1; i++) {
        const p1 = pathPoints[i];
        const p2 = pathPoints[i + 1];
        if (lineSegmentIntersectsRect(p1.x, p1.y, p2.x, p2.y, box.minX, box.minY, box.maxX, box.maxY)) {
          const point = closestPointOnSeg(box.cx, box.cy, p1.x, p1.y, p2.x, p2.y);
          console.log(`addLabel: placing at (${point.x.toFixed(1)},${point.y.toFixed(1)}) on segment ${i}`);
          const label = new DALabel(point.x, point.y, 'label');
          edge.addLabel(label);
          this.drawingLayer.batchDraw();
          this.unselectAll(); // Clear selection after adding label
          return;
        }
      }
    }
    console.log('addLabel: no edge found under crosshairs');
  }

  private handleEditSelected() {
    const selectedNodes = this.drawingLayer.getSelectedDANodes();
    const selectedLabels = this.getSelectedLabels();
    // Waypoints are not editable, so we don't check for them here.
    console.log(`handleEditSelected: Nodes=${selectedNodes.length}, Labels=${selectedLabels.length}`);

    // 1. If selection exists (and is editable), edit it.
    if (selectedNodes.length > 0 ||
        selectedLabels.length > 0) {
       console.log('  -> Entering edit mode due to existing selection.');
       this.daOut.emit({kind: "started-label-editing-mode"});
       return;
    }

    // 2. If no selection, check under crosshairs for editable items.
    // Waypoints are ignored.

    const label = this.getLabelUnderCrosshairs();
    if (label) {
      console.log('  -> Found label under crosshairs. Selecting and editing.');
      this.singleItemSelect();
      this.daOut.emit({kind: "started-label-editing-mode"});
      return;
    }

    const nodes = this.getDANodesContainingCrosshairs();
    console.log(`  -> Nodes under crosshairs: ${nodes.length}`);
    if (nodes.length > 0) {
      console.log('  -> Found node under crosshairs. Selecting and editing.');
      this.singleItemSelect();
      this.daOut.emit({kind: "started-label-editing-mode"});
      return;
    }

    // 3. Nothing selected or hovered -> no-op (user should use insert key instead)
    console.log('  -> Nothing targeted. Edit command ignored.');
  }

  private updateWaypointVisibility(): void {
    const edges = this.drawingLayer.getDAEdges();
    edges.forEach(edge => {
      edge.waypoints.forEach(waypoint => {
        waypoint.setVisibleForSelection(this.waypointsVisible);
      });
    });
  }

  private toggleWaypointVisibility(): void {
    this.waypointsVisible = !this.waypointsVisible;
    this.updateWaypointVisibility();
    this.drawingLayer.batchDraw();
    this.emitWaypointVisibility();
  }

  private emitWaypointVisibility(): void {
    this.waypointsVisibleChange.emit(this.waypointsVisible);
  }

  private getSelectedWaypoints(): DAWaypoint[] {
    const selectedWaypoints: DAWaypoint[] = [];
    const edges = this.drawingLayer.getDAEdges();
    edges.forEach(edge => {
      edge.waypoints.forEach(waypoint => {
        if (waypoint.isSelected) {
          selectedWaypoints.push(waypoint);
        }
      });
    });
    return selectedWaypoints;
  }

  private getWaypointUnderCrosshairs(): DAWaypoint | null {
    const box = this.getCrosshairsBBoxInDrawingLayer();

    const edges = this.drawingLayer.getDAEdges();
    for (const edge of edges) {
      for (const waypoint of edge.waypoints) {
        console.log(`  waypoint at (${waypoint.x.toFixed(1)},${waypoint.y.toFixed(1)}) vs box (${box.minX.toFixed(1)},${box.minY.toFixed(1)})-(${box.maxX.toFixed(1)},${box.maxY.toFixed(1)})`);
        if (waypoint.x >= box.minX && waypoint.x <= box.maxX &&
            waypoint.y >= box.minY && waypoint.y <= box.maxY) {
          console.log('  -> waypoint HIT');
          return waypoint;
        }
      }
    }
    return null;
  }

  private unselectAllWaypoints(): void {
    const edges = this.drawingLayer.getDAEdges();
    edges.forEach(edge => {
      edge.waypoints.forEach(waypoint => {
        waypoint.isSelected = false;
      });
    });
  }

  private getEdgesContainingWaypoint(waypoint: DAWaypoint): DAEdge[] {
    const edges = this.drawingLayer.getDAEdges();
    return edges.filter(edge => edge.waypoints.includes(waypoint));
  }

  private getSelectedLabels(): DALabel[] {
    const selectedLabels: DALabel[] = [];
    const edges = this.drawingLayer.getDAEdges();
    edges.forEach(edge => {
      edge.labels.forEach(label => {
        if (label.isSelected) {
          selectedLabels.push(label);
        }
      });
    });
    return selectedLabels;
  }

  private getLabelUnderCrosshairs(): DALabel | null {
    const box = this.getCrosshairsBBoxInDrawingLayer();

    const edges = this.drawingLayer.getDAEdges();
    for (const edge of edges) {
      for (const label of edge.labels) {
        if (label.x >= box.minX && label.x <= box.maxX &&
            label.y >= box.minY && label.y <= box.maxY) {
          return label;
        }
      }
    }
    return null;
  }

  private unselectAllLabels(): void {
    const edges = this.drawingLayer.getDAEdges();
    edges.forEach(edge => {
      edge.labels.forEach(label => {
        label.isSelected = false;
      });
    });
  }

  private getEdgesContainingLabel(label: DALabel): DAEdge[] {
    const edges = this.drawingLayer.getDAEdges();
    return edges.filter(edge => edge.labels.includes(label));
  }

  private deleteSelected(): void {
    // Priority: nodes > edges > waypoints > crosshairs
    const selectedNodes = this.drawingLayer.getSelectedDANodes();
    if (selectedNodes.length > 0) {
      selectedNodes.forEach(node => this.drawingLayer.removeNode(node));
      this.drawingLayer.batchDraw();
      return;
    }

    const selectedEdges = this.drawingLayer.getSelectedDAEdges();
    if (selectedEdges.length > 0) {
      selectedEdges.forEach(edge => this.drawingLayer.removeEdge(edge));
      this.drawingLayer.batchDraw();
      return;
    }

    const selectedWaypoints = this.getSelectedWaypoints();
    if (selectedWaypoints.length > 0) {
      selectedWaypoints.forEach(waypoint => {
        const edges = this.getEdgesContainingWaypoint(waypoint);
        edges.forEach(edge => edge.removeWaypoint(waypoint));
      });
      this.drawingLayer.batchDraw();
      return;
    }

    const selectedLabels = this.getSelectedLabels();
    if (selectedLabels.length > 0) {
      selectedLabels.forEach(label => {
        const edges = this.getEdgesContainingLabel(label);
        edges.forEach(edge => edge.removeLabel(label));
      });
      this.drawingLayer.batchDraw();
      return;
    }

    // Nothing selected: delete item under crosshairs
    const nodeUnderCrosshairs = this.getDANodesContainingCrosshairs()[0];
    if (nodeUnderCrosshairs) {
      this.drawingLayer.removeNode(nodeUnderCrosshairs);
      this.drawingLayer.batchDraw();
      return;
    }

    const edgeUnderCrosshairs = this.getDAEdgesContainingCrosshairs()[0];
    if (edgeUnderCrosshairs) {
      this.drawingLayer.removeEdge(edgeUnderCrosshairs);
      this.drawingLayer.batchDraw();
      return;
    }

    const waypointUnderCrosshairs = this.getWaypointUnderCrosshairs();
    if (waypointUnderCrosshairs) {
      const edges = this.getEdgesContainingWaypoint(waypointUnderCrosshairs);
      edges.forEach(edge => edge.removeWaypoint(waypointUnderCrosshairs));
      this.drawingLayer.batchDraw();
      return;
    }

    const labelUnderCrosshairs = this.getLabelUnderCrosshairs();
    if (labelUnderCrosshairs) {
      const edges = this.getEdgesContainingLabel(labelUnderCrosshairs);
      edges.forEach(edge => edge.removeLabel(labelUnderCrosshairs));
      this.drawingLayer.batchDraw();
    }
  }

  private enterDragMode() {
    // Crosshairs stay visible during drag
    this.hasDragged = false;
  }

  private exitDragMode() {
    // Crosshairs remain visible after drag
    if (this.hasDragged) {
      this.unselectAll();
      this.checkAndEmitEditState();
    }
  }

}
