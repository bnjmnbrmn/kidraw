import {AfterViewInit, Component, ElementRef, EventEmitter, inject, Input, OnChanges, OnDestroy, Output, SimpleChanges} from '@angular/core';
import { Subscription } from 'rxjs';
import { debounceTime } from 'rxjs/operators';
import { DemoDataService } from '../services/demo-data.service';
import { ThemeService } from '../services/theme.service';
import { VisualConfigService } from '../services/visual-config.service';
import { DrawingLayer } from './drawing.layer';
import { CrosshairsLayer } from './crosshairs.layer';
import { DANode } from './da-node';
import { DAEdge } from './da-edge';
import { DALabel } from './da-label';
import { DACommand, DACommandType, EdgeDirectedness, GridTier, ItemColor, LayoutType, LineStyle, NodeShape, TextOverflowMode } from './command.model';
import { lineSegmentIntersectsRect, closestPointOnSegment as closestPointOnSeg } from './utils';
import { DANotification } from './da-notification.model';
import { Observable } from 'rxjs';
import Konva from 'konva';
import { DebugLogService } from '../services/debug-log.service';
import { UndoRedoService } from './undo-redo.service';
import { applyLayout } from './graph-layout';
import { applyChargedSpringEdges } from './charged-spring-edges';
import { applyBezierRouteEdges } from './bezier-route-edges';
import { applyBezierFitChargedSpringEdges } from './bezier-fit-route-edges';
import { applyFlexibleWireEdges } from './flexible-wire-edges';
import { applyWeightedChainEdges } from './weighted-chain-edges';
import { TuningOptionsService } from '../services/tuning-options.service';
import { RoutingMetricsService } from '../services/routing-metrics.service';
import { ABTestingService, SnapshotPayload } from '../services/ab-testing.service';

@Component({
  selector: 'app-drawing-area',
  imports: [],
  templateUrl: './drawing-area.component.html',
  styleUrl: './drawing-area.component.css'
})
export class DrawingAreaComponent implements AfterViewInit, OnChanges, OnDestroy {

  @Input({required: true}) commands!: Observable<DACommand>;
  @Output() daOut = new EventEmitter<DANotification>()
  @Output() zoomLevel = new EventEmitter<number>()
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
  private log = inject(DebugLogService);
  private themeService = inject(ThemeService);
  private visualConfigService = inject(VisualConfigService);
  private tuning = inject(TuningOptionsService);
  private metrics = inject(RoutingMetricsService);
  private abTesting = inject(ABTestingService);
  private themeSub?: Subscription;
  private visualSub?: Subscription;
  private hasDragged = false;
  private wasAlreadySelectedBeforeDrag = false;
  private undoRedoService = new UndoRedoService();
  private dragSnapshotCaptured = false;
  private textEditSnapshotCaptured = false;
  private directedEdgeSource: DANode | null = null;
  private directedEdgeInProgress: DAEdge | null = null;
  private _defaultNodeShape: NodeShape = 'box';
  private _defaultEdgeDirectedness: EdgeDirectedness = 'directed';
  private _defaultLineStyle: LineStyle = 'solid';
  private resizeTargetNode: DANode | null = null;
  private navigationHistory: DANode[] = [];
  private gatheredNodePositions: Map<DANode, {x: number; y: number}> = new Map();
  private gatherRestoreTimeout: number | null = null;
  private gridFadeTimeout: number | null = null;
  private gridInitialized = false;

  public readonly MAX_ZOOM = 8.0;
  public readonly MIN_ZOOM = 0.125;
  public readonly CROSSHAIR_MOVEMENT_DURATION = .1;
  public CROSSHAIRS_MOVEMENT_DISTANCE = 50; // one grid cell
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

  private static readonly CONTEXT_AFFECTING_COMMANDS = new Set<DACommandType>([
    DACommandType.CREATE_NEW_NODE,
    DACommandType.CREATE_NEW_NODE_DIRECTED,
    DACommandType.CONNECT_SELECTED_NODES,
    DACommandType.FINALIZE_DIRECTED_EDGE,
    DACommandType.ADD_LABEL,
    DACommandType.SINGLE_ITEM_TOGGLE_SELECT,
    DACommandType.MULTI_ITEM_SELECT,
    DACommandType.UNSELECT_ALL,
    DACommandType.DELETE,
    DACommandType.UNDO,
    DACommandType.REDO,
    DACommandType.SNAP_TO_NEAREST_NODE,
    DACommandType.SNAP_TO_NODE_LEFT,
    DACommandType.SNAP_TO_NODE_RIGHT,
    DACommandType.SNAP_TO_NODE_UP,
    DACommandType.SNAP_TO_NODE_DOWN,
    DACommandType.TRAVERSE_OUTGOING_NEXT,
    DACommandType.TRAVERSE_OUTGOING_PREV,
    DACommandType.TRAVERSE_INCOMING_NEXT,
    DACommandType.TRAVERSE_INCOMING_PREV,
    DACommandType.FOLLOW_SELECTED_EDGE,
    DACommandType.NAVIGATE_BACK,
    DACommandType.GATHER_CONNECTED_NODES,
    DACommandType.LOAD_SAMPLE_GRAPH,
    DACommandType.LOAD_GRAPH,
    DACommandType.NEW_GRAPH,
    DACommandType.EXIT_LABEL_EDIT_MODE,
    DACommandType.RECENTER_VIEW,
    DACommandType.RECENTER_CROSSHAIRS,
    DACommandType.SET_DEFAULT_EDGE_DIRECTEDNESS,
    DACommandType.SET_DEFAULT_LINE_STYLE,
    DACommandType.SET_NODE_SHAPE,
  ]);

  private static readonly MUTATING_COMMANDS = new Set<DACommandType>([
    DACommandType.CREATE_NEW_NODE,
    DACommandType.CREATE_NEW_NODE_DIRECTED,
    DACommandType.CONNECT_SELECTED_NODES,
    DACommandType.BEGIN_DIRECTED_EDGE,
    DACommandType.SET_EDGE_DESTINATION,
    DACommandType.ADD_LABEL,
    DACommandType.DELETE,
    DACommandType.INSERT_CHAR,
    DACommandType.DELETE_LAST_CHAR,
    DACommandType.INCREASE_SELECTED_NODE_SIZE,
    DACommandType.DECREASE_SELECTED_NODE_SIZE,
    DACommandType.INCREASE_SELECTED_TEXT_SIZE,
    DACommandType.DECREASE_SELECTED_TEXT_SIZE,
    DACommandType.DRAG_SELECTED_LEFT,
    DACommandType.DRAG_SELECTED_RIGHT,
    DACommandType.DRAG_SELECTED_UP,
    DACommandType.DRAG_SELECTED_DOWN,
    DACommandType.MULTI_ITEM_SELECT,
    DACommandType.SINGLE_ITEM_TOGGLE_SELECT,
    DACommandType.UNSELECT_ALL,
    DACommandType.SET_TEXT_OVERFLOW_MODE,
    DACommandType.SET_NODE_SHAPE,
  ]);


  ngAfterViewInit(): void {
    this.stage = new Konva.Stage({
      container: 'mainDrawingArea',
      width: this.componentNE.offsetWidth,
      height: this.componentNE.offsetHeight,
    });
    const effectivePalette = () => this.visualConfigService.getEffectivePalette(this.themeService.theme);
    this.stage.container().style.backgroundColor = effectivePalette().drawingStageBackground;
    const reapplyTheme = () => {
      const palette = effectivePalette();
      this.stage.container().style.backgroundColor = palette.drawingStageBackground;
      this.drawingLayer.applyThemeColors(palette);
      this.crosshairsLayer.updateCrosshairsColor(palette.crosshairsStroke);
    };
    const reapplyConfig = () => {
      reapplyTheme();
      this.CROSSHAIRS_MOVEMENT_DISTANCE = this.visualConfigService.config.cursor.gridSpacing;
    };
    this.themeSub = this.themeService.themeChanged$.subscribe(reapplyTheme);
    this.visualSub = this.visualConfigService.configChanged$.subscribe(reapplyConfig);

    this.drawingLayer = new DrawingLayer();
    this.drawingLayer.palette = effectivePalette();
    this.stage.add(this.drawingLayer);
    this.crosshairsLayer = new CrosshairsLayer(this.stage, effectivePalette().crosshairsStroke);
    this.stage.add(this.crosshairsLayer);

    this.crosshairsLayer.setHeading(this.headingRadians);
    this.crosshairsLayer.setHeadingVisible(false);

    // Check for demo flag in URL parameters
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('demo') as string === 'true') {
      this.demoDataService.createDemoGraph(this.drawingLayer);
      this.drawingLayer.applyThemeColors(effectivePalette());
    } else {
      // Auto-load last saved graph on startup
      const raw = localStorage.getItem(this.STORAGE_KEY);
      if (raw) {
        try {
          const snapshot = JSON.parse(raw);
          this.drawingLayer.restoreGraph(snapshot);
          this.drawingLayer.applyThemeColors(effectivePalette());
        } catch {
          // Ignore corrupt stored data
        }
      }
    }

