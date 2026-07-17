import {AfterViewInit, Component, ElementRef, EventEmitter, inject, Input, OnChanges, OnDestroy, Output, SimpleChanges} from '@angular/core';
import { Subscription } from 'rxjs';
import { DemoDataService } from '../services/demo-data.service';
import { ThemeService } from '../services/theme.service';
import { VisualConfigService } from '../services/visual-config.service';
import { DrawingLayer } from './drawing.layer';
import { CrosshairsLayer } from './crosshairs.layer';
import { DANode } from './da-node';
import { DAEdge, EdgeControlPoint } from './da-edge';
import { DALabel } from './da-label';
import { DAWaypoint } from './da-waypoint';
import { DACommand, DACommandType, EdgeDirectedness, GridTier, ItemColor, LayoutType, LineStyle, NodeShape, RoutingAlgorithm, TextOverflowMode } from './command.model';
import { lineSegmentIntersectsRect, closestPointOnSegment as closestPointOnSeg } from './utils';
import { pointAtT, projectPointToPath } from './edge-label-anchor';
import { endpointFlowDirection, pickEntryCandidate } from './graph-nav';
import { NavPopupComponent, PopupRow } from '../nav-popup/nav-popup.component';
import { planGather, GatherNeighbor, GatherPlacement } from './gather-fisheye';

/** One way out of the nav popup's source node. */
interface NavCandidate {
  edge: DAEdge;
  direction: 'out' | 'in';
  other: DANode;
}

/** Axis-aligned box a gather meta-arrow connects to (node or container). */
interface MetaBox {
  cx: number;
  cy: number;
  halfW: number;
  halfH: number;
}
import { DANotification, EditContext } from './da-notification.model';
import { Observable } from 'rxjs';
import Konva from 'konva';
import { DebugLogService } from '../services/debug-log.service';
import { UndoRedoService } from './undo-redo.service';
import { applyLayout, isClearLayout } from './graph-layout';
import { resolveBoxOverlaps } from './overlap-resolution';
import {
  applyDesiderataRouteEdges,
  DEFAULT_OPTIONS as DESIDERATA_DEFAULTS,
} from './desiderata-route-edges';
import {
  applyBezierFitWeightedChainEdges,
  DEFAULT_OPTIONS as BFWC_FIT_DEFAULTS,
  DEFAULT_WC_OPTIONS as BFWC_WC_DEFAULTS,
} from './bezier-fit-weighted-chain-edges';
import {
  applyIncrementalDesiderataRouteEdges,
  DEFAULT_OPTIONS as INCREMENTAL_DEFAULTS,
} from './incremental-desiderata-route-edges';
import {
  routeNewEdgeIncrementally,
  applyIncrementalDesiderataV3RouteEdges,
  DEFAULT_OPTIONS as INCREMENTAL_V3_DEFAULTS,
} from './incremental-desiderata-v3-route-edges';
import type { RoutingRequest, RoutingResponse } from './routing-worker-messages';
import { RoutingMetricsService } from '../services/routing-metrics.service';
import { DraftStorageService } from '../services/draft-storage.service';
import { FileIoService } from '../services/file-io.service';
import { Vault, VaultService, ensureKidrawFilename, normalizeVaultPath } from '../services/vault.service';
import {
  isYamlFilename,
  parseGraphDocByFilename,
  serializeGraphDocByFilename,
} from '../lib/file-format/parser';
import { snapshotToFiles, filesToSnapshot } from '../lib/file-format/snapshot-mapping';
import { getExtension } from '../extensions/extension-registry';
import {
  InlineStyleSet,
  KidrawGraphDoc,
  KidrawStyleSet,
  StyleRef,
  inlineToStyleSet,
  styleRefId,
} from '../lib/file-format/types';
import { resolveAndApplyToGraph, ImportResolver } from '../lib/file-format/resolver';
import {
  findManifest,
  isKidrawFile,
  packZip,
  PackedFile,
  unpackZip,
} from '../lib/file-format/zip-bundle';
import {
  parseStyleSetByFilename,
  serializeStyleSetByFilename,
} from '../lib/file-format/parser';
import { GraphStorageService } from '../services/graph-storage.service';
import { GraphSnapshot } from './graph-snapshot';

function defaultGraphFilename(): string {
  const stamp = new Date().toISOString().slice(0, 10);
  // YAML is the default save format.
  return `kidraw-${stamp}.kidraw.yaml`;
}

/** Strip leading "./" and normalize separators for archive-relative paths. */
function normalizeArchivePath(p: string): string {
  return p.replace(/^\.\//, '').replace(/^\/+/, '').replace(/\\/g, '/');
}

/** An in-graph search hit: a node (matched by its label text) or an edge label. */
type SearchMatch =
  | { kind: 'node'; node: DANode }
  | { kind: 'edge-label'; label: DALabel };

function searchMatchesEqual(a: SearchMatch, b: SearchMatch): boolean {
  if (a.kind === 'node' && b.kind === 'node') return a.node === b.node;
  if (a.kind === 'edge-label' && b.kind === 'edge-label') return a.label === b.label;
  return false;
}

@Component({
  selector: 'app-drawing-area',
  imports: [NavPopupComponent],
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
  private metrics = inject(RoutingMetricsService);
  private draftStorage = inject(DraftStorageService);
  private fileIo = inject(FileIoService);
  private graphStorage = inject(GraphStorageService);
  private vaultService = inject(VaultService);
  /** Debounced auto-save to the vault-backed file (null = nothing pending). */
  private vaultSaveTimer: ReturnType<typeof setTimeout> | null = null;
  /** Guards the external-change poll against reacting to our own writes. */
  private vaultWriteInFlight = false;
  private vaultPollTimer: ReturnType<typeof setInterval> | null = null;
  /** lastModified of the vault file as of our most recent read/write. */
  private vaultLastModified = 0;
  private static readonly VAULT_AUTOSAVE_DEBOUNCE_MS = 1000;
  private static readonly VAULT_POLL_INTERVAL_MS = 1500;
  /** The graph doc + style resolver from the most-recent Open. Used to
   *  switch between top-level displays after the file is loaded. */
  private openedDoc: KidrawGraphDoc | null = null;
  private openedStyleResolver: ImportResolver | null = null;
  private activeStyleIndex = 0;
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
  private gatheredNodePositions: Map<DANode, {x: number; y: number}> = new Map();
  /** Node the current gather view is centered on. */
  private gatherAnchor: DANode | null = null;
  /** Explicitly gathered (Gather key); restored by Ungather or re-toggle. */
  private gatherPinned = false;
  /** Member edges of a pile, hidden while their meta-edge stands in for
   *  them; shown again on ungather. */
  private gatherHiddenEdges: DAEdge[] = [];
  /** Meta-node containers, meta-edges, ×N badges, and label markers;
   *  destroyed on ungather. */
  private gatherIndicators: Konva.Node[] = [];
  /** Drawing-layer children order before stack restacking, for restore. */
  private gatherZOrder: Konva.Node[] | null = null;
  /** Debounced re-route of edges between gathered nodes and the rest of the
   *  graph — rapid navigation keeps cancelling it so only the resting view
   *  pays for routing. */
  private gatherDeferredRouting: number | null = null;
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
  /** Clearance kept between boxes when a resize pushes neighbors aside. */
  public readonly RESIZE_REFLOW_GAP = 16;
  /** Stage-pixel radius within which the crosshairs count as standing on a
   *  traversal stop (label/waypoint pseudo-node). */
  private headingRadians = -Math.PI / 2;
  private steeringMoveDistance = this.CROSSHAIRS_MOVEMENT_DISTANCE;
  /** Direction (unit vector, layer orientation) of the last nav-popup jump;
   *  used by gather's nav-next pick (`pickEntryCandidate`). */
  private graphNavMomentum: {x: number; y: number} | null = null;
  /** The edge under consideration in the nav popup (preview highlight) or
   *  the edge last traveled. A glow (DAEdge.navFocused), not a selection:
   *  no editing command sees it. */
  private graphNavEdge: DAEdge | null = null;
  /** The traversal's current node: where the last nav jump landed (or
   *  anchored). Anchor of last resort for navigation and gather. */
  private graphNavLastNode: DANode | null = null;
  /** In/out sense of the last nav jump — the popup's "momentum": candidates
   *  continuing this direction are the primary group, and a single one
   *  auto-advances without a popup. */
  private navDirection: 'out' | 'in' | null = null;

  // --- Nav popup state (template bindings + open-session bookkeeping) ---
  navPopupOpen = false;
  navPopupRows: PopupRow[] = [];
  navPopupLeft = 0;
  navPopupTop = 0;
  navPopupDark = false;
  /** Physical key that fired Go, if still held — releasing it over the
   *  popup's search pseudo-item starts filtering. */
  navPopupHoldKey: string | null = null;
  /** True while a single-candidate popup is concealed (first 500 ms of a
   *  hold — a quick tap walks the chain without flashing UI). */
  navPopupHidden = false;
  private navPopupRevealTimer: number | null = null;
  /** Vim-style jumplist over nav landings: Ctrl+O back, Ctrl+I forward. */
  private navHistory: string[] = [];
  private navHistoryIndex = -1;
  private navCandidates = new Map<string, NavCandidate>();
  private navSource: DANode | null = null;
  /** Original transform of the popup's enlarged source node. */
  private navSourceEmphasis: {node: DANode; scaleX: number; scaleY: number; x: number; y: number} | null = null;
  /** The candidate currently highlighted in the popup — drives the ghost
   *  preview and which side of the source the popup sits on. */
  private navHighlightCand: NavCandidate | null = null;
  /** Translucent dashed preview of the highlighted candidate (copies of the
   *  source node, a straightened edge + labels, and the destination node
   *  pulled into the viewport). The view itself never moves while browsing. */
  private navGhostGroup: Konva.Group | null = null;
  /** Pre-gather control points of every edge Gather re-routed, so Ungather
   *  restores the wiring exactly. */
  private gatheredEdgeControlPoints = new Map<DAEdge, EdgeControlPoint[]>();

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
    DACommandType.TRAVERSE_SMART,
    DACommandType.NAV_HISTORY_BACK,
    DACommandType.NAV_HISTORY_FORWARD,
    DACommandType.GATHER_CONNECTED_NODES,
    DACommandType.UNGATHER,
    DACommandType.LOAD_SAMPLE_GRAPH,
    DACommandType.NEW_GRAPH,
    DACommandType.EXIT_LABEL_EDIT_MODE,
    DACommandType.RECENTER_VIEW,
    DACommandType.RECENTER_CROSSHAIRS,
    DACommandType.SET_DEFAULT_EDGE_DIRECTEDNESS,
    DACommandType.SET_DEFAULT_LINE_STYLE,
    DACommandType.SET_NODE_SHAPE,
    DACommandType.EDIT_OR_INSERT,
    DACommandType.SEARCH_GRAPH,
    DACommandType.SEARCH_NEXT_MATCH,
    DACommandType.SEARCH_PREV_MATCH,
  ]);

  private static readonly MUTATING_COMMANDS = new Set<DACommandType>([
    DACommandType.CREATE_NEW_NODE,
    DACommandType.CREATE_NEW_NODE_DIRECTED,
    DACommandType.INSERT_WAYPOINT,
    DACommandType.CONNECT_SELECTED_NODES,
    DACommandType.BEGIN_DIRECTED_EDGE,
    DACommandType.SET_EDGE_DESTINATION,
    DACommandType.ADD_LABEL,
    DACommandType.DELETE,
    DACommandType.TOGGLE_PIN_SELECTED,
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
    DACommandType.SET_DIAGRAM_TYPE,
  ]);

  private static readonly ROUTING_LOCKED_COMMANDS = new Set<DACommandType>([
    DACommandType.CREATE_NEW_NODE,
    DACommandType.CREATE_NEW_NODE_DIRECTED,
    DACommandType.INSERT_WAYPOINT,
    DACommandType.CONNECT_SELECTED_NODES,
    DACommandType.BEGIN_DIRECTED_EDGE,
    DACommandType.SET_EDGE_DESTINATION,
    DACommandType.FINALIZE_DIRECTED_EDGE,
    DACommandType.ADD_LABEL,
    DACommandType.EDIT_SELECTED,
    DACommandType.EDIT_OR_INSERT,
    DACommandType.INSERT_CHAR,
    DACommandType.DELETE_LAST_CHAR,
    DACommandType.DELETE,
    DACommandType.UNDO,
    DACommandType.REDO,
    DACommandType.INCREASE_SELECTED_NODE_SIZE,
    DACommandType.DECREASE_SELECTED_NODE_SIZE,
    DACommandType.INCREASE_SELECTED_TEXT_SIZE,
    DACommandType.DECREASE_SELECTED_TEXT_SIZE,
    DACommandType.DRAG_SELECTED_LEFT,
    DACommandType.DRAG_SELECTED_RIGHT,
    DACommandType.DRAG_SELECTED_UP,
    DACommandType.DRAG_SELECTED_DOWN,
    DACommandType.SET_TEXT_OVERFLOW_MODE,
    DACommandType.SET_NODE_SHAPE,
    DACommandType.SET_EDGE_DIRECTEDNESS,
    DACommandType.SET_LINE_STYLE,
    DACommandType.SET_ITEM_COLOR,
    DACommandType.LOAD_SAMPLE_GRAPH,
    DACommandType.LOAD_NAMED_GRAPH,
    DACommandType.NEW_GRAPH,
    DACommandType.OPEN_FILE,
    DACommandType.VAULT_OPEN,
    DACommandType.CYCLE_DISPLAY,
    DACommandType.TOGGLE_PIN_SELECTED,
    DACommandType.APPLY_LAYOUT,
    DACommandType.APPLY_EDGE_ROUTING,
    DACommandType.SET_DIAGRAM_TYPE,
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
      // Restore the localStorage draft (v2 schema; auto-migrates v1).
      const draft = this.draftStorage.load();
      if (draft) {
        try {
          const snapshot = this.draftStorage.draftToSnapshot(draft);
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

    // Vault: restore the stored directory grant and re-open the last file.
    void this.initVault();

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

  /** Tracks whether the user has applied a routing this session. Kept as a
   *  null-vs-string marker; parameter-driven re-routing is no longer wired
   *  here (the tuning panel was removed). */
  private lastAppliedRouting: RoutingAlgorithm | null = null;

  /** Layout (edge routing) runs in a Web Worker so a slow/non-converging graph
   *  can't freeze the UI. These track the in-flight run so we can drive the
   *  countdown, enforce the timeout, and cancel a superseding run. */
  private routingWorker: Worker | null = null;
  private routingCountdown: ReturnType<typeof setInterval> | null = null;
  private routingDeadline: ReturnType<typeof setTimeout> | null = null;
  private static readonly ROUTING_TIMEOUT_MS = 15000;

  ngOnInit(): void {
  }

  private _beforeUnloadHandler?: () => void;

  ngOnDestroy(): void {
    this.stopRouting();
    this.themeSub?.unsubscribe();
    this.visualSub?.unsubscribe();
    if (this._beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this._beforeUnloadHandler);
    }
    if (this.vaultSaveTimer !== null) clearTimeout(this.vaultSaveTimer);
    if (this.vaultPollTimer !== null) clearInterval(this.vaultPollTimer);
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

    if (this.isRoutingInProgress() && DrawingAreaComponent.ROUTING_LOCKED_COMMANDS.has(command.kind)) {
      this.daOut.emit({ kind: 'status-message', message: 'Layout is running; graph edits are locked.' });
      return;
    }

    // Push undo snapshot before mutating commands
    if (DrawingAreaComponent.MUTATING_COMMANDS.has(command.kind)) {
      this.pushUndoSnapshot(command);
    }

    // Show grid and indicators for any spatial/manipulation command
    if (command.kind !== DACommandType.INSERT_CHAR &&
        command.kind !== DACommandType.DELETE_LAST_CHAR &&
        command.kind !== DACommandType.EXIT_LABEL_EDIT_MODE &&
        command.kind !== DACommandType.EDIT_SELECTED &&
        command.kind !== DACommandType.EDIT_OR_INSERT &&
        command.kind !== DACommandType.QUERY_EDIT_CONTEXT &&
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
      case DACommandType.TRAVERSE_SMART:
        this.traverseSmart(command.holdKey);
        break;
      case DACommandType.NAV_HISTORY_BACK:
        this.navHistoryGo(-1);
        break;
      case DACommandType.NAV_HISTORY_FORWARD:
        this.navHistoryGo(1);
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
      case DACommandType.INSERT_WAYPOINT:
        this.insertWaypointAtCrosshairs();
        this.checkAndEmitEditState();
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
      case DACommandType.QUERY_EDIT_CONTEXT:
        this.daOut.emit({kind: 'edit-context', context: this.computeEditContext()});
        break;
      case DACommandType.EDIT_OR_INSERT:
        this.handleEditOrInsert();
        break;
      case DACommandType.DELETE_LAST_CHAR:
        this.deleteLastChar();
        break;
      case DACommandType.DELETE_CHAR_AT_CURSOR:
        this.deleteCharAtCursor();
        break;
      case DACommandType.CURSOR_LEFT:
        this.moveEditCursor(t => t.moveCursorH(-1));
        break;
      case DACommandType.CURSOR_RIGHT:
        this.moveEditCursor(t => t.moveCursorH(1));
        break;
      case DACommandType.CURSOR_UP:
        this.moveEditCursor(t => t.moveCursorV(-1));
        break;
      case DACommandType.CURSOR_DOWN:
        this.moveEditCursor(t => t.moveCursorV(1));
        break;
      case DACommandType.CURSOR_LINE_START:
        this.moveEditCursor(t => t.cursorToLineStart());
        break;
      case DACommandType.CURSOR_LINE_END:
        this.moveEditCursor(t => t.cursorToLineEnd());
        break;
      case DACommandType.CURSOR_WORD_FORWARD:
        this.moveEditCursor(t => t.cursorWordForward());
        break;
      case DACommandType.CURSOR_WORD_BACK:
        this.moveEditCursor(t => t.cursorWordBack());
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
      case DACommandType.GATHER_CONNECTED_NODES:
        this.gatherToggle();
        break;
      case DACommandType.UNGATHER:
        this.ungather();
        break;
      case DACommandType.LOAD_SAMPLE_GRAPH:
        this.loadSampleGraph(command.graphId);
        break;
      case DACommandType.NEW_GRAPH:
        this.newGraph();
        break;
      case DACommandType.OPEN_FILE:
        void this.openFile();
        break;
      case DACommandType.SAVE_FILE_AS:
        this.saveFileAs();
        break;
      case DACommandType.EXPORT_ZIP:
        this.exportZip();
        break;
      case DACommandType.CYCLE_DISPLAY:
        this.cycleDisplay();
        break;
      case DACommandType.SET_DIAGRAM_TYPE:
        this.setDiagramType(command.typeId);
        break;
      case DACommandType.CONNECT_VAULT:
        void this.connectVault();
        break;
      case DACommandType.VAULT_OPEN:
        void this.vaultOpen();
        break;
      case DACommandType.VAULT_SAVE_AS:
        void this.vaultSaveAs();
        break;
      case DACommandType.SEARCH_GRAPH:
        this.searchGraph();
        break;
      case DACommandType.SEARCH_NEXT_MATCH:
        this.searchStep(1);
        break;
      case DACommandType.SEARCH_PREV_MATCH:
        this.searchStep(-1);
        break;
      case DACommandType.SAVE_GRAPH_AS:
        this.saveGraphAs(command.name);
        break;
      case DACommandType.LOAD_NAMED_GRAPH:
        this.loadNamedGraph(command.graphSnapshot);
        break;
      case DACommandType.TOGGLE_PIN_SELECTED:
        this.togglePinSelected();
        break;
      case DACommandType.APPLY_LAYOUT:
        this.applyGraphLayout(command.layout);
        break;
      case DACommandType.APPLY_EDGE_ROUTING:
        this.applyEdgeRouting(command.algorithm);
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
    this.refreshWaypointVisibility();

    if (DrawingAreaComponent.MUTATING_COMMANDS.has(command.kind) ||
        command.kind === DACommandType.UNDO ||
        command.kind === DACommandType.REDO) {
      this.scheduleVaultAutoSave();
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
    // Same priority as singleItemSelect: a label beats everything under it.
    const label = this.getLabelUnderCrosshairs();
    if (label) return label.isSelected;

    const wp = this.getWaypointUnderCrosshairs();
    if (wp) return wp.isSelected;

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
    const label = this.getLabelUnderCrosshairs();
    if (label) {
      label.isSelected = true;
      this.drawingLayer.batchDraw();
      return;
    }

    const wp = this.getWaypointUnderCrosshairs();
    if (wp) {
      wp.isSelected = true;
      return;
    }

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

    // A waypoint is selectable (in preference to its edge) whenever it even
    // partially overlaps the crosshairs' selection circle.
    const wpUnderCrosshairs = this.getWaypointUnderCrosshairs();
    if (wpUnderCrosshairs) {
      wpUnderCrosshairs.isSelected = true;
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

  /** Radius of the crosshairs' selection circle expressed in drawing-layer
   *  coordinates. The circle is drawn unscaled on the crosshairs layer, so its
   *  effective size relative to the drawing layer changes with zoom. */
  private crosshairsCircleRadiusInLayerCoords(): number {
    return Math.max(this.crosshairsLayer.crosshairs.hitRadiusX, this.crosshairsLayer.crosshairs.hitRadiusY) / this.drawingLayer.scaleX();
  }

  /** Waypoint overlapping the crosshairs' selection circle — i.e. whose dot
   *  comes within `RADIUS` + the circle's radius of the crosshairs center (all
   *  in layer coords). Returns the closest such waypoint, or undefined if none.
   *  Used by every waypoint hit-test (select, select+drag, pin, delete) so they
   *  all share the same generous targeting. */
  private getWaypointUnderCrosshairs(): DAWaypoint | undefined {
    const wps = this.drawingLayer.getDAWaypoints();
    if (wps.length === 0) return undefined;
    const pt = this.crosshairsInLayerCoords();
    const tolerance = this.crosshairsCircleRadiusInLayerCoords();
    const candidates = wps
      .map(wp => ({wp, d: wp.distanceTo(pt)}))
      .filter(c => c.d <= c.wp.RADIUS + tolerance);
    if (candidates.length === 0) return undefined;
    candidates.sort((a, b) => a.d - b.d);
    return candidates[0].wp;
  }

  private loadSampleGraph(graphId: string) {
    this.detachVaultFile();
    this.finishTweens();
    this.unselectAllLabels();
    this.undoRedoService.clear();
    this.demoDataService.loadGraph(graphId, this.drawingLayer);
    const palette = this.visualConfigService.getEffectivePalette(this.themeService.theme);
    this.drawingLayer.applyThemeColors(palette);
    this.fitViewToContent();
    this.recenterCrosshairs();
    this.emitZoomLevel();
    this.checkAndEmitEditState();
  }

  private saveGraphToStorage(): void {
    this.finishTweens();
    const snapshot = this.drawingLayer.serializeGraph();
    this.draftStorage.saveSnapshot(snapshot);
  }

  private async openFile(): Promise<void> {
    const accept = FileIoService.KIDRAW_ACCEPT;
    const opened = await this.fileIo.openBinaryFile(accept);
    if (!opened) return;

    const lower = opened.name.toLowerCase();
    const isZip = lower.endsWith('.zip');

    let manifestText: string;
    let manifestName: string;
    let styleResolver: ImportResolver;

    if (isZip) {
      let unpacked: PackedFile[];
      try {
        unpacked = unpackZip(opened.bytes);
      } catch (e) {
        window.alert(`Could not unpack ${opened.name}:\n\n${(e as Error).message}`);
        return;
      }
      const manifest = findManifest(unpacked);
      if (!manifest) {
        window.alert(`${opened.name} doesn't contain a .kidraw.{json,yaml} manifest file.`);
        return;
      }
      manifestText = manifest.content;
      manifestName = manifest.name;
      const byPath = new Map<string, PackedFile>();
      for (const f of unpacked) byPath.set(normalizeArchivePath(f.name), f);
      styleResolver = (path: string) => {
        const found = byPath.get(normalizeArchivePath(path));
        if (!found) return null;
        const parsed = parseStyleSetByFilename(found.content, found.name);
        return parsed.ok ? parsed.value : null;
      };
    } else {
      manifestText = new TextDecoder().decode(opened.bytes);
      manifestName = opened.name;
      styleResolver = (_path: string) => null; // pre-populated cache below
    }

    const parsed = parseGraphDocByFilename(manifestText, manifestName);
    if (!parsed.ok) {
      window.alert(`Could not open ${manifestName}:\n\n${parsed.error}`);
      return;
    }

    // For plain (non-zip) opens, prompt-on-miss to gather any external
    // style files referenced by the graph (top-level + transitive imports).
    if (!isZip) {
      const cache = new Map<string, KidrawStyleSet>();
      const declined = new Set<string>();
      await this.gatherExternalStyles(parsed.value.styles, cache, declined);
      styleResolver = (path: string) => cache.get(normalizeArchivePath(path)) ?? null;
    }

    const resolvedStyle = this.resolveStyleAtIndex(parsed.value, 0, styleResolver);
    if (resolvedStyle === null) return;

    // A picker-opened file is not vault-backed; stop auto-saving to the
    // previously-open vault file.
    this.detachVaultFile();

    // Save open-state so the user can cycle through other displays later.
    this.openedDoc = parsed.value;
    this.openedStyleResolver = styleResolver;
    this.activeStyleIndex = 0;

    const snapshot = filesToSnapshot(parsed.value, resolvedStyle);
    this.finishTweens();
    this.unselectAllLabels();
    this.undoRedoService.clear();
    this.drawingLayer.restoreGraph(snapshot);
    const palette = this.visualConfigService.getEffectivePalette(this.themeService.theme);
    this.drawingLayer.applyThemeColors(palette);
    this.fitViewToContent();
    this.recenterCrosshairs();
    this.emitZoomLevel();
    this.checkAndEmitEditState();
    this.emitFileState(manifestName);

    this.emitDisplayStatus(parsed.value);
  }

  /** Apply a registered plugin: restyle existing nodes to its defaults and
   *  record it as active so new nodes follow them too. Undoable; persisted
   *  with the graph. */
  private setDiagramType(typeId: string): void {
    const extension = getExtension(typeId);
    if (!extension) {
      this.emitStatus(`⚠ Unknown diagram type: ${typeId}`);
      return;
    }
    this.finishTweens();
    this.undoRedoService.pushSnapshot(this.drawingLayer.serializeGraph());
    this.drawingLayer.setDiagramType(extension);
    this.updateEdgesForResizedNodes(this.drawingLayer.getDANodes());
    this.drawingLayer.batchDraw();
    this.emitStatus(`Diagram type: ${extension.name}`);
  }

  private cycleDisplay(): void {
    if (!this.openedDoc || !this.openedStyleResolver) {
      this.daOut.emit({ kind: 'status-message', message: 'Open a graph file first to cycle displays.' });
      return;
    }
    const styles = this.openedDoc.styles;
    if (styles.length <= 1) {
      this.daOut.emit({ kind: 'status-message', message: `Only one display in this graph (${styleRefId(styles[0])}).` });
      return;
    }
    this.activeStyleIndex = (this.activeStyleIndex + 1) % styles.length;
    const resolvedStyle = this.resolveStyleAtIndex(this.openedDoc, this.activeStyleIndex, this.openedStyleResolver);
    if (resolvedStyle === null) return;

    const snapshot = filesToSnapshot(this.openedDoc, resolvedStyle);
    this.finishTweens();
    this.unselectAllLabels();
    this.undoRedoService.clear();
    this.drawingLayer.restoreGraph(snapshot);
    const palette = this.visualConfigService.getEffectivePalette(this.themeService.theme);
    this.drawingLayer.applyThemeColors(palette);
    this.fitViewToContent();
    this.emitZoomLevel();
    this.checkAndEmitEditState();

    this.emitDisplayStatus(this.openedDoc);
  }

  /** Resolve styles[index] into a cascaded KidrawStyleSet (or null if it errors). */
  private resolveStyleAtIndex(
    doc: KidrawGraphDoc,
    index: number,
    resolver: ImportResolver,
  ): KidrawStyleSet | null {
    const ref = doc.styles[index];
    if (ref === undefined) return { kdStyle: 1 };
    const rootStyle = typeof ref === 'string'
      ? resolver(ref) ?? { kdStyle: 1 }
      : ref;
    const resolved = resolveAndApplyToGraph(doc, rootStyle, resolver);
    if (!resolved.ok) {
      window.alert(`Could not resolve display ${styleRefId(ref)}:\n\n${resolved.error}`);
      return null;
    }
    return resolved.value;
  }

  private emitDisplayStatus(doc: KidrawGraphDoc): void {
    if (doc.styles.length === 0) return;
    const name = styleRefId(doc.styles[this.activeStyleIndex]);
    const total = doc.styles.length;
    const message = total > 1
      ? `Display: ${name} (${this.activeStyleIndex + 1}/${total})`
      : `Display: ${name}`;
    this.daOut.emit({ kind: 'status-message', message });
  }

  /**
   * For every external (path-string) style reference in `styles[]` —
   * top-level and recursive imports — prompt the user to locate the file
   * via the OS picker. Builds out `cache` keyed by normalized requested path.
   * If the user declines a prompt, the path is added to `declined` so we
   * don't ask again in the same open.
   */
  private async gatherExternalStyles(
    refs: ReadonlyArray<string | InlineStyleSet>,
    cache: Map<string, KidrawStyleSet>,
    declined: Set<string>,
  ): Promise<void> {
    for (const ref of refs) {
      if (typeof ref === 'string') {
        await this.gatherExternalPath(ref, cache, declined);
      } else {
        // Inline style — still recurse into its imports (paths inside it).
        for (const importPath of ref.imports ?? []) {
          await this.gatherExternalPath(importPath, cache, declined);
        }
      }
    }
  }

  private async gatherExternalPath(
    path: string,
    cache: Map<string, KidrawStyleSet>,
    declined: Set<string>,
  ): Promise<void> {
    const key = normalizeArchivePath(path);
    if (cache.has(key) || declined.has(key)) return;

    const ok = window.confirm(`Locate referenced style file "${path}"?`);
    if (!ok) {
      declined.add(key);
      return;
    }
    const file = await this.fileIo.openTextFile(FileIoService.STYLE_ACCEPT);
    if (!file) {
      declined.add(key);
      return;
    }
    const parsed = parseStyleSetByFilename(file.content, file.name);
    if (!parsed.ok) {
      window.alert(`Could not parse ${file.name}:\n\n${parsed.error}`);
      declined.add(key);
      return;
    }
    cache.set(key, parsed.value);

    // Recurse into this style's own imports.
    for (const importPath of parsed.value.imports ?? []) {
      await this.gatherExternalPath(importPath, cache, declined);
    }
  }

  private exportZip(): void {
    this.finishTweens();
    const snapshot = this.drawingLayer.serializeGraph();
    const { doc, style } = snapshotToFiles(snapshot);

    // Multi-file zip: one .kidraw.yaml manifest + one .kd-style.yaml sibling.
    const stylePath = './graph.kd-style.yaml';
    doc.styles = [stylePath];

    const manifestName = 'graph.kidraw.yaml';
    const styleName = 'graph.kd-style.yaml';

    const files: PackedFile[] = [
      { name: manifestName, content: serializeGraphDocByFilename(doc, manifestName) },
      { name: styleName, content: serializeStyleSetByFilename(style, styleName) },
    ];

    const bytes = packZip(files);
    const stamp = new Date().toISOString().slice(0, 10);
    this.fileIo.saveBinary(`kidraw-${stamp}.kidraw.zip`, bytes, 'application/zip');
  }

  private saveFileAs(): void {
    this.finishTweens();
    const filename = defaultGraphFilename();
    const content = this.serializeCurrentGraphSingleFile(filename);
    const mime = isYamlFilename(filename) ? 'text/yaml' : 'application/json';
    this.fileIo.saveAs(filename, content, mime);
  }

  /**
   * Serialize the live graph as a self-contained single file: the style is
   * embedded inline so the result opens anywhere. (Multi-file save will land
   * in a later phase.)
   */
  private serializeCurrentGraphSingleFile(filename: string): string {
    const snapshot = this.drawingLayer.serializeGraph();
    const { doc, style } = snapshotToFiles(snapshot);
    const inline: InlineStyleSet = {
      name: 'default',
      ...(style.nodes ? { nodes: style.nodes } : {}),
      ...(style.edges ? { edges: style.edges } : {}),
      ...(style.imports ? { imports: style.imports } : {}),
      ...(style.tagStyles ? { tagStyles: style.tagStyles } : {}),
      ...(style.view ? { view: style.view } : {}),
    };
    doc.styles = [inline];
    return serializeGraphDocByFilename(doc, filename);
  }

  // ─── Vault ────────────────────────────────────────────────────────────────
  // Local-directory storage via the File System Access API. One directory
  // grant, then silent auto-save + external-change polling — see
  // notes/decision-vault-model.md. window.prompt inputs below are placeholders
  // until the trad/large-menu overlay lands.

  private emitStatus(message: string): void {
    // Status messages double as the vault/search diagnostic trail in
    // tools/debug.log (via the log server).
    this.log.log('[status]', message);
    this.daOut.emit({ kind: 'status-message', message });
  }

  private lastFileLabel: string | null | undefined = undefined;

  /** Tell the header which file is open (deduplicated — auto-save calls
   *  this on every write). */
  private emitFileState(fileLabel: string | null): void {
    if (fileLabel === this.lastFileLabel) return;
    this.lastFileLabel = fileLabel;
    this.log.log('[file]', fileLabel ?? '(none)');
    this.daOut.emit({ kind: 'file-state-update', fileLabel });
  }

  private async initVault(): Promise<void> {
    if (!VaultService.isSupported()) return;
    const status = await this.vaultService.tryRestore();
    this.log.log('[vault] startup restore:', status, 'storedPath:', this.vaultService.currentFilePath ?? '(none)');
    if (status === 'connected') {
      const path = this.vaultService.currentFilePath;
      if (path && await this.loadVaultFile(path, { recenter: true })) {
        this.emitStatus(`Vault: opened ${path}`);
      }
    } else if (status === 'needs-permission') {
      this.emitStatus('Vault needs reconnecting — file menu → Vault: Connect.');
    }
    this.vaultPollTimer = setInterval(
      () => void this.pollVaultFile(),
      DrawingAreaComponent.VAULT_POLL_INTERVAL_MS,
    );
  }

  private async connectVault(): Promise<void> {
    if (!VaultService.isSupported()) {
      this.emitStatus('Vault requires a Chromium-based browser (File System Access API).');
      return;
    }
    const status = await this.vaultService.connectOrReconnect();
    if (status !== 'connected') {
      this.emitStatus('Vault not connected.');
      return;
    }
    const vault = this.vaultService.vault!;
    const files = await vault.list();
    this.emitStatus(`Vault connected: ${vault.name} (${files.length} kidraw file${files.length === 1 ? '' : 's'})`);

    // If a file was open in a previous session and the canvas is still
    // empty, resume it now that we have permission again.
    const path = this.vaultService.currentFilePath;
    const canvasEmpty = this.drawingLayer.getDANodes().length === 0;
    if (path && canvasEmpty && await this.loadVaultFile(path, { recenter: true })) {
      this.emitStatus(`Vault: opened ${path}`);
    }
  }

  private async vaultSaveAs(): Promise<void> {
    if (!this.vaultService.isConnected) {
      this.emitStatus('Connect a vault first (file menu → Vault: Connect).');
      return;
    }
    const suggestion = this.vaultService.currentFilePath ?? 'graph.kidraw.yaml';
    const entered = window.prompt('Save in vault as:', suggestion);
    if (!entered || entered.trim() === '') return;
    let path: string;
    try {
      path = ensureKidrawFilename(entered.trim());
    } catch (e) {
      this.emitStatus((e as Error).message);
      return;
    }
    this.cancelVaultAutoSave();
    if (await this.writeGraphToVault(path)) {
      this.emitStatus(`Saved to vault: ${path} — auto-save is on`);
    }
  }

  private async vaultOpen(): Promise<void> {
    if (!this.vaultService.isConnected) {
      this.emitStatus('Connect a vault first (file menu → Vault: Connect).');
      return;
    }
    const vault = this.vaultService.vault!;
    const files = (await vault.list()).filter(f => /\.kidraw\./i.test(f));
    if (files.length === 0) {
      this.emitStatus('No graph files in the vault yet — use Vault: Save As first.');
      return;
    }
    this.log.log('[vault] open picker,', files.length, 'files:', files.join(', '));
    const listing = files.map((f, i) => `${i + 1}. ${f}`).join('\n');
    const entered = window.prompt(`Open from vault (number or name):\n${listing}`, files[0]);
    if (!entered || entered.trim() === '') {
      this.log.log('[vault] open cancelled');
      return;
    }
    const trimmed = entered.trim();
    let path: string | undefined;
    try {
      path = /^\d+$/.test(trimmed)
        ? files[parseInt(trimmed, 10) - 1]
        : files.find(f => f === normalizeVaultPath(trimmed)) ?? normalizeVaultPath(trimmed);
    } catch (e) {
      this.emitStatus((e as Error).message);
      return;
    }
    if (!path) {
      this.emitStatus(`No such vault file: ${trimmed}`);
      return;
    }
    if (await this.loadVaultFile(path, { recenter: true })) {
      this.emitStatus(`Opened from vault: ${path} — auto-save is on`);
    }
  }

  /**
   * Load a graph file from the vault into the canvas and make it the
   * auto-save target. Does not emit a success status — callers word their
   * own. `recenter` is for user-initiated opens; external-change reloads
   * leave the viewport and crosshairs alone.
   */
  private async loadVaultFile(path: string, opts: { recenter?: boolean } = {}): Promise<boolean> {
    const vault = this.vaultService.vault;
    if (!vault) return false;
    this.log.log('[vault] loading', path);
    const content = await vault.read(path);
    if (content === null) {
      this.emitStatus(`Vault: file not found: ${path}`);
      return false;
    }
    const parsed = parseGraphDocByFilename(content, path);
    if (!parsed.ok) {
      this.emitStatus(`Vault: could not parse ${path}: ${parsed.error}`);
      return false;
    }

    // Resolve external style references from the vault (relative to the
    // graph file's directory), mirroring the zip-internal resolver.
    const baseDir = path.includes('/') ? path.slice(0, path.lastIndexOf('/') + 1) : '';
    const cache = new Map<string, KidrawStyleSet>();
    await this.gatherVaultStyles(parsed.value.styles, baseDir, cache, vault);
    const resolver: ImportResolver = p => cache.get(normalizeArchivePath(p)) ?? null;

    const resolvedStyle = this.resolveStyleAtIndex(parsed.value, 0, resolver);
    if (resolvedStyle === null) return false;

    this.openedDoc = parsed.value;
    this.openedStyleResolver = resolver;
    this.activeStyleIndex = 0;

    const snapshot = filesToSnapshot(parsed.value, resolvedStyle);
    this.cancelVaultAutoSave();
    this.finishTweens();
    this.unselectAllLabels();
    this.undoRedoService.clear();
    this.drawingLayer.restoreGraph(snapshot);
    const palette = this.visualConfigService.getEffectivePalette(this.themeService.theme);
    this.drawingLayer.applyThemeColors(palette);
    if (opts.recenter) {
      this.fitViewToContent();
      this.recenterCrosshairs();
      this.emitZoomLevel();
    }
    this.drawingLayer.batchDraw();
    this.checkAndEmitEditState();
    this.emitContextState();

    this.vaultService.currentFilePath = path;
    this.vaultLastModified = (await vault.lastModified(path)) ?? Date.now();
    const dir = this.vaultService.directoryName;
    this.emitFileState(dir ? `${dir}/${path}` : path);
    return true;
  }

  /** Read + parse external style references (and their transitive imports)
   *  out of the vault into `cache`, keyed like the zip resolver. */
  private async gatherVaultStyles(
    refs: ReadonlyArray<string | InlineStyleSet>,
    baseDir: string,
    cache: Map<string, KidrawStyleSet>,
    vault: Vault,
  ): Promise<void> {
    for (const ref of refs) {
      const paths = typeof ref === 'string' ? [ref] : (ref.imports ?? []);
      for (const p of paths) {
        await this.gatherVaultStylePath(p, baseDir, cache, vault);
      }
    }
  }

  private async gatherVaultStylePath(
    path: string,
    baseDir: string,
    cache: Map<string, KidrawStyleSet>,
    vault: Vault,
  ): Promise<void> {
    const key = normalizeArchivePath(path);
    if (cache.has(key)) return;
    let vaultPath: string;
    try {
      vaultPath = normalizeVaultPath(`${baseDir}${key}`);
    } catch {
      return;
    }
    const content = await vault.read(vaultPath);
    if (content === null) return;
    const parsed = parseStyleSetByFilename(content, vaultPath);
    if (!parsed.ok) return;
    cache.set(key, parsed.value);
    for (const importPath of parsed.value.imports ?? []) {
      await this.gatherVaultStylePath(importPath, baseDir, cache, vault);
    }
  }

  private scheduleVaultAutoSave(): void {
    if (!this.vaultService.isConnected || !this.vaultService.currentFilePath) return;
    if (this.vaultSaveTimer !== null) clearTimeout(this.vaultSaveTimer);
    this.vaultSaveTimer = setTimeout(() => {
      this.vaultSaveTimer = null;
      void this.autoSaveToVault();
    }, DrawingAreaComponent.VAULT_AUTOSAVE_DEBOUNCE_MS);
  }

  private cancelVaultAutoSave(): void {
    if (this.vaultSaveTimer !== null) {
      clearTimeout(this.vaultSaveTimer);
      this.vaultSaveTimer = null;
    }
  }

  private async autoSaveToVault(): Promise<void> {
    const path = this.vaultService.currentFilePath;
    if (!path || !this.vaultService.isConnected) return;
    if (await this.writeGraphToVault(path)) {
      this.emitStatus(`Saved: ${path}`);
    }
  }

  private async writeGraphToVault(path: string): Promise<boolean> {
    const vault = this.vaultService.vault;
    if (!vault) return false;
    this.vaultWriteInFlight = true;
    try {
      this.finishTweens();
      const content = this.serializeCurrentGraphSingleFile(path);
      await vault.write(path, content);
      this.vaultService.currentFilePath = path;
      this.vaultLastModified = (await vault.lastModified(path)) ?? Date.now();
      const dir = this.vaultService.directoryName;
      this.emitFileState(dir ? `${dir}/${path}` : path);
      return true;
    } catch (e) {
      this.emitStatus(`Vault save failed: ${(e as Error).message}`);
      return false;
    } finally {
      this.vaultWriteInFlight = false;
    }
  }

  private vaultReloadInFlight = false;

  /** External-change poll: reload the open vault file when something else
   *  (an editor, an LLM) writes it. Local unsaved changes win. */
  private async pollVaultFile(): Promise<void> {
    if (document.hidden || this.vaultWriteInFlight || this.vaultReloadInFlight) return;
    const path = this.vaultService.currentFilePath;
    const vault = this.vaultService.vault;
    if (!path || !vault) return;
    const modified = await vault.lastModified(path);
    if (modified === null || modified <= this.vaultLastModified) return;
    if (this.vaultSaveTimer !== null) {
      // Dirty session: local wins (the pending auto-save will overwrite).
      this.vaultLastModified = modified;
      this.emitStatus(`${path} changed on disk while editing — keeping local changes.`);
      return;
    }
    this.vaultReloadInFlight = true;
    try {
      if (await this.loadVaultFile(path)) {
        this.emitStatus(`Reloaded — ${path} changed on disk.`);
      }
    } finally {
      this.vaultReloadInFlight = false;
    }
  }

  /** Called when a non-vault source replaces the graph: stop auto-saving to
   *  the previously-open vault file. */
  private detachVaultFile(): void {
    this.cancelVaultAutoSave();
    if (this.vaultService.currentFilePath) {
      this.vaultService.currentFilePath = null;
      this.emitStatus('Vault auto-save off — graph is no longer vault-backed.');
    }
    this.emitFileState(null);
  }

  // ─── In-graph search ──────────────────────────────────────────────────────
  // Vim-style: `/` prompts for a query (window.prompt is a placeholder until
  // the trad/large-menu overlay lands) and jumps to the first match; `n` / `p`
  // cycle forward/backward. The query persists so n/p keep working across
  // graph edits — matches are recomputed on every step.

  private searchQuery: string | null = null;
  private lastSearchMatch: SearchMatch | null = null;

  private searchGraph(): void {
    const entered = window.prompt('Search graph:', this.searchQuery ?? '');
    if (entered === null || entered.trim() === '') return;
    this.searchQuery = entered.trim();
    this.lastSearchMatch = null;
    const matches = this.computeSearchMatches();
    if (matches.length === 0) {
      this.emitStatus(`No matches for "${this.searchQuery}"`);
      return;
    }
    this.focusSearchMatch(matches[0], 0, matches.length);
  }

  private searchStep(step: 1 | -1): void {
    if (!this.searchQuery) {
      this.emitStatus('No search yet — press / to search.');
      return;
    }
    const matches = this.computeSearchMatches();
    if (matches.length === 0) {
      this.emitStatus(`No matches for "${this.searchQuery}"`);
      return;
    }
    const currentIndex = this.lastSearchMatch === null
      ? -1
      : matches.findIndex(m => searchMatchesEqual(m, this.lastSearchMatch!));
    const index = currentIndex === -1
      ? (step === 1 ? 0 : matches.length - 1)
      : (currentIndex + step + matches.length) % matches.length;
    this.focusSearchMatch(matches[index], index, matches.length);
  }

  /** All items whose text contains the query (case-insensitive): nodes in
   *  layer order, then edge labels. */
  private computeSearchMatches(): SearchMatch[] {
    const query = (this.searchQuery ?? '').toLowerCase();
    if (query === '') return [];
    const matches: SearchMatch[] = [];
    for (const node of this.drawingLayer.getDANodes()) {
      if (node.label.text().toLowerCase().includes(query)) {
        matches.push({ kind: 'node', node });
      }
    }
    for (const edge of this.drawingLayer.getDAEdges()) {
      for (const label of edge.labels) {
        if (label.label.toLowerCase().includes(query)) {
          matches.push({ kind: 'edge-label', label });
        }
      }
    }
    return matches;
  }

  /** Select the match, move the crosshairs onto it AND recenter the view on
   *  it (pan only, no rescale — the match lands at screen center under the
   *  crosshairs), then report position. */
  private focusSearchMatch(match: SearchMatch, index: number, total: number): void {
    // Land any in-flight tween BEFORE reading positions — a rapid n/p
    // sequence would otherwise pan from a mid-tween layer offset.
    this.finishTweens();
    this.lastSearchMatch = match;
    this.drawingLayer.unselectAll();
    this.unselectAllLabels();

    let text: string;
    let layerCenter: {x: number; y: number};
    if (match.kind === 'node') {
      text = match.node.label.text();
      match.node.isSelected = true;
      layerCenter = this.getNodeCenterInLayerCoordinates(match.node);
    } else {
      text = match.label.label;
      match.label.isSelected = true;
      // Label x/y are already drawing-layer coords (label center).
      layerCenter = {x: match.label.x, y: match.label.y};
    }
    this.centerViewOnLayerPoint(layerCenter);
    this.checkAndEmitEditState();
    this.drawingLayer.batchDraw();
    const shown = text.length > 40 ? `${text.slice(0, 40)}…` : text;
    this.emitStatus(`Match ${index + 1}/${total}: "${shown}"`);
  }

  private saveGraphAs(name: string): void {
    this.finishTweens();
    const snapshot = this.drawingLayer.serializeGraph();
    this.graphStorage.save(name, snapshot);
    this.daOut.emit({ kind: 'status-message', message: `Saved as "${name}"` });
  }

  private loadNamedGraph(snapshot: GraphSnapshot): void {
    this.detachVaultFile();
    this.finishTweens();
    this.unselectAllLabels();
    this.undoRedoService.clear();
    this.drawingLayer.restoreGraph(snapshot);
    const palette = this.visualConfigService.getEffectivePalette(this.themeService.theme);
    this.drawingLayer.applyThemeColors(palette);
    this.fitViewToContent();
    this.recenterCrosshairs();
    this.emitZoomLevel();
    this.checkAndEmitEditState();
    this.openedDoc = null;
    this.openedStyleResolver = null;
    this.activeStyleIndex = 0;
  }

  private newGraph(): void {
    const hasContent = this.drawingLayer.getDANodes().length > 0 || this.drawingLayer.getDAEdges().length > 0;
    if (hasContent && !window.confirm('Start a new graph? This will clear the current diagram.')) return;
    this.detachVaultFile();
    this.finishTweens();
    this.unselectAllLabels();
    this.undoRedoService.clear();
    this.drawingLayer.restoreGraph({ nodes: [], edges: [] });
    // Drop any open-file context so display cycling doesn't reference the
    // previously-loaded doc after a fresh-start.
    this.openedDoc = null;
    this.openedStyleResolver = null;
    this.activeStyleIndex = 0;
    this.recenterCrosshairs();
    this.emitZoomLevel();
    this.checkAndEmitEditState();
  }

  private togglePinSelected() {
    // Waypoints take priority — if any are selected (or hovered under
    // crosshairs), pin/unpin them. Otherwise fall through to node pinning.
    const selectedWps = this.drawingLayer.getSelectedDAWaypoints();
    if (selectedWps.length > 0) {
      const newPinned = !selectedWps.every(wp => wp.pinned);
      selectedWps.forEach(wp => {
        const edge = this.drawingLayer.findEdgeForWaypoint(wp);
        edge?.setWaypointPinned(wp, newPinned);
      });
      this.drawingLayer.batchDraw();
      return;
    }
    const hoveredWp = this.getWaypointUnderCrosshairs();
    if (hoveredWp) {
      const edge = this.drawingLayer.findEdgeForWaypoint(hoveredWp);
      edge?.setWaypointPinned(hoveredWp, !hoveredWp.pinned);
      this.drawingLayer.batchDraw();
      return;
    }

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

    const crossLinks = applyLayout(layout, nodes, edges);
    this.updateEdgesForResizedNodes(allNodes);

    // The layout moved nodes wholesale, so pre-existing unpinned waypoints on
    // affected edges now describe meaningless detours — drop them (pinned
    // waypoints survive setControlPoints) and re-route to fit the new
    // positions. The "-clear" variants keep tree/skeleton edges straight;
    // for the tree-clears the layout hands back the NON-TREE cross-links,
    // whose straight chords legitimately pierce nodes the tree geometry
    // can't move — those still get routed, against everything else frozen.
    const touchedEdges = allEdges.filter(
      e => nodeSet.has(e.srcNode) || nodeSet.has(e.destNode));
    for (const e of touchedEdges) e.setControlPoints([]);
    this.drawingLayer.batchDraw();
    if (isClearLayout(layout)) {
      if (crossLinks.length > 0) {
        this.daOut.emit({kind: 'status-message',
          message: `Layout applied — tree edges straight, routing ${crossLinks.length} cross-link${crossLinks.length === 1 ? '' : 's'}.`});
        this.applyEdgeRouting(
          this.lastAppliedRouting ?? 'incremental-desiderata-v3', crossLinks);
      } else {
        this.daOut.emit({kind: 'status-message', message: 'Layout applied — edges left straight (clear variant).'});
      }
      return;
    }
    this.applyEdgeRouting(
      this.lastAppliedRouting ?? 'incremental-desiderata-v3', touchedEdges);
  }

  private applyEdgeRouting(algorithm: RoutingAlgorithm, explicitEdges?: DAEdge[]) {
    this.finishTweens();
    const allNodes = this.drawingLayer.getDANodes();
    const allEdges = this.drawingLayer.getDAEdges();

    const routeEdges = explicitEdges && explicitEdges.length > 0
      ? explicitEdges
      : this.routingScopeFromSelection(allEdges);
    const routeSet = new Set(routeEdges);
    // When routing only a subset, the other edges stay put but still act as
    // obstacles so the routed edges weave around them rather than overlap.
    const frozenEdges = routeSet.size < allEdges.length
      ? allEdges.filter(e => !routeSet.has(e))
      : [];

    this.routeInWorker(algorithm, allNodes, allEdges, routeEdges, frozenEdges);
  }

  /** What the routing commands act on. Selected edges win; otherwise selected
   *  nodes scope routing to their outgoing edges and, recursively, every edge
   *  reachable from them along outgoing edges (the whole subtree's wiring);
   *  with no selection the whole graph is routed. */
  private routingScopeFromSelection(allEdges: DAEdge[]): DAEdge[] {
    const selectedEdges = allEdges.filter(e => e.isSelected);
    if (selectedEdges.length > 0) return selectedEdges;
    const selectedNodes = this.drawingLayer.getSelectedDANodes();
    if (selectedNodes.length === 0) return allEdges;
    const inScope = new Set<DANode>(selectedNodes);
    let grew = true;
    while (grew) {
      grew = false;
      for (const e of allEdges) {
        if (inScope.has(e.srcNode) && !inScope.has(e.destNode)) {
          inScope.add(e.destNode);
          grew = true;
        }
      }
    }
    return allEdges.filter(e => inScope.has(e.srcNode));
  }

  /** Run the chosen edge-routing algorithm in the Web Worker with a live
   *  countdown and a hard timeout, so a non-converging graph can't freeze the
   *  UI. Falls back to synchronous routing where Worker is unavailable. */
  private routeInWorker(
    algorithm: RoutingAlgorithm,
    allNodes: DANode[], allEdges: DAEdge[], routeEdges: DAEdge[], frozenEdges: DAEdge[],
  ): void {
    this.stopRouting(); // supersede any in-flight run

    if (typeof Worker === 'undefined') {
      this.applyRoutingSync(algorithm, allNodes, allEdges, routeEdges, frozenEdges);
      return;
    }

    const request: RoutingRequest = {
      algorithm,
      nodes: allNodes.map(n => ({
        id: n.id, x: n.konvaGroup.x(), y: n.konvaGroup.y(),
        width: n.NODE_WIDTH, height: n.NODE_HEIGHT, shape: n.nodeShape,
      })),
      routeEdges: routeEdges.map(e => ({ id: e.id, srcId: e.srcNode.id, destId: e.destNode.id })),
      frozenEdges: frozenEdges.map(e => ({
        id: e.id, srcId: e.srcNode.id, destId: e.destNode.id,
        controlPoints: e.controlPoints.map(p => ({ x: p.x, y: p.y })),
      })),
    };

    let worker: Worker;
    try {
      worker = new Worker(new URL('./routing.worker', import.meta.url));
    } catch {
      this.applyRoutingSync(algorithm, allNodes, allEdges, routeEdges, frozenEdges);
      return;
    }
    this.routingWorker = worker;

    worker.onmessage = ({ data }: MessageEvent<RoutingResponse>) => {
      this.stopRouting();
      this.applyRoutedControlPoints(data, allNodes, allEdges);
      this.lastAppliedRouting = algorithm;
      const unclean = data.uncleanEdgeIds?.length ?? 0;
      const message = unclean > 0
        ? `⚠ ${unclean} edge${unclean === 1 ? '' : 's'} could not be routed cleanly.`
        : '';
      this.daOut.emit({ kind: 'status-message', message });
    };
    worker.onerror = () => {
      this.stopRouting();
      this.daOut.emit({ kind: 'status-message', message: '⚠ Layout failed (routing error).' });
    };

    const deadline = Date.now() + DrawingAreaComponent.ROUTING_TIMEOUT_MS;
    const tick = () => {
      const remaining = Math.max(0, deadline - Date.now()) / 1000;
      this.daOut.emit({ kind: 'status-message', message: `Calculating layout… ${remaining.toFixed(1)}s` });
    };
    tick();
    this.routingCountdown = setInterval(tick, 100);
    this.routingDeadline = setTimeout(() => {
      this.stopRouting();
      const secs = DrawingAreaComponent.ROUTING_TIMEOUT_MS / 1000;
      this.daOut.emit({ kind: 'status-message', message: `⚠ Layout gave up after ${secs}s — graph too complex to converge.` });
    }, DrawingAreaComponent.ROUTING_TIMEOUT_MS);

    worker.postMessage(request);
  }

  /** Apply the control points the worker computed onto the live edges. Edges
   *  removed while routing ran are simply skipped. */
  private applyRoutedControlPoints(result: RoutingResponse, allNodes: DANode[], allEdges: DAEdge[]): void {
    this.undoRedoService.pushSnapshot(this.drawingLayer.serializeGraph());
    const byId = new Map(allEdges.map(e => [e.id, e]));
    for (const routed of result.edges) {
      const edge = byId.get(routed.id);
      if (!edge) continue;
      edge.setControlPoints(routed.controlPoints);
      edge.setSmoothRendering(true);
      edge.promoteToWaypoints();
    }
    this.refreshWaypointVisibility(false);
    this.drawingLayer.batchDraw();
    this.lastAppliedRouting = 'desiderata';
    this.metrics.compute(allNodes, allEdges);
  }

  /** Synchronous routing fallback for environments without Web Workers. */
  private applyRoutingSync(
    algorithm: RoutingAlgorithm,
    allNodes: DANode[], allEdges: DAEdge[], routeEdges: DAEdge[], frozenEdges: DAEdge[],
  ): void {
    this.undoRedoService.pushSnapshot(this.drawingLayer.serializeGraph());
    const log = (msg: string) => this.log.log(msg);
    let unclean = 0;
    switch (algorithm) {
      case 'bezier-fit-weighted-chain':
        applyBezierFitWeightedChainEdges(allNodes, routeEdges, BFWC_FIT_DEFAULTS, BFWC_WC_DEFAULTS, log, frozenEdges);
        break;
      case 'incremental-desiderata-v2': {
        const stats = applyIncrementalDesiderataRouteEdges(allNodes, routeEdges, INCREMENTAL_DEFAULTS, log, frozenEdges);
        unclean = stats.uncleanEdges.length;
        break;
      }
      case 'incremental-desiderata-v3': {
        const stats = applyIncrementalDesiderataV3RouteEdges(allNodes, routeEdges, INCREMENTAL_V3_DEFAULTS, log, frozenEdges);
        unclean = stats.uncleanEdges.length;
        break;
      }
      case 'desiderata':
      default:
        applyDesiderataRouteEdges(allNodes, routeEdges, DESIDERATA_DEFAULTS, log, frozenEdges);
        break;
    }
    routeEdges.forEach(e => { e.setSmoothRendering(true); e.promoteToWaypoints(); });
    this.drawingLayer.batchDraw();
    this.lastAppliedRouting = algorithm;
    if (unclean > 0) {
      this.daOut.emit({ kind: 'status-message', message: `⚠ ${unclean} edge${unclean === 1 ? '' : 's'} could not be routed cleanly.` });
    }
    this.metrics.compute(allNodes, allEdges);
  }

  /** Route a just-added edge with incremental-desiderata-v3, holding every
   *  other edge fixed. Synchronous — a single edge routes in milliseconds under
   *  the per-edge budgets. The undo snapshot for the add-edge command is pushed
   *  before the command mutates, so the routed shape is part of the same undo
   *  step as the edge itself. */
  private autoRouteNewEdge(edge: DAEdge): void {
    const clean = routeNewEdgeIncrementally(
      this.drawingLayer.getDANodes(),
      this.drawingLayer.getDAEdges(),
      edge,
      undefined,
      (msg: string) => this.log.log(msg),
    );
    edge.promoteToWaypoints();
    this.refreshWaypointVisibility(false);
    this.drawingLayer.batchDraw();
    if (!clean) {
      this.daOut.emit({ kind: 'status-message', message: '⚠ New edge could not be routed cleanly.' });
    }
  }

  /** Re-route every edge incident to the given nodes with the same single-edge
   *  incremental pipeline used when adding an edge, holding the rest of the
   *  graph fixed. Runs at drag-step granularity (once per grid step, not per
   *  animation frame). Edges are re-routed one at a time, each seeing the
   *  previous ones' fresh routes; pinned user waypoints survive via
   *  setControlPoints' merge. Silent about unclean routes — a status message
   *  every repeat tick would spam; the route keeps improving as the node moves. */
  private rerouteIncidentEdges(nodes: DANode[]): void {
    const incident = new Set<DAEdge>();
    nodes.forEach(n => n.connectedEdges.forEach(e => incident.add(e)));
    if (incident.size === 0) return;
    const allNodes = this.drawingLayer.getDANodes();
    const allEdges = this.drawingLayer.getDAEdges();
    for (const edge of incident) {
      routeNewEdgeIncrementally(allNodes, allEdges, edge, undefined, (msg: string) => this.log.log(msg));
      edge.promoteToWaypoints();
    }
    this.refreshWaypointVisibility(false);
    this.drawingLayer.batchDraw();
  }

  /** Tear down the in-flight routing run: stop the countdown + timeout and kill
   *  the worker. Safe to call when nothing is running. */
  private stopRouting(): void {
    if (this.routingCountdown !== null) { clearInterval(this.routingCountdown); this.routingCountdown = null; }
    if (this.routingDeadline !== null) { clearTimeout(this.routingDeadline); this.routingDeadline = null; }
    if (this.routingWorker) { this.routingWorker.terminate(); this.routingWorker = null; }
  }

  private isRoutingInProgress(): boolean {
    return this.routingWorker !== null;
  }

  private exitLabelEditMode() {
    this.finishTweens();
    this.log.log("case exit-label-edit-mode")
    this.crosshairsLayer.showCrosshairs();
    this.drawingLayer.getSelectedDANodes().forEach(n => n.hideCursor());
    this.getSelectedLabels().forEach(l => l.hideCursor());
    // A label left empty has no visible content — drop it rather than leave
    // an invisible hit-target on the edge.
    this.getSelectedLabels()
      .filter(label => label.label.trim() === '')
      .forEach(label => {
        this.getEdgesContainingLabel(label).forEach(edge => edge.removeLabel(label));
      });
    this.drawingLayer.unselectAll();
    this.unselectAllLabels();
    this.drawingLayer.batchDraw();
  }

  private unselectAll() {
    this.finishTweens();
    this.drawingLayer.unselectAll();
    this.unselectAllLabels();
    // Escape also ends the traversal: drop the navigation focus glow.
    this.setGraphNavEdge(null);
  }

  private insertChar(key: string) {
    this.finishTweens()
    this.crosshairsLayer.hideCrosshairs();
    const resized = this.drawingLayer.appendTextToSelected(key);
    this.updateEdgesForResizedNodes(resized);
    // Also insert into selected labels; re-place from the anchor so a growing
    // box keeps its above/below clearance from the line.
    this.getSelectedLabels().forEach(l => {
      l.insertAtCursor(key);
      this.getEdgeForLabel(l)?.refreshGeometry();
    });
    this.drawingLayer.batchDraw();
  }

  private deleteLastChar() {
    this.finishTweens();
    const resized = this.drawingLayer.deleteBeforeCursorFromSelected();
    this.updateEdgesForResizedNodes(resized);
    // Also delete from selected labels
    this.getSelectedLabels().forEach(l => {
      l.deleteBeforeCursor();
      this.getEdgeForLabel(l)?.refreshGeometry();
    });
    this.drawingLayer.batchDraw();
  }

  private deleteCharAtCursor() {
    this.finishTweens();
    const resized = this.drawingLayer.deleteAtCursorFromSelected();
    this.updateEdgesForResizedNodes(resized);
    this.getSelectedLabels().forEach(l => {
      l.deleteAtCursor();
      this.getEdgeForLabel(l)?.refreshGeometry();
    });
    this.drawingLayer.batchDraw();
  }

  /** Apply a caret motion to everything being edited (selected nodes and
   *  edge labels). Motions never change geometry — just the caret. */
  private moveEditCursor(motion: (target: {
    moveCursorH(d: number): void; moveCursorV(d: number): void;
    cursorToLineStart(): void; cursorToLineEnd(): void;
    cursorWordForward(): void; cursorWordBack(): void;
  }) => void) {
    this.drawingLayer.getSelectedDANodes().forEach(n => motion(n));
    this.getSelectedLabels().forEach(l => motion(l));
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
        this.autoRouteNewEdge(this.drawingLayer.addEdge(srcNode, destNode));
        this.unselectAll();
      } else {
        return;
      }
    } else if (selectedDANodes.length == 1 && daNodesContainingCrosshairs.length == 1) {
      const destNode = daNodesContainingCrosshairs[0];
      const srcNode = selectedDANodes[0];
      if (srcNode === destNode) return; // no self-edges
      this.autoRouteNewEdge(this.drawingLayer.addEdge(srcNode, destNode));
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
      const axis: 'x' | 'y' | null = deltaX !== 0 ? 'x' : deltaY !== 0 ? 'y' : null;

      // 'normal' movement is half a major cell, snapped to the minor grid
      // (minorSpacing is 1/10th of majorSpacing, so 5 minor steps == half a
      // major cell). 'fine' is one minor cell; 'coarse' is ten major cells.
      let spacing: number;
      let steps: number;
      if (tier === 'fine') {
        spacing = minorSpacing;
        steps = 1;
      } else if (tier === 'coarse') {
        spacing = majorSpacing;
        steps = 10;
      } else {
        spacing = minorSpacing;
        steps = axis
          ? this.resolveNormalMovementSteps(axis, axis === 'x' ? Math.sign(deltaX) : Math.sign(deltaY), currentDlX, currentDlY, minorSpacing)
          : 5;
      }
      this.updateCrosshairsProbeShape(axis, tier, minorSpacing, majorSpacing, steps * spacing, scale);

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

  private resolveNormalMovementSteps(
    axis: 'x' | 'y',
    sign: number,
    currentDlX: number,
    currentDlY: number,
    minorSpacing: number,
  ): number {
    const normalSteps = 5;
    const coords = this.collectMovementFeatureCoordinates(axis, currentDlX, currentDlY, minorSpacing);
    if (coords.length < 1) return normalSteps;

    const current = axis === 'x' ? currentDlX : currentDlY;
    const before = coords.filter(c => c < current - 0.01).at(-1);
    const after = coords.find(c => c > current + 0.01);
    if (before !== undefined && after !== undefined) {
      const gapSteps = (after - before) / minorSpacing;
      if (gapSteps <= normalSteps * 2) return 1;
      if (gapSteps <= normalSteps * 3) return 2;
      if (gapSteps <= normalSteps * 4) return 3;
    }

    const next = sign > 0 ? after : before;
    if (next !== undefined) {
      const distanceSteps = Math.abs(next - current) / minorSpacing;
      if (distanceSteps > 1 && distanceSteps < normalSteps) return 1;
    }

    return normalSteps;
  }

  private collectMovementFeatureCoordinates(
    axis: 'x' | 'y',
    currentDlX: number,
    currentDlY: number,
    minorSpacing: number,
  ): number[] {
    const perpendicular = axis === 'x' ? currentDlY : currentDlX;
    const scale = this.drawingLayer.scaleX();
    const radius = axis === 'x'
      ? this.crosshairsLayer.crosshairs.hitRadiusY / scale
      : this.crosshairsLayer.crosshairs.hitRadiusX / scale;
    const tolerance = Math.max(radius, minorSpacing);
    const coords: number[] = [];
    const add = (value: number) => {
      if (Number.isFinite(value)) coords.push(value);
    };
    const spansPerpendicular = (min: number, max: number) =>
      perpendicular >= min - tolerance && perpendicular <= max + tolerance;

    for (const node of this.drawingLayer.getDANodes()) {
      const minX = node.group.x();
      const maxX = minX + node.NODE_WIDTH;
      const minY = node.group.y();
      const maxY = minY + node.NODE_HEIGHT;
      if (axis === 'y' && spansPerpendicular(minX, maxX)) {
        add(minY);
        add(maxY);
      } else if (axis === 'x' && spansPerpendicular(minY, maxY)) {
        add(minX);
        add(maxX);
      }
    }

    for (const edge of this.drawingLayer.getDAEdges()) {
      for (const waypoint of edge.waypoints) {
        const wpPerpendicular = axis === 'x' ? waypoint.y : waypoint.x;
        if (Math.abs(wpPerpendicular - perpendicular) <= tolerance) {
          add(axis === 'x' ? waypoint.x : waypoint.y);
        }
      }
      for (const label of edge.labels) {
        const minX = label.x - label.width / 2;
        const maxX = label.x + label.width / 2;
        const minY = label.y - label.height / 2;
        const maxY = label.y + label.height / 2;
        if (axis === 'y' && spansPerpendicular(minX, maxX)) {
          add(minY);
          add(maxY);
        } else if (axis === 'x' && spansPerpendicular(minY, maxY)) {
          add(minX);
          add(maxX);
        }
      }

      const points = edge.getPathPoints();
      for (let i = 0; i < points.length - 1; i++) {
        const a = points[i];
        const b = points[i + 1];
        const primaryA = axis === 'x' ? a.x : a.y;
        const primaryB = axis === 'x' ? b.x : b.y;
        const perpA = axis === 'x' ? a.y : a.x;
        const perpB = axis === 'x' ? b.y : b.x;
        const dPerp = perpB - perpA;
        if (Math.abs(dPerp) < 0.01) {
          if (Math.abs(perpA - perpendicular) <= tolerance) {
            add(primaryA);
            add(primaryB);
          }
          continue;
        }
        const t = (perpendicular - perpA) / dPerp;
        if (t >= -0.01 && t <= 1.01) {
          add(primaryA + (primaryB - primaryA) * Math.max(0, Math.min(1, t)));
        }
      }
    }

    coords.sort((a, b) => a - b);
    return coords.filter((value, index) => index === 0 || Math.abs(value - coords[index - 1]) > minorSpacing * 0.25);
  }

  private updateCrosshairsProbeShape(
    axis: 'x' | 'y' | null,
    tier: GridTier,
    minorSpacing: number,
    majorSpacing: number,
    stepDistance: number,
    scale: number,
  ): void {
    const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
    let radius: number;
    if (tier === 'fine') {
      radius = clamp(minorSpacing * scale, 5, 12);
    } else if (tier === 'coarse') {
      radius = clamp((majorSpacing * scale) / 2, 18, 42);
    } else {
      radius = clamp(Math.max((stepDistance * scale) / 2, minorSpacing * scale), 6, 22);
    }
    this.crosshairsLayer.setHitRadii(radius, radius);
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
      this.refreshWaypointVisibility(false);
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
    this.refreshWaypointVisibility(false);
  }

  private refreshWaypointVisibility(drawIfChanged = true): void {
    const changed = this.drawingLayer.updateWaypointVisibility(this.getSelectedLabels().length > 0);
    if (changed && drawIfChanged) {
      this.drawingLayer.batchDraw();
    }
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
      totalNodes: this.drawingLayer.getDANodes().length,
      totalEdges: this.drawingLayer.getDAEdges().length,
      defaultNodeShape: this._defaultNodeShape,
      defaultEdgeDirectedness: this._defaultEdgeDirectedness,
      defaultLineStyle: this._defaultLineStyle,
      canUndo: this.undoRedoService.canUndo,
      canRedo: this.undoRedoService.canRedo,
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

  // --- Move-by-graph traversal (see graph-nav.ts for the geometry) ---







  private setGraphNavEdge(edge: DAEdge | null): void {
    if (this.graphNavEdge === edge) return;
    if (this.graphNavEdge) this.graphNavEdge.navFocused = false;
    this.graphNavEdge = edge;
    if (edge) edge.navFocused = true;
    this.drawingLayer.batchDraw();
  }

  // --- Nav popup (TRAVERSE_SMART): IntelliJ-style go-to for the graph ---

  /** Press of the Go key. Always presents every candidate — momentum only
   *  decides the default (top) row, and the move happens on the key's
   *  release. A node with exactly one candidate conceals the popup for half
   *  a second so tap-walking a chain doesn't flash UI; the concealed popup
   *  is fully live (its keyup commit still fires), it's just not painted. */
  private traverseSmart(holdKey?: string): void {
    this.navPopupHoldKey = holdKey ?? null;
    this.finishTweens();
    const source = this.getTraversalAnchorNode();
    if (!source) {
      this.emitStatus('Move the crosshairs onto a node to navigate.');
      return;
    }
    // Free movement to a different node is a cold start.
    if (source !== this.graphNavLastNode) this.navDirection = null;
    const candidates = this.navCandidatesFor(source);
    if (candidates.length === 0) {
      this.emitStatus('No edges here.');
      return;
    }
    this.openNavPopup(source, candidates, this.navDirection ?? 'out',
      candidates.length === 1);
  }

  private navCandidatesFor(source: DANode): NavCandidate[] {
    const out: NavCandidate[] = [];
    for (const edge of source.outgoingEdges) {
      if (edge.destNode !== source) out.push({edge, direction: 'out', other: edge.destNode});
    }
    for (const edge of source.incomingEdges) {
      if (edge.srcNode !== source) out.push({edge, direction: 'in', other: edge.srcNode});
    }
    return out;
  }

  private openNavPopup(source: DANode, candidates: NavCandidate[], forwardDir: 'out' | 'in',
                       concealed = false): void {
    this.clearNavPopupRevealTimer();
    this.navPopupHidden = concealed;
    if (concealed) {
      this.navPopupRevealTimer = window.setTimeout(() => {
        this.navPopupRevealTimer = null;
        this.navPopupHidden = false;
        // The ghost preview is suppressed while concealed (a tap-walk
        // shouldn't flash canvas UI either) — paint it on reveal. The
        // crosshairs go with it: they'd occlude the source ghost.
        this.crosshairsLayer.hideCrosshairs();
        this.crosshairsLayer.batchDraw();
        if (this.navHighlightCand) {
          this.renderNavGhost(this.navHighlightCand);
          this.drawingLayer.batchDraw();
        }
      }, 500);
    } else {
      // Graph navigation owns the canvas: the crosshairs would sit right on
      // the source node, occluding it and the ghost — hide until the
      // popup closes.
      this.crosshairsLayer.hideCrosshairs();
      this.crosshairsLayer.batchDraw();
    }
    const sC = this.getNodeCenterInLayerCoordinates(source);
    const bearing = (c: NavCandidate) => {
      const oC = this.getNodeCenterInLayerCoordinates(c.other);
      const a = Math.atan2(oC.x - sC.x, -(oC.y - sC.y)); // clockwise from 12
      return a < 0 ? a + Math.PI * 2 : a;
    };
    const ordered = [...candidates].sort((a, b) =>
      Number(a.direction !== forwardDir) - Number(b.direction !== forwardDir)
      || bearing(a) - bearing(b));
    const hasForward = ordered.some(c => c.direction === forwardDir);
    this.navCandidates = new Map(ordered.map(c => [c.edge.id, c]));
    this.navSource = source;
    // The popup opens with the top row selected; its highlight emit is
    // deferred, so seed the candidate now for the initial popup placement.
    this.navHighlightCand = ordered[0];
    this.navPopupRows = ordered.map(c => ({
      id: c.edge.id,
      glyph: c.direction === 'out' ? '→' : '←',
      title: (c.other.label?.text() ?? '').trim() || '(unlabeled)',
      subtitle: c.edge.labels.map(l => l.label).filter(t => t.trim()).join(' · ') || undefined,
      tags: [...c.edge.tags, ...c.other.tags],
      secondary: hasForward && c.direction !== forwardDir,
    }));
    this.navPopupDark = this.themeService.theme === 'dark';
    this.emphasizeNavSource(source);
    if (!this.navPopupOpen) {
      this.navPopupOpen = true;
      this.daOut.emit({kind: 'popup-state', open: true});
    }
    this.positionNavPopup();
    this.drawingLayer.batchDraw();
  }

  /** Selection moved in the popup: glow the candidate edge and paint the
   *  ghost preview of where it leads. The view (pan and zoom) never moves —
   *  offscreen destinations are represented by the ghost copy instead. */
  onNavPopupHighlight(edgeId: string): void {
    const cand = this.navCandidates.get(edgeId);
    if (!cand || !this.navSource) return;
    this.navHighlightCand = cand;
    this.setGraphNavEdge(cand.edge);
    if (!this.navPopupHidden) this.renderNavGhost(cand);
    this.positionNavPopup();
    this.drawingLayer.batchDraw();
  }

  onNavPopupCommit(event: {id: string; walk: boolean}): void {
    const cand = this.navCandidates.get(event.id);
    const source = this.navSource;
    this.clearNavGhost();
    this.navHighlightCand = null;
    this.restoreNavSourceEmphasis();
    if (!cand || !source) {
      this.closeNavPopup();
      return;
    }
    if (!event.walk) {
      this.navPopupOpen = false;
      this.navSource = null;
      this.clearNavPopupRevealTimer();
      this.daOut.emit({kind: 'popup-state', open: false});
      this.crosshairsLayer.showCrosshairs();
    }
    this.navCommitTo(source, cand, event.walk);
  }

  /** Escape / backdrop: close without moving. The crosshairs return to the
   *  source node so the traversal anchor stays meaningful. */
  closeNavPopup(): void {
    this.clearNavGhost();
    this.navHighlightCand = null;
    this.restoreNavSourceEmphasis();
    this.crosshairsLayer.showCrosshairs();
    this.setGraphNavEdge(null);
    const source = this.navSource;
    this.navSource = null;
    this.clearNavPopupRevealTimer();
    if (this.navPopupOpen) {
      this.navPopupOpen = false;
      this.daOut.emit({kind: 'popup-state', open: false});
    }
    if (source) {
      const c = this.getNodeCenterInLayerCoordinates(source);
      const scale = this.drawingLayer.scaleX();
      const sx = this.drawingLayer.x() + c.x * scale;
      const sy = this.drawingLayer.y() + c.y * scale;
      if (sx >= 0 && sx <= this.stage.width() && sy >= 0 && sy <= this.stage.height()) {
        this.crosshairsLayer.crosshairs.x = sx;
        this.crosshairsLayer.crosshairs.y = sy;
      } else {
        this.centerViewOnLayerPoint(c);
      }
    }
    this.drawingLayer.batchDraw();
  }

  /** The jump itself. Non-walk: animated recenter onto the destination; the
   *  glow clears — it marks where you're headed, never where you've been.
   *  Walk: snap the view and immediately reopen the popup at the landing
   *  node. Every landing is recorded in the nav history (Ctrl+O / Ctrl+I). */
  private navCommitTo(source: DANode, cand: NavCandidate, walk: boolean): void {
    const dest = cand.other;
    this.recordNavVisit(source.id, dest.id);
    this.graphNavLastNode = dest;
    this.navDirection = cand.direction;
    const sC = this.getNodeCenterInLayerCoordinates(source);
    const dC = this.getNodeCenterInLayerCoordinates(dest);
    const len = Math.hypot(dC.x - sC.x, dC.y - sC.y);
    if (len > 1e-6) this.graphNavMomentum = {x: (dC.x - sC.x) / len, y: (dC.y - sC.y) / len};
    const destLabel = (dest.label?.text() ?? '').trim() || '(unlabeled)';
    this.emitStatus(`${cand.direction === 'out' ? '→' : '←'} ${destLabel}`);
    if (!walk) {
      this.setGraphNavEdge(null);
      this.centerViewOnLayerPoint(dC);
      return;
    }
    // Walk mode: land, then keep browsing from the new node.
    const scale = this.drawingLayer.scaleX();
    this.drawingLayer.position({
      x: this.stage.width() / 2 - dC.x * scale,
      y: this.stage.height() / 2 - dC.y * scale,
    });
    this.crosshairsLayer.crosshairs.x = this.stage.width() / 2;
    this.crosshairsLayer.crosshairs.y = this.stage.height() / 2;
    const candidates = this.navCandidatesFor(dest);
    if (candidates.length === 0) {
      this.emitStatus(`${destLabel}: dead end.`);
      this.closeNavPopup();
      return;
    }
    this.setGraphNavEdge(null);
    this.openNavPopup(dest, candidates, this.navDirection ?? 'out');
  }

  private clearNavPopupRevealTimer(): void {
    if (this.navPopupRevealTimer !== null) {
      window.clearTimeout(this.navPopupRevealTimer);
      this.navPopupRevealTimer = null;
    }
    this.navPopupHidden = false;
  }

  /** Record a nav landing. A new jump truncates any forward history (vim
   *  jumplist semantics); the source is stitched in when the chain broke
   *  (free crosshairs movement between jumps). */
  private recordNavVisit(sourceId: string, destId: string): void {
    if (this.navHistoryIndex < this.navHistory.length - 1) {
      this.navHistory.splice(this.navHistoryIndex + 1);
    }
    if (this.navHistory[this.navHistory.length - 1] !== sourceId) {
      this.navHistory.push(sourceId);
    }
    this.navHistory.push(destId);
    this.navHistoryIndex = this.navHistory.length - 1;
  }

  /** Ctrl+O (delta -1) / Ctrl+I (delta +1): step through the jumplist.
   *  Entries whose nodes have since been deleted are skipped. Stepping
   *  doesn't edit the history — only a new jump truncates it. */
  private navHistoryGo(delta: -1 | 1): void {
    const nodeById = (id: string) =>
      this.drawingLayer.getDANodes().find(n => n.id === id);
    let i = this.navHistoryIndex + delta;
    while (i >= 0 && i < this.navHistory.length && !nodeById(this.navHistory[i])) {
      i += delta;
    }
    if (i < 0 || i >= this.navHistory.length) {
      this.emitStatus(delta < 0
        ? 'Already at the oldest nav position.'
        : 'Already at the newest nav position.');
      return;
    }
    this.navHistoryIndex = i;
    const node = nodeById(this.navHistory[i])!;
    this.finishTweens();
    this.graphNavLastNode = node;
    this.navDirection = null; // arriving by jumplist is a cold start
    this.setGraphNavEdge(null);
    this.centerViewOnLayerPoint(this.getNodeCenterInLayerCoordinates(node));
    const label = (node.label?.text() ?? '').trim() || '(unlabeled)';
    this.emitStatus(`${delta < 0 ? '⟨O⟩ back:' : '⟨I⟩ forward:'} ${label}`);
  }

  private clearNavGhost(): void {
    if (!this.navGhostGroup) return;
    this.navGhostGroup.destroy();
    this.navGhostGroup = null;
  }

  /** Ghost preview of the highlighted candidate: translucent dashed copies
   *  of the source node, a straight edge with its labels, and the
   *  destination node. An offscreen destination's ghost slides along the
   *  source→destination ray until it fits in the viewport, so the bearing
   *  (and therefore the sense of where you're headed) is preserved. The
   *  straight ghost edge may cross real nodes and edges — that's the
   *  accepted cost of keeping it cheap. */
  private renderNavGhost(cand: NavCandidate): void {
    this.clearNavGhost();
    const source = this.navSource;
    if (!source) return;
    const palette = this.visualConfigService.getEffectivePalette(this.themeService.theme);
    const dest = cand.other;
    const scale = this.drawingLayer.scaleX();
    // Ghosts never render below their 100%-zoom size: below that, every
    // ghost dimension (box, text, stroke, labels) is inflated by 1/scale so
    // legibility is independent of how far out the view is. Centers stay at
    // true layer positions — only the ghosts' size is zoom-immune.
    const boost = Math.max(1, 1 / scale);
    // Source box as rendered — the popup's emphasis scales its group.
    const sW = source.NODE_WIDTH * source.group.scaleX();
    const sH = source.NODE_HEIGHT * source.group.scaleY();
    const sC = {x: source.group.x() + sW / 2, y: source.group.y() + sH / 2};
    const dC = this.getNodeCenterInLayerCoordinates(dest);
    const dW = dest.NODE_WIDTH;
    const dH = dest.NODE_HEIGHT;
    // Viewport in layer coordinates, inset so the (boosted) ghost lands
    // fully visible: half the rendered box plus a constant screen margin.
    const lo = {
      x: -this.drawingLayer.x() / scale + dW * boost / 2 + 16 / scale,
      y: -this.drawingLayer.y() / scale + dH * boost / 2 + 16 / scale,
    };
    const hi = {
      x: (this.stage.width() - this.drawingLayer.x()) / scale - dW * boost / 2 - 16 / scale,
      y: (this.stage.height() - this.drawingLayer.y()) / scale - dH * boost / 2 - 16 / scale,
    };
    let g = {x: dC.x, y: dC.y};
    const inside = (p: {x: number; y: number}) =>
      p.x >= lo.x && p.x <= hi.x && p.y >= lo.y && p.y <= hi.y;
    if (!inside(g)) {
      if (inside(sC)) {
        // Slide toward the source along the ray until inside.
        let t = 1;
        const axis = (s: number, d: number, min: number, max: number) => {
          if (d > max) t = Math.min(t, (max - s) / (d - s));
          else if (d < min) t = Math.min(t, (min - s) / (d - s));
        };
        axis(sC.x, dC.x, lo.x, hi.x);
        axis(sC.y, dC.y, lo.y, hi.y);
        g = {x: sC.x + (dC.x - sC.x) * t, y: sC.y + (dC.y - sC.y) * t};
      } else {
        // Source offscreen too (shouldn't happen — it's under the
        // crosshairs): plain clamp is the best we can do.
        g = {
          x: Math.min(Math.max(g.x, lo.x), hi.x),
          y: Math.min(Math.max(g.y, lo.y), hi.y),
        };
      }
    }
    const group = new Konva.Group({listening: false, opacity: 0.8});
    const DASH = [8, 5];
    // Each ghost box is a boost-scaled subgroup anchored on its center, so
    // the contents are laid out at natural (100%-zoom) dimensions.
    const ghostNode = (cx: number, cy: number, w: number, h: number, text: string) => {
      const n = new Konva.Group({
        x: cx, y: cy, offsetX: w / 2, offsetY: h / 2,
        scaleX: boost, scaleY: boost,
      });
      n.add(new Konva.Rect({
        width: w, height: h, cornerRadius: 10,
        fill: palette.nodeFill, stroke: palette.nodeStroke, strokeWidth: 2,
        dash: DASH,
        shadowColor: palette.highlightShadowColor, shadowBlur: 10, shadowOpacity: 0.35,
      }));
      if (text) {
        n.add(new Konva.Text({
          text, width: w, height: h, align: 'center', verticalAlign: 'middle',
          fontSize: 16, fill: palette.nodeText,
        }));
      }
      group.add(n);
    };
    // Straight ghost edge between the two ghost boxes' borders, arrowhead
    // matching the real edge's direction; labels stacked at its midpoint.
    let labelsGroup: Konva.Group | null = null;
    const len = Math.hypot(g.x - sC.x, g.y - sC.y);
    if (len > 1e-6) {
      const u = {x: (g.x - sC.x) / len, y: (g.y - sC.y) / len};
      const border = (cx: number, cy: number, hw: number, hh: number,
                      dx: number, dy: number) => {
        const s = Math.min(
          dx !== 0 ? hw / Math.abs(dx) : Number.POSITIVE_INFINITY,
          dy !== 0 ? hh / Math.abs(dy) : Number.POSITIVE_INFINITY);
        return {x: cx + dx * s, y: cy + dy * s};
      };
      const p0 = border(sC.x, sC.y, sW * boost / 2, sH * boost / 2, u.x, u.y);
      const p1 = border(g.x, g.y, dW * boost / 2, dH * boost / 2, -u.x, -u.y);
      group.add(new Konva.Arrow({
        points: cand.direction === 'out'
          ? [p0.x, p0.y, p1.x, p1.y] : [p1.x, p1.y, p0.x, p0.y],
        stroke: palette.edgeStroke, fill: palette.edgeFill,
        strokeWidth: 2.5 * boost, dash: DASH.map(d => d * boost),
        pointerLength: 12 * boost, pointerWidth: 10 * boost,
      }));
      const texts = cand.edge.labels.map(l => l.label).filter(t => t.trim());
      if (texts.length > 0) {
        // Label stack laid out at natural size around (0,0), boost-scaled
        // as a whole and anchored on the ghost edge's midpoint.
        labelsGroup = new Konva.Group({
          x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2,
          scaleX: boost, scaleY: boost,
        });
        let rowY = 0;
        texts.forEach((t, i) => {
          const txt = new Konva.Text({text: t, fontSize: 12, fill: palette.labelText, padding: 5});
          if (i === 0) rowY = -(texts.length * (txt.height() + 4) - 4) / 2;
          const box = {x: -txt.width() / 2, y: rowY, w: txt.width(), h: txt.height()};
          labelsGroup!.add(new Konva.Rect({
            x: box.x, y: box.y, width: box.w, height: box.h, cornerRadius: 6,
            fill: palette.labelFill, stroke: palette.labelStroke,
            strokeWidth: 1.5, dash: [4, 3],
          }));
          txt.position({x: box.x, y: box.y});
          labelsGroup!.add(txt);
          rowY += box.h + 4;
        });
      }
    }
    ghostNode(sC.x, sC.y, sW, sH, (source.label?.text() ?? '').trim());
    ghostNode(g.x, g.y, dW, dH, (dest.label?.text() ?? '').trim());
    // Labels last: they stay readable even when a short ghost edge tucks
    // them under one of the ghost boxes.
    if (labelsGroup) group.add(labelsGroup);
    this.navGhostGroup = group;
    this.drawingLayer.add(group); // after the node group: ghosts render on top
  }

  /** Beside the source node, on the opposite horizontal side from the
   *  highlighted destination (destination east → popup west), so the popup
   *  never sits between you and where you're going. */
  private positionNavPopup(): void {
    if (!this.navSource) return;
    // Estimates for edge clamping — keep in sync with nav-popup.component.css
    // (width / max-height) and its compact row metrics.
    const POPUP_W = 210;
    const POPUP_H = Math.min(38 + this.navPopupRows.length * 28 + 16, 220);
    const GAP = 14;
    const scale = this.drawingLayer.scaleX();
    const n = this.navSource;
    const rect = {
      x: this.drawingLayer.x() + n.group.x() * scale,
      y: this.drawingLayer.y() + n.group.y() * scale,
      w: n.NODE_WIDTH * scale,
      h: n.NODE_HEIGHT * scale,
    };
    let destEast = true;
    if (this.navHighlightCand) {
      const sC = this.getNodeCenterInLayerCoordinates(n);
      const dC = this.getNodeCenterInLayerCoordinates(this.navHighlightCand.other);
      destEast = dC.x >= sC.x;
    }
    const left = destEast ? rect.x - GAP - POPUP_W : rect.x + rect.w + GAP;
    this.navPopupLeft = Math.max(8, Math.min(left, this.stage.width() - POPUP_W - 8));
    this.navPopupTop = Math.max(8, Math.min(rect.y, this.stage.height() - POPUP_H - 8));
  }

  /** The popup's source node grows a little so it reads as "you are here";
   *  transform restored on close/commit. */
  private emphasizeNavSource(source: DANode): void {
    this.restoreNavSourceEmphasis();
    const g = source.group;
    this.navSourceEmphasis = {node: source, scaleX: g.scaleX(), scaleY: g.scaleY(), x: g.x(), y: g.y()};
    const f = 1.12;
    g.x(g.x() - source.NODE_WIDTH * (f - 1) / 2);
    g.y(g.y() - source.NODE_HEIGHT * (f - 1) / 2);
    g.scaleX(g.scaleX() * f);
    g.scaleY(g.scaleY() * f);
  }

  private restoreNavSourceEmphasis(): void {
    if (!this.navSourceEmphasis) return;
    const e = this.navSourceEmphasis;
    e.node.group.scaleX(e.scaleX);
    e.node.group.scaleY(e.scaleY);
    e.node.group.x(e.x);
    e.node.group.y(e.y);
    this.navSourceEmphasis = null;
  }


  /** `graphNavLastNode`, validated against the live graph (undo/redo,
   *  delete, and load rebuild nodes — a stale reference clears). */
  private validGraphNavLastNode(): DANode | null {
    if (this.graphNavLastNode
        && !this.drawingLayer.getDANodes().includes(this.graphNavLastNode)) {
      this.graphNavLastNode = null;
    }
    return this.graphNavLastNode;
  }



  /** Pan the view (no rescale) so the layer point sits at the stage center,
   *  tweening the crosshairs onto it in step. */
  private centerViewOnLayerPoint(p: {x: number; y: number}): void {
    const scale = this.drawingLayer.scaleX();
    const centerX = this.stage.width() / 2;
    const centerY = this.stage.height() / 2;
    this.tweens.push(new Konva.Tween({
      node: this.drawingLayer,
      duration: this.RECENTER_DURATION,
      x: centerX - p.x * scale,
      y: centerY - p.y * scale,
      easing: Konva.Easings.EaseInOut,
    }).play());
    this.tweens.push(new Konva.Tween({
      node: this.crosshairsLayer.crosshairs.konvaGroup,
      duration: this.RECENTER_DURATION,
      x: centerX,
      y: centerY,
      easing: Konva.Easings.EaseInOut,
      onFinish: () => this.checkResizeHandleProximity(),
    }).play());
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
    this.directedEdgeInProgress = this.drawingLayer.addEdge(this.directedEdgeSource, targetNode);
    this.autoRouteNewEdge(this.directedEdgeInProgress);

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

  /** Explicit Gather (the `Gather` key): a persistent toggle. Pressing it
   *  over the gathered anchor (or with no anchor at all) restores; over a
   *  different node it re-gathers there. */
  private gatherToggle(): void {
    this.finishTweens();
    const anchorNode = this.getTraversalAnchorNode();
    if (this.gatheredNodePositions.size > 0
        && (anchorNode === null || anchorNode === this.gatherAnchor)) {
      if (!this.gatherPinned && this.gatherAnchor !== null) {
        // The nav session auto-gathered this view; the explicit key pins it
        // so it survives leaving the submenu.
        this.gatherPinned = true;
        this.emitStatus('Gather pinned. Ungather restores.');
        return;
      }
      this.restoreGatheredNodes();
      return;
    }
    if (!anchorNode) {
      this.emitStatus('Move the crosshairs onto a node to gather.');
      return;
    }
    this.gatherAround(anchorNode, true);
  }




  /** Everything the gather view needs to know about one neighbor. */
  private collectGatherNeighbors(anchorNode: DANode):
      Map<DANode, {direction: 'in' | 'out'; kind: string; edges: DAEdge[]}> {
    const infos = new Map<DANode, {direction: 'in' | 'out'; kind: string; edges: DAEdge[]}>();
    for (const edge of anchorNode.outgoingEdges) {
      const n = edge.destNode;
      if (n === anchorNode) continue;
      const info = infos.get(n)
        ?? {direction: 'out' as const, kind: edge.tags[0] ?? n.tags[0] ?? '', edges: []};
      info.edges.push(edge);
      infos.set(n, info);
    }
    for (const edge of anchorNode.incomingEdges) {
      const n = edge.srcNode;
      if (n === anchorNode) continue;
      const existing = infos.get(n);
      if (existing) { // edges both ways → counts as 'out'
        existing.edges.push(edge);
        continue;
      }
      infos.set(n, {direction: 'in', kind: edge.tags[0] ?? n.tags[0] ?? '', edges: [edge]});
    }
    return infos;
  }

  /** Gather the anchor's neighborhood into the fisheye view: neighbors keep
   *  their bearings and compress onto a ring (stacking when crowded — see
   *  gather-fisheye.ts), strangers inside the zone are pushed out, and the
   *  wiring is transformed with the nodes so the picture reads as the real
   *  layout sucked in. A temporary view: Ungather restores everything. */
  private gatherAround(anchorNode: DANode, pinned: boolean): void {
    this.finishTweens();
    if (this.gatheredNodePositions.size > 0) {
      this.restoreGatheredNodes(false);
    }

    const infos = this.collectGatherNeighbors(anchorNode);
    if (infos.size === 0) {
      if (pinned) this.emitStatus('Nothing connected to gather.');
      return;
    }
    this.gatherAnchor = anchorNode;
    this.gatherPinned = pinned;

    const protectedNodes = this.gatherProtectedNodes(anchorNode, infos);
    const boxOf = (n: DANode) => {
      const c = this.getNodeCenterInLayerCoordinates(n);
      return {id: n.id, cx: c.x, cy: c.y, halfW: n.NODE_WIDTH / 2, halfH: n.NODE_HEIGHT / 2};
    };
    const neighbors: GatherNeighbor[] = [...infos.entries()].map(([n, i]) => ({
      ...boxOf(n),
      direction: i.direction,
      kind: i.kind,
      protected: protectedNodes.has(n),
    }));
    const plan = planGather(boxOf(anchorNode), neighbors);
    const placedById = new Map(plan.placed.map(p => [p.id, p]));
    const nodeById = new Map([...infos.keys()].map(n => [n.id, n]));

    // Snapshot z-order before restacking piles (restored on ungather).
    this.gatherZOrder = [...this.drawingLayer.getChildren()];

    // Move the neighbors.
    for (const p of plan.placed) {
      const node = nodeById.get(p.id)!;
      this.gatheredNodePositions.set(node, {x: node.group.x(), y: node.group.y()});
      this.tweens.push(new Konva.Tween({
        node: node.group,
        x: p.x - node.NODE_WIDTH / 2,
        y: p.y - node.NODE_HEIGHT / 2,
        duration: 0.3,
        easing: Konva.Easings.EaseInOut,
        onFinish: () => {
          this.updateEdgesForResizedNodes([node]);
          this.drawingLayer.batchDraw();
        },
      }).play());
    }
    // Stack z-order: deepest first, so index 0 renders on top.
    const stackMembers = new Map<string, GatherPlacement[]>();
    for (const p of plan.placed) {
      if (!p.stack) continue;
      const list = stackMembers.get(p.stack.key) ?? [];
      list.push(p);
      stackMembers.set(p.stack.key, list);
    }
    for (const members of stackMembers.values()) {
      [...members].sort((a, b) => b.stack!.index - a.stack!.index)
        .forEach(p => nodeById.get(p.id)!.group.moveToTop());
    }

    // Push non-participants out of the gather zone so nothing near the ring
    // can be mistaken for a neighbor.
    const aC = this.getNodeCenterInLayerCoordinates(anchorNode);
    for (const node of this.drawingLayer.getDANodes()) {
      if (node === anchorNode || infos.has(node)) continue;
      const c = this.getNodeCenterInLayerCoordinates(node);
      const d = Math.hypot(c.x - aC.x, c.y - aC.y);
      const need = plan.clearRadius + Math.hypot(node.NODE_WIDTH, node.NODE_HEIGHT) / 2;
      if (d >= need) continue;
      const ang = d < 1e-6 ? 0 : Math.atan2(c.y - aC.y, c.x - aC.x);
      this.gatheredNodePositions.set(node, {x: node.group.x(), y: node.group.y()});
      this.tweens.push(new Konva.Tween({
        node: node.group,
        x: aC.x + Math.cos(ang) * need - node.NODE_WIDTH / 2,
        y: aC.y + Math.sin(ang) * need - node.NODE_HEIGHT / 2,
        duration: 0.3,
        easing: Konva.Easings.EaseInOut,
        onFinish: () => {
          this.updateEdgesForResizedNodes([node]);
          this.drawingLayer.batchDraw();
        },
      }).play());
    }

    this.scheduleAfterGatherTweens(anchorNode,
      () => this.applyGatherEdgeTreatment(anchorNode, infos, placedById, stackMembers, nodeById));

    if (pinned) {
      const stacked = plan.placed.filter(p => p.stack !== null).length;
      const parts = `${infos.size} neighbor${infos.size === 1 ? '' : 's'}`
        + (stacked > 0 ? ` (${stacked} in ${stackMembers.size} stack${stackMembers.size === 1 ? '' : 's'})` : '');
      this.emitStatus(`Gathered ${parts}. Gather again or Ungather restores.`);
    }
  }

  /** The traversal's next-jump candidate and its bearing-adjacent
   *  siblings — these must never disappear into a stack. */
  private gatherProtectedNodes(
    anchorNode: DANode,
    infos: Map<DANode, {direction: 'in' | 'out'; kind: string; edges: DAEdge[]}>,
  ): Set<DANode> {
    const result = new Set<DANode>();
    let navNext: DANode | null = null;
    if (this.graphNavEdge
        && this.drawingLayer.getDAEdges().includes(this.graphNavEdge)
        && (this.graphNavEdge.srcNode === anchorNode || this.graphNavEdge.destNode === anchorNode)) {
      const other = this.graphNavEdge.srcNode === anchorNode
        ? this.graphNavEdge.destNode : this.graphNavEdge.srcNode;
      if (infos.has(other)) navNext = other;
    }
    if (!navNext) {
      // Same pick Jump Outgoing would make: momentum-aligned, else first
      // clockwise from 12 o'clock.
      const toDest = anchorNode.outgoingEdges.length > 0;
      const candidates = toDest ? anchorNode.outgoingEdges : anchorNode.incomingEdges;
      if (candidates.length > 0) {
        const flows = candidates.map(e =>
          endpointFlowDirection(e.getPathPoints(), toDest ? 'src' : 'dest'));
        const pick = pickEntryCandidate(flows, this.graphNavMomentum);
        if (pick >= 0) {
          const e = candidates[pick];
          const other = e.srcNode === anchorNode ? e.destNode : e.srcNode;
          if (infos.has(other)) navNext = other;
        }
      }
    }
    if (!navNext) return result;
    result.add(navNext);
    const aC = this.getNodeCenterInLayerCoordinates(anchorNode);
    const bearingOf = (n: DANode) => {
      const c = this.getNodeCenterInLayerCoordinates(n);
      return Math.atan2(c.y - aC.y, c.x - aC.x);
    };
    const sorted = [...infos.keys()].sort((a, b) => bearingOf(a) - bearingOf(b));
    const i = sorted.indexOf(navNext);
    if (sorted.length > 1) {
      result.add(sorted[(i + 1) % sorted.length]);
      result.add(sorted[(i - 1 + sorted.length) % sorted.length]);
    }
    return result;
  }

  /** Run `work` just after the gather placement tweens land (finishTweens
   *  fires it synchronously in tests and on interrupt). */
  private scheduleAfterGatherTweens(anchorNode: DANode, work: () => void): void {
    const scheduler = new Konva.Tween({
      node: anchorNode.group,
      duration: 0.32,
      x: anchorNode.group.x(),
      onFinish: work,
    });
    this.tweens.push(scheduler);
    scheduler.play();
  }

  private saveGatherEdgeWiring(edge: DAEdge): void {
    if (!this.gatheredEdgeControlPoints.has(edge)) {
      this.gatheredEdgeControlPoints.set(edge, edge.controlPoints.map(c => ({...c})));
    }
  }

  /** The wiring pass, after placement: anchor↔neighbor edges keep their
   *  shape via the same rotate+scale that moved their node (the "sucked in"
   *  look); stacked edges go straight so a pile reads as one bundle (with
   *  buried labels hidden behind a "…N more labels…" marker); everything
   *  else re-routes incrementally — debounced, so rapid navigation only
   *  pays for the view it rests on. */
  private applyGatherEdgeTreatment(
    anchorNode: DANode,
    infos: Map<DANode, {direction: 'in' | 'out'; kind: string; edges: DAEdge[]}>,
    placedById: Map<string, GatherPlacement>,
    stackMembers: Map<string, GatherPlacement[]>,
    nodeById: Map<string, DANode>,
  ): void {
    const aC = this.getNodeCenterInLayerCoordinates(anchorNode);
    const handled = new Set<DAEdge>();

    for (const [node, info] of infos) {
      const p = placedById.get(node.id);
      if (!p) continue;
      const saved = this.gatheredNodePositions.get(node);
      for (const edge of info.edges) {
        handled.add(edge);
        this.saveGatherEdgeWiring(edge);
        const hasWaypoint = edge.controlPoints.some(cp => cp.waypointId);
        if (p.stack !== null) {
          // A pile is represented by a meta-node (dashed container) and one
          // meta-edge; the member edges hide entirely — labels and waypoint
          // glyphs live inside the edge group and ride along. N overlapping
          // arrowheads never read as N; one arrow into a box labeled ×N
          // does.
          if (edge.group.visible()) {
            edge.group.visible(false);
            this.gatherHiddenEdges.push(edge);
          }
          continue;
        }
        if (hasWaypoint || edge.controlPoints.length === 0 || !saved) {
          edge.setControlPoints([]);
          continue;
        }
        const oldC = {x: saved.x + node.NODE_WIDTH / 2, y: saved.y + node.NODE_HEIGHT / 2};
        const va = {x: oldC.x - aC.x, y: oldC.y - aC.y};
        const vb = {x: p.x - aC.x, y: p.y - aC.y};
        const da = Math.hypot(va.x, va.y);
        if (da < 1e-6) {
          edge.setControlPoints([]);
          continue;
        }
        const scale = Math.hypot(vb.x, vb.y) / da;
        const rot = Math.atan2(vb.y, vb.x) - Math.atan2(va.y, va.x);
        const cos = Math.cos(rot);
        const sin = Math.sin(rot);
        edge.setControlPoints(edge.controlPoints.map(cp => {
          const dx = cp.x - aC.x;
          const dy = cp.y - aC.y;
          return {...cp, x: aC.x + (dx * cos - dy * sin) * scale, y: aC.y + (dx * sin + dy * cos) * scale};
        }));
      }
    }

    // Meta-node + meta-edge per pile: a dashed container around the sheets,
    // one thick arrow into/out of it, the ×N count at its corner, and the
    // top edge's label (plus a "…K more labels…" marker) on the arrow.
    const containerOf = new Map<DANode, Konva.Rect>();
    const pileIds = new Map<Konva.Rect, number>();
    for (const [key, members] of stackMembers) {
      const ordered = [...members].sort((a, b) => a.stack!.index - b.stack!.index);
      const memberNodes = ordered.map(m => nodeById.get(m.id)!);
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const n of memberNodes) {
        minX = Math.min(minX, n.group.x());
        minY = Math.min(minY, n.group.y());
        maxX = Math.max(maxX, n.group.x() + n.NODE_WIDTH);
        maxY = Math.max(maxY, n.group.y() + n.NODE_HEIGHT);
      }
      const PAD = 10;
      const container = new Konva.Rect({
        x: minX - PAD,
        y: minY - PAD,
        width: maxX - minX + 2 * PAD,
        height: maxY - minY + 2 * PAD,
        stroke: '#8a8a8a',
        strokeWidth: 1.5,
        dash: [7, 5],
        cornerRadius: 8,
        fill: 'rgba(138, 138, 138, 0.07)',
        listening: false,
      });
      this.drawingLayer.add(container);
      this.gatherIndicators.push(container);
      pileIds.set(container, pileIds.size);
      for (const n of memberNodes) containerOf.set(n, container);
      // Sheets render inside (above) their container, deepest first.
      [...ordered].reverse().forEach(m => nodeById.get(m.id)!.group.moveToTop());

      const labels: string[] = [];
      for (const m of ordered) {
        for (const edge of infos.get(nodeById.get(m.id)!)?.edges ?? []) {
          for (const label of edge.labels) {
            if (label.label.trim()) labels.push(label.label);
          }
        }
      }
      this.addGatherMetaEdge(anchorNode, container, key.startsWith('in:'), labels);
      this.addGatherStackBadge(container, ordered.length);
    }

    // Everything else touching a moved node. A stacked member's wiring to
    // the wider graph hides with its pile but is not lost: each distinct
    // (pile ↔ endpoint) connection renders as one thin meta-arrow bundled
    // at the container — the fan of individually re-routed member edges
    // was most of the gathered view's noise. Edges between still-individual
    // nodes stay live: stale wiring → incremental re-route, debounced
    // behind the navigation.
    const rest: DAEdge[] = [];
    const bundles = new Map<string, {from: MetaBox; to: MetaBox}>();
    for (const node of this.gatheredNodePositions.keys()) {
      for (const edge of node.connectedEdges) {
        if (handled.has(edge) || rest.includes(edge) || !edge.group.visible()) continue;
        const srcRect = containerOf.get(edge.srcNode);
        const dstRect = containerOf.get(edge.destNode);
        if (!srcRect && !dstRect) {
          rest.push(edge);
          continue;
        }
        edge.group.visible(false);
        this.gatherHiddenEdges.push(edge);
        const sKey = srcRect ? `pile:${pileIds.get(srcRect)}` : `node:${edge.srcNode.id}`;
        const dKey = dstRect ? `pile:${pileIds.get(dstRect)}` : `node:${edge.destNode.id}`;
        if (!bundles.has(`${sKey}->${dKey}`)) {
          bundles.set(`${sKey}->${dKey}`, {
            from: srcRect ? this.gatherMetaBoxOfRect(srcRect) : this.gatherMetaBoxOfNode(edge.srcNode),
            to: dstRect ? this.gatherMetaBoxOfRect(dstRect) : this.gatherMetaBoxOfNode(edge.destNode),
          });
        }
      }
    }
    for (const bundle of bundles.values()) {
      this.addGatherMetaArrow(bundle.from, bundle.to, true);
    }
    if (this.gatherDeferredRouting !== null) {
      clearTimeout(this.gatherDeferredRouting);
      this.gatherDeferredRouting = null;
    }
    if (rest.length > 0) {
      if (this.gatherPinned) this.emitStatus('Gathering…');
      this.gatherDeferredRouting = window.setTimeout(() => {
        this.gatherDeferredRouting = null;
        const allNodes = this.drawingLayer.getDANodes();
        const allEdges = this.drawingLayer.getDAEdges();
        for (const edge of rest) {
          this.saveGatherEdgeWiring(edge);
          edge.setControlPoints([]);
          // Straight first: the router only earns its curves when the
          // straight chord actually pierces a node — a temporary view
          // doesn't need routing polish, it needs calm.
          if (this.straightChordPiercesNode(edge, allNodes)) {
            routeNewEdgeIncrementally(allNodes, allEdges, edge, undefined, (msg: string) => this.log.log(msg));
            edge.promoteToWaypoints();
          }
        }
        this.refreshWaypointVisibility(false);
        this.drawingLayer.batchDraw();
        if (this.gatherPinned) {
          this.emitStatus(`Gathered around ${(this.gatherAnchor?.label?.text() ?? '').trim() || 'node'}.`);
        }
      }, 250);
    }
    this.drawingLayer.batchDraw();
  }

  /** "×N" count badge at the top-right corner of a pile's container: how
   *  many nodes (and edges) are stacked here, since the capped cascade
   *  deliberately looks the same for 4 and 50. */
  private addGatherStackBadge(container: Konva.Rect, size: number): void {
    const badge = new Konva.Text({
      x: container.x() + container.width() - 6,
      y: container.y() - 18,
      text: `×${size}`,
      fontSize: 13,
      fontStyle: 'italic bold',
      fill: '#8a8a8a',
      listening: false,
    });
    this.drawingLayer.add(badge);
    badge.moveToTop();
    this.gatherIndicators.push(badge);
  }

  /** The primary meta-edge: one thick arrow between the anchor's box and a
   *  pile's container, pointing the way all the hidden member edges flow,
   *  carrying the top edge's label and a "…K more labels…" marker on
   *  opposite sides so they never collide. */
  private addGatherMetaEdge(
    anchorNode: DANode,
    container: Konva.Rect,
    incoming: boolean,
    labels: string[],
  ): void {
    const anchorBox = this.gatherMetaBoxOfNode(anchorNode);
    const containerBox = this.gatherMetaBoxOfRect(container);
    const geo = incoming
      ? this.addGatherMetaArrow(containerBox, anchorBox, false)
      : this.addGatherMetaArrow(anchorBox, containerBox, false);
    if (!geo || labels.length === 0) return;

    const mid = {x: (geo.start.x + geo.end.x) / 2, y: (geo.start.y + geo.end.y) / 2};
    const perp = {x: -geo.u.y, y: geo.u.x};
    const put = (text: string, side: number, italic: boolean) => {
      const t = new Konva.Text({
        x: mid.x + perp.x * side,
        y: mid.y + perp.y * side,
        text,
        fontSize: italic ? 11 : 12,
        fontStyle: italic ? 'italic' : 'normal',
        fill: '#8a8a8a',
        listening: false,
      });
      t.offsetX(t.width() / 2);
      t.offsetY(t.height() / 2);
      this.drawingLayer.add(t);
      t.moveToTop();
      this.gatherIndicators.push(t);
    };
    put(labels[0], 16, false);
    if (labels.length > 1) {
      put(`…${labels.length - 1} more label${labels.length === 2 ? '' : 's'}…`, -16, true);
    }
  }

  /** A meta-arrow between two boxes: boundary to boundary, gray direction
   *  gradient (dim source → bright destination, arrowhead in the
   *  destination gray), tip standing off its target, rendered just above
   *  the grid — below nodes and real edges, like wiring should be. `thin`
   *  is the secondary form bundling a pile's connections to the wider
   *  graph. */
  private addGatherMetaArrow(
    from: MetaBox,
    to: MetaBox,
    thin: boolean,
  ): {start: {x: number; y: number}; end: {x: number; y: number}; u: {x: number; y: number}} | null {
    const len = Math.hypot(to.cx - from.cx, to.cy - from.cy);
    if (len < 1e-6) return null;
    const u = {x: (to.cx - from.cx) / len, y: (to.cy - from.cy) / len};
    const start = this.rectBoundaryPoint({x: from.cx, y: from.cy}, from.halfW, from.halfH, u);
    const end = this.rectBoundaryPoint({x: to.cx, y: to.cy}, to.halfW, to.halfH, {x: -u.x, y: -u.y});
    const standoff = thin ? 4 : 6;
    const tip = {x: end.x - u.x * standoff, y: end.y - u.y * standoff};
    const dark = this.themeService.theme === 'dark';
    const grayFrom = dark ? '#5c5c5c' : '#c2c2c2';
    const grayTo = dark ? '#d4d4d4' : '#4d4d4d';
    const arrow = new Konva.Arrow({
      points: [start.x, start.y, tip.x, tip.y],
      stroke: '#8a8a8a',
      strokeLinearGradientStartPoint: {x: start.x, y: start.y},
      strokeLinearGradientEndPoint: {x: tip.x, y: tip.y},
      strokeLinearGradientColorStops: [0, grayFrom, 1, grayTo],
      fill: grayTo,
      strokeWidth: thin ? 2.5 : 5,
      pointerLength: thin ? 10 : 16,
      pointerWidth: thin ? 10 : 16,
      lineCap: 'round',
      opacity: thin ? 0.7 : 0.95,
      listening: false,
    });
    this.drawingLayer.add(arrow);
    arrow.zIndex(1); // above the grid group, below every node and edge
    this.gatherIndicators.push(arrow);
    return {start, end, u};
  }

  private gatherMetaBoxOfNode(n: DANode): MetaBox {
    const c = this.getNodeCenterInLayerCoordinates(n);
    return {cx: c.x, cy: c.y, halfW: n.NODE_WIDTH / 2, halfH: n.NODE_HEIGHT / 2};
  }

  private gatherMetaBoxOfRect(r: Konva.Rect): MetaBox {
    return {cx: r.x() + r.width() / 2, cy: r.y() + r.height() / 2, halfW: r.width() / 2, halfH: r.height() / 2};
  }

  /** Whether the straight chord between an edge's endpoint boxes runs
   *  through any other node's box. */
  private straightChordPiercesNode(edge: DAEdge, allNodes: DANode[]): boolean {
    const a = this.getNodeCenterInLayerCoordinates(edge.srcNode);
    const b = this.getNodeCenterInLayerCoordinates(edge.destNode);
    for (const node of allNodes) {
      if (node === edge.srcNode || node === edge.destNode) continue;
      if (!node.group.visible()) continue;
      if (lineSegmentIntersectsRect(
        a.x, a.y, b.x, b.y,
        node.group.x(), node.group.y(),
        node.group.x() + node.NODE_WIDTH, node.group.y() + node.NODE_HEIGHT,
      )) {
        return true;
      }
    }
    return false;
  }

  /** Where a ray from a box's center exits its (axis-aligned) boundary. */
  private rectBoundaryPoint(
    center: {x: number; y: number},
    halfW: number,
    halfH: number,
    u: {x: number; y: number},
  ): {x: number; y: number} {
    const tx = Math.abs(u.x) < 1e-9 ? Infinity : halfW / Math.abs(u.x);
    const ty = Math.abs(u.y) < 1e-9 ? Infinity : halfH / Math.abs(u.y);
    const t = Math.min(tx, ty);
    return {x: center.x + u.x * t, y: center.y + u.y * t};
  }

  private ungather(): void {
    this.finishTweens();
    if (this.gatheredNodePositions.size === 0) {
      this.emitStatus('Nothing to ungather.');
      return;
    }
    this.restoreGatheredNodes();
  }

  private restoreGatheredNodes(animate = true): void {
    if (this.gatherDeferredRouting !== null) {
      clearTimeout(this.gatherDeferredRouting);
      this.gatherDeferredRouting = null;
    }
    // Hidden pile edges come back; the meta-node/meta-edge overlays go away.
    for (const edge of this.gatherHiddenEdges) {
      edge.group.visible(true);
    }
    this.gatherHiddenEdges = [];
    for (const indicator of this.gatherIndicators) {
      indicator.destroy();
    }
    this.gatherIndicators = [];
    // Original stacking order of the layer (stacks called moveToTop).
    if (this.gatherZOrder) {
      const layer = this.drawingLayer;
      this.gatherZOrder
        .filter(child => child.getParent() === layer)
        .forEach((child, i) => child.zIndex(i));
      this.gatherZOrder = null;
    }
    this.gatherAnchor = null;
    this.gatherPinned = false;

    // Put back the pre-gather wiring exactly (gather re-routed the edges
    // around the temporary arrangement).
    const restoreEdgeWiring = () => {
      for (const [edge, cps] of this.gatheredEdgeControlPoints) {
        edge.restoreControlPoints(cps);
      }
      this.gatheredEdgeControlPoints.clear();
    };

    if (!animate) {
      const moved = [...this.gatheredNodePositions.keys()];
      for (const [node, pos] of this.gatheredNodePositions) {
        node.group.position(pos);
      }
      this.gatheredNodePositions.clear();
      restoreEdgeWiring();
      this.updateEdgesForResizedNodes(moved);
      this.drawingLayer.batchDraw();
      return;
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
    restoreEdgeWiring();
  }

  /** Auto-select the first edge of the given direction on a node, if any. */
  /** Anchor priority: the node you're on (crosshairs), then the traversal's
   *  current node — an in-progress journey continues from where it is — and
   *  only then the selection. A selection is a way to START a journey; it
   *  must not keep hijacking the anchor after the traversal moves on
   *  (checking it first made every Go re-anchor at the selected node,
   *  2026-07-16 dogfood bug). */
  private getTraversalAnchorNode(): DANode | null {
    const nodesUnderCrosshairs = this.getDANodesContainingCrosshairs();
    if (nodesUnderCrosshairs.length > 0) {
      this.log.log('[getTraversalAnchorNode] under crosshairs:', nodesUnderCrosshairs[0].id);
      return nodesUnderCrosshairs[0];
    }

    const navNode = this.validGraphNavLastNode();
    if (navNode) {
      this.log.log('[getTraversalAnchorNode] traversal current node:', navNode.id);
      return navNode;
    }

    const selectedNodes = this.drawingLayer.getSelectedDANodes();
    if (selectedNodes.length > 0) {
      this.log.log('[getTraversalAnchorNode] selected:', selectedNodes[0].id);
      return selectedNodes[0];
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

  private getNodeCenterInLayerCoordinates(node: DANode): {x: number; y: number} {
    return {
      x: node.group.x() + node.NODE_WIDTH / 2,
      y: node.group.y() + node.NODE_HEIGHT / 2,
    };
  }

  private getCrosshairsInLayerCoordinates(): {x: number; y: number} {
    const scale = this.drawingLayer.scaleX();
    return {
      x: (this.crosshairsLayer.crosshairsX() - this.drawingLayer.x()) / scale,
      y: (this.crosshairsLayer.crosshairsY() - this.drawingLayer.y()) / scale,
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

    const resized = targetNodes.filter((node) => node.resizeBy(delta));
    if (resized.length === 0) {
      return;
    }

    // A grown node may now sit on top of its neighbors: push them out of the
    // way (chains included), keeping the resized nodes themselves anchored.
    // Shrinking creates no new overlaps, so the pass is a no-op then.
    const moved = this.resolveOverlapsAround(resized);
    this.updateEdgesForResizedNodes([...resized, ...moved]);
    this.drawingLayer.batchDraw();
  }

  /** Push movable nodes apart until nothing overlaps, treating `anchored` and
   *  pinned nodes as immovable obstacles. Returns the nodes that moved. */
  private resolveOverlapsAround(anchored: DANode[]): DANode[] {
    const all = this.drawingLayer.getDANodes();
    const anchoredSet = new Set(anchored);
    const boxes = all.map(n => ({
      x: n.group.x(),
      y: n.group.y(),
      w: n.NODE_WIDTH,
      h: n.NODE_HEIGHT,
      movable: !anchoredSet.has(n) && !n.pinned,
    }));
    const moved: DANode[] = [];
    for (const i of resolveBoxOverlaps(boxes, this.RESIZE_REFLOW_GAP)) {
      all[i].group.position({x: boxes[i].x, y: boxes[i].y});
      moved.push(all[i]);
    }
    return moved;
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

  /** Insert a user waypoint onto the nearest edge, snapping it to the closest
   *  point on that edge's existing rendered polyline so the line shape doesn't
   *  change. "Nearest" means smallest perpendicular distance from the
   *  crosshairs to any segment of any edge's polyline; the snapped point is
   *  that closest point on that segment. */
  private insertWaypointAtCrosshairs(): void {
    this.finishTweens();
    const layerPt = this.crosshairsInLayerCoords();
    const nearest = this.findNearestEdgeSnap(layerPt);
    if (!nearest) {
      this.daOut.emit({kind: 'status-message', message: 'No edge to attach waypoint to'});
      return;
    }
    this.drawingLayer.unselectAll();
    this.unselectAllLabels();
    const wp = nearest.edge.insertWaypointAt(nearest.point, nearest.segmentIndex);
    wp.isSelected = true;
    this.drawingLayer.batchDraw();
  }

  private crosshairsInLayerCoords(): {x: number; y: number} {
    const scale = this.drawingLayer.scaleX();
    return {
      x: (this.crosshairsLayer.crosshairsX() - this.drawingLayer.x()) / scale,
      y: (this.crosshairsLayer.crosshairsY() - this.drawingLayer.y()) / scale,
    };
  }

  /** Edge whose polyline comes closest to `point`, plus the snapped closest
   *  point on that polyline and the segment index it lies on. `segmentIndex`
   *  is the index into `_controlPoints` at which a new waypoint should be
   *  spliced to split the chosen segment (segment 0 splits before the first
   *  control point; segment k splits between cp[k-1] and cp[k]). Returns
   *  undefined if no edges exist. */
  private findNearestEdgeSnap(point: {x: number; y: number}):
      {edge: DAEdge; point: {x: number; y: number}; segmentIndex: number} | undefined {
    const edges = this.drawingLayer.getDAEdges();
    let bestEdge: DAEdge | undefined;
    let bestSnap: {x: number; y: number} | undefined;
    let bestSeg = 0;
    let bestDist = Infinity;
    for (const edge of edges) {
      const pts = edge.getPathPoints();
      for (let i = 0; i < pts.length - 1; i++) {
        const closest = closestPointOnSeg(point.x, point.y, pts[i].x, pts[i].y, pts[i + 1].x, pts[i + 1].y);
        const d = Math.hypot(closest.x - point.x, closest.y - point.y);
        if (d < bestDist) {
          bestDist = d;
          bestEdge = edge;
          bestSnap = closest;
          bestSeg = i;
        }
      }
    }
    if (!bestEdge || !bestSnap) return undefined;
    return {edge: bestEdge, point: bestSnap, segmentIndex: bestSeg};
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
      this.autoRouteNewEdge(this.drawingLayer.addEdge(srcNode, newNode));
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
      this.autoRouteNewEdge(this.drawingLayer.addEdge(srcNode, newNode));
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

    const hasSelection = this.drawingLayer.getSelectedDANodes().length > 0;
    const nodes = hasSelection
      ? this.drawingLayer.getSelectedDANodes()
      : this.drawingLayer.getDANodes();
    const edges = this.drawingLayer.getDAEdges();

    const box = this.contentBoundingBox(nodes, edges);
    if (!box) return;

    // Calculate the center point of the drawing in layer coordinates
    const centerX = (box.minX + box.maxX) / 2;
    const centerY = (box.minY + box.maxY) / 2;

    const stageWidth = this.stage.width();
    const stageHeight = this.stage.height();

    // With a selection: center on it without changing scale. Without one:
    // this is the "rescue" command — also zoom out (never in past 100%)
    // until the whole graph fits, so it always brings everything on screen.
    let targetScale = this.drawingLayer.scaleX();
    if (!hasSelection) {
      const margin = 0.9;
      const w = Math.max(box.maxX - box.minX, 1);
      const h = Math.max(box.maxY - box.minY, 1);
      const fit = Math.min((stageWidth * margin) / w, (stageHeight * margin) / h);
      targetScale = Math.min(Math.max(fit, 0.02), 1.0);
    }

    const tween = new Konva.Tween({
      node: this.drawingLayer,
      duration: this.RECENTER_DURATION,
      scaleX: targetScale,
      scaleY: targetScale,
      x: stageWidth / 2 - centerX * targetScale,
      y: stageHeight / 2 - centerY * targetScale,
      easing: Konva.Easings.EaseInOut,
      onFinish: () => {
        this.emitZoomLevel();
        const index = this.tweens.indexOf(tween);
        if (index > -1) {
          this.tweens.splice(index, 1);
        }
      }
    });

    this.tweens.push(tween);
    tween.play();
  }

  /** Bounding box of the given items in drawing-layer coordinates, or null
   *  when there is nothing to measure. */
  private contentBoundingBox(nodes: DANode[], edges: DAEdge[]):
      { minX: number; minY: number; maxX: number; maxY: number } | null {
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

    return minX === Infinity ? null : { minX, minY, maxX, maxY };
  }

  /**
   * Instantly fit the whole graph in the viewport: pan to the bounding-box
   * center and zoom out (never in past 100%) until everything fits with a
   * margin. Every load path calls this so an opened graph is always fully
   * on screen. Plain centering is not enough: a couple of outlier nodes put
   * the bbox center in empty space with every cluster off-screen.
   */
  private fitViewToContent(): void {
    const box = this.contentBoundingBox(this.drawingLayer.getDANodes(), this.drawingLayer.getDAEdges());
    if (!box) return;
    const margin = 0.9;
    const w = Math.max(box.maxX - box.minX, 1);
    const h = Math.max(box.maxY - box.minY, 1);
    const fit = Math.min((this.stage.width() * margin) / w, (this.stage.height() * margin) / h);
    // Fitting may go below the interactive MIN_ZOOM — a rescue that stops
    // short of showing the whole graph isn't a rescue. Floor well below it.
    const scale = Math.min(Math.max(fit, 0.02), 1.0);
    this.drawingLayer.scale({ x: scale, y: scale });
    this.drawingLayer.position({
      x: this.stage.width() / 2 - ((box.minX + box.maxX) / 2) * scale,
      y: this.stage.height() / 2 - ((box.minY + box.maxY) / 2) * scale,
    });
    this.drawingLayer.batchDraw();
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

    // If only labels are selected, the movement keys reposition them on
    // their edges: left/right slides along the path (coarse tier jumps
    // between the start/middle/end stops), up/down steps through the
    // above/on/below placement.
    const selectedLabels = this.getSelectedLabels();
    const selectedNodes = this.drawingLayer.getSelectedDANodes();
    const selectedWaypoints = this.drawingLayer.getSelectedDAWaypoints();
    if (selectedLabels.length > 0 && selectedNodes.length === 0 && selectedWaypoints.length === 0) {
      const effectiveTier = tier ?? 'normal';
      selectedLabels.forEach(label => {
        const edge = this.getEdgeForLabel(label);
        if (!edge) return;
        if (axis === 'y') {
          edge.cycleLabelSide(label, sign);
        } else if (effectiveTier === 'coarse') {
          edge.snapLabelToNextStop(label, sign);
        } else {
          const spacing = effectiveTier === 'fine'
            ? this.drawingLayer.getSubGridSpacing()
            : this.drawingLayer.getGridSpacing();
          edge.slideLabelBy(label, sign * spacing);
        }
      });
      this.drawingLayer.batchDraw();
      return;
    }

    // Waypoint-only drag: nudge each selected waypoint by one grid step.
    // No tween/crosshair-pan; waypoint moves are pointwise and snappy.
    if (selectedWaypoints.length > 0 && selectedNodes.length === 0) {
      const majorSpacing = this.drawingLayer.getGridSpacing();
      const minorSpacing = this.drawingLayer.getSubGridSpacing();
      const effectiveTier = tier ?? 'normal';
      const gridSpacing = effectiveTier === 'fine' ? minorSpacing : majorSpacing;
      const steps = effectiveTier === 'coarse' ? 10 : 1;
      const delta = sign * steps * gridSpacing;
      const dx = axis === 'x' ? delta : 0;
      const dy = axis === 'y' ? delta : 0;
      selectedWaypoints.forEach(wp => {
        const edge = this.drawingLayer.findEdgeForWaypoint(wp);
        edge?.moveWaypoint(wp, dx, dy);
      });
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
        // Node(s) landed on their new grid cell: re-route their edges around
        // the changed geometry (same pipeline as adding a new edge).
        this.rerouteIncidentEdges(selectedNodes);
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
          const projected = projectPointToPath(pathPoints, {x: box.cx, y: box.cy});
          this.log.log(`addLabel: anchoring at t=${(projected?.t ?? 0.5).toFixed(3)} on edge ${edge.id}`);
          const label = new DALabel(0, 0, '', undefined, this.drawingLayer.labelColors());
          edge.addLabel(label);
          edge.setLabelAnchor(label, projected?.t ?? 0.5, 'on');
          // Leave only the new label selected so the label-edit mode the
          // keymenu enters on key release types straight into it.
          this.unselectAll();
          label.isSelected = true;
          label.setCursorToEnd();
          label.showCursor();
          this.crosshairsLayer.hideCrosshairs();
          this.drawingLayer.batchDraw();
          this.checkAndEmitEditState();
          this.daOut.emit({kind: 'label-added'});
          return;
        }
      }
    }
    this.log.log('addLabel: no edge found under crosshairs');
  }

  /** Reset carets to the end and show them on everything about to be
   *  edited (nodes and edge labels alike). */
  private showEditCarets(): void {
    this.drawingLayer.getSelectedDANodes().forEach(n => {
      n.setCursorToEnd();
      n.showCursor();
    });
    this.getSelectedLabels().forEach(l => {
      l.setCursorToEnd();
      l.showCursor();
    });
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
       this.showEditCarets();
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
      this.showEditCarets();
      this.drawingLayer.batchDraw();
      this.daOut.emit({kind: "started-label-editing-mode"});
      return;
    }

    const nodes = this.getDANodesContainingCrosshairs();
    this.log.log(`  -> Nodes under crosshairs: ${nodes.length}`);
    if (nodes.length > 0) {
      this.log.log('  -> Found node under crosshairs. Selecting and editing.');
      this.singleItemSelect();
      this.crosshairsLayer.hideCrosshairs();
      this.showEditCarets();
      this.drawingLayer.batchDraw();
      this.daOut.emit({kind: "started-label-editing-mode"});
      return;
    }

    // 3. Nothing selected or hovered -> no-op (user should use insert key instead)
    this.log.log('  -> Nothing targeted. Edit command ignored.');
  }

  /** Selection wins over crosshairs position. Among crosshairs targets, a
   *  node or label beats everything; a waypoint beats the edge it sits on and
   *  counts as 'empty' (the i-key spec says a waypoint gets a node inserted
   *  on top of it, not edge treatment). */
  private computeEditContext(): EditContext {
    const selectedCount =
      this.drawingLayer.getSelectedDANodes().length +
      this.drawingLayer.getSelectedDAEdges().length +
      this.drawingLayer.getSelectedDAWaypoints().length +
      this.getSelectedLabels().length;
    if (selectedCount > 1) return 'multi-select';
    if (selectedCount === 1) return 'single-select';
    if (this.getLabelUnderCrosshairs() || this.getDANodesContainingCrosshairs().length > 0) return 'item';
    if (this.getWaypointUnderCrosshairs()) return 'empty';
    if (this.getDAEdgesContainingCrosshairs().length > 0) return 'edge';
    return 'empty';
  }

  /** Tap of the edit/insert key: context-sensitive default action. The held-key
   *  submenu alternatives (insert node over an item; label/waypoint over an
   *  edge) live in the keymenu, driven by QUERY_EDIT_CONTEXT. */
  private handleEditOrInsert(): void {
    const context = this.computeEditContext();
    this.log.log(`handleEditOrInsert: context=${context}`);
    switch (context) {
      case 'multi-select':
        this.daOut.emit({kind: 'status-message', message: '⚠ Multiple items selected — deselect (Esc) before edit/insert.'});
        return;
      case 'single-select':
        this.focusAndReleaseSelectedItem();
        return;
      case 'item':
        this.handleEditSelected();
        return;
      case 'edge':
        this.daOut.emit({kind: 'status-message', message: 'Edge under crosshairs — hold the edit/insert key to add a label or waypoint.'});
        return;
      case 'empty': {
        this.pushUndoSnapshot({kind: DACommandType.CREATE_NEW_NODE});
        const shape = this._defaultNodeShape;
        this.createNewNode();
        if (shape !== 'junction') {
          this.daOut.emit({kind: 'started-label-editing-mode'});
        }
        return;
      }
    }
  }

  /** Tap of the edit/insert key with exactly one item selected: recenter the
   *  view, move the crosshairs onto the item, and release the selection.
   *  Recenter runs before the crosshairs jump because panning the layer
   *  changes the item's stage position. */
  private focusAndReleaseSelectedItem(): void {
    this.finishTweens();
    this.recenterView();
    this.finishTweens();
    const target = this.selectedItemStagePoint();
    if (target) {
      this.moveCrosshairsBy(
        target.x - this.crosshairsLayer.crosshairsX(),
        target.y - this.crosshairsLayer.crosshairsY(),
      );
    }
    this.drawingLayer.unselectAll();
    this.unselectAllLabels();
    this.drawingLayer.batchDraw();
    this.checkAndEmitEditState();
  }

  /** Stage-coordinate position of the single selected item: node center,
   *  label/waypoint position, or the selected edge's path midpoint. */
  private selectedItemStagePoint(): {x: number; y: number} | null {
    const node = this.drawingLayer.getSelectedDANodes()[0];
    if (node) return this.getNodeCenterInStageCoordinates(node);

    const scale = this.drawingLayer.scaleX();
    const toStage = (p: {x: number; y: number}) => ({
      x: this.drawingLayer.x() + p.x * scale,
      y: this.drawingLayer.y() + p.y * scale,
    });

    const label = this.getSelectedLabels()[0];
    if (label) return toStage({x: label.x, y: label.y});

    const waypoint = this.drawingLayer.getSelectedDAWaypoints()[0];
    if (waypoint) return toStage({x: waypoint.x, y: waypoint.y});

    const edge = this.drawingLayer.getSelectedDAEdges()[0];
    if (edge) {
      const points = edge.getPathPoints();
      if (points.length > 0) return toStage(points[Math.floor(points.length / 2)]);
    }
    return null;
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

  private getLabelUnderCrosshairs(): DALabel | null {
    const box = this.getCrosshairsBBoxInDrawingLayer();

    const edges = this.drawingLayer.getDAEdges();
    for (const edge of edges) {
      for (const label of edge.labels) {
        // Check overlap between crosshairs bbox and label bounding rect
        const labelLeft = label.x - label.width / 2;
        const labelRight = label.x + label.width / 2;
        const labelTop = label.y - label.height / 2;
        const labelBottom = label.y + label.height / 2;

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
    // Priority: waypoints > nodes > edges > labels > crosshairs
    const selectedWaypoints = this.drawingLayer.getSelectedDAWaypoints();
    if (selectedWaypoints.length > 0) {
      selectedWaypoints.forEach(wp => {
        const edge = this.drawingLayer.findEdgeForWaypoint(wp);
        edge?.removeWaypoint(wp);
      });
      this.drawingLayer.batchDraw();
      return;
    }

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
    const wpUnderCrosshairs = this.getWaypointUnderCrosshairs();
    if (wpUnderCrosshairs) {
      const edge = this.drawingLayer.findEdgeForWaypoint(wpUnderCrosshairs);
      edge?.removeWaypoint(wpUnderCrosshairs);
      this.drawingLayer.batchDraw();
      return;
    }

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
      // A cancelled mid-tween step leaves nodes at their final (part-way)
      // position without the step-completion reroute having fired.
      this.rerouteIncidentEdges(this.drawingLayer.getSelectedDANodes());
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
    // Same priority as the rest of the waypoint hit-tests: a label wins over
    // everything; a waypoint overlapping the crosshairs circle wins over the
    // edge underneath it.
    const label = this.getLabelUnderCrosshairs();
    if (label) {
      label.isSelected = !label.isSelected;
      this.drawingLayer.batchDraw();
      return;
    }

    const wp = this.getWaypointUnderCrosshairs();
    if (wp) {
      wp.isSelected = !wp.isSelected;
      this.drawingLayer.batchDraw();
      return;
    }

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
      let applied = false;
      for (const edge of this.drawingLayer.getDAEdges()) {
        const points = edge.getPathPoints();
        for (let i = 0; i < points.length - 1; i++) {
          if (this.lineSegmentIntersectsBox(points[i], points[i + 1], box)) {
            edge.directedness = directedness;
            applied = true;
            break;
          }
        }
      }
      if (!applied) {
        this.daOut.emit({kind: 'status-message', message: 'Select or hover an edge to change directedness'});
        return;
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
      let applied = false;
      for (const edge of this.drawingLayer.getDAEdges()) {
        const points = edge.getPathPoints();
        for (let i = 0; i < points.length - 1; i++) {
          if (this.lineSegmentIntersectsBox(points[i], points[i + 1], box)) {
            edge.lineStyle = lineStyle;
            applied = true;
            break;
          }
        }
      }
      if (!applied) {
        this.daOut.emit({kind: 'status-message', message: 'Select or hover an edge to change line style'});
        return;
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
    const selectedEdges = this.drawingLayer.getSelectedDAEdges();

    if (selectedNodes.length === 0 && selectedEdges.length === 0) {
      this.daOut.emit({kind: 'status-message', message: 'Select a node or edge to change color'});
      return;
    }

    selectedNodes.forEach(n => n.applyColors(colors.node));
    selectedEdges.forEach(e => e.applyColors(colors.edge));

    this.drawingLayer.batchDraw();
  }

  private lineSegmentIntersectsBox(p1: {x: number; y: number}, p2: {x: number; y: number}, box: {minX: number; minY: number; maxX: number; maxY: number}): boolean {
    return lineSegmentIntersectsRect(p1.x, p1.y, p2.x, p2.y, box.minX, box.minY, box.maxX, box.maxY);
  }

}