    this.commands.subscribe(this.handleCommands.bind(this));

    // Auto-save on page unload
    this._beforeUnloadHandler = () => this.saveGraphToStorage();
    window.addEventListener('beforeunload', this._beforeUnloadHandler);

    // Emit initial zoom level and context state
    this.emitZoomLevel();
    this.emitMovementSpeed();
    this.emitContextState();

    this.resizeObserver = new ResizeObserver(entries => {
      this.stage.width(this.componentNE.offsetWidth);
      this.stage.height(this.componentNE.offsetHeight);
    });
    this.resizeObserver.observe(this.componentNE);

  }

  ngOnChanges(changes: SimpleChanges): void {
  }

  /** Most recently applied routing — used by the auto-reroute subscription
   *  so a slider change only re-runs the routing the user is currently
   *  looking at. null until the user has applied any routing. */
  private lastAppliedRouting: 'charged-spring' | 'bezier-route' | 'bezier-fit' | 'flexible-wire' | 'weighted-chain' | null = null;
  private tuningSub?: Subscription;

  ngOnInit(): void {
    // Auto-reroute when a slider relevant to the active routing changes.
    // Debounced so dragging a slider doesn't fire a routing per pixel of
    // movement. The hybrid 'bezier-fit' routing reads BOTH charged-spring
    // and bezier-fit options, so it should re-run on either group.
    this.tuningSub = this.tuning.changes
      .pipe(debounceTime(120))
      .subscribe(group => {
        const lr = this.lastAppliedRouting;
        if (lr === 'charged-spring' && group === 'charged-spring') {
          this.applyChargedSpringEdges(true);
        } else if (lr === 'bezier-route' && group === 'bezier-route') {
          this.applyBezierRouteEdges(true);
        } else if (lr === 'bezier-fit' && (group === 'bezier-fit' || group === 'charged-spring')) {
          this.applyBezierFitChargedSpringEdges(true);
        } else if (lr === 'flexible-wire' && group === 'flexible-wire') {
          this.applyFlexibleWireEdges(true);
        } else if (lr === 'weighted-chain' && group === 'weighted-chain') {
          this.applyWeightedChainEdges(true);
        }
      });

    // Provide a snapshot-capture function to the A/B service. It captures
    // the current Konva stage as PNG along with the active routing's
    // metadata. Called on demand when the user clicks "Snapshot".
    this.abTesting.registerCapture((): SnapshotPayload | null => {
      const m = this.metrics.metrics$.value;
      if (!m) return null;
      const algo = this.lastAppliedRouting ?? 'unknown';
      let params: Record<string, any> = {};
      switch (algo) {
        case 'charged-spring': params = { ...this.tuning.chargedSpring }; break;
        case 'bezier-route': params = { ...this.tuning.bezierRoute }; break;
        case 'bezier-fit': params = { ...this.tuning.bezierFit, _cs: { ...this.tuning.chargedSpring } }; break;
        case 'flexible-wire': params = { ...this.tuning.flexibleWire }; break;
        case 'weighted-chain': params = { ...this.tuning.weightedChain }; break;
      }
      return {
        algorithm: algo,
        params,
        metrics: m,
        pngDataUrl: this.stage.toDataURL({pixelRatio: 1}),
        graphSerialized: JSON.stringify(this.drawingLayer.serializeGraph()),
      };
    });
  }

  private _beforeUnloadHandler?: () => void;

  ngOnDestroy(): void {
    this.themeSub?.unsubscribe();
    this.visualSub?.unsubscribe();
    this.tuningSub?.unsubscribe();
    if (this._beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this._beforeUnloadHandler);
    }
  }

  private canEdit = false;

  private checkAndEmitEditState() {
    const hasSelection = this.drawingLayer.getSelectedDANodes().length > 0 ||
      this.getSelectedLabels().length > 0;

    let canEditNow = hasSelection;

    if (!canEditNow) {
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

  private pushUndoSnapshot(command: DACommand): void {
    const kind = command.kind;

    // Drag coalescing: only snapshot on first drag command per session
    if (kind === DACommandType.DRAG_SELECTED_LEFT ||
        kind === DACommandType.DRAG_SELECTED_RIGHT ||
        kind === DACommandType.DRAG_SELECTED_UP ||
        kind === DACommandType.DRAG_SELECTED_DOWN) {
      if (this.dragSnapshotCaptured) return;
      this.dragSnapshotCaptured = true;
    }

    // Text edit coalescing: only snapshot on first text edit per session
    if (kind === DACommandType.INSERT_CHAR || kind === DACommandType.DELETE_LAST_CHAR) {
      if (this.textEditSnapshotCaptured) return;
      this.textEditSnapshotCaptured = true;
    } else {
      // Non-text-edit mutation resets text coalescing
      this.textEditSnapshotCaptured = false;
    }

    this.undoRedoService.pushSnapshot(this.drawingLayer.serializeGraph());
  }

  private handleCommands(command: DACommand) {
    this.log.log("handleCommands - " + JSON.stringify(command));

    // Push undo snapshot before mutating commands
    if (DrawingAreaComponent.MUTATING_COMMANDS.has(command.kind)) {
      this.pushUndoSnapshot(command);
    }

    // Show grid and indicators for any spatial/manipulation command
    if (command.kind !== DACommandType.INSERT_CHAR &&
        command.kind !== DACommandType.DELETE_LAST_CHAR &&
        command.kind !== DACommandType.EXIT_LABEL_EDIT_MODE &&
        command.kind !== DACommandType.EDIT_SELECTED &&
        command.kind !== DACommandType.REDO) {
      this.showMovementIndicators();
    }

    switch (command.kind) {
      case DACommandType.MOVE_CROSSHAIRS_LEFT:
        this.moveCrosshairsLeft(command.gridTier);
        break;
      case DACommandType.MOVE_CROSSHAIRS_DOWN:
        this.moveCrosshairsDown(command.gridTier);
        break;
      case DACommandType.MOVE_CROSSHAIRS_RIGHT:
        this.moveCrosshairsRight(command.gridTier);
        break;
      case DACommandType.MOVE_CROSSHAIRS_UP:
        this.moveCrosshairsUp(command.gridTier);
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
      case DACommandType.TRAVERSE_OUTGOING_PREV:
        this.traverseOutgoingPrev();
        break;
      case DACommandType.TRAVERSE_INCOMING_NEXT:
        this.traverseIncomingNext();
        break;
      case DACommandType.TRAVERSE_INCOMING_PREV:
        this.traverseIncomingPrev();
        break;
      case DACommandType.SNAP_TO_NEAREST_NODE:
        this.snapToNearestNode();
        break;
      case DACommandType.SNAP_TO_NODE_LEFT:
        this.snapToNodeInDirection('left');
        break;
      case DACommandType.SNAP_TO_NODE_RIGHT:
        this.snapToNodeInDirection('right');
        break;
      case DACommandType.SNAP_TO_NODE_UP:
        this.snapToNodeInDirection('up');
        break;
      case DACommandType.SNAP_TO_NODE_DOWN:
        this.snapToNodeInDirection('down');
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
        this.createNewNode(command.nodeShape);
        break;
      case DACommandType.CREATE_NEW_NODE_DIRECTED:
        this.createNewNodeDirected(command.direction, command.nodeShape);
        break;
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
      case DACommandType.BEGIN_DIRECTED_EDGE:
        this.beginDirectedEdge();
        break;
      case DACommandType.SET_EDGE_DESTINATION:
        this.setEdgeDestination(command.direction);
        break;
      case DACommandType.FINALIZE_DIRECTED_EDGE:
        this.finalizeDirectedEdge();
        break;
      case DACommandType.RECENTER_VIEW:
        this.recenterView();
        this.recenterCrosshairs();
        this.checkAndEmitEditState();
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
        this.dragSelectedLeft(command.gridTier);
        break;
      case DACommandType.DRAG_SELECTED_RIGHT:
        this.dragSelectedRight(command.gridTier);
        break;
      case DACommandType.DRAG_SELECTED_UP:
        this.dragSelectedUp(command.gridTier);
        break;
      case DACommandType.DRAG_SELECTED_DOWN:
        this.dragSelectedDown(command.gridTier);
        break;
      case DACommandType.ENTER_DRAG_MODE:
        this.enterDragMode();
        break;
      case DACommandType.EXIT_DRAG_MODE:
        this.exitDragMode();
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
      case DACommandType.UNDO:
        this.handleUndo();
        break;
      case DACommandType.REDO:
        this.handleRedo();
        break;
      case DACommandType.SET_TEXT_OVERFLOW_MODE:
        this.setTextOverflowMode(command.mode);
        break;
      case DACommandType.SET_NODE_SHAPE:
        this.setNodeShape(command.shape);
        break;
      case DACommandType.PAN_LEFT:
        this.panViewport(command.distance ?? this.CROSSHAIRS_MOVEMENT_DISTANCE, 0);
        break;
      case DACommandType.PAN_RIGHT:
        this.panViewport(-(command.distance ?? this.CROSSHAIRS_MOVEMENT_DISTANCE), 0);
        break;
      case DACommandType.PAN_UP:
        this.panViewport(0, command.distance ?? this.CROSSHAIRS_MOVEMENT_DISTANCE);
        break;
      case DACommandType.PAN_DOWN:
        this.panViewport(0, -(command.distance ?? this.CROSSHAIRS_MOVEMENT_DISTANCE));
        break;
      case DACommandType.SELECT_NEXT_EDGE:
        this.selectNextEdge(command.direction);
        break;
      case DACommandType.FOLLOW_SELECTED_EDGE:
        this.followSelectedEdge();
        break;
      case DACommandType.NAVIGATE_BACK:
        this.navigateBack();
        break;
      case DACommandType.GATHER_CONNECTED_NODES:
        this.gatherConnectedNodes();
        break;
      case DACommandType.LOAD_SAMPLE_GRAPH:
        this.loadSampleGraph(command.graphId);
        break;
      case DACommandType.SAVE_GRAPH:
        this.saveGraphToStorage();
        break;
      case DACommandType.LOAD_GRAPH:
        this.loadGraphFromStorage();
        break;
      case DACommandType.NEW_GRAPH:
        this.newGraph();
        break;
      case DACommandType.TOGGLE_PIN_SELECTED:
        this.togglePinSelected();
        break;
      case DACommandType.APPLY_LAYOUT:
        this.applyGraphLayout(command.layout);
        break;
      case DACommandType.APPLY_CHARGED_SPRING_EDGES:
        this.applyChargedSpringEdges();
        break;
      case DACommandType.APPLY_BEZIER_ROUTE_EDGES:
        this.applyBezierRouteEdges();
        break;
      case DACommandType.APPLY_BEZIER_FIT_CHARGED_SPRING_EDGES:
        this.applyBezierFitChargedSpringEdges();
        break;
      case DACommandType.APPLY_FLEXIBLE_WIRE_EDGES:
        this.applyFlexibleWireEdges();
        break;
      case DACommandType.APPLY_WEIGHTED_CHAIN_EDGES:
        this.applyWeightedChainEdges();
        break;
      case DACommandType.SET_EDGE_DIRECTEDNESS:
        this.log.log('[style] setEdgeDirectedness:', command.directedness);
        this.setEdgeDirectedness(command.directedness);
        break;
      case DACommandType.SET_LINE_STYLE:
        this.log.log('[style] setLineStyle:', command.lineStyle);
        this.setLineStyle(command.lineStyle);
        break;
      case DACommandType.SET_ITEM_COLOR:
        this.log.log('[style] setItemColor:', command.color);
        this.setItemColor(command.color);
        break;
      case DACommandType.SET_DEFAULT_EDGE_DIRECTEDNESS:
        this.log.log('[style] setDefaultEdgeDirectedness:', command.directedness);
        this._defaultEdgeDirectedness = command.directedness;
        break;
      case DACommandType.SET_DEFAULT_LINE_STYLE:
        this.log.log('[style] setDefaultLineStyle:', command.lineStyle);
        this._defaultLineStyle = command.lineStyle;
        break;
      default:
        this.assertNever(command);
    }

    if (DrawingAreaComponent.CONTEXT_AFFECTING_COMMANDS.has(command.kind)) {
      this.emitContextState();
    }
  }

  assertNever(x: never): never {
    throw new Error(`Unexpected object: ${x}`);
  }

  private multiItemSelect() {
    this.tweens.forEach(t => t.finish());
    this.tweens = [];
    this.wasAlreadySelectedBeforeDrag = this.isTopItemSelected();
    this.ensureTopItemSelected();
  }

  private isTopItemSelected(): boolean {
    const daNodesContainingCrosshairs = this.getDANodesContainingCrosshairs();
    if (daNodesContainingCrosshairs.length > 0) {
      const topNode = daNodesContainingCrosshairs.reduce((n0, n1) => n0.zIndex() > n1.zIndex() ? n0 : n1);
      return topNode.isSelected;
    }

    const daEdgesContainingCrosshairs = this.getDAEdgesContainingCrosshairs();
    if (daEdgesContainingCrosshairs.length > 0) {
      const topEdge = daEdgesContainingCrosshairs.reduce((e0, e1) => e0.zIndex() > e1.zIndex() ? e0 : e1);
      return topEdge.isSelected;
    }

    return false;
  }

  private ensureTopItemSelected() {
    const daNodesContainingCrosshairs: DANode[] = this.getDANodesContainingCrosshairs();

    if (daNodesContainingCrosshairs.length > 0) {
      const topNode = daNodesContainingCrosshairs.reduce((n0, n1) => n0.zIndex() > n1.zIndex() ? n0 : n1);
      topNode.isSelected = true;
      return;
    }

    const daEdgesContainingCrosshairs: DAEdge[] = this.getDAEdgesContainingCrosshairs();
    if (daEdgesContainingCrosshairs.length > 0) {
      const topEdge = daEdgesContainingCrosshairs.reduce((e0, e1) => e0.zIndex() > e1.zIndex() ? e0 : e1);
      topEdge.isSelected = true;
      return;
    }
  }

  private singleItemSelect() {
    this.tweens.forEach(t => t.finish());
    this.tweens = [];
    this.drawingLayer.unselectAll();
    this.unselectAllLabels();

    const labelUnderCrosshairs = this.getLabelUnderCrosshairs();
    if (labelUnderCrosshairs) {
      labelUnderCrosshairs.isSelected = true;
      this.drawingLayer.batchDraw();
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
      this.drawingLayer.batchDraw();
      return;
    }
  }

  private loadSampleGraph(graphId: string) {
    this.finishTweens();
    this.unselectAllLabels();
    this.undoRedoService.clear();
    this.demoDataService.loadGraph(graphId, this.drawingLayer);
    const palette = this.visualConfigService.getEffectivePalette(this.themeService.theme);
    this.drawingLayer.applyThemeColors(palette);
    this.recenterCrosshairs();
    this.emitZoomLevel();
    this.checkAndEmitEditState();
  }

  private readonly STORAGE_KEY = 'kidraw_graph_v1';

  private saveGraphToStorage(): void {
    this.finishTweens();
    const snapshot = this.drawingLayer.serializeGraph();
    localStorage.setItem(this.STORAGE_KEY, JSON.stringify(snapshot));
  }

  private loadGraphFromStorage(): void {
    const raw = localStorage.getItem(this.STORAGE_KEY);
    if (!raw) return;
    try {
      const snapshot = JSON.parse(raw);
      this.finishTweens();
      this.unselectAllLabels();
      this.undoRedoService.clear();
      this.drawingLayer.restoreGraph(snapshot);
      const palette = this.visualConfigService.getEffectivePalette(this.themeService.theme);
      this.drawingLayer.applyThemeColors(palette);
      this.recenterCrosshairs();
      this.emitZoomLevel();
      this.checkAndEmitEditState();
    } catch {
      // Corrupted or incompatible stored data — ignore silently
    }
  }

  private newGraph(): void {
    const hasContent = this.drawingLayer.getDANodes().length > 0 || this.drawingLayer.getDAEdges().length > 0;
    if (hasContent && !window.confirm('Start a new graph? This will clear the current diagram.')) return;
    this.finishTweens();
    this.unselectAllLabels();
    this.undoRedoService.clear();
    this.drawingLayer.restoreGraph({ nodes: [], edges: [] });
    this.recenterCrosshairs();
    this.emitZoomLevel();
    this.checkAndEmitEditState();
  }

  private togglePinSelected() {
    const selected = this.drawingLayer.getSelectedDANodes();
    const hovered = selected.length > 0 ? selected : this.getDANodesContainingCrosshairs();
    const targets = hovered.length > 0 ? [hovered.reduce((a, b) => a.zIndex() > b.zIndex() ? a : b)] : [];
    targets.forEach(n => { n.pinned = !n.pinned; });
    this.drawingLayer.batchDraw();
  }

  private applyGraphLayout(layout: LayoutType) {
    this.finishTweens();
    this.undoRedoService.pushSnapshot(this.drawingLayer.serializeGraph());
    const allNodes = this.drawingLayer.getDANodes();
    const allEdges = this.drawingLayer.getDAEdges();

    const selectedNodes = allNodes.filter(n => n.isSelected);
    const nodes = selectedNodes.length > 0 ? selectedNodes : allNodes;
    const nodeSet = new Set(nodes);
    const edges = allEdges.filter(e => nodeSet.has(e.srcNode) && nodeSet.has(e.destNode));

    applyLayout(layout, nodes, edges);
    this.updateEdgesForResizedNodes(allNodes);
    this.drawingLayer.batchDraw();
  }

  /** @param skipUndo true when invoked by the auto-reroute subscription
   *  in response to a slider change — pushing an undo snapshot per slider
   *  tick would spam the undo stack. */
  private applyChargedSpringEdges(skipUndo: boolean = false) {
    this.finishTweens();
    if (!skipUndo) {
      this.undoRedoService.pushSnapshot(this.drawingLayer.serializeGraph());
    }
    const allNodes = this.drawingLayer.getDANodes();
    const allEdges = this.drawingLayer.getDAEdges();

    const selectedEdges = allEdges.filter(e => e.isSelected);
    const edges = selectedEdges.length > 0 ? selectedEdges : allEdges;

    // Force polyline rendering on every edge we're about to route. Without
    // this, an edge that was previously Bezier-routed would still render
    // smooth even though its control points are now physics-sim positions.
    edges.forEach(e => e.setSmoothRendering(false));
    applyChargedSpringEdges(allNodes, edges, this.tuning.chargedSpring, msg => this.log.log(msg));
    this.drawingLayer.batchDraw();
    this.lastAppliedRouting = 'charged-spring';
    this.metrics.compute(allNodes, allEdges);
  }

  private applyBezierRouteEdges(skipUndo: boolean = false) {
    this.finishTweens();
    if (!skipUndo) {
      this.undoRedoService.pushSnapshot(this.drawingLayer.serializeGraph());
    }
    const allNodes = this.drawingLayer.getDANodes();
    const allEdges = this.drawingLayer.getDAEdges();

    const selectedEdges = allEdges.filter(e => e.isSelected);
    const edges = selectedEdges.length > 0 ? selectedEdges : allEdges;

    applyBezierRouteEdges(allNodes, edges, this.tuning.bezierRoute, msg => this.log.log(msg));
    this.drawingLayer.batchDraw();
    this.lastAppliedRouting = 'bezier-route';
    this.metrics.compute(allNodes, allEdges);
  }

  private applyBezierFitChargedSpringEdges(skipUndo: boolean = false) {
    this.finishTweens();
    if (!skipUndo) {
      this.undoRedoService.pushSnapshot(this.drawingLayer.serializeGraph());
    }
    const allNodes = this.drawingLayer.getDANodes();
    const allEdges = this.drawingLayer.getDAEdges();

    const selectedEdges = allEdges.filter(e => e.isSelected);
    const edges = selectedEdges.length > 0 ? selectedEdges : allEdges;

    applyBezierFitChargedSpringEdges(
      allNodes, edges,
      this.tuning.bezierFit, this.tuning.chargedSpring,
      msg => this.log.log(msg),
    );
    this.drawingLayer.batchDraw();
    this.lastAppliedRouting = 'bezier-fit';
    this.metrics.compute(allNodes, allEdges);
  }

  private applyFlexibleWireEdges(skipUndo: boolean = false) {
    this.finishTweens();
    if (!skipUndo) {
      this.undoRedoService.pushSnapshot(this.drawingLayer.serializeGraph());
    }
    const allNodes = this.drawingLayer.getDANodes();
    const allEdges = this.drawingLayer.getDAEdges();

    const selectedEdges = allEdges.filter(e => e.isSelected);
    const edges = selectedEdges.length > 0 ? selectedEdges : allEdges;

    edges.forEach(e => e.setSmoothRendering(false));
    applyFlexibleWireEdges(allNodes, edges, this.tuning.flexibleWire, msg => this.log.log(msg));
    this.drawingLayer.batchDraw();
    this.lastAppliedRouting = 'flexible-wire';
    this.metrics.compute(allNodes, allEdges);
  }

  private applyWeightedChainEdges(skipUndo: boolean = false) {
    this.finishTweens();
    if (!skipUndo) {
      this.undoRedoService.pushSnapshot(this.drawingLayer.serializeGraph());
    }
    const allNodes = this.drawingLayer.getDANodes();
    const allEdges = this.drawingLayer.getDAEdges();

    const selectedEdges = allEdges.filter(e => e.isSelected);
    const edges = selectedEdges.length > 0 ? selectedEdges : allEdges;

    edges.forEach(e => e.setSmoothRendering(false));
    applyWeightedChainEdges(allNodes, edges, this.tuning.weightedChain, msg => this.log.log(msg));
    this.drawingLayer.batchDraw();
    this.lastAppliedRouting = 'weighted-chain';
    this.metrics.compute(allNodes, allEdges);
  }

  private exitLabelEditMode() {
    this.finishTweens();
    this.log.log("case exit-label-edit-mode")
    this.crosshairsLayer.showCrosshairs();
    this.drawingLayer.getSelectedDANodes().forEach(n => n.hideCursor());
    this.drawingLayer.unselectAll();
    this.unselectAllLabels();
  }

  private unselectAll() {
    this.finishTweens();
    this.drawingLayer.unselectAll();
    this.unselectAllLabels();
  }

  private insertChar(key: string) {
    this.finishTweens()
    this.crosshairsLayer.hideCrosshairs();
    const resized = this.drawingLayer.appendTextToSelected(key);
    this.updateEdgesForResizedNodes(resized);
    this.drawingLayer.getSelectedDANodes().forEach(n => n.updateCursorPosition());
    // Also insert into selected labels
    this.getSelectedLabels().forEach(l => l.appendText(key));
    this.drawingLayer.batchDraw();
  }

  private deleteLastChar() {
    this.finishTweens();
    const resized = this.drawingLayer.deleteLastCharFromSelected();
    this.updateEdgesForResizedNodes(resized);
    this.drawingLayer.getSelectedDANodes().forEach(n => n.updateCursorPosition());
    // Also delete from selected labels
    this.getSelectedLabels().forEach(l => l.deleteLastChar());
    this.drawingLayer.batchDraw();
  }

  private setTextOverflowMode(mode: TextOverflowMode) {
    const selected = this.drawingLayer.getSelectedDANodes().filter(n => n.nodeShape !== 'junction');
    const targets = selected.length > 0 ? selected : (() => {
      const hovered = this.getDANodesContainingCrosshairs().filter(n => n.nodeShape !== 'junction');
      return hovered.length > 0 ? [hovered.reduce((a, b) => a.zIndex() > b.zIndex() ? a : b)] : [];
    })();

    const resized: DANode[] = [];
    targets.forEach(node => {
      node.textOverflowMode = mode;
      resized.push(node);
    });
    this.updateEdgesForResizedNodes(resized);
    this.drawingLayer.batchDraw();
  }

  private setNodeShape(shape: NodeShape) {
    const selected = this.drawingLayer.getSelectedDANodes();
    const targets = selected.length > 0 ? selected : (() => {
      const hovered = this.getDANodesContainingCrosshairs();
      return hovered.length > 0 ? [hovered.reduce((a, b) => a.zIndex() > b.zIndex() ? a : b)] : [];
    })();

    if (targets.length > 0) {
      targets.forEach(node => this.drawingLayer.changeNodeShape(node, shape));
      targets.forEach(node => node.connectedEdges.forEach(e => this.updateEdgePoints(e)));
      this.drawingLayer.batchDraw();
    } else {
      this._defaultNodeShape = shape;
    }
  }

  private updateEdgesForResizedNodes(nodes: DANode[]) {
    for (const node of nodes) {
      for (const edge of node.connectedEdges) {
        this.updateEdgePoints(edge);
      }
    }
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
      if (srcNode === destNode) return; // no self-edges
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
    this.log.log("scale", scale);
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

  private moveCrosshairsUp(tier?: GridTier) {
    this.moveCrosshairsBy(0, -1, tier ?? 'normal');
  }

  private moveCrosshairsRight(tier?: GridTier) {
    this.moveCrosshairsBy(1, 0, tier ?? 'normal');
  }

  private moveCrosshairsDown(tier?: GridTier) {
    this.moveCrosshairsBy(0, 1, tier ?? 'normal');
  }

  private moveCrosshairsLeft(tier?: GridTier) {
    this.moveCrosshairsBy(-1, 0, tier ?? 'normal');
  }

  private moveCrosshairsBy(deltaX: number, deltaY: number, tier?: GridTier) {
    this.finishTweens();

    const edgeMargin = 60;
    const currentX = this.crosshairsLayer.crosshairs.x;
    const currentY = this.crosshairsLayer.crosshairs.y;

    let targetX: number;
    let targetY: number;

    if (tier) {
      // Grid-snapped movement: deltaX/Y are direction signs (-1, 0, +1)
      this.drawingLayer.rebuildGrid(this.stage.width(), this.stage.height());
      this.gridInitialized = true;

      const scale = this.drawingLayer.scaleX();
      const majorSpacing = this.drawingLayer.getGridSpacing();
      const minorSpacing = this.drawingLayer.getSubGridSpacing();
      const currentDlX = (currentX - this.drawingLayer.x()) / scale;
      const currentDlY = (currentY - this.drawingLayer.y()) / scale;

      const spacing = tier === 'fine' ? minorSpacing : majorSpacing;
      const steps = tier === 'coarse' ? 10 : 1;

      const snappedDlX = deltaX !== 0
        ? Math.round(currentDlX / spacing) * spacing + steps * spacing * Math.sign(deltaX)
        : Math.round(currentDlX / spacing) * spacing;
      const snappedDlY = deltaY !== 0
        ? Math.round(currentDlY / spacing) * spacing + steps * spacing * Math.sign(deltaY)
        : Math.round(currentDlY / spacing) * spacing;

      targetX = snappedDlX * scale + this.drawingLayer.x();
      targetY = snappedDlY * scale + this.drawingLayer.y();
    } else {
      // Raw pixel movement (focusNode, moveByNode, zoom, etc.)
      targetX = currentX + deltaX;
      targetY = currentY + deltaY;
    }

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
        onFinish: () => this.checkResizeHandleProximity(),
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

    // Show grid and indicators on movement, then fade after 5s
    this.showMovementIndicators();
  }

  private showMovementIndicators(): void {
    this.drawingLayer.rebuildGrid(this.stage.width(), this.stage.height());
    this.gridInitialized = true;

    // Show grid + pin indicators + invisible nodes
    if (!this.drawingLayer.gridVisible) {
      this.drawingLayer.showGrid();
    }
    this.setGridIndicatorsVisible(true);
    this.drawingLayer.batchDraw();

    // Reset fade timer
    if (this.gridFadeTimeout !== null) {
      clearTimeout(this.gridFadeTimeout);
    }
    this.gridFadeTimeout = window.setTimeout(() => {
      this.drawingLayer.hideGrid();
      this.setGridIndicatorsVisible(false);
      this.drawingLayer.batchDraw();
      this.gridFadeTimeout = null;
    }, 5000);
  }

  /** Toggle invisible-style nodes and pin indicators alongside grid display. */
  private setGridIndicatorsVisible(show: boolean): void {
    this.drawingLayer.getDANodes().forEach(node => {
      node.setInvisibleVisibleForGrid(show);
      node.setPinIndicatorVisible(show);
    });
  }

  /**
   * Check if crosshairs are near the bottom-right corner of any node.
   * If so, show the resize handle on that node.
   * Called after crosshairs movement completes (on tween finish).
   */
  private checkResizeHandleProximity(): void {
    const PROXIMITY_THRESHOLD = 25; // in drawing-layer units

    // Convert crosshairs position to drawing-layer coordinates
    const scale = this.drawingLayer.scaleX();
    const crosshairsX = (this.crosshairsLayer.crosshairs.x - this.drawingLayer.x()) / scale;
    const crosshairsY = (this.crosshairsLayer.crosshairs.y - this.drawingLayer.y()) / scale;

    let closestNode: DANode | null = null;
    let closestDist = Infinity;

    for (const node of this.drawingLayer.getDANodes()) {
      if (node.nodeShape === 'junction') continue;
      const br = node.getBottomRightAbsolute();
      const dx = crosshairsX - br.x;
      const dy = crosshairsY - br.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < PROXIMITY_THRESHOLD && dist < closestDist) {
        closestDist = dist;
        closestNode = node;
      }
    }

    // Update state
    if (closestNode !== this.resizeTargetNode) {
      if (this.resizeTargetNode) {
        this.resizeTargetNode.hideResizeHandle();
      }
      this.resizeTargetNode = closestNode;
      if (this.resizeTargetNode) {
        this.resizeTargetNode.showResizeHandle();
      }
      this.drawingLayer.batchDraw();
    }
  }

  private panViewport(deltaX: number, deltaY: number) {
    this.finishTweens();
    this.tweens.push(new Konva.Tween({
      node: this.drawingLayer,
      duration: this.CROSSHAIR_MOVEMENT_DURATION,
      x: this.drawingLayer.x() + deltaX,
      y: this.drawingLayer.y() + deltaY,
      easing: Konva.Easings.Linear,
    }).play());
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

  private emitContextState(): void {
    const selectedNodes = this.drawingLayer.getSelectedDANodes();
    const selectedEdges = this.drawingLayer.getSelectedDAEdges();
    const selectedLabels = this.getSelectedLabels();
    const parts: string[] = [];
    if (selectedNodes.length > 0) parts.push(`${selectedNodes.length} node${selectedNodes.length !== 1 ? 's' : ''}`);
    if (selectedEdges.length > 0) parts.push(`${selectedEdges.length} edge${selectedEdges.length !== 1 ? 's' : ''}`);
    if (selectedLabels.length > 0) parts.push(`${selectedLabels.length} label${selectedLabels.length !== 1 ? 's' : ''}`);
    this.daOut.emit({
      kind: 'context-state-update',
      selectionSummary: parts.join(', '),
      defaultNodeShape: this._defaultNodeShape,
      defaultEdgeDirectedness: this._defaultEdgeDirectedness,
      defaultLineStyle: this._defaultLineStyle,
    });
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
    this.traverseFromAnchorNode('outgoing', 1);
  }

  private traverseOutgoingPrev() {
    this.traverseFromAnchorNode('outgoing', -1);
  }

  private traverseIncomingNext() {
    this.traverseFromAnchorNode('incoming', 1);
  }

  private traverseIncomingPrev() {
    this.traverseFromAnchorNode('incoming', -1);
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

  private findNodeInDirection(direction: 'left' | 'right' | 'up' | 'down'): DANode | null {
    const nodes = this.drawingLayer.getDANodes();
    if (nodes.length === 0) return null;

    const crosshairsPosition = {
      x: this.crosshairsLayer.crosshairsX(),
      y: this.crosshairsLayer.crosshairsY(),
    };

    let bestNode: DANode | null = null;
    let bestScore = Number.POSITIVE_INFINITY;

    nodes.forEach((node) => {
      const center = this.getNodeCenterInStageCoordinates(node);
      const dx = center.x - crosshairsPosition.x;
      const dy = center.y - crosshairsPosition.y;

      const MIN_OFFSET = 5;
      let inDirection = false;
      switch (direction) {
        case 'left':  inDirection = dx < -MIN_OFFSET; break;
        case 'right': inDirection = dx > MIN_OFFSET; break;
        case 'up':    inDirection = dy < -MIN_OFFSET; break;
        case 'down':  inDirection = dy > MIN_OFFSET; break;
      }
      if (!inDirection) return;

      const isHorizontal = direction === 'left' || direction === 'right';
      const primaryDist = isHorizontal ? Math.abs(dx) : Math.abs(dy);
      const offAxisDist = isHorizontal ? Math.abs(dy) : Math.abs(dx);
      const score = primaryDist + offAxisDist * 2;

      if (score < bestScore) {
        bestScore = score;
        bestNode = node;
      }
    });

    return bestNode;
  }

  private snapToNodeInDirection(direction: 'left' | 'right' | 'up' | 'down') {
    const bestNode = this.findNodeInDirection(direction);
    if (bestNode) {
      const nodeCenterInStage = this.getNodeCenterInStageCoordinates(bestNode);
      const deltaX = nodeCenterInStage.x - this.crosshairsLayer.crosshairs.x;
      const deltaY = nodeCenterInStage.y - this.crosshairsLayer.crosshairs.y;
      this.moveCrosshairsBy(deltaX, deltaY);
    }
  }

  private beginDirectedEdge() {
    this.finishTweens();

    // Source: node under crosshairs, or first selected node
    const nodesUnderCrosshairs = this.getDANodesContainingCrosshairs();
    const selectedNodes = this.drawingLayer.getSelectedDANodes();
    const srcNode = nodesUnderCrosshairs.length > 0
      ? nodesUnderCrosshairs[0]
      : (selectedNodes.length > 0 ? selectedNodes[0] : null);
    if (!srcNode) return;

    this.directedEdgeSource = srcNode;
    // Create self-edge initially
    this.drawingLayer.addEdge(srcNode, srcNode);
    const edges = this.drawingLayer.getDAEdges();
    this.directedEdgeInProgress = edges[edges.length - 1];
    this.drawingLayer.batchDraw();
  }

  private setEdgeDestination(direction: 'left' | 'right' | 'up' | 'down') {
    if (!this.directedEdgeSource || !this.directedEdgeInProgress) return;

    const targetNode = this.findNodeInDirection(direction);
    if (!targetNode) return;

    // Remove the current in-progress edge and create a new one to the target
    this.drawingLayer.removeEdge(this.directedEdgeInProgress);
    this.drawingLayer.addEdge(this.directedEdgeSource, targetNode);
    const edges = this.drawingLayer.getDAEdges();
    this.directedEdgeInProgress = edges[edges.length - 1];

    // Move crosshairs to target so subsequent direction presses work relative to new position
    const targetCenter = this.getNodeCenterInStageCoordinates(targetNode);
    const deltaX = targetCenter.x - this.crosshairsLayer.crosshairs.x;
    const deltaY = targetCenter.y - this.crosshairsLayer.crosshairs.y;
    this.moveCrosshairsBy(deltaX, deltaY);

    this.drawingLayer.batchDraw();
  }

  private finalizeDirectedEdge() {
    this.directedEdgeSource = null;
    this.directedEdgeInProgress = null;
  }

  private traverseFromAnchorNode(direction: 'outgoing' | 'incoming', step: number = 1) {
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
    const edge = candidateEdges[((currentIndex % candidateEdges.length) + candidateEdges.length) % candidateEdges.length];
    indexMap.set(anchorNode, ((currentIndex + step) % candidateEdges.length + candidateEdges.length) % candidateEdges.length);

    const targetNode = direction === 'outgoing' ? edge.destNode : edge.srcNode;
    this.focusNode(targetNode);
  }

  private selectNextEdge(direction: 'outgoing' | 'incoming') {
    this.finishTweens();

    const anchorNode = this.getTraversalAnchorNode();
    this.log.log('[selectNextEdge]', direction, 'anchorNode:', anchorNode?.id ?? 'null');
    if (!anchorNode) return;

    const candidateEdges = direction === 'outgoing' ? anchorNode.outgoingEdges : anchorNode.incomingEdges;
    this.log.log('[selectNextEdge]', direction, 'candidates:', candidateEdges.length,
      candidateEdges.map(e => `${e.id}(${e.srcNode.id}->${e.destNode.id})`));
    if (candidateEdges.length === 0) return;

    // Find currently selected edge to cycle from
    const currentlySelected = candidateEdges.findIndex(e => e.isSelected);
    let nextIndex: number;
    if (currentlySelected >= 0) {
      nextIndex = (currentlySelected + 1) % candidateEdges.length;
    } else {
      nextIndex = 0;
    }

    // Deselect all edges, select the next one
    this.drawingLayer.getSelectedDAEdges().forEach(e => e.isSelected = false);
    candidateEdges[nextIndex].isSelected = true;
    this.drawingLayer.batchDraw();
  }

  private followSelectedEdge() {
    this.finishTweens();

    const selectedEdges = this.drawingLayer.getSelectedDAEdges();
    this.log.log('[followSelectedEdge] selectedEdges:', selectedEdges.length);
    if (selectedEdges.length === 0) return;

    const edge = selectedEdges[0];
    // Determine which end to go to: if we're at the source, go to dest; otherwise go to source
    const anchorNode = this.getTraversalAnchorNode();
    const wentForward = (anchorNode === edge.srcNode);
    const targetNode = wentForward ? edge.destNode : edge.srcNode;
    this.log.log('[followSelectedEdge] edge:', edge.id, 'anchor:', anchorNode?.id, 'target:', targetNode.id, 'forward:', wentForward);

    // Push current node to navigation history before moving
    if (anchorNode) {
      this.navigationHistory.push(anchorNode);
    }

    // Deselect the edge, focus the target node
    edge.isSelected = false;
    this.focusNode(targetNode);

    // Auto-select an edge on the target: outgoing if we went forward, incoming if backward
    this.autoSelectEdge(targetNode, wentForward ? 'outgoing' : 'incoming');
  }

  private navigateBack() {
    this.finishTweens();

    if (this.navigationHistory.length === 0) return;

    const previousNode = this.navigationHistory.pop()!;
    this.focusNode(previousNode);

    // Auto-select an outgoing edge on the node we returned to
    this.autoSelectEdge(previousNode, 'outgoing');
  }

  private gatherConnectedNodes(): void {
    this.finishTweens();

    // If already gathered, restore first
    if (this.gatheredNodePositions.size > 0) {
      this.restoreGatheredNodes();
      return;
    }

    const anchorNode = this.getTraversalAnchorNode();
    if (!anchorNode) return;

    // Collect unique connected nodes
    const connected = new Set<DANode>();
    for (const edge of anchorNode.outgoingEdges) {
      if (edge.destNode !== anchorNode) connected.add(edge.destNode);
    }
    for (const edge of anchorNode.incomingEdges) {
      if (edge.srcNode !== anchorNode) connected.add(edge.srcNode);
    }
    if (connected.size === 0) return;

    // Save original positions and animate nodes close
    const anchorX = anchorNode.group.x();
    const anchorY = anchorNode.group.y();
    const GATHER_RADIUS = 150;

    let i = 0;
    const total = connected.size;
    for (const node of connected) {
      this.gatheredNodePositions.set(node, {x: node.group.x(), y: node.group.y()});

      // Arrange in a circle around the anchor
      const angle = (2 * Math.PI * i) / total;
      const targetX = anchorX + Math.cos(angle) * GATHER_RADIUS;
      const targetY = anchorY + Math.sin(angle) * GATHER_RADIUS;

      this.tweens.push(new Konva.Tween({
        node: node.group,
        x: targetX,
        y: targetY,
        duration: 0.3,
        easing: Konva.Easings.EaseInOut,
        onFinish: () => {
          this.updateEdgesForResizedNodes([node]);
          this.drawingLayer.batchDraw();
        },
      }).play());
      i++;
    }

    // Auto-restore after 5 seconds
    this.gatherRestoreTimeout = window.setTimeout(() => {
      this.restoreGatheredNodes();
    }, 5000);
  }

  private restoreGatheredNodes(): void {
    if (this.gatherRestoreTimeout !== null) {
      clearTimeout(this.gatherRestoreTimeout);
      this.gatherRestoreTimeout = null;
    }

    for (const [node, pos] of this.gatheredNodePositions) {
      this.tweens.push(new Konva.Tween({
        node: node.group,
        x: pos.x,
        y: pos.y,
        duration: 0.3,
        easing: Konva.Easings.EaseInOut,
        onFinish: () => {
          this.updateEdgesForResizedNodes([node]);
          this.drawingLayer.batchDraw();
        },
      }).play());
    }
    this.gatheredNodePositions.clear();
  }

  /** Auto-select the first edge of the given direction on a node, if any. */
  private autoSelectEdge(node: DANode, direction: 'outgoing' | 'incoming') {
    const edges = direction === 'outgoing' ? node.outgoingEdges : node.incomingEdges;
    if (edges.length > 0) {
      edges[0].isSelected = true;
      this.drawingLayer.batchDraw();
    }
  }

  private getTraversalAnchorNode(): DANode | null {
    const selectedNodes = this.drawingLayer.getSelectedDANodes();
    if (selectedNodes.length > 0) {
      this.log.log('[getTraversalAnchorNode] selected:', selectedNodes[0].id);
      return selectedNodes[0];
    }

    const nodesUnderCrosshairs = this.getDANodesContainingCrosshairs();
    if (nodesUnderCrosshairs.length > 0) {
      this.log.log('[getTraversalAnchorNode] under crosshairs:', nodesUnderCrosshairs[0].id);
      return nodesUnderCrosshairs[0];
    }

    this.log.log('[getTraversalAnchorNode] no anchor node found');
    return null;
  }

  private focusNode(node: DANode) {
    this.drawingLayer.unselectAll();
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

  private createNewNode(nodeShape?: NodeShape) {
    this.finishTweens();

    // Get currently selected nodes (sources for auto-connect edges)
    const selectedNodes = this.drawingLayer.getSelectedDANodes();

    // Unselect all before creating (new node will auto-select)
    this.drawingLayer.unselectAll();
    this.unselectAllLabels();

    const newNode = this.drawingLayer.createNewNode(this.crosshairsLayer.crosshairsX(), this.crosshairsLayer.crosshairsY(), nodeShape ?? this._defaultNodeShape);

    // Create edges from each previously selected node to the new node
    for (const srcNode of selectedNodes) {
      this.drawingLayer.addEdge(srcNode, newNode);
    }

    newNode.showCursor();
    this.crosshairsLayer.hideCrosshairs();
    this.drawingLayer.batchDraw();
    this.checkAndEmitEditState();
  }

  private createNewNodeDirected(direction: 'up' | 'down' | 'left' | 'right', nodeShape?: NodeShape) {
    this.finishTweens();

    // Source nodes for auto-connect: selected nodes, OR node under crosshairs as fallback
    let sourceNodes = this.drawingLayer.getSelectedDANodes();
    if (sourceNodes.length === 0) {
      const hoveredNodes = this.getDANodesContainingCrosshairs();
      if (hoveredNodes.length > 0) {
        sourceNodes = [hoveredNodes[0]];
      }
    }
    this.log.log('[directedInsert]', direction, 'sourceNodes:', sourceNodes.length);

    // Anchor in stage coords: source node center if exactly one, else current crosshairs
    let anchorX: number;
    let anchorY: number;
    if (sourceNodes.length === 1) {
      const center = this.getNodeCenterInStageCoordinates(sourceNodes[0]);
      anchorX = center.x;
      anchorY = center.y;
    } else {
      anchorX = this.crosshairsLayer.crosshairs.x;
      anchorY = this.crosshairsLayer.crosshairs.y;
    }

    // Offset of 300 drawing-layer units, scaled to stage coords
    const DIRECTED_OFFSET = 300 * this.drawingLayer.scaleX();
    const deltaX = direction === 'left' ? -DIRECTED_OFFSET : direction === 'right' ? DIRECTED_OFFSET : 0;
    const deltaY = direction === 'up' ? -DIRECTED_OFFSET : direction === 'down' ? DIRECTED_OFFSET : 0;

    // Move crosshairs to target (handles clamping + auto-pan), then immediately finish
    this.moveCrosshairsBy(anchorX - this.crosshairsLayer.crosshairs.x + deltaX,
                          anchorY - this.crosshairsLayer.crosshairs.y + deltaY);
    this.finishTweens();

    this.drawingLayer.unselectAll();
    this.unselectAllLabels();

    const newNode = this.drawingLayer.createNewNode(this.crosshairsLayer.crosshairsX(), this.crosshairsLayer.crosshairsY(), nodeShape ?? this._defaultNodeShape);

    for (const srcNode of sourceNodes) {
      this.drawingLayer.addEdge(srcNode, newNode);
    }

    newNode.showCursor();
    this.crosshairsLayer.hideCrosshairs();
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
    this.log.log(`crosshairs bbox (local): min(${minX.toFixed(1)},${minY.toFixed(1)}) max(${maxX.toFixed(1)},${maxY.toFixed(1)}) scale=${scale} layerPos=(${layerX},${layerY})`);
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
    return edges.filter(edge => this.edgeIntersectsBox(edge, box));
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

  private dragSelectedLeft(tier?: GridTier)  {
    if (this.resizeTargetNode) { this.resizeSelected(-1); return; }
    this.dragSelected('x', -1, tier);
  }
  private dragSelectedRight(tier?: GridTier) {
    if (this.resizeTargetNode) { this.resizeSelected(1); return; }
    this.dragSelected('x', +1, tier);
  }
  private dragSelectedUp(tier?: GridTier)    {
    if (this.resizeTargetNode) { this.resizeSelected(-1); return; }
    this.dragSelected('y', -1, tier);
  }
  private dragSelectedDown(tier?: GridTier)  {
    if (this.resizeTargetNode) { this.resizeSelected(1); return; }
    this.dragSelected('y', +1, tier);
  }

  private resizeSelected(sign: 1 | -1) {
    const node = this.resizeTargetNode;
    if (!node) return;
    this.hasDragged = true;
    const delta = sign * this.NODE_SIZE_STEP;
    node.resizeBy(delta);
    this.updateEdgesForResizedNodes([node]);
    this.drawingLayer.batchDraw();
  }

  private dragSelected(axis: 'x' | 'y', sign: 1 | -1, tier?: GridTier) {
    this.cancelDragAnimation();
    this.finishTweens();
    this.hasDragged = true;

    // If only labels are selected, slide them along their edges
    const selectedLabels = this.getSelectedLabels();
    const selectedNodes = this.drawingLayer.getSelectedDANodes();
    if (selectedLabels.length > 0 && selectedNodes.length === 0) {
      const majorSpacing = this.drawingLayer.getGridSpacing();
      const slideDist = sign * majorSpacing;
      selectedLabels.forEach(label => this.slideLabelAlongEdge(label, slideDist));
      this.drawingLayer.batchDraw();
      return;
    }
    const edgeMargin = 60;
    const effectiveTier = tier ?? 'normal';

    // Collect all connected edges to move
    const edgesToMove = new Set<DAEdge>();
    selectedNodes.forEach(node => {
      node.connectedEdges.forEach(edge => edgesToMove.add(edge));
    });

    // Store initial crosshairs position
    const initialCrosshairsX = this.crosshairsLayer.crosshairs.x;
    const initialCrosshairsY = this.crosshairsLayer.crosshairs.y;

    // Axis-specific accessors
    const getNodePos = (node: DANode) => axis === 'x' ? node.group.x() : node.group.y();
    const setNodePos = (node: DANode, v: number) => axis === 'x' ? node.group.x(v) : node.group.y(v);
    const initialCrosshairs = axis === 'x' ? initialCrosshairsX : initialCrosshairsY;
    const stageExtent = axis === 'x' ? this.stage.width() : this.stage.height();
    const getLayerPos = () => axis === 'x' ? this.drawingLayer.x() : this.drawingLayer.y();
    const setLayerPos = (v: number) => axis === 'x' ? this.drawingLayer.x(v) : this.drawingLayer.y(v);

    // Snap target positions to grid based on tier
    const majorSpacing = this.drawingLayer.getGridSpacing();
    const minorSpacing = this.drawingLayer.getSubGridSpacing();
    const gridSpacing = effectiveTier === 'fine' ? minorSpacing : majorSpacing;
    const steps = effectiveTier === 'coarse' ? 10 : 1;
    const snapToGrid = (pos: number) => Math.round(pos / gridSpacing) * gridSpacing;
    const getNodeCenterOffset = (node: DANode) =>
      axis === 'x' ? node.NODE_WIDTH / 2 : node.NODE_HEIGHT / 2;

    // Store initial positions for all nodes
    const initialNodePositions = selectedNodes.map(node => {
      const initial = getNodePos(node);
      const centerOffset = getNodeCenterOffset(node);
      const currentCenter = initial + centerOffset;
      const snappedCenter = snapToGrid(currentCenter) + sign * steps * gridSpacing;
      return { node, initial, target: snappedCenter - centerOffset };
    });

    // Compute effective distance for crosshairs (use first node, else nominal step)
    const snappedDistance = initialNodePositions.length > 0
      ? Math.abs(initialNodePositions[0].target - initialNodePositions[0].initial)
      : steps * gridSpacing;

    const duration = this.TWEEN_DURATION * 1000;
    const startTime = Date.now();
    let prevOverflow = 0;

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);

      initialNodePositions.forEach(({ node, initial, target }) => {
        setNodePos(node, initial + (target - initial) * progress);
      });
      edgesToMove.forEach(edge => this.updateEdgePoints(edge));

      // Update crosshairs, panning the drawing layer if crosshairs hit the edge margin
      const scale = this.drawingLayer.scaleX();
      const targetCrosshairs = initialCrosshairs + sign * snappedDistance * scale * progress;
      const clamped = Math.min(Math.max(targetCrosshairs, edgeMargin), stageExtent - edgeMargin);
      const overflow = targetCrosshairs - clamped;
      this.crosshairsLayer.crosshairs.x = axis === 'x' ? clamped : initialCrosshairsX;
      this.crosshairsLayer.crosshairs.y = axis === 'y' ? clamped : initialCrosshairsY;
      const panDelta = -(overflow - prevOverflow);
      if (panDelta !== 0) {
        setLayerPos(getLayerPos() + panDelta);
      }
      prevOverflow = overflow;

      if (progress < 1) {
        this.currentDragRafId = requestAnimationFrame(animate);
      } else {
        this.currentDragRafId = null;
      }
    };

    animate();
  }

  private updateEdgePoints(edge: DAEdge) {
    edge.refreshGeometry();
    this.drawingLayer.batchDraw();
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
          this.log.log(`addLabel: placing at (${point.x.toFixed(1)},${point.y.toFixed(1)}) on segment ${i}`);
          const label = new DALabel(point.x, point.y, 'label', undefined, this.drawingLayer.labelColors());
          edge.addLabel(label);
          this.drawingLayer.batchDraw();
          this.unselectAll(); // Clear selection after adding label
          return;
        }
      }
    }
    this.log.log('addLabel: no edge found under crosshairs');
  }

  private handleEditSelected() {
    const selectedNodes = this.drawingLayer.getSelectedDANodes();
    const selectedLabels = this.getSelectedLabels();
    this.log.log(`handleEditSelected: Nodes=${selectedNodes.length}, Labels=${selectedLabels.length}`);

    // 1. If selection exists (and is editable), edit it.
    if (selectedNodes.length > 0 ||
        selectedLabels.length > 0) {
       this.log.log('  -> Entering edit mode due to existing selection.');
       this.crosshairsLayer.hideCrosshairs();
       selectedNodes.forEach(n => n.showCursor());
       this.drawingLayer.batchDraw();
       this.daOut.emit({kind: "started-label-editing-mode"});
       return;
    }

    // 2. If no selection, check under crosshairs for editable items.
    const label = this.getLabelUnderCrosshairs();
    if (label) {
      this.log.log('  -> Found label under crosshairs. Selecting and editing.');
      this.singleItemSelect();
      this.crosshairsLayer.hideCrosshairs();
      this.daOut.emit({kind: "started-label-editing-mode"});
      return;
    }

    const nodes = this.getDANodesContainingCrosshairs();
    this.log.log(`  -> Nodes under crosshairs: ${nodes.length}`);
    if (nodes.length > 0) {
      this.log.log('  -> Found node under crosshairs. Selecting and editing.');
      this.singleItemSelect();
      this.crosshairsLayer.hideCrosshairs();
      this.drawingLayer.getSelectedDANodes().forEach(n => n.showCursor());
      this.drawingLayer.batchDraw();
      this.daOut.emit({kind: "started-label-editing-mode"});
      return;
    }

    // 3. Nothing selected or hovered -> no-op (user should use insert key instead)
    this.log.log('  -> Nothing targeted. Edit command ignored.');
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

  private getEdgeForLabel(label: DALabel): DAEdge | null {
    for (const edge of this.drawingLayer.getDAEdges()) {
      if (edge.labels.includes(label)) return edge;
    }
    return null;
  }

  /** Slide a label along its parent edge by the given distance. */
  private slideLabelAlongEdge(label: DALabel, distance: number): void {
    const edge = this.getEdgeForLabel(label);
    if (!edge) return;

    const points = edge.getPathPoints();
    if (points.length < 2) return;

    // Find which segment the label is currently closest to, and its t parameter
    let bestSegIdx = 0;
    let bestT = 0;
    let bestDist = Infinity;
    let totalLength = 0;
    const segLengths: number[] = [];

    for (let i = 0; i < points.length - 1; i++) {
      const dx = points[i + 1].x - points[i].x;
      const dy = points[i + 1].y - points[i].y;
      const len = Math.sqrt(dx * dx + dy * dy);
      segLengths.push(len);
      totalLength += len;

      // Project label onto this segment
      if (len === 0) continue;
      const t = Math.max(0, Math.min(1, ((label.x - points[i].x) * dx + (label.y - points[i].y) * dy) / (len * len)));
      const projX = points[i].x + t * dx;
      const projY = points[i].y + t * dy;
      const d = Math.sqrt((label.x - projX) ** 2 + (label.y - projY) ** 2);
      if (d < bestDist) {
        bestDist = d;
        bestSegIdx = i;
        bestT = t;
      }
    }

    // Convert current position to a distance-along-path
    let currentDist = 0;
    for (let i = 0; i < bestSegIdx; i++) currentDist += segLengths[i];
    currentDist += bestT * segLengths[bestSegIdx];

    // Move along path by distance
    let newDist = Math.max(0, Math.min(totalLength, currentDist + distance));

    // Convert back to x,y
    let accumulated = 0;
    for (let i = 0; i < segLengths.length; i++) {
      if (accumulated + segLengths[i] >= newDist || i === segLengths.length - 1) {
        const segT = segLengths[i] > 0 ? (newDist - accumulated) / segLengths[i] : 0;
        label.x = points[i].x + segT * (points[i + 1].x - points[i].x);
        label.y = points[i].y + segT * (points[i + 1].y - points[i].y);
        return;
      }
      accumulated += segLengths[i];
    }
  }

  private getLabelUnderCrosshairs(): DALabel | null {
    const box = this.getCrosshairsBBoxInDrawingLayer();

    const edges = this.drawingLayer.getDAEdges();
    for (const edge of edges) {
      for (const label of edge.labels) {
        // Check overlap between crosshairs bbox and label bounding rect
        const labelLeft = label.x - label.RECT_WIDTH / 2;
        const labelRight = label.x + label.RECT_WIDTH / 2;
        const labelTop = label.y - label.RECT_HEIGHT / 2;
        const labelBottom = label.y + label.RECT_HEIGHT / 2;

        const overlaps = labelRight >= box.minX && labelLeft <= box.maxX &&
                         labelBottom >= box.minY && labelTop <= box.maxY;
        if (overlaps) {
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

  private handleUndo(): void {
    this.finishTweens();
    const currentState = this.drawingLayer.serializeGraph();
    const snapshot = this.undoRedoService.undo(currentState);
    if (snapshot) {
      this.drawingLayer.restoreGraph(snapshot);
      this.drawingLayer.batchDraw();
      this.checkAndEmitEditState();
      this.daOut.emit({kind: "exit-label-editing-mode"});
      this.crosshairsLayer.showCrosshairs();
      this.crosshairsLayer.batchDraw();
    }
  }

  private handleRedo(): void {
    this.finishTweens();
    const currentState = this.drawingLayer.serializeGraph();
    const snapshot = this.undoRedoService.redo(currentState);
    if (snapshot) {
      this.drawingLayer.restoreGraph(snapshot);
      this.drawingLayer.batchDraw();
      this.checkAndEmitEditState();
      this.daOut.emit({kind: "exit-label-editing-mode"});
      this.crosshairsLayer.showCrosshairs();
      this.crosshairsLayer.batchDraw();
    }
  }

  private deleteSelected(): void {
    // Priority: nodes > edges > labels > crosshairs
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
    this.dragSnapshotCaptured = false;
    // If resize handle is active, select that node and enter resize drag
    if (this.resizeTargetNode) {
      this.drawingLayer.unselectAll();
      this.resizeTargetNode.isSelected = true;
    }
  }

  private exitDragMode() {
    if (this.resizeTargetNode) {
      this.resizeTargetNode.hideResizeHandle();
      this.resizeTargetNode = null;
    }
    if (this.hasDragged) {
      this.unselectAll();
      this.checkAndEmitEditState();
    } else if (this.wasAlreadySelectedBeforeDrag) {
      // Quick tap vv on already-selected item: toggle it off
      this.toggleTopItemSelection();
      this.checkAndEmitEditState();
    }
    // Quick tap vv on unselected item: leave it selected (ensureTopItemSelected already did it)
  }

  private toggleTopItemSelection() {
    const daNodesContainingCrosshairs = this.getDANodesContainingCrosshairs();
    if (daNodesContainingCrosshairs.length > 0) {
      const topNode = daNodesContainingCrosshairs.reduce((n0, n1) => n0.zIndex() > n1.zIndex() ? n0 : n1);
      topNode.isSelected = !topNode.isSelected;
      return;
    }

    const daEdgesContainingCrosshairs = this.getDAEdgesContainingCrosshairs();
    if (daEdgesContainingCrosshairs.length > 0) {
      const topEdge = daEdgesContainingCrosshairs.reduce((e0, e1) => e0.zIndex() > e1.zIndex() ? e0 : e1);
      topEdge.isSelected = !topEdge.isSelected;
      return;
    }
  }

  private setEdgeDirectedness(directedness: EdgeDirectedness): void {
    const selectedEdges = this.drawingLayer.getSelectedDAEdges();
    if (selectedEdges.length > 0) {
      selectedEdges.forEach(e => e.directedness = directedness);
    } else {
      // Apply to edges under crosshairs
      const box = this.getCrosshairsBBoxInDrawingLayer();
      for (const edge of this.drawingLayer.getDAEdges()) {
        const points = edge.getPathPoints();
        for (let i = 0; i < points.length - 1; i++) {
          if (this.lineSegmentIntersectsBox(points[i], points[i + 1], box)) {
            edge.directedness = directedness;
            break;
          }
        }
      }
    }
    this.drawingLayer.batchDraw();
  }

  private setLineStyle(lineStyle: LineStyle): void {
    const selectedEdges = this.drawingLayer.getSelectedDAEdges();
    if (selectedEdges.length > 0) {
      selectedEdges.forEach(e => e.lineStyle = lineStyle);
    } else {
      const box = this.getCrosshairsBBoxInDrawingLayer();
      for (const edge of this.drawingLayer.getDAEdges()) {
        const points = edge.getPathPoints();
        for (let i = 0; i < points.length - 1; i++) {
          if (this.lineSegmentIntersectsBox(points[i], points[i + 1], box)) {
            edge.lineStyle = lineStyle;
            break;
          }
        }
      }
    }
    this.drawingLayer.batchDraw();
  }

  private setItemColor(color: ItemColor): void {
    const COLOR_MAP: Record<ItemColor, {node: {fill: string; stroke: string; text: string}; edge: {stroke: string; fill: string}}> = {
      'default': {node: this.drawingLayer.nodeColors()!, edge: this.drawingLayer.edgeColors()!},
      'red': {node: {fill: '#ffcccc', stroke: '#cc0000', text: '#660000'}, edge: {stroke: '#cc0000', fill: '#cc0000'}},
      'blue': {node: {fill: '#cce0ff', stroke: '#0066cc', text: '#003366'}, edge: {stroke: '#0066cc', fill: '#0066cc'}},
      'green': {node: {fill: '#ccffcc', stroke: '#009900', text: '#004d00'}, edge: {stroke: '#009900', fill: '#009900'}},
      'orange': {node: {fill: '#ffe0cc', stroke: '#cc6600', text: '#663300'}, edge: {stroke: '#cc6600', fill: '#cc6600'}},
      'purple': {node: {fill: '#e0ccff', stroke: '#6600cc', text: '#330066'}, edge: {stroke: '#6600cc', fill: '#6600cc'}},
    };
    const colors = COLOR_MAP[color];
    if (!colors) return;

    const selectedNodes = this.drawingLayer.getSelectedDANodes();
    selectedNodes.forEach(n => n.applyColors(colors.node));

    const selectedEdges = this.drawingLayer.getSelectedDAEdges();
    selectedEdges.forEach(e => e.applyColors(colors.edge));

    this.drawingLayer.batchDraw();
  }

  private lineSegmentIntersectsBox(p1: {x: number; y: number}, p2: {x: number; y: number}, box: {minX: number; minY: number; maxX: number; maxY: number}): boolean {
    return lineSegmentIntersectsRect(p1.x, p1.y, p2.x, p2.y, box.minX, box.minY, box.maxX, box.maxY);
  }

}
