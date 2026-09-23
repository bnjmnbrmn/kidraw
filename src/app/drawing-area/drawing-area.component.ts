/**
 * The canvas: everything you see and every command that changes it.
 *
 * This is the orchestrator, not the whole drawing area. It owns the Angular
 * lifecycle, the two Konva layers, command dispatch, selection and mode state,
 * and crosshairs movement. The work itself lives beside it — the shapes in
 * `da-*.ts`, routing and layout in their own pure modules, and subsystems that
 * have earned their own file (`navigation-grid-controller.ts`,
 * `gather-controller.ts`) behind narrow host interfaces.
 *
 * It receives `DACommand`s from the keymenu through AppComponent and answers
 * with `DANotification`s. It never reads a key code: bindings resolve upstream,
 * so the vim and ijkl profiles are the same code with different tables.
 *
 * Still large. When taking something out of it, follow the two controllers
 * above: lend the collaborator a host object with getters, keep this class's
 * own members private, and move the state that belongs to the feature rather
 * than leaving it behind. See ARCHITECTURE.md.
 */
import {AfterViewInit, Component, ElementRef, EventEmitter, HostListener, inject, Input, OnChanges, OnDestroy, Output, SimpleChanges} from '@angular/core';
import { Subscription } from 'rxjs';
import { DemoDataService } from '../services/demo-data.service';
import { ThemeService } from '../services/theme.service';
import { VisualConfigService } from '../services/visual-config.service';
import { DrawingLayer } from './drawing.layer';
import { CrosshairsLayer } from './crosshairs.layer';
import { DANode } from './da-node';
import { DAEdge } from './da-edge';
import { DALabel } from './da-label';
import { DAWaypoint } from './da-waypoint';
import { DACommand, DACommandType, EdgeDirectedness, GridTier, ItemColor, LayoutType, LineStyle, NavTargetKind, NodeShape, RoutingAlgorithm, TaskStatus, TextCursorMode, TextOverflowMode } from './command.model';
import {
  affectsContextState,
  endsNormalMovementGoal,
  isBlockedWhileRouting,
  mutatesGraph,
  showsMovementIndicators,
} from './command-policy';
import { DEFAULT_BOX_SIZE, PlacementAxis, quickAddSpacing } from './quick-add-spacing';
import { clamp, lineSegmentIntersectsRect, Point, topmost, topmostSelection, closestPointOnSegment as closestPointOnSeg } from './utils';
import { boxEdgePoint, ghostLandingPoint } from './nav-ghost-geometry';
import { Axis, AxisKey } from './axis';
import { Camera, Rect } from './camera';
import { Overlay } from './overlay';
import { Viewport } from './viewport';
import { CrosshairsProbe, ProbeBounds } from './crosshairs-probe';
import { Animations } from './animations';
import { FileController, FileHost } from './file-controller';
import { nodeCenterInLayer, nodeCenterInStage, nodeStageRect } from './node-geometry';
import { projectPointToPath } from './edge-label-anchor';
import { linkDirectionsFrom, LinkCardinalDirection, moveLinkQuadrant, NavCandidate, navCandidatesFor, pickEntryCandidate } from './graph-nav';
import { NavPopupComponent, PopupRow } from '../nav-popup/nav-popup.component';
import type {
  AgentCanvasTarget, AgentChange, AgentChangeResult, AgentEdgeInfo, AgentEditMeta, AgentNodeInfo, ClientRect,
} from '../agent/agent-canvas';
import type { GraphOperationApplier } from './graph-operation-applier';
import type { GraphOperation, UndoGroup } from './graph-operations';
import { nextId } from './id-generator';
import { onMathImageLoaded, onMathReady } from './math-images';
import { layeredLayout } from './layered-layout';
import { GatherController, GatherHost } from './gather-controller';
import { NavigationGridController, NavigationGridHost, navigationRayEnd } from './navigation-grid-controller';
import { NavigationGridStop } from './navigation-grid';
import {
  gridSnapStepper,
  nextNormalMovementStep,
  NormalMovementGoal,
  startNormalMovementGoal,
} from './normal-movement';
import {caretVisibilityPanDelta} from './edit-viewport';
import {buildGrowGhostTargets, GrowGhostNodeCenter, GrowGhostTarget} from './grow-ghost-targets';
import {HopDirection, planGrowHop} from './grow-lattice';
import {TextEditingController, TextEditingHost} from './text-editing-controller';
import {NavJourney} from './nav-journey';
import {LinkNavController, LinkNavHost} from './link-nav-controller';
import {NavGhost, NavGhostHost} from './nav-ghost';
import {GrowAim, GrowGhost, GrowGhostHost} from './grow-ghost';
import {GrowPlacement, GrowPlacementDirection, GrowPlacementHost} from './grow-placement';
import {navPopupRows, orderNavCandidates} from './nav-popup-model';
import {placePopup, popupSize} from './nav-popup-layout';


/** What the crosshairs are resting on, and the trace drawn around it.
 *  `trace` is null when the item is shown by a navigation landing ghost. */
interface CrosshairHover {
  kind: 'label' | 'waypoint' | 'node' | 'edge';
  id: string;
  trace: Konva.Shape | null;
  node?: DANode;
  ghostReasons?: string[];
}

/** The look every hover trace shares, resolved for the current zoom. */
interface HoverTraceStyle {
  scale: number;
  pad: number;
  common: Konva.ShapeConfig;
}

/** The grid a movement step measures itself against, at the current zoom. */
interface MovementGrid {
  scale: number;
  /** Major grid spacing, in layer units. */
  major: number;
  /** Sub-grid spacing, in layer units. */
  minor: number;
}

/** One way out of the nav popup's source node. */
import { DANotification } from './da-notification.model';
import { Observable } from 'rxjs';
import Konva from 'konva';
import type { TweenConfig } from 'konva/lib/Tween';
import { DebugLogService } from '../services/debug-log.service';
import { UndoRedoService } from './undo-redo.service';
import { applyLayout, isClearLayout, layoutSpacingFor } from './graph-layout';
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
import { VaultService } from '../services/vault.service';
import { resolveIdentity } from '../extensions/extension-registry';
import { applyExclusiveTag } from '../extensions/tag-groups';
import { GraphStorageService } from '../services/graph-storage.service';
import { GraphSnapshot } from './graph-snapshot';
import { CommandHandlers, CommandSlice, mergeCommandSlices, runCommand } from './command-handlers';
import { AreaSelect, AreaSelectHost } from './area-select';
import { KeyboardDrag, KeyboardDragHost } from './keyboard-drag';
import { GraphSearch, GraphSearchHost } from './graph-search';


@Component({
  selector: 'app-drawing-area',
  imports: [NavPopupComponent],
  templateUrl: './drawing-area.component.html',
  styleUrl: './drawing-area.component.css'
})
export class DrawingAreaComponent implements AfterViewInit, OnChanges, OnDestroy, AgentCanvasTarget {

  @Input({required: true}) commands!: Observable<DACommand>;
  /** Screen-space strip on each edge that a DOM overlay covers: the compact
   *  keymenu on its docked side, the floating keyboard card along the
   *  bottom. The stage still spans the full area — the canvas shows through
   *  the translucent panel — but every viewport decision uses the *usable*
   *  rectangle instead, so content is never centered, fitted, or parked
   *  underneath the panel. */
  @Input() viewportInset: {left: number; right: number; top: number; bottom: number} =
    {left: 0, right: 0, top: 0, bottom: 0};
  @Output() daOut = new EventEmitter<DANotification>()
  @Output() zoomLevel = new EventEmitter<number>()
  @Output() movementSpeedChange = new EventEmitter<number>()
  @Output() canEditChange = new EventEmitter<boolean>();
  private componentNE = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private resizeObserver!: ResizeObserver;
  private crosshairsLayer!: CrosshairsLayer;
  private drawingLayer!: DrawingLayer;
  private stage!: Konva.Stage;
  /** Every animation in flight — tweens and the drag loop (animations.ts). */
  private readonly animations = new Animations();
  private demoDataService = inject(DemoDataService);
  private log = inject(DebugLogService);
  private themeService = inject(ThemeService);
  private visualConfigService = inject(VisualConfigService);
  private metrics = inject(RoutingMetricsService);
  private draftStorage = inject(DraftStorageService);
  private fileIo = inject(FileIoService);
  private graphStorage = inject(GraphStorageService);
  private vaultService = inject(VaultService);
  private themeSub?: Subscription;
  private visualSub?: Subscription;
  private hasDragged = false;
  private wasAlreadySelectedBeforeDrag = false;
  private undoRedoService = new UndoRedoService();
  private dragSnapshotCaptured = false;
  private textEditSnapshotCaptured = false;
  private _defaultNodeShape: NodeShape = 'box';
  private _defaultEdgeDirectedness: EdgeDirectedness = 'directed';
  private _defaultLineStyle: LineStyle = 'solid';
  private resizeTargetNode: DANode | null = null;
  /** The fisheye gather view (gather-controller.ts). Its state lives with it;
   *  the drawing area only lends it the layer, the tweens and the nav context. */
  private readonly gather = new GatherController(this.gatherHost());
  /** The stage↔layer transform (camera.ts). Reads the drawing layer
   *  lazily, because that layer is built in ngAfterViewInit. */
  private readonly camera = new Camera(() => this.drawingLayer);
  /** The stage minus whatever the UI overlays cover (viewport.ts). */
  private readonly viewport = new Viewport(() => this.stage, () => this.viewportInset);
  /** Files, the vault, named graphs and display (file-controller.ts). */
  private readonly fileController = new FileController(this.fileHost());
  private readonly textEditor = new TextEditingController(this.textEditingHost());
  private readonly areaSelect = new AreaSelect(this.areaSelectHost());
  private readonly keyboardDrag = new KeyboardDrag(this.keyboardDragHost());
  private readonly search = new GraphSearch(this.graphSearchHost());
  /** What the crosshairs are on (crosshairs-probe.ts). */
  private readonly probe = new CrosshairsProbe(
    () => this.drawingLayer, () => this.crosshairsLayer, this.camera);
  /** Move-by-node and its overlay (navigation-grid-controller.ts). */
  private readonly navGrid = new NavigationGridController(this.navigationGridHost());
  /** Labelable node created by the held insert hub. It is focused only when
   *  the hold ends, after the optional drag phase has established its final
   *  position. */
  private pendingNodeLabelEdit: DANode | null = null;
  private gridFadeTimeout: number | null = null;
  private gridInitialized = false;
  /** Ordinary hjkl movement follows this fixed line until the axis changes
   *  or the movement indicators time out. */
  private normalMovementGoal: NormalMovementGoal | null = null;
  private readonly goalLine = new Overlay<Konva.Line>(() => this.drawingLayer);
  /** Dashed crosshair-colored trace around the single top-priority graph item
   *  currently under the crosshairs. This is intentionally separate from
   *  selection state and is never serialized. */
  private readonly hoverTrace = new Overlay<Konva.Shape>(() => this.drawingLayer);
  private crosshairHoverRefreshTimer: number | null = null;
  /** Screen-space copy of one edited node at low graph zoom. The real node
   *  remains in place; this lens keeps its text and caret readable. */
  private readonly labelEditGhost = new Overlay<Konva.Group>(() => this.crosshairsLayer);
  /** Destination scale of an in-flight focus zoom (da-198): the edit lens
   *  evaluates legibility against this rather than the animating scale. */
  private focusZoomTargetScale: number | null = null;
  /** Natural-scale copy of the node currently reached by crosshair
   *  navigation, shown only when the real node is not fully readable. */
  private readonly navigationLandingGhost = new Overlay<Konva.Group>(() => this.crosshairsLayer);

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
  /** Nominal size of a ghosted node — the box stands in for a node that does
   *  not exist yet and so cannot be measured. */
  /** Preserve closer views, but never label a new node below natural scale. */
  private static readonly NODE_EDIT_MIN_ZOOM = 1;
  /** Where the camera goes when a label is opened for editing: natural size,
   *  so the text is readable without losing the graph around it. A closer
   *  view is kept. (Was 400%, which Ben found too close, 2026-09-19.) */
  private static readonly NODE_EDIT_ZOOM = 1;
  /** Stage-pixel radius within which the crosshairs count as standing on a
   *  traversal stop (label/waypoint pseudo-node). */
  private headingRadians = -Math.PI / 2;
  private steeringMoveDistance = this.CROSSHAIRS_MOVEMENT_DISTANCE;
  /** Where traversal has been and which way it was going: momentum, the
   *  current node, the focused edge and the jumplist (nav-journey.ts).
   *  Move by Link and the nav popup share it, so one continues the other. */
  private readonly journey = new NavJourney();
  /** The held, popup-free Move by Link mode (link-nav-controller.ts). */
  private readonly linkNav = new LinkNavController(this.linkNavHost());

  // --- Nav popup state (template bindings + open-session bookkeeping) ---
  navPopupOpen = false;
  navPopupRows: PopupRow[] = [];
  navPopupLeft = 0;
  navPopupTop = 0;
  navPopupDark = false;
  /** Physical key that fired Go, if still held — releasing it over the
   *  popup's search pseudo-item starts filtering. */
  navPopupHoldKey: string | null = null;
  navPopupStartFilter = false;
  navPopupSelectedId: string | null = null;
  navPopupDirectionKeys = {up: 'k', left: 'h', down: 'j', right: 'l'};
  /** Who owns the popup right now: graph navigation or the grow-target search. */
  private navPopupPurpose: 'nav' | 'grow-target' | 'grow-type' = 'nav';
  /** True while a single-candidate popup is concealed (first 500 ms of a
   *  hold — a quick tap walks the chain without flashing UI). */
  navPopupHidden = false;
  private navPopupRevealTimer: number | null = null;
  private navCandidates = new Map<string, NavCandidate>();
  private navSource: DANode | null = null;
  /** Original transform of the popup's enlarged source node. */
  private navSourceEmphasis: {node: DANode; scaleX: number; scaleY: number; x: number; y: number} | null = null;
  /** The candidate currently highlighted in the popup — drives the ghost
   *  preview and which side of the source the popup sits on. */
  private navHighlightCand: NavCandidate | null = null;
  /** Initial row highlighting is only a preview; the first directional key
   *  establishes the geometric edge focus. */
  private navDirectionalFocus = false;
  /** Translucent dashed preview of the highlighted candidate (copies of the
   *  source node, a straightened edge + labels, and the destination node
   *  pulled into the viewport). The view itself never moves while browsing. */
  /** The popup's jump preview (nav-ghost.ts). */
  private readonly navGhost = new NavGhost(this.navGhostHost());

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
      if (this.normalMovementGoal) this.redrawNormalMovementGoalLine();
      this.linkNav.redraw();
      this.refreshCrosshairHoverHighlight();
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
    // Math in labels lays out as TeX source until MathJax has loaded, then again at its real size.
    this.mathUnsubscribes = [
      onMathReady(() => this.relayoutMathLabels()),
      onMathImageLoaded(() => {
        this.drawingLayer.batchDraw();
        this.crosshairsLayer?.batchDraw();
      }),
    ];
    this.watchUserViewChanges();
    this.crosshairsLayer = new CrosshairsLayer(this.stage, effectivePalette().crosshairsStroke);
    this.stage.add(this.crosshairsLayer);

    this.crosshairsLayer.setHeading(this.headingRadians);
    this.crosshairsLayer.setHeadingVisible(false);

    // Restore the localStorage draft (v2 schema; auto-migrates v1).
    const draft = this.draftStorage.load();
    if (draft) {
      try {
        const snapshot = this.draftStorage.draftToSnapshot(draft);
        this.drawingLayer.restoreGraph(snapshot);
        this.drawingLayer.applyThemeColors(effectivePalette());
        // Keep the user's place across a refresh; fall back to fit only
        // when the draft predates viewport persistence. Stash it so the
        // vault reopen (initVault) honors it instead of re-fitting.
        this.fileController.noteStartupDraftView(draft.view ?? null);
        if (!this.restoreViewport(draft.view) && snapshot.nodes.length > 0) {
          this.fitViewToContent();
        }
      } catch {
        // Ignore corrupt stored data
      }
    }

    this.commands.subscribe(this.handleCommand.bind(this));

    // Auto-save on page unload
    this._beforeUnloadHandler = () => this.saveGraphToStorage();
    window.addEventListener('beforeunload', this._beforeUnloadHandler);

    // Vault: restore the stored directory grant and re-open the last file.
    void this.initVault();

    // Emit initial zoom level and context state
    this.emitZoomLevel();
    this.emitMovementSpeed();
    this.emitContextState();
    this.refreshCrosshairHoverHighlight();

    this.resizeObserver = new ResizeObserver(() => {
      this.stage.width(this.componentNE.offsetWidth);
      this.stage.height(this.componentNE.offsetHeight);
      if (this.navGrid.visible) this.navGrid.redrawNodeGrid();
      this.linkNav.redraw();
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
  /** Graph-local clipboard: the last copied/cut subgraph. Not the system
   *  clipboard, and deliberately not persisted with the draft. */
  private clipboard: GraphSnapshot | null = null;
  /** True while a key that owns the view is held (Pan/Zoom). The idle fade
   *  is suspended for the duration — you cannot aim a pan at something you
   *  cannot see (da-257). */
  private crosshairsHeldVisible = false;
  private routingWorker: Worker | null = null;
  private routingCountdown: ReturnType<typeof setInterval> | null = null;
  private routingDeadline: ReturnType<typeof setTimeout> | null = null;
  private static readonly ROUTING_TIMEOUT_MS = 15000;

  ngOnInit(): void {
  }

  private _beforeUnloadHandler?: () => void;

  ngOnDestroy(): void {
    this.stopRouting();
    this.navGrid.cancelQuadrantGoalRayFade();
    this.themeSub?.unsubscribe();
    this.visualSub?.unsubscribe();
    if (this._beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this._beforeUnloadHandler);
    }
    this.fileController.dispose();
    if (this.crosshairHoverRefreshTimer !== null) {
      clearTimeout(this.crosshairHoverRefreshTimer);
    }
    this.linkNav.clear();
    this.clearLabelEditGhost(false);
    this.clearNavigationLandingGhost(false);
    this.hoverTrace.clear(false);
    this.areaSelect.dispose();
    this.mathUnsubscribes.forEach(unsubscribe => unsubscribe());
  }

  private mathUnsubscribes: (() => void)[] = [];

  /** MathJax has loaded: labels with math take their real size. */
  private relayoutMathLabels(): void {
    const resized: DANode[] = [];
    for (const node of this.drawingLayer.getDANodes()) {
      if (node.labelFormat === 'markdown' && node.label.text().includes('$') && node.applyTextOverflow()) {
        resized.push(node);
      }
    }
    this.updateEdgesForResizedNodes(resized);
    this.drawingLayer.batchDraw();
    this.refreshLabelEditGhost();
  }

  private canEdit = false;

  private checkAndEmitEditState() {
    this.setCanEdit(this.hasTextBearingSelection() || this.isOverEditableItem());
  }

  /** Something selected that carries text of its own. */
  private hasTextBearingSelection(): boolean {
    return this.drawingLayer.getSelectedDANodes().length > 0 ||
      this.getSelectedLabels().length > 0;
  }

  /** The crosshairs are resting on something editable in place. */
  private isOverEditableItem(): boolean {
    return this.getLabelUnderCrosshairs() !== null ||
      this.getDANodesContainingCrosshairs().length > 0;
  }

  /** Tell the header only when the answer changes. */
  private setCanEdit(canEdit: boolean): void {
    if (this.canEdit === canEdit) return;
    this.canEdit = canEdit;
    this.canEditChange.emit(canEdit);
  }

  private pushUndoSnapshot(command: DACommand): void {
    const kind = command.kind;

    // Drag coalescing: only snapshot on first drag command per session
    if (kind === DACommandType.DRAG_SELECTED_LEFT ||
        kind === DACommandType.DRAG_SELECTED_RIGHT ||
        kind === DACommandType.DRAG_SELECTED_UP ||
        kind === DACommandType.DRAG_SELECTED_DOWN) {
      // Area-select steps only change selection state, never geometry —
      // they don't belong in the undo history.
      if (this.areaSelect.active) return;
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

  /**
   * The one entry point for every command the keymenu sends.
   *
   * Policy first, effect second: refuse what routing has locked, retire the
   * movement goal line, snapshot for undo, raise the movement overlay. Then
   * the command's handler performs it, and `afterCommand` settles what every
   * command leaves behind.
   */
  private handleCommand(command: DACommand) {
    this.log.log("handleCommand - " + JSON.stringify(command));

    if (this.isRoutingInProgress() && isBlockedWhileRouting(command.kind)) {
      this.daOut.emit({ kind: 'status-message', message: 'Layout is running; graph edits are locked.' });
      return;
    }

    if (endsNormalMovementGoal(command)) {
      this.clearNormalMovementGoal();
    }
    if (mutatesGraph(command.kind)) {
      this.pushUndoSnapshot(command);
    }
    if (showsMovementIndicators(command.kind)) {
      this.showMovementIndicators();
    }

    runCommand(this.commandHandlers, command);
    this.afterCommand(command);
  }

  // ── Command handlers: one slice per owner (see command-handlers.ts) ──
  // A handler performs its command's own effect and nothing else; the policy
  // around every command lives in `handleCommand`.

  private _commandHandlers?: CommandHandlers;

  /** Every command's handler. Built on first use rather than by a field
   *  initialiser, which specs that build the component with `Object.create`
   *  would skip. */
  private get commandHandlers(): CommandHandlers {
    return this._commandHandlers ??= mergeCommandSlices(
      this.crosshairsCommands(), this.graphNavigationCommands(), this.linkNav.commands(), this.navGrid.commands(),
      this.search.commands(), this.viewCommands(), this.selectionCommands(),
      this.structureCommands(), this.textEditingCommands(), this.textEditor.commands(),
      this.styleCommands(), this.layoutCommands(), this.gather.commands(), this.fileController.commands(),
      this.editMenuCommands(), this.diagramTypeCommands(), this.shellCommands(),
    );
  }

  /** A handler that runs `run`, then tells the keymenu whether editing is
   *  possible now — for commands that change what editing would act on. */
  private thenEmitEditState<C>(run: (command: C) => void): (command: C) => void {
    return command => {
      run(command);
      this.checkAndEmitEditState();
    };
  }

  /** Moving the crosshairs freely: by distance, by heading, and showing them. */
  private crosshairsCommands() {
    return {
      [DACommandType.MOVE_CROSSHAIRS_LEFT]: c => this.moveCrosshairsLeft(c.gridTier),
      [DACommandType.MOVE_CROSSHAIRS_DOWN]: c => this.moveCrosshairsDown(c.gridTier),
      [DACommandType.MOVE_CROSSHAIRS_RIGHT]: c => this.moveCrosshairsRight(c.gridTier),
      [DACommandType.MOVE_CROSSHAIRS_UP]: c => this.moveCrosshairsUp(c.gridTier),
      [DACommandType.STEER_FORWARD]: () => this.steerForward(),
      [DACommandType.STEER_BACKWARD]: () => this.steerBackward(),
      [DACommandType.STRAFE_LEFT]: () => this.strafeLeft(),
      [DACommandType.STRAFE_RIGHT]: () => this.strafeRight(),
      [DACommandType.ROTATE_HEADING_LEFT]: () => this.rotateHeadingLeft(),
      [DACommandType.ROTATE_HEADING_RIGHT]: () => this.rotateHeadingRight(),
      [DACommandType.INCREASE_MOVE_SPEED]: () => this.increaseMoveSpeed(),
      [DACommandType.DECREASE_MOVE_SPEED]: () => this.decreaseMoveSpeed(),
      [DACommandType.SHOW_CROSSHAIRS]: () => this.holdCrosshairsVisible(),
      [DACommandType.RELEASE_CROSSHAIRS]: () => this.releaseCrosshairsVisible(),
    } satisfies CommandSlice;
  }

  /** Moving along the graph: smart traverse, the walk's history, and
   *  snapping to the nearest node. (Move by Link and move by node bring their
   *  own commands.) */
  private graphNavigationCommands() {
    return {
      [DACommandType.TRAVERSE_SMART]: c => this.traverseSmart(c.keys),
      [DACommandType.NAV_HISTORY_BACK]: () => this.navHistoryGo(-1),
      [DACommandType.NAV_HISTORY_FORWARD]: () => this.navHistoryGo(1),
      [DACommandType.SNAP_TO_NEAREST_NODE]: () => this.snapToNearestNode(),
    } satisfies CommandSlice;
  }

  /** The view: zoom, pan, and recentring. */
  private viewCommands() {
    return {
      [DACommandType.ZOOM_IN]: () => this.zoomIn(),
      [DACommandType.ZOOM_OUT]: () => this.zoomOut(),
      [DACommandType.PAN_LEFT]: c => this.panViewport(this.panDistance(c), 0),
      [DACommandType.PAN_RIGHT]: c => this.panViewport(-this.panDistance(c), 0),
      [DACommandType.PAN_UP]: c => this.panViewport(0, this.panDistance(c)),
      [DACommandType.PAN_DOWN]: c => this.panViewport(0, -this.panDistance(c)),
      [DACommandType.RECENTER_VIEW]: this.thenEmitEditState(() => this.recenterViewAndCrosshairs()),
      [DACommandType.RECENTER_CROSSHAIRS]: this.thenEmitEditState(() => this.recenterCrosshairs()),
      [DACommandType.RECENTER_VIEW_ON_CROSSHAIRS]: () => this.recenterViewOnCrosshairs(),
    } satisfies CommandSlice;
  }

  /** How far one pan step goes: the command's own distance, else one
   *  crosshairs step. */
  private panDistance(command: {distance?: number}): number {
    return command.distance ?? this.CROSSHAIRS_MOVEMENT_DISTANCE;
  }

  /** Selecting, and dragging what is selected. */
  private selectionCommands() {
    return {
      [DACommandType.MULTI_ITEM_SELECT]: this.thenEmitEditState(() => this.multiItemSelect()),
      [DACommandType.UNSELECT_ALL]: this.thenEmitEditState(() => this.unselectAll()),
      [DACommandType.ENTER_DRAG_MODE]: () => this.enterDragMode(),
      [DACommandType.DRAG_SELECTED_LEFT]: c => this.dragKey(Axis.X, -1, c.gridTier),
      [DACommandType.DRAG_SELECTED_RIGHT]: c => this.dragKey(Axis.X, 1, c.gridTier),
      [DACommandType.DRAG_SELECTED_UP]: c => this.dragKey(Axis.Y, -1, c.gridTier),
      [DACommandType.DRAG_SELECTED_DOWN]: c => this.dragKey(Axis.Y, 1, c.gridTier),
      [DACommandType.EXIT_DRAG_MODE]: () => this.exitDragMode(),
    } satisfies CommandSlice;
  }

  /** Adding, connecting and removing nodes, edges, labels and waypoints. */
  private structureCommands() {
    return {
      [DACommandType.CREATE_NEW_NODE]: c => this.createNewNode(c.nodeShape),
      [DACommandType.QUICK_ADD]: () => this.handleQuickAdd(),
      [DACommandType.ENTER_ADD_MODE]: c => this.maybeEnterGrowMode(c.holdKey, c.keys),
      [DACommandType.BEGIN_NEW_NODE_LABEL_EDIT]: () => this.beginPendingNodeLabelEdit(),
      [DACommandType.ADD_SELF_EDGE]: () => this.addSelfEdge(),
      [DACommandType.CONNECT_SELECTED_NODES]: this.thenEmitEditState(() => this.connectSelectedNodes()),
      [DACommandType.ADD_LABEL]: () => this.addLabel(),
      [DACommandType.INSERT_WAYPOINT]: this.thenEmitEditState(() => this.insertWaypointAtCrosshairs()),
      [DACommandType.TOGGLE_PIN_SELECTED]: () => this.togglePinSelected(),
      [DACommandType.DELETE]: () => this.deleteSelected(),
    } satisfies CommandSlice;
  }

  /** Starting and leaving a text edit, and typing. (Changing the text and
   *  moving the caret are the TextEditingController's own commands.) */
  private textEditingCommands() {
    return {
      [DACommandType.EDIT_SELECTED]: () => this.handleEditSelected(),
      [DACommandType.EDIT_TEXT_AT_CROSSHAIRS]: () => this.editTextAtCrosshairs(),
      [DACommandType.EXIT_LABEL_EDIT_MODE]: () => this.exitLabelEditMode(),
      [DACommandType.INSERT_CHAR]: c => this.insertChar(c.value),
    } satisfies CommandSlice;
  }

  /** Styling what is selected or under the crosshairs, and the defaults new
   *  edges take. */
  private styleCommands() {
    return {
      [DACommandType.INCREASE_SELECTED_NODE_SIZE]: () => this.increaseSelectedNodeSize(),
      [DACommandType.DECREASE_SELECTED_NODE_SIZE]: () => this.decreaseSelectedNodeSize(),
      [DACommandType.INCREASE_SELECTED_TEXT_SIZE]: () => this.increaseSelectedTextSize(),
      [DACommandType.DECREASE_SELECTED_TEXT_SIZE]: () => this.decreaseSelectedTextSize(),
      [DACommandType.SET_TEXT_OVERFLOW_MODE]: c => this.setTextOverflowMode(c.mode),
      [DACommandType.SET_NODE_SHAPE]: c => this.setNodeShape(c.shape),
      [DACommandType.TOGGLE_NODE_SHAPE]: () => this.toggleNodeShape(),
      [DACommandType.CYCLE_EDGE_DIRECTEDNESS]: () => this.cycleEdgeDirectedness(),
      [DACommandType.SET_EDGE_DIRECTEDNESS]: c => this.setEdgeDirectedness(c.directedness),
      [DACommandType.SET_LINE_STYLE]: c => this.setLineStyle(c.lineStyle),
      [DACommandType.SET_ITEM_COLOR]: c => this.setItemColor(c.color),
      [DACommandType.SET_DEFAULT_EDGE_DIRECTEDNESS]: c => this.setDefaultEdgeDirectedness(c.directedness),
      [DACommandType.SET_DEFAULT_LINE_STYLE]: c => this.setDefaultLineStyle(c.lineStyle),
    } satisfies CommandSlice;
  }

  /** Rearranging the graph: layouts and edge routing. (Gather brings its own commands.) */
  private layoutCommands() {
    return {
      [DACommandType.APPLY_LAYOUT]: c => this.applyGraphLayout(c.layout),
      [DACommandType.APPLY_EDGE_ROUTING]: c => this.applyEdgeRouting(c.algorithm),
    } satisfies CommandSlice;
  }

  /** The Edit menu's five: undo, redo, cut, copy and paste. */
  private editMenuCommands() {
    return {
      [DACommandType.UNDO]: () => this.handleUndo(),
      [DACommandType.REDO]: () => this.handleRedo(),
      [DACommandType.CUT_SELECTION]: this.thenEmitEditState(() => this.cutSelection()),
      [DACommandType.COPY_SELECTION]: () => this.copySelection(),
      [DACommandType.PASTE_CLIPBOARD]: () => this.pasteClipboard(),
    } satisfies CommandSlice;
  }

  /** The graph's diagram type, and the task status todo graphs add. The
   *  plugin-shaped slice: the first to leave when plugins bring their own
   *  commands (notes/design-plugins.md). */
  private diagramTypeCommands() {
    return {
      [DACommandType.SET_DIAGRAM_TYPE]: c => this.fileController.setDiagramType(c.typeId),
      [DACommandType.SET_TASK_STATUS]: c => this.setTaskStatus(c.status),
    } satisfies CommandSlice;
  }

  /** Commands AppComponent handles and never forwards: the ex line, agent
   *  mode and reading. Listed so that every command kind has an owner. */
  private shellCommands() {
    const handledByShell = () => undefined;
    return {
      [DACommandType.OPEN_EX_LINE]: handledByShell,
      [DACommandType.OPEN_AGENT_CHAT]: handledByShell,
      [DACommandType.CLOSE_AGENT_CHAT]: handledByShell,
      [DACommandType.ASK_AGENT_ABOUT_SELECTION]: handledByShell,
      [DACommandType.FOLLOW_AGENT]: handledByShell,
      [DACommandType.ENTER_READING_MODE]: handledByShell,
    } satisfies CommandSlice;
  }

  /** Settle what every command leaves behind: the keymenu's context, waypoint
   *  visibility, the hover highlight, and the vault auto-save. */
  private afterCommand(command: DACommand) {
    if (affectsContextState(command.kind)) {
      this.emitContextState();
    }
    this.refreshWaypointVisibility();
    // Commands may tween either the crosshairs or the drawing beneath them.
    // Refresh just after the standard movement tween, coalescing held-key
    // repeats so the highlight never trails several landings behind.
    if (this.crosshairsLayer.crosshairs.konvaGroup.visible()) {
      this.scheduleCrosshairHoverRefresh();
    } else {
      this.refreshCrosshairHoverHighlight();
    }

    if (mutatesGraph(command.kind) ||
        command.kind === DACommandType.UNDO ||
        command.kind === DACommandType.REDO) {
      this.scheduleVaultAutoSave();
    }
  }


  // ── File, vault, named graphs, display: delegated to FileController ──
  // Lifecycle hooks enter the controller here; its commands reach it through
  // its own slice of the command table (FileController.commands).
  private initVault(): Promise<void> {
    return this.fileController.initVault();
  }

  private restoreViewport(view: {x: number; y: number; scale: number} | undefined): boolean {
    return this.fileController.restoreViewport(view);
  }

  private saveGraphToStorage(): void {
    this.fileController.saveGraphToStorage();
  }

  private scheduleVaultAutoSave(): void {
    this.fileController.scheduleVaultAutoSave();
  }

  private multiItemSelect() {
    this.finishTweens();
    this.wasAlreadySelectedBeforeDrag = this.isTopItemSelected();
    this.ensureTopItemSelected();
  }

  /** What the select+drag gesture acts on: whatever is under the crosshairs,
   *  a label winning over everything, then a waypoint overlapping the
   *  crosshairs circle (over the edge beneath it), then the topmost node,
   *  then the topmost edge. */
  private topItemUnderCrosshairs(): DALabel | DAWaypoint | DANode | DAEdge | null {
    return this.getLabelUnderCrosshairs()
      ?? this.getWaypointUnderCrosshairs()
      ?? topmost(this.getDANodesContainingCrosshairs())
      ?? topmost(this.getDAEdgesContainingCrosshairs());
  }

  private hasItemUnderCrosshairs(): boolean {
    return this.topItemUnderCrosshairs() !== null;
  }

  private isTopItemSelected(): boolean {
    return this.topItemUnderCrosshairs()?.isSelected ?? false;
  }

  private ensureTopItemSelected(): void {
    this.reselectTopItem(() => true);
  }

  /** The quick tap of the select key on an item already selected. */
  private toggleTopItemSelection(): void {
    this.reselectTopItem(selected => !selected);
  }

  private reselectTopItem(next: (selected: boolean) => boolean): void {
    const item = this.topItemUnderCrosshairs();
    if (!item) return;
    item.isSelected = next(item.isSelected);
    this.drawingLayer.batchDraw();
  }



  /** Select the item under the crosshairs and nothing else — the item the
   *  hover trace is on, so the edit keys act on what is highlighted. */
  private selectOnlyTopItem(): void {
    this.finishTweens();
    this.drawingLayer.unselectAll();
    this.unselectAllLabels();
    const item = this.topItemUnderCrosshairs();
    if (item) item.isSelected = true;
    this.drawingLayer.batchDraw();
  }

  /** Radius of the crosshairs' selection circle expressed in drawing-layer
   *  coordinates. The circle is drawn unscaled on the crosshairs layer, so its
   *  effective size relative to the drawing layer changes with zoom. */
  private crosshairsCircleRadiusInLayerCoords(): number {
    return this.probe.reach;
  }

  /** Waypoint overlapping the crosshairs' selection circle — i.e. whose dot
   *  comes within `RADIUS` + the circle's radius of the crosshairs center (all
   *  in layer coords). Returns the closest such waypoint, or undefined if none.
   *  Used by every waypoint hit-test (select, select+drag, pin, delete) so they
   *  all share the same generous targeting. */
  private getWaypointUnderCrosshairs(): DAWaypoint | undefined {
    return this.probe.waypoint();
  }

  /** Mark the targeted task nodes (selection, else topmost node under the
   *  crosshairs) with a status from the identity's `status` tag group.
   *  Statuses are exclusive semantic tags (`status/done` etc.), so they
   *  persist with the graph document and survive undo/redo. */
  private setTaskStatus(status: TaskStatus): void {
    const group = resolveIdentity(this.drawingLayer.diagramType).tagGroups?.find(g => g.id === 'status');
    if (!group) {
      this.emitStatus('⚠ Task statuses need a Todo Graph (m → t)');
      return;
    }
    const choice = status === 'none' ? null : group.choices.find(c => c.tag === `status/${status}`) ?? null;
    if (status !== 'none' && choice === null) {
      this.emitStatus(`⚠ Unknown task status: ${status}`);
      return;
    }
    // Filters after the choice, not before: a selection of only junctions
    // reports "nothing to do" rather than falling through to the node under
    // the crosshairs. setTextOverflowMode does the opposite — see
    // notes/bug-node-target-filter-order.md.
    const targets = this.targetNodes()
      .filter(n => n.nodeShape !== 'junction' && n.nodeShape !== 'invisible');
    if (targets.length === 0) {
      this.emitStatus('⚠ Select or hover a node to set its status');
      return;
    }
    this.finishTweens();
    for (const node of targets) {
      node.tags = applyExclusiveTag(node.tags, group, choice);
      node.setStatusBadge(choice);
    }
    this.drawingLayer.batchDraw();
    const suffix = targets.length > 1 ? ` (${targets.length} nodes)` : '';
    this.emitStatus(choice ? `Status: ${choice.label}${suffix}` : `Status cleared${suffix}`);
  }

  /** Lends search what it needs, through getters so the layers can still be
   *  assigned later in ngAfterViewInit. */
  private graphSearchHost(): GraphSearchHost {
    const da = this;
    return {
      get drawingLayer() { return da.drawingLayer; },
      prompt: (message, initial) => window.prompt(message, initial),
      finishTweens: () => da.finishTweens(),
      unselectAllLabels: () => da.unselectAllLabels(),
      nodeCenter: node => da.getNodeCenterInLayerCoordinates(node),
      centerViewOnLayerPoint: point => da.centerViewOnLayerPoint(point),
      checkAndEmitEditState: () => da.checkAndEmitEditState(),
      emitStatus: message => da.emitStatus(message),
    };
  }

  /** Lends the keyboard drag what it needs, through getters so the layers
   *  can still be assigned later in ngAfterViewInit. */
  private keyboardDragHost(): KeyboardDragHost {
    const da = this;
    return {
      get drawingLayer() { return da.drawingLayer; },
      get crosshairsLayer() { return da.crosshairsLayer; },
      get viewport() { return da.viewport; },
      get animations() { return da.animations; },
      get tweenDuration() { return da.TWEEN_DURATION; },
      crosshairsInLayerCoords: () => da.crosshairsInLayerCoords(),
      edgesUnderCrosshairs: () => da.getDAEdgesContainingCrosshairs(),
      findSnapOnEdge: (edge, point) => da.findSnapOnEdge(edge, point),
      getSelectedLabels: () => da.getSelectedLabels(),
      getEdgeForLabel: label => da.getEdgeForLabel(label),
      unselectAllLabels: () => da.unselectAllLabels(),
      placeCrosshairs: at => da.placeCrosshairs(at),
      panLayerAlong: (axis, delta) => da.panLayerAlong(axis, delta),
      updateEdgePoints: edge => da.updateEdgePoints(edge),
      rerouteIncidentEdges: nodes => da.rerouteIncidentEdges(nodes),
    };
  }

  /** Lends area select what it needs, through getters so the layers can
   *  still be assigned later in ngAfterViewInit. */
  private areaSelectHost(): AreaSelectHost {
    const da = this;
    return {
      get drawingLayer() { return da.drawingLayer; },
      get crosshairsLayer() { return da.crosshairsLayer; },
      get viewport() { return da.viewport; },
      crosshairsInLayerCoords: () => da.crosshairsInLayerCoords(),
      placeCrosshairs: at => da.placeCrosshairs(at),
      panLayerAlong: (axis, delta) => da.panLayerAlong(axis, delta),
      stepDistance: tier => da.movementDistanceForTier(
        tier, da.drawingLayer.getSubGridSpacing(), da.drawingLayer.getGridSpacing()) * da.drawingLayer.scaleX(),
      marqueeColor: () => da.visualConfigService.getEffectivePalette(da.themeService.theme).crosshairsStroke,
      checkAndEmitEditState: () => da.checkAndEmitEditState(),
    };
  }

  /** Lends move-by-node what it needs, through getters so the layers can
   *  still be assigned later in ngAfterViewInit. */
  private navigationGridHost(): NavigationGridHost {
    const da = this;
    return {
      get crosshairsLayer() { return da.crosshairsLayer; },
      get drawingLayer() { return da.drawingLayer; },
      get stage() { return da.stage; },
      get themeService() { return da.themeService; },
      get visualConfigService() { return da.visualConfigService; },
      get growActive() { return da.growActive; },
      emitStatus: message => da.emitStatus(message),
      finishTweens: () => da.finishTweens(),
      moveCrosshairsBy: (dx, dy, tier, showGrid) => da.moveCrosshairsBy(dx, dy, tier, showGrid),
      navStops: targets => da.navStops(targets),
      navStopCenter: (id, kind) => da.navStopCenter(id, kind),
    };
  }

  /** The grow ghost needs the layer it draws on and one colour. */
  private growGhostHost(): GrowGhostHost {
    const da = this;
    return {
      get drawingLayer() { return da.drawingLayer; },
      get stroke() {
        return da.visualConfigService.getEffectivePalette(da.themeService.theme).nodeStroke;
      },
    };
  }

  /** Free grow placement reads the session's anchor and origin, and gives
   *  every move back to the same ghost renderer the rest of grow mode uses. */
  private growPlacementHost(): GrowPlacementHost {
    const da = this;
    return {
      get anchor() { return da.growAnchor; },
      get origin() { return da.growOrigin!; },
      spacing: axis => da.quickAddSpacingFrom(axis),
      coarseModifierHeld: () => da.growMods.has(da.growKeys?.coarse ?? 'coarse'),
      fineModifierHeld: () => da.growMods.has(da.growKeys?.fine ?? 'fine'),
      redraw: () => da.redrawGrowGhost(),
    };
  }

  /** The nav ghost needs the zoom, the viewport and the palette; nothing else. */
  private navGhostHost(): NavGhostHost {
    const da = this;
    return {
      get drawingLayer() { return da.drawingLayer; },
      get camera() { return da.camera; },
      get stage() { return da.stage; },
      get palette() {
        return da.visualConfigService.getEffectivePalette(da.themeService.theme);
      },
    };
  }

  /** Move by Link reads the crosshairs and the shared walk, and draws one
   *  overlay. Layers are assigned after construction, so these are getters. */
  private linkNavHost(): LinkNavHost {
    const da = this;
    return {
      get drawingLayer() { return da.drawingLayer; },
      get crosshairsLayer() { return da.crosshairsLayer; },
      get stage() { return da.stage; },
      get camera() { return da.camera; },
      get probe() { return da.probe; },
      get journey() { return da.journey; },
      get navGrid() { return da.navGrid; },
      get crosshairsStroke() {
        return da.visualConfigService.getEffectivePalette(da.themeService.theme)
          .crosshairsStroke;
      },
      get crosshairMovementDuration() { return da.CROSSHAIR_MOVEMENT_DURATION; },
      emitStatus: message => da.emitStatus(message),
      finishTweens: () => da.finishTweens(),
      focusEdge: edge => da.setGraphNavEdge(edge),
    };
  }

  /** Text editing owns mutations and keeps resized boxes centred. */
  private textEditingHost(): TextEditingHost {
    const da = this;
    return {
      get drawingLayer() { return da.drawingLayer; },
      get resizeReflowGap() { return da.RESIZE_REFLOW_GAP; },
      getSelectedLabels: () => da.getSelectedLabels(),
      getEdgeForLabel: label => da.getEdgeForLabel(label),
      finishTweens: () => da.finishTweens(),
      updateEdgesForResizedNodes: nodes => da.updateEdgesForResizedNodes(nodes),
      refreshLabelEditGhost: () => da.refreshLabelEditGhost(),
    };
  }

  /** Layers are assigned after construction; getters keep the host current. */
  private fileHost(): FileHost {
    const da = this;
    return {
      get drawingLayer() { return da.drawingLayer; },
      get crosshairsLayer() { return da.crosshairsLayer; },
      get viewport() { return da.viewport; },
      get daOut() { return da.daOut; },

      get vaultService() { return da.vaultService; },
      get fileIo() { return da.fileIo; },
      get graphStorage() { return da.graphStorage; },
      get demoDataService() { return da.demoDataService; },
      get draftStorage() { return da.draftStorage; },
      get undoRedoService() { return da.undoRedoService; },
      get themeService() { return da.themeService; },
      get visualConfigService() { return da.visualConfigService; },
      get log() { return da.log; },

      emitStatus: message => da.emitStatus(message),
      emitContextState: () => da.emitContextState(),
      emitZoomLevel: () => da.emitZoomLevel(),
      checkAndEmitEditState: () => da.checkAndEmitEditState(),
      finishTweens: () => da.finishTweens(),
      unselectAllLabels: () => da.unselectAllLabels(),
      fitViewToContent: () => da.fitViewToContent(),
      recenterCrosshairs: () => da.recenterCrosshairs(),
      updateEdgesForResizedNodes: nodes => da.updateEdgesForResizedNodes(nodes),
    };
  }

  /** Lends the gather view what it needs, without widening this component's
   *  own surface: everything here stays private, reached through getters so
   *  the layer can still be assigned later in ngAfterViewInit. */
  private gatherHost(): GatherHost {
    const da = this;
    return {
      get drawingLayer() { return da.drawingLayer; },
      get animations() { return da.animations; },
      get themeService() { return da.themeService; },
      get journey() { return da.journey; },
      log: message => da.log.log(message),
      emitStatus: message => da.emitStatus(message),
      finishTweens: () => da.finishTweens(),
      getTraversalAnchorNode: () => da.getTraversalAnchorNode(),
      getNodeCenterInLayerCoordinates: node => da.getNodeCenterInLayerCoordinates(node),
      refreshWaypointVisibility: draw => da.refreshWaypointVisibility(draw),
      updateEdgesForResizedNodes: nodes => da.updateEdgesForResizedNodes(nodes),
    };
  }

  private emitStatus(message: string): void {
    // Status messages double as the vault/search diagnostic trail in
    // tools/debug.log (via the log server).
    this.log.log('[status]', message);
    this.daOut.emit({ kind: 'status-message', message });
  }

  /** Run one ex-line command (da-165). An initial vocabulary: `:w` saves,
   *  `:e` switches files, `:ls` lists the vault. Unknown commands report
   *  themselves rather than failing silently, the way vim does. */
  /** Pin the crosshairs and movement indicators up for the duration of a
   *  held view key (da-257). */
  private holdCrosshairsVisible(): void {
    this.crosshairsHeldVisible = true;
    this.showMovementIndicators();
    this.crosshairsLayer.showCrosshairs();
    this.crosshairsLayer.batchDraw();
  }

  /** Release the pin and restart the ordinary idle fade. */
  private releaseCrosshairsVisible(): void {
    this.crosshairsHeldVisible = false;
    this.showMovementIndicators();
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
    const targets = topmostSelection(hovered);
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

    const crossLinks = applyLayout(layout, nodes, edges, layoutSpacingFor(nodes, layout));
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
    this.clearLabelEditGhost();
    this.crosshairsLayer.showCrosshairs();
    // Deliberately every node and label, not just the selected ones. A cursor
    // is shown before selection settles -- a freshly created node awaiting its
    // label gets one while unselected (beginNewNodeLabelEdit) -- so keying the
    // teardown off selection left that node's blink timer running for the rest
    // of the session, with a caret visible on a node nobody was editing.
    // hideCursor on a node without one is a no-op.
    const resized = new Map<DANode, Point>();
    this.drawingLayer.getDANodes().forEach(n => this.toggleNodeCaret(n, () => n.hideCursor(), resized));
    this.settleCaretResizes(resized);
    this.getAllLabels().forEach(l => l.hideCursor());
    // A label left empty has no visible content — drop it rather than leave
    // an invisible hit-target on the edge.
    const editedNodes = this.drawingLayer.getSelectedDANodes();
    const editedLabels = this.getSelectedLabels().filter(label => label.label.trim() !== '');
    this.getSelectedLabels()
      .filter(label => label.label.trim() === '')
      .forEach(label => {
        this.getEdgesContainingLabel(label).forEach(edge => edge.removeLabel(label));
      });
    this.drawingLayer.unselectAll();
    this.unselectAllLabels();
    this.drawingLayer.batchDraw();
    const drewLink = this.newNodeArrivedByLink;
    this.newNodeArrivedByLink = false;
    // Keeping the caret in view pans the graph under the hidden crosshairs,
    // so editing could end with them off the thing just edited, and the edit
    // key then found nothing there. Put them back on it.
    if (editedNodes.length === 1 && !this.getDANodesContainingCrosshairs().includes(editedNodes[0])) {
      this.parkCrosshairsAt(this.getNodeCenterInLayerCoordinates(editedNodes[0]));
    } else if (editedNodes.length === 0 && editedLabels.length === 1
        && this.getLabelUnderCrosshairs() !== editedLabels[0]) {
      this.parkCrosshairsAt({x: editedLabels[0].x, y: editedLabels[0].y});
    }
    // A node that arrived on a new link rests the crosshairs on it, the same
    // landing as connecting two existing nodes.
    if (drewLink) this.hideCrosshairsUntilMoved();
  }

  private unselectAll() {
    this.finishTweens();
    this.clearLabelEditGhost();
    this.drawingLayer.unselectAll();
    this.unselectAllLabels();
    // Escape also ends the traversal: drop the navigation focus glow.
    this.setGraphNavEdge(null);
  }

  /** Yank the selected nodes (and the edges wholly inside the selection).
   *  Graph-local, not the system clipboard: the payload is a subgraph, and
   *  nothing about it survives a page reload. */
  /** The nodes the clipboard acts on. The selection when there is one;
   *  otherwise whatever the crosshairs are over, so `y` yanks the node you
   *  are looking at the way vim yanks the line you are on (da-272).
   *
   *  The guards mirror deleteSelected's priority order, so a cut copies
   *  exactly what it is about to remove: with a waypoint, edge or label
   *  selected, delete acts on that and the clipboard takes nothing. */
  private clipboardTargetNodes(): DANode[] {
    if (this.drawingLayer.getSelectedDAWaypoints().length > 0) return [];
    const selected = this.drawingLayer.getSelectedDANodes();
    if (selected.length > 0) return selected;
    if (this.drawingLayer.getSelectedDAEdges().length > 0) return [];
    if (this.getSelectedLabels().length > 0) return [];
    if (this.getWaypointUnderCrosshairs()) return [];
    const hovered = this.getDANodesContainingCrosshairs()[0];
    return hovered ? [hovered] : [];
  }

  private copySelection(): void {
    const sub = this.drawingLayer.copySubgraphOf(this.clipboardTargetNodes());
    if (!sub) {
      this.emitStatus('Nothing to copy.');
      return;
    }
    this.clipboard = sub;
    // The text goes on the system clipboard too, to paste into the agent chat
    // or another label. Best effort: the browser may refuse.
    const text = this.clipboardTargetNodes().map(node => node.label.text()).join('\n\n');
    void navigator.clipboard?.writeText(text).catch(() => {});
    const n = sub.nodes.length;
    const e = sub.edges.length;
    this.emitStatus(`Copied ${n} node${n === 1 ? '' : 's'}` +
      (e > 0 ? ` and ${e} edge${e === 1 ? '' : 's'}.` : '.'));
  }

  /** `x`: cut. Copies the nodes the delete is about to remove, then deletes
   *  exactly what Delete would have — so cut stays a strict superset of the
   *  Delete it replaced and still removes waypoints, edges and labels, which
   *  the clipboard has no representation for (da-272). */
  private cutSelection(): void {
    const sub = this.drawingLayer.copySubgraphOf(this.clipboardTargetNodes());
    if (sub) this.clipboard = sub;
    this.deleteSelected();
    this.emitStatus(sub
      ? `Cut ${sub.nodes.length} node${sub.nodes.length === 1 ? '' : 's'}.`
      : 'Deleted.');
  }

  /** Drop the clipboard subgraph centred on the crosshairs, selected so it
   *  can be dragged straight away. */
  private pasteClipboard(): void {
    if (!this.clipboard) {
      this.emitStatus('Clipboard is empty.');
      return;
    }
    this.finishTweens();
    const at = this.crosshairsInLayerCoords();
    const pasted = this.drawingLayer.pasteSubgraph(this.clipboard, at.x, at.y);
    this.updateEdgesForResizedNodes(pasted);
    this.drawingLayer.batchDraw();
    this.checkAndEmitEditState();
    const n = pasted.length;
    this.emitStatus(`Pasted ${n} node${n === 1 ? '' : 's'}.`);
  }

  // ── Text edits and the geometry they cause: delegated to TextEditingController ──
  // Command dispatch and the caret show/hide passes enter the controller here.
  private insertChar(key: string): void {
    this.crosshairsLayer.hideCrosshairs();
    this.textEditor.insertChar(key);
  }

  private toggleNodeCaret(node: DANode, toggle: () => boolean,
                          resized: Map<DANode, Point>): void {
    this.textEditor.toggleNodeCaret(node, toggle, resized);
  }

  private settleCaretResizes(resized: Map<DANode, Point>): void {
    this.textEditor.settleCaretResizes(resized);
  }

  private setTextOverflowMode(mode: TextOverflowMode) {
    const targets = this.targetNodes(n => n.nodeShape !== 'junction');

    const resized: DANode[] = [];
    targets.forEach(node => {
      node.textOverflowMode = mode;
      resized.push(node);
    });
    this.updateEdgesForResizedNodes(resized);
    this.drawingLayer.batchDraw();
  }

  /**
   * The nodes a command means: the selection if there is one, else the topmost
   * node under the crosshairs. Empty means "no node addressed" — the shape
   * commands read that as a change to the default for new nodes.
   *
   * `only` narrows both candidates before the choice, so restricting the kinds
   * of node a command accepts cannot change which of the two wins.
   */
  private targetNodes(only: (node: DANode) => boolean = () => true): DANode[] {
    const selected = this.drawingLayer.getSelectedDANodes().filter(only);
    return selected.length > 0
      ? selected
      : topmostSelection(this.getDANodesContainingCrosshairs().filter(only));
  }

  /** Flip between the two shapes that carry a label, leaving diamond and the
   *  two markers alone. Temporary: the intent is that shape follows a tag or
   *  class rather than being set per node, and this goes when that lands.
   *  Anything that is not a circle becomes a circle, so a mixed selection
   *  converges instead of splitting further. */
  private toggleNodeShape() {
    const targets = this.targetNodes();
    if (targets.length === 0) {
      this._defaultNodeShape = this._defaultNodeShape === 'circle' ? 'box' : 'circle';
      this.daOut.emit({kind: 'status-message',
        message: `Default node shape: ${this._defaultNodeShape}`});
      return;
    }
    const toCircle = targets.some(n => n.nodeShape !== 'circle');
    this.setNodeShape(toCircle ? 'circle' : 'box');
  }

  private setNodeShape(shape: NodeShape) {
    const targets = this.targetNodes();

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
    // The hover trace and the landing ghost are snapshots of where a node was
    // when the crosshairs last moved. Anything that resizes or shifts a node
    // — a resize and its reflow, a layout, a paste, a drag — leaves them
    // describing the old geometry, which is how a dashed outline ends up
    // sitting next to its node instead of around it (2026-08-29). This is the
    // common exit for every one of those paths.
    if (this.crosshairsLayer?.crosshairs) this.refreshCrosshairHoverHighlight();
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
        this.addDefaultEdge(srcNode, destNode);
        this.unselectAll();
        this.restCrosshairsOn(destNode);
      } else {
        return;
      }
    } else if (selectedDANodes.length == 1 && daNodesContainingCrosshairs.length == 1) {
      const destNode = daNodesContainingCrosshairs[0];
      const srcNode = selectedDANodes[0];
      this.addDefaultEdge(srcNode, destNode);
      this.unselectAll();
      this.restCrosshairsOn(destNode);
      return;
    } else if (selectedDANodes.length == 1 && daNodesContainingCrosshairs.length == 0) {
      //todo: create new connected node
    } else {
      return;
    }
  }

  private zoomIn() {
    this.zoomAboutCrosshairs(Math.min(this.camera.scale * 2, this.MAX_ZOOM));
  }

  private zoomOut() {
    this.zoomAboutCrosshairs(Math.max(this.camera.scale / 2, this.MIN_ZOOM));
  }

  /** Zoom with the crosshairs pinned: whatever they are over stays under them,
   *  so the graph grows around the thing you are looking at. */
  private zoomAboutCrosshairs(newScale: number): void {
    this.finishTweens();
    this.clearCrosshairHoverHighlight(false);
    const pinned = this.crosshairsInLayerCoords();
    this.tween({
      node: this.drawingLayer,
      duration: this.TWEEN_DURATION,
      scaleX: newScale,
      scaleY: newScale,
      x: this.crosshairsLayer.crosshairsX() - pinned.x * newScale,
      y: this.crosshairsLayer.crosshairsY() - pinned.y * newScale,
      onFinish: () => {
        this.emitZoomLevel();
        this.afterMovementTween();
      },
    });
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

  // Kept as methods because tools/qa scripts call them; see
  // tools/qa/contract/component-api.js. Inside this class, ask the viewport.
  private viewMinY(): number { return this.viewport.minY; }
  private viewMaxY(): number { return this.viewport.maxY; }
  private viewCenterX(): number { return this.viewport.centerX; }
  private viewCenterY(): number { return this.viewport.centerY; }

  /** Screen-space keep-out band between the crosshairs and the drawing-area
   *  edge: cross it and movement pans the view instead of advancing the
   *  crosshairs. A flat band clips whatever you land on — navigate onto a
   *  wide card near the edge and half its text sits outside the viewport —
   *  so the band grows to half the landed-on node's rendered box plus
   *  padding. Capped at 40% of the viewport so it can never swallow it. */
  private crosshairsEdgeMargin(target: Point): Point {
    const BASE = 60;
    const PAD = 24;
    const scale = this.drawingLayer.scaleX();
    let mx = BASE;
    let my = BASE;
    for (const node of this.drawingLayer.getDaNodesContainingPoint(target)) {
      mx = Math.max(mx, (node.NODE_WIDTH * scale) / 2 + PAD);
      my = Math.max(my, (node.NODE_HEIGHT * scale) / 2 + PAD);
    }
    return {
      x: Math.min(mx, this.viewport.width * 0.4),
      y: Math.min(my, this.viewport.height * 0.4),
    };
  }

  /**
   * Move the crosshairs, panning the drawing when they reach the margin.
   *
   * Three ways to pick the destination — a goal-line step, a grid snap, or raw
   * pixels — and then one shared landing: clamp to the usable viewport, tween
   * the crosshairs that far, and give whatever is left over to the layer
   * beneath them.
   */
  private moveCrosshairsBy(deltaX: number, deltaY: number, tier?: GridTier,
                           showMovementGrid = true) {
    this.finishTweens();
    this.clearCrosshairHoverHighlight(false);
    this.crosshairsLayer.showCrosshairs();
    this.crosshairsLayer.batchDraw();

    const current = {
      x: this.crosshairsLayer.crosshairs.x,
      y: this.crosshairsLayer.crosshairs.y,
    };
    const target = this.crosshairsMoveTarget(current, deltaX, deltaY, tier);

    const margin = this.crosshairsEdgeMargin(target);
    const clamped = {
      x: clamp(target.x, this.viewport.minX + margin.x, this.viewport.maxX - margin.x),
      y: clamp(target.y, this.viewport.minY + margin.y, this.viewport.maxY - margin.y),
    };
    // What the crosshairs could not travel, the drawing travels instead.
    const overflow = {x: target.x - clamped.x, y: target.y - clamped.y};

    if (clamped.x !== current.x || clamped.y !== current.y) {
      this.tweenCrosshairsTo(clamped);
    }
    if (overflow.x !== 0 || overflow.y !== 0) {
      this.panLayerByOverflow(overflow);
    }

    // Show grid and indicators on movement, then fade after 5s
    if (showMovementGrid) this.showMovementIndicators();
  }

  /** Where one movement press lands the crosshairs, in stage pixels. */
  private crosshairsMoveTarget(
    current: Point,
    deltaX: number,
    deltaY: number,
    tier?: GridTier,
  ): Point {
    if (!tier) {
      // Raw pixel movement (focusNode, moveByNode, zoom, etc.)
      this.clearNormalMovementGoal();
      return {x: current.x + deltaX, y: current.y + deltaY};
    }

    // Grid-snapped movement: deltaX/Y are direction signs (-1, 0, +1)
    this.drawingLayer.rebuildGrid(this.stage.width(), this.stage.height());
    this.gridInitialized = true;

    const grid: MovementGrid = {
      scale: this.camera.scale,
      major: this.drawingLayer.getGridSpacing(),
      minor: this.drawingLayer.getSubGridSpacing(),
    };
    const inLayer = this.camera.toLayer(current);
    const axis: 'x' | 'y' | null = deltaX !== 0 ? 'x' : deltaY !== 0 ? 'y' : null;

    const landing = tier === 'normal' && axis
      ? this.goalLineStep(axis, (axis === 'x' ? Math.sign(deltaX) : Math.sign(deltaY)) as -1 | 1, inLayer, grid)
      : this.gridSnapStep(tier, deltaX, deltaY, inLayer, grid);

    return this.camera.toStage(landing);
  }

  /** Normal movement follows a visible goal line in fixed, configured steps.
   *  Item-aware travel belongs to Move by Node and Move by Link. */
  private goalLineStep(
    axis: 'x' | 'y',
    sign: -1 | 1,
    inLayer: Point,
    grid: MovementGrid,
  ): Point {
    if (!this.normalMovementGoal || this.normalMovementGoal.axis !== axis) {
      this.normalMovementGoal = startNormalMovementGoal(axis, inLayer);
    }
    const stepDistance = this.movementDistanceForTier('normal', grid.minor, grid.major);
    const step = nextNormalMovementStep(this.normalMovementGoal, sign, stepDistance);
    this.normalMovementGoal = step.state;
    this.redrawNormalMovementGoalLine();
    this.updateCrosshairsProbeShape('normal', grid.minor, grid.major, stepDistance, grid.scale);
    return step.target;
  }

  /** Fine and coarse keep direct grid movement: snap to the nearest line, then
   *  step one cell off it. The next normal key starts a fresh goal. */
  private gridSnapStep(
    tier: GridTier,
    deltaX: number,
    deltaY: number,
    inLayer: Point,
    grid: MovementGrid,
  ): Point {
    const step = gridSnapStepper(this.beginGridSnap(tier, grid));
    return {x: step(inLayer.x, deltaX), y: step(inLayer.y, deltaY)};
  }

  /** Retire the goal line, size the probe for this tier, and report the spacing
   *  the step will use. The two effects a direct grid move has to perform. */
  private beginGridSnap(tier: GridTier, grid: MovementGrid): number {
    this.clearNormalMovementGoal();
    const spacing = this.movementDistanceForTier(tier, grid.minor, grid.major);
    this.updateCrosshairsProbeShape(tier, grid.minor, grid.major, spacing, grid.scale);
    return spacing;
  }

  private tweenCrosshairsTo(to: Point): void {
    this.tween({
      node: this.crosshairsLayer.crosshairs.konvaGroup,
      duration: this.CROSSHAIR_MOVEMENT_DURATION,
      x: to.x,
      y: to.y,
      easing: Konva.Easings.Linear,
      onFinish: () => {
        // Konva can finish a short tween one frame shy of its requested
        // endpoint. Snapping must be exact or the following goal-line step
        // slowly accumulates screen-pixel drift.
        this.crosshairsLayer.crosshairs.konvaGroup.position(to);
        this.checkResizeHandleProximity();
        this.afterMovementTween();
      },
    });
  }

  /** Slide the drawing the distance the crosshairs could not travel, so the
   *  gesture continues past the edge of the viewport. */
  private panLayerByOverflow(overflow: Point): void {
    const to = {
      x: this.drawingLayer.x() - overflow.x,
      y: this.drawingLayer.y() - overflow.y,
    };
    this.tween({
      node: this.drawingLayer,
      duration: this.CROSSHAIR_MOVEMENT_DURATION,
      x: to.x,
      y: to.y,
      easing: Konva.Easings.Linear,
      onFinish: () => {
        this.drawingLayer.position(to);
        this.afterMovementTween();
      },
    });
  }

  /** Start a tween and keep it where finishTweens() can find it. Every
   *  animation on this canvas goes through here, so none is left running when
   *  the next command arrives. */
  private tween(config: TweenConfig): void {
    this.animations.start(config);
  }

  /** Whatever moved, the overlay that tracks it has to catch up. */
  private afterMovementTween(): void {
    if (this.navGrid.visible) this.navGrid.redrawNodeGrid();
    this.scheduleCrosshairHoverRefresh(20);
  }

  /** Draw the current goal in drawing-layer space, just above the ordinary
   *  grid and below graph content. It therefore stays registered with the
   *  diagram during any edge-of-viewport pan. */
  private redrawNormalMovementGoalLine(): void {
    this.goalLine.clear(false);
    const goal = this.normalMovementGoal;
    if (!goal) return;

    // A screenful of overshoot each side, so the line never ends in view.
    const overshoot = {
      x: this.camera.toLayerDistance(this.stage.width()),
      y: this.camera.toLayerDistance(this.stage.height()),
    };
    const topLeft = this.camera.toLayer({x: 0, y: 0});
    const bottomRight = this.camera.toLayer({x: this.stage.width(), y: this.stage.height()});
    const minX = topLeft.x - overshoot.x, maxX = bottomRight.x + overshoot.x;
    const minY = topLeft.y - overshoot.y, maxY = bottomRight.y + overshoot.y;
    const line = new Konva.Line({
      name: 'normal-movement-goal-line',
      points: goal.axis === 'x'
        ? [minX, goal.line, maxX, goal.line]
        : [goal.line, minY, goal.line, maxY],
      stroke: this.visualConfigService
        .getEffectivePalette(this.themeService.theme).crosshairsStroke,
      // Screen-constant: the guide keeps its weight at any zoom.
      strokeWidth: this.camera.toLayerDistance(1.5),
      dash: [this.camera.toLayerDistance(10), this.camera.toLayerDistance(7)],
      opacity: 0.58,
      listening: false,
    });
    this.goalLine.show(() => line);
    line.zIndex(1);   // just above the grid, beneath the graph
    this.drawingLayer.batchDraw();
  }

  private clearNormalMovementGoal(draw = true): void {
    this.normalMovementGoal = null;
    this.goalLine.clear(draw);
  }

  private scheduleCrosshairHoverRefresh(delayMs?: number): void {
    if (this.crosshairHoverRefreshTimer !== null) {
      clearTimeout(this.crosshairHoverRefreshTimer);
    }
    const delay = delayMs ??
      Math.ceil(this.CROSSHAIR_MOVEMENT_DURATION * 1000) + 30;
    this.crosshairHoverRefreshTimer = window.setTimeout(() => {
      this.crosshairHoverRefreshTimer = null;
      this.refreshCrosshairHoverHighlight();
    }, delay);
  }

  /**
   * Show one non-semantic hover trace for the top item under the crosshairs.
   * The hit priority matches selection: label, waypoint, top node, top edge.
   * Using a separate overlay keeps this cue visually and behaviorally
   * independent from the blue selection treatment.
   */
  private refreshCrosshairHoverHighlight(): void {
    this.clearCrosshairHoverHighlight(false);
    if (!this.drawingLayer || !this.crosshairsLayer ||
        !this.crosshairsLayer.crosshairs.konvaGroup.visible()) {
      this.drawingLayer?.batchDraw();
      return;
    }

    const hover = this.crosshairHoverTarget();
    if (hover?.trace) {
      const trace = hover.trace;
      trace.setAttr('targetKind', hover.kind);
      trace.setAttr('targetId', hover.id);
      this.hoverTrace.show(() => trace);
    }
    if (hover?.node) {
      this.refreshNavigationLandingGhost(hover.node, hover.ghostReasons);
    }
    this.drawingLayer.batchDraw();
  }

  /** The one item the crosshairs are on, in selection's priority order, with
   *  the trace to draw around it. Null when they are over empty canvas. */
  private crosshairHoverTarget(): CrosshairHover | null {
    const style = this.hoverTraceStyle();

    const label = this.getLabelUnderCrosshairs();
    if (label) {
      return {kind: 'label', id: label.id, trace: this.labelHoverTrace(label, style)};
    }

    const waypoint = this.getWaypointUnderCrosshairs();
    if (waypoint) {
      return {kind: 'waypoint', id: waypoint.id, trace: this.waypointHoverTrace(waypoint, style)};
    }

    const node = topmost(this.getDANodesContainingCrosshairs());
    if (node) {
      // A node that earns a landing ghost gets its dashed trace on the ghost
      // instead. Ringing the real node as well put two dashed outlines of the
      // same node on screen at once (da-434).
      const ghostReasons = this.navigationGhostReasons(node);
      return {
        kind: 'node',
        id: node.id,
        node,
        ghostReasons,
        trace: ghostReasons.length > 0 ? null : this.nodeHoverTrace(node, style),
      };
    }

    const edge = topmost(this.getDAEdgesContainingCrosshairs());
    if (edge) {
      return {kind: 'edge', id: edge.id, trace: this.edgeHoverTrace(edge, style)};
    }

    return null;
  }

  /** Dash, colour and glow shared by every hover trace, plus the zoom-corrected
   *  padding that keeps the trace clear of the thing it traces. */
  private hoverTraceStyle(): HoverTraceStyle {
    const scale = Math.max(this.drawingLayer.scaleX(), 0.001);
    const color = this.visualConfigService
      .getEffectivePalette(this.themeService.theme).crosshairsStroke;
    return {
      scale,
      pad: 6 / scale,
      common: {
        name: 'crosshair-hover-highlight',
        stroke: color,
        strokeWidth: 2,
        strokeScaleEnabled: false,
        // With stroke scaling disabled, Konva applies dash lengths in screen
        // pixels too. Dividing by zoom here would compensate a second time.
        dash: [7, 5],
        opacity: 0.9,
        lineCap: 'round' as const,
        lineJoin: 'round' as const,
        listening: false,
        shadowColor: color,
        shadowBlur: 5,
        shadowOpacity: 0.3,
      },
    };
  }

  private labelHoverTrace(label: DALabel, {common, pad, scale}: HoverTraceStyle): Konva.Shape {
    return new Konva.Rect({
      ...common,
      x: label.x - label.width / 2 - pad,
      y: label.y - label.height / 2 - pad,
      width: label.width + pad * 2,
      height: label.height + pad * 2,
      cornerRadius: 5 / scale,
    });
  }

  private waypointHoverTrace(waypoint: DAWaypoint, {common, pad}: HoverTraceStyle): Konva.Shape {
    return new Konva.Circle({...common, x: waypoint.x, y: waypoint.y, radius: waypoint.RADIUS + pad});
  }

  private nodeHoverTrace(node: DANode, {common, pad, scale}: HoverTraceStyle): Konva.Shape {
    // A circle node is an ellipse once its label stretches it, and a rounded
    // rectangle around one reads as a different shape than the thing it is
    // tracing (da-442).
    if (node.nodeShape === 'circle') {
      return new Konva.Ellipse({
        ...common,
        x: node.group.x() + node.NODE_WIDTH / 2,
        y: node.group.y() + node.NODE_HEIGHT / 2,
        radiusX: node.NODE_WIDTH / 2 + pad,
        radiusY: node.NODE_HEIGHT / 2 + pad,
      });
    }
    return new Konva.Rect({
      ...common,
      x: node.group.x() - pad,
      y: node.group.y() - pad,
      width: node.NODE_WIDTH + pad * 2,
      height: node.NODE_HEIGHT + pad * 2,
      cornerRadius: 7 / scale,
    });
  }

  private edgeHoverTrace(edge: DAEdge, {common}: HoverTraceStyle): Konva.Shape {
    return new Konva.Line({
      ...common,
      // Trace the exact polyline Konva paints, including the render-only
      // endpoint stubs used by smooth edges. Applying tension to the raw
      // control points produced a similar, but visibly different, dotted curve.
      points: edge.getRenderedPathPoints().flatMap(p => [p.x, p.y]),
      tension: 0,
      strokeWidth: 5,
      opacity: 0.72,
    });
  }

  private clearCrosshairHoverHighlight(draw = true): void {
    // The landing ghost carries the trace for a node that earned one, so the
    // two come down together (da-434). Both layers repaint: the trace lives on
    // the drawing layer, the ghost on the crosshairs layer.
    const removedTrace = this.hoverTrace.clear(false);
    const removedGhost = this.clearNavigationLandingGhost(false);
    const changed = removedTrace || removedGhost;
    if (draw && changed) {
      this.drawingLayer.batchDraw();
      this.crosshairsLayer?.batchDraw();
    }
  }

  private nodeStageRect(node: DANode): Rect {
    return nodeStageRect(node, this.camera);
  }

  /** Why the real navigation target needs a readable screen-space copy. */
  private navigationGhostReasons(node: DANode): string[] {
    if (!this.stage || node.nodeShape === 'junction' || node.nodeShape === 'invisible') return [];
    const rect = this.nodeStageRect(node);
    const reasons: string[] = [];
    // The ghost is a copy of the node at its *natural* size, so it is only
    // worth drawing when the real node is harder to read than that copy would
    // be.
    const drawnScale = node.group.scaleY() * this.drawingLayer.scaleY();
    const pad = 8;
    if (drawnScale > 1) {
      // Zoomed in past natural size there is no stand-in worth drawing: the
      // copy is made at natural size, so it would be *smaller* than the box it
      // stands in for. A pan that pushed a 400% box part-way out of frame used
      // to earn one anyway, and a small dashed copy would appear on top of the
      // very large node it was supposedly standing in for.
    } else if (rect.x < this.viewport.minX + pad || rect.y < this.viewport.minY + pad ||
        rect.x + rect.width > this.viewport.maxX - pad ||
        rect.y + rect.height > this.viewport.maxY - pad) {
      reasons.push('offscreen');
    }
    if (node.FONT_SIZE * drawnScale < 12) {
      reasons.push('too-small');
    }
    const overlaps = (a: typeof rect, b: typeof rect) =>
      a.x < b.x + b.width && a.x + a.width > b.x &&
      a.y < b.y + b.height && a.y + a.height > b.y;
    if (this.drawingLayer.getDANodes().some(other =>
      other !== node && other.nodeShape !== 'invisible' && other.konvaGroup.visible() &&
      other.zIndex() > node.zIndex() && overlaps(rect, this.nodeStageRect(other)))) {
      reasons.push('occluded');
    }
    return reasons;
  }

  /** Overlay the actual node (shape, text, status, selection) at natural
   *  scale on the chrome layer. Its position follows the real node when
   *  possible and clamps wholly inside the viewport otherwise. */
  private refreshNavigationLandingGhost(node: DANode, knownReasons?: string[]): void {
    this.clearNavigationLandingGhost(false);
    if (!this.stage || !this.crosshairsLayer) return;
    const reasons = knownReasons ?? this.navigationGhostReasons(node);
    if (reasons.length === 0) return;
    const rect = this.nodeStageRect(node);
    const center = {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2};
    const pad = 12;
    const clampedStart = (start: number, size: number, lo: number, hi: number) =>
      size + pad * 2 > hi - lo
        ? lo + (hi - lo - size) / 2
        : Math.max(lo + pad, Math.min(start, hi - size - pad));
    const x = clampedStart(center.x - node.NODE_WIDTH / 2, node.NODE_WIDTH,
      this.viewport.minX, this.viewport.maxX);
    const y = clampedStart(center.y - node.NODE_HEIGHT / 2, node.NODE_HEIGHT,
      this.viewport.minY, this.viewport.maxY);
    const palette = this.visualConfigService.getEffectivePalette(this.themeService.theme);
    // Fully opaque: this is a stand-in for a node you cannot read, and at
    // 0.94 the real node showed through it wherever the two overlapped.
    const group = new Konva.Group({
      name: 'navigation-node-ghost',
      x,
      y,
      listening: false,
    });
    group.setAttr('targetId', node.id);
    group.setAttr('reasons', reasons);
    // Ground the clone on the canvas colour so anything behind the ghost is
    // occluded even where the node's own fill is translucent.
    group.add(this.ghostOutlineShape(node, {
      fill: palette.drawingStageBackground,
    }));
    const clone = node.konvaGroup.clone({
      x: 0,
      y: 0,
      scaleX: 1,
      scaleY: 1,
      listening: false,
    });
    group.add(clone);
    group.add(this.ghostOutlineShape(node, {
      stroke: palette.crosshairsStroke,
      strokeWidth: 2,
      dash: [7, 5],
    }));
    this.navigationLandingGhost.show(() => group);
    this.crosshairsLayer.batchDraw();
  }

  /** The ghost's backing and its dashed outline, in the node's own shape:
   *  an ellipse for a circle node — which a long label stretches into a real
   *  ellipse — and a rounded box otherwise (da-442). Local to the ghost
   *  group, whose origin is the node's top-left. */
  private ghostOutlineShape(node: DANode, style: Record<string, unknown>): Konva.Shape {
    if (node.nodeShape === 'circle') {
      return new Konva.Ellipse({
        x: node.NODE_WIDTH / 2,
        y: node.NODE_HEIGHT / 2,
        radiusX: node.NODE_WIDTH / 2,
        radiusY: node.NODE_HEIGHT / 2,
        listening: false,
        ...style,
      });
    }
    return new Konva.Rect({
      width: node.NODE_WIDTH,
      height: node.NODE_HEIGHT,
      cornerRadius: 7,
      listening: false,
      ...style,
    });
  }

  private clearNavigationLandingGhost(draw = true): boolean {
    return this.navigationLandingGhost.clear(draw);
  }

  private updateCrosshairsProbeShape(
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

  private movementDistanceForTier(
    tier: GridTier,
    minorSpacing: number,
    majorSpacing: number,
  ): number {
    const cursor = this.visualConfigService?.config.cursor;
    const configured = tier === 'fine' ? cursor?.fineMovementGridSteps
      : tier === 'coarse' ? cursor?.coarseMovementGridSteps
      : cursor?.normalMovementGridSteps;
    const fallback = tier === 'fine' ? 1 : tier === 'coarse' ? 10 : 5;
    const gridSteps = configured !== undefined && Number.isFinite(configured) && configured > 0
      ? configured
      : fallback;
    return gridSteps * (tier === 'coarse' ? majorSpacing : minorSpacing);
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
      // A held view key keeps everything up; releasing it re-arms this timer.
      if (this.crosshairsHeldVisible) return;
      this.drawingLayer.hideGrid();
      this.setGridIndicatorsVisible(false);
      this.refreshWaypointVisibility(false);
      this.clearNormalMovementGoal(false);
      this.clearCrosshairHoverHighlight(false);
      this.crosshairsLayer.hideCrosshairs();
      this.drawingLayer.batchDraw();
      this.crosshairsLayer.batchDraw();
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

    const {x: crosshairsX, y: crosshairsY} = this.camera.toLayer({
      x: this.crosshairsLayer.crosshairs.x,
      y: this.crosshairsLayer.crosshairs.y,
    });

    let closestNode: DANode | null = null;
    let closestDist = Infinity;

    // The handle is only offered when the drag gesture would have nothing
    // else to act on — same stand-down rule as enterDragMode, so a visible
    // handle always means "v will resize" (da-193).
    if (!this.hasItemUnderCrosshairs() && !this.hasDragSelection()) {
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
    this.clearCrosshairHoverHighlight(false);
    this.tween({
      node: this.drawingLayer,
      duration: this.CROSSHAIR_MOVEMENT_DURATION,
      x: this.drawingLayer.x() + deltaX,
      y: this.drawingLayer.y() + deltaY,
      easing: Konva.Easings.Linear,
      onFinish: () => this.afterMovementTween(),
    });
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
      diagramTypeName: this.drawingLayer.diagramType === 'default'
        ? '' : resolveIdentity(this.drawingLayer.diagramType).name,
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
    if (this.journey.focusEdge(edge)) this.drawingLayer.batchDraw();
  }

  // ── Move by Link (held NSEW quadrants): delegated to LinkNavController ──

  // --- Nav popup (TRAVERSE_SMART): IntelliJ-style go-to for the graph ---

  /** Enter the sticky Move by Link surface. Every candidate is available;
   *  momentum only decides the initial preview row. Directional movement or
   *  an explicit Enter/Tab performs traversal — opener release never does. */
  private traverseSmart(keys?: {up: string; left: string; down: string; right: string}): void {
    // Move by Link is sticky: releasing its opener does not accidentally
    // traverse whichever row happened to be first.
    this.navPopupHoldKey = null;
    if (keys) this.navPopupDirectionKeys = {...keys};
    this.finishTweens();
    const source = this.getTraversalAnchorNode();
    if (!source) {
      this.emitStatus('Move the crosshairs onto a node to navigate.');
      return;
    }
    // Free movement to a different node is a cold start.
    this.journey.coldStartUnlessAt(source);
    const candidates = navCandidatesFor(source);
    if (candidates.length === 0) {
      this.emitStatus('No edges here.');
      return;
    }
    this.openNavPopup(source, candidates, this.journey.direction ?? 'out',
      candidates.length === 1);
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
    const ordered = orderNavCandidates(candidates, forwardDir, bearing);
    this.navCandidates = new Map(ordered.map(c => [c.edge.id, c]));
    this.navSource = source;
    this.navDirectionalFocus = false;
    // The popup opens with the top row selected; its highlight emit is
    // deferred, so seed the candidate now for the initial popup placement.
    this.navHighlightCand = ordered[0];
    this.navPopupSelectedId = ordered[0].edge.id;
    this.navPopupRows = navPopupRows(ordered, forwardDir);
    this.navPopupDark = this.themeService.theme === 'dark';
    this.emphasizeNavSource(source);
    if (!this.navPopupOpen) {
      this.navPopupPurpose = 'nav';
      this.navPopupStartFilter = false;
      this.navPopupOpen = true;
      this.daOut.emit({kind: 'popup-state', open: true, surface: 'nav-popup'});
    }
    this.positionNavPopup();
    this.drawingLayer.batchDraw();
  }

  /** Selection moved in the popup: glow the candidate edge and paint the
   *  ghost preview of where it leads. The view (pan and zoom) never moves —
   *  offscreen destinations are represented by the ghost copy instead. */
  onNavPopupHighlight(edgeId: string): void {
    if (this.navPopupPurpose === 'grow-type') return;
    if (this.navPopupPurpose === 'grow-target') {
      const node = this.drawingLayer.getDANodes().find(n => n.id === edgeId);
      if (node && node !== this.growAnchor) {
        this.growTarget = node;
        this.redrawGrowGhost();
      }
      return;
    }
    const cand = this.navCandidates.get(edgeId);
    if (!cand || !this.navSource) return;
    this.navHighlightCand = cand;
    this.navPopupSelectedId = edgeId;
    this.setGraphNavEdge(cand.edge);
    if (!this.navPopupHidden) this.renderNavGhost(cand);
    this.positionNavPopup();
    this.drawingLayer.batchDraw();
  }

  /** NSEW movement among the incident links. A unique link in the requested
   *  quadrant walks immediately; otherwise the first press focuses and
   *  subsequent perpendicular presses scan before an along-link press walks. */
  onNavPopupDirection(direction: LinkCardinalDirection): void {
    if (this.navPopupPurpose !== 'nav' || !this.navSource) return;
    const source = this.navSource;
    const move = moveLinkQuadrant(
      linkDirectionsFrom(source, [...this.navCandidates.values()]),
      this.navDirectionalFocus ? this.navHighlightCand?.edge.id ?? null : null,
      direction,
      true,
    );
    if (!move.id) {
      this.emitStatus(`No link in the ${direction} quadrant.`);
      return;
    }
    this.navDirectionalFocus = true;
    if (move.traverse) {
      this.onNavPopupCommit({id: move.id, walk: true});
    } else {
      this.navPopupSelectedId = move.id;
      this.onNavPopupHighlight(move.id);
    }
  }

  onNavPopupCommit(event: {id: string; walk: boolean}): void {
    if (this.navPopupPurpose === 'grow-target') {
      this.growCommitToNodeId(event.id);
      return;
    }
    if (this.navPopupPurpose === 'grow-type') {
      this.enterGrowPlacement(event.id);
      return;
    }
    const cand = this.navCandidates.get(event.id);
    const source = this.navSource;
    this.clearNavGhost();
    this.navHighlightCand = null;
    this.navPopupSelectedId = null;
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
    if (this.navPopupPurpose === 'grow-target' || this.navPopupPurpose === 'grow-type') {
      // Esc out of a grow popup cancels the whole add.
      this.navPopupOpen = false;
      this.navPopupPurpose = 'nav';
      this.exitGrowMode();
      this.emitStatus('Add canceled');
      return;
    }
    this.clearNavGhost();
    this.navHighlightCand = null;
    this.navPopupSelectedId = null;
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
    this.journey.arrive(source, dest, cand.direction);
    const dC = this.getNodeCenterInLayerCoordinates(dest);
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
      x: this.viewport.centerX - dC.x * scale,
      y: this.viewport.centerY - dC.y * scale,
    });
    this.crosshairsLayer.crosshairs.x = this.viewport.centerX;
    this.crosshairsLayer.crosshairs.y = this.viewport.centerY;
    const candidates = navCandidatesFor(dest);
    if (candidates.length === 0) {
      this.emitStatus(`${destLabel}: dead end.`);
      this.closeNavPopup();
      return;
    }
    this.setGraphNavEdge(null);
    this.openNavPopup(dest, candidates, this.journey.direction ?? 'out');
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
  /** Ctrl+O (delta -1) / Ctrl+I (delta +1): step through the jumplist. */
  private navHistoryGo(delta: -1 | 1): void {
    const node = this.journey.stepHistory(
      delta, id => this.drawingLayer.getDANodes().find(n => n.id === id));
    if (!node) {
      this.emitStatus(delta < 0
        ? 'Already at the oldest nav position.'
        : 'Already at the newest nav position.');
      return;
    }
    this.finishTweens();
    this.drawingLayer.batchDraw();
    this.centerViewOnLayerPoint(this.getNodeCenterInLayerCoordinates(node));
    const label = (node.label?.text() ?? '').trim() || '(unlabeled)';
    this.emitStatus(`${delta < 0 ? '⟨O⟩ back:' : '⟨I⟩ forward:'} ${label}`);
  }

  // ── The nav popup's jump preview: delegated to NavGhost ──
  private clearNavGhost(): void {
    this.navGhost.clear();
  }

  private renderNavGhost(cand: NavCandidate): void {
    if (this.navSource) this.navGhost.show(this.navSource, cand);
  }


  /** Beside the source node, on the opposite horizontal side from the
   *  highlighted destination (destination east → popup west), so the popup
   *  never sits between you and where you're going. */
  private positionNavPopup(): void {
    if (!this.navSource) return;
    const scale = this.drawingLayer.scaleX();
    const n = this.navSource;
    const rect = {
      x: this.drawingLayer.x() + n.group.x() * scale,
      y: this.drawingLayer.y() + n.group.y() * scale,
      w: n.NODE_WIDTH * scale,
    };
    let destEast = true;
    if (this.navHighlightCand) {
      const sC = this.getNodeCenterInLayerCoordinates(n);
      const dC = this.getNodeCenterInLayerCoordinates(this.navHighlightCand.other);
      destEast = dC.x >= sC.x;
    }
    const position = placePopup(
      rect, this.popupViewport(), popupSize(this.navPopupRows.length), destEast ? 'left' : 'right');
    this.navPopupLeft = position.left;
    this.navPopupTop = position.top;
  }

  private popupViewport(): {minX: number; maxX: number; minY: number; maxY: number} {
    return {
      minX: this.viewport.minX,
      maxX: this.viewport.maxX,
      minY: this.viewport.minY,
      maxY: this.viewport.maxY,
    };
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
    return this.journey.lastNodeAmong(this.drawingLayer.getDANodes());
  }



  /** Pan the view (no rescale) so the layer point sits at the stage center,
   *  tweening the crosshairs onto it in step. */
  /** Vim-`zz` for the canvas: pan the view so the graph point under the
   *  crosshairs lands at screen center. The crosshairs ride along (still
   *  over the same graph point) and the zoom level is untouched. */
  private recenterViewOnCrosshairs(): void {
    this.finishTweens();
    this.centerViewOnLayerPoint(this.crosshairsInLayerCoords());
  }

  // ─── Operations: the write path for changes that aren't keymenu commands ──

  private operationsRuntime: Promise<{
    applier: GraphOperationApplier;
    invert: (ops: readonly GraphOperation[]) => GraphOperation[];
  }> | null = null;

  /** The operations code loads on first use; so far only agent edits need it,
   *  and it keeps the initial bundle inside its budget. */
  private loadOperations() {
    return this.operationsRuntime ??= Promise.all([import('./graph-operation-applier'), import('./graph-operations')])
      .then(([applierModule, operations]) => ({
        applier: new applierModule.GraphOperationApplier(this.drawingLayer, {
          nodesChanged: nodes => this.updateEdgesForResizedNodes(nodes),
          edgeAdded: edge => this.autoRouteNewEdge(edge),
        }),
        invert: operations.invertOperations,
      }));
  }

  /**
   * Apply an undo group (today: agent edits) all-or-nothing, record it for
   * undo, and save. Resolves to a conflict message instead, having changed
   * nothing, when the graph no longer matches what the operations expect.
   */
  async applyOperations(group: UndoGroup): Promise<string | null> {
    const {applier} = await this.loadOperations();
    this.finishTweens();
    const conflict = applier.apply(group.ops);
    if (conflict) return conflict;
    this.undoRedoService.pushGroup(group);
    this.afterOperations();
    return null;
  }

  /** Undo every group of a change set (e.g. one agent turn) as one new undo
   *  group, even if other changes came after it. */
  async revertChangeSet(changeSetId: string, author = 'user'): Promise<string | null> {
    const groups = this.undoRedoService.changeSetGroups(changeSetId);
    if (groups.length === 0) return `Nothing left to revert in ${changeSetId}`;
    const {invert} = await this.loadOperations();
    return this.applyOperations({
      author,
      label: `Revert ${groups[0].label}`,
      ops: invert(groups.flatMap(group => group.ops)),
    });
  }

  private afterOperations(): void {
    this.drawingLayer.batchDraw();
    this.checkAndEmitEditState();
    this.scheduleVaultAutoSave();
  }

  // ─── Agent mode canvas surface (AgentCanvasTarget; notes/idea-mcp-server.md) ──
  // Read-only inspection plus view guidance. Nothing here mutates the graph
  // or touches the undo stack.

  agentNodes(): AgentNodeInfo[] {
    return this.drawingLayer.getDANodes().map(node => ({
      id: node.id, label: node.label.text(), tags: [...node.tags],
    }));
  }

  agentEdges(): AgentEdgeInfo[] {
    return this.drawingLayer.getDAEdges().map(edge => ({
      id: edge.id,
      from: edge.srcNode.id,
      to: edge.destNode.id,
      labels: edge.labels.map(label => label.label),
      tags: [...edge.tags],
    }));
  }

  agentSelection(): {nodeIds: string[]; edgeIds: string[]; underCrosshairsId: string | null} {
    return {
      nodeIds: this.drawingLayer.getSelectedDANodes().map(n => n.id),
      edgeIds: this.drawingLayer.getSelectedDAEdges().map(e => e.id),
      underCrosshairsId: this.getDANodesContainingCrosshairs()[0]?.id ?? null,
    };
  }

  agentZoomPercent(): number {
    return Math.round(this.drawingLayer.scaleX() * 100);
  }

  agentVisibleNodeIds(): string[] {
    const scale = this.drawingLayer.scaleX();
    const minX = this.viewport.minX, maxX = this.viewport.maxX, minY = this.viewport.minY, maxY = this.viewport.maxY;
    return this.drawingLayer.getDANodes().filter(node => {
      const x = this.drawingLayer.x() + node.group.x() * scale;
      const y = this.drawingLayer.y() + node.group.y() * scale;
      return x + node.NODE_WIDTH * scale > minX && x < maxX && y + node.NODE_HEIGHT * scale > minY && y < maxY;
    }).map(node => node.id);
  }

  /** Until this time (performance.now()), view changes are the agent's own focus animation. */
  private agentViewMoveUntil = 0;
  private lastUserViewChangeEmit = 0;

  /**
   * Tell the shell whenever the user, not the agent, pans or zooms the view,
   * however it happened: pan and zoom keys, crosshairs pushing at the edge,
   * a jump, the mouse. Agent mode uses this to switch to "You lead"; a plain
   * crosshairs move that leaves the view where it is doesn't count.
   */
  private watchUserViewChanges(): void {
    this.drawingLayer.on('xChange.agentView yChange.agentView scaleXChange.agentView', () => {
      const now = performance.now();
      // A tween changes the view every frame; one notification per burst is plenty.
      if (now < this.agentViewMoveUntil || now - this.lastUserViewChangeEmit < 250) return;
      this.lastUserViewChangeEmit = now;
      this.daOut.emit({kind: 'view-changed-by-user'});
    });
  }

  /** Pan the view onto the node. The agent only points: it never changes the
   *  user's selection, so nothing the user is doing gets redirected. */
  agentFocusNode(id: string): boolean {
    const node = this.drawingLayer.getDANodes().find(n => n.id === id);
    if (!node) return false;
    this.agentViewMoveUntil = performance.now() + this.RECENTER_DURATION * 1000 + 150;
    this.finishTweens();
    this.centerViewOnLayerPoint(this.getNodeCenterInLayerCoordinates(node));
    this.drawingLayer.batchDraw();
    return true;
  }

  agentDiagramTypeId(): string {
    return this.drawingLayer.diagramType;
  }

  async agentApplyChanges(changes: AgentChange[], meta: AgentEditMeta): Promise<AgentChangeResult> {
    const planner = await import('./agent-change-planner');
    return planner.applyAgentChanges(
      this.drawingLayer.serializeGraph(), changes, meta, nextId, group => this.applyOperations(group),
      () => this.agentArrange(meta));
  }

  /** The agent's "arrange": lay the graph out top-down along its links
   *  (layered-layout.ts), as moves in the agent's change set, so undoing its
   *  turn puts the nodes back. Pinned nodes stay where they are. */
  private async agentArrange(meta: AgentEditMeta): Promise<string | null> {
    const nodes = this.drawingLayer.getDANodes();
    const edges = this.drawingLayer.getDAEdges();
    const positions = layeredLayout(
      nodes.map(node => ({id: node.id, x: node.group.x(), y: node.group.y(), width: node.NODE_WIDTH, height: node.NODE_HEIGHT})),
      edges.map(edge => ({from: edge.srcNode.id, to: edge.destNode.id})),
    );
    const ops: GraphOperation[] = [];
    for (const node of nodes) {
      const to = positions.get(node.id);
      const from = {x: node.group.x(), y: node.group.y()};
      if (!to || node.pinned || (Math.abs(to.x - from.x) < 0.5 && Math.abs(to.y - from.y) < 0.5)) continue;
      ops.push({op: 'update_node', id: node.id, before: from, after: {x: to.x, y: to.y}});
    }
    if (ops.length === 0) return null;
    const conflict = await this.applyOperations({
      author: meta.author, label: `${meta.label} (arrange)`, ops, changeSetId: meta.changeSetId,
    });
    // Routes drawn around the old positions would loop around the new ones.
    for (const edge of edges) edge.setControlPoints([]);
    this.updateEdgesForResizedNodes(nodes);
    this.drawingLayer.batchDraw();
    return conflict;
  }

  agentRevertChangeSet(changeSetId: string): Promise<string | null> {
    return this.revertChangeSet(changeSetId);
  }

  agentSetHighlights(ids: string[]): void {
    const wanted = new Set(ids);
    for (const node of this.drawingLayer.getDANodes()) {
      if (wanted.has(node.id) || node.agentHighlighted) node.setAgentHighlight(wanted.has(node.id));
    }
    for (const edge of this.drawingLayer.getDAEdges()) edge.setEmphasized(wanted.has(edge.id));
    this.drawingLayer.batchDraw();
  }

  agentNodeClientRect(id: string): ClientRect | null {
    const node = this.drawingLayer.getDANodes().find(n => n.id === id);
    if (!node) return null;
    const scale = this.drawingLayer.scaleX();
    const container = this.stage.container().getBoundingClientRect();
    return {
      left: container.left + this.drawingLayer.x() + node.group.x() * scale,
      top: container.top + this.drawingLayer.y() + node.group.y() * scale,
      width: node.NODE_WIDTH * scale,
      height: node.NODE_HEIGHT * scale,
    };
  }

  agentViewClientRect(): ClientRect {
    const container = this.stage.container().getBoundingClientRect();
    return {
      left: container.left + this.viewport.minX,
      top: container.top + this.viewport.minY,
      width: this.viewport.width,
      height: this.viewport.height,
    };
  }

  private centerViewOnLayerPoint(
    p: Point,
    targetScale = this.drawingLayer.scaleX(),
    onFinish?: () => void,
  ): void {
    const centerX = this.viewport.centerX;
    const centerY = this.viewport.centerY;
    this.tween({
      node: this.drawingLayer,
      duration: this.RECENTER_DURATION,
      scaleX: targetScale,
      scaleY: targetScale,
      x: centerX - p.x * targetScale,
      y: centerY - p.y * targetScale,
      easing: Konva.Easings.EaseInOut,
      onFinish: () => {
        this.emitZoomLevel();
        onFinish?.();
      },
    });
    this.tween({
      node: this.crosshairsLayer.crosshairs.konvaGroup,
      duration: this.RECENTER_DURATION,
      x: centerX,
      y: centerY,
      easing: Konva.Easings.EaseInOut,
      onFinish: () => this.checkResizeHandleProximity(),
    });
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

  /** A place move-by-node can land: a node, an edge label, or a waypoint,
   *  with its center in stage coords. */
  private navStops(targets: NavTargetKind): NavigationGridStop[] {
    const scale = this.drawingLayer.scaleX();
    const lx = this.drawingLayer.x(), ly = this.drawingLayer.y();
    const stops: NavigationGridStop[] = [];
    for (const n of this.drawingLayer.getDANodes()) {
      const c = this.getNodeCenterInStageCoordinates(n);
      stops.push({id: n.id, kind: 'node', cx: c.x, cy: c.y});
    }
    if (targets === 'nodes' && this.growActive && this.growAnchor &&
        !this.growPlacing && !this.growEdgeMenuActive) {
      for (const target of this.growGhostTargets) {
        stops.push({
          id: target.id,
          kind: 'node',
          cx: lx + target.x * scale,
          cy: ly + target.y * scale,
        });
      }
    }
    if (targets === 'labels' || targets === 'all') {
      for (const e of this.drawingLayer.getDAEdges()) for (const l of e.labels) {
        // DALabel's group origin is the center of its rendered box.
        stops.push({id: l.id, kind: 'label', cx: lx + l.x * scale, cy: ly + l.y * scale});
      }
    }
    if (targets === 'all') {
      for (const w of this.drawingLayer.getDAWaypoints()) {
        stops.push({id: w.id, kind: 'waypoint', cx: lx + w.x * scale, cy: ly + w.y * scale});
      }
    }
    return stops;
  }

  /** Current stage center of a stop by id+kind (positions move under pan). */
  private navStopCenter(id: string, kind: 'node'|'label'|'waypoint'): Point | null {
    const scale = this.drawingLayer.scaleX();
    const lx = this.drawingLayer.x(), ly = this.drawingLayer.y();
    if (kind === 'node') {
      const ghost = this.growGhostTargets.find(target => target.id === id);
      if (ghost && this.growActive) {
        return {x: lx + ghost.x * scale, y: ly + ghost.y * scale};
      }
      const n = this.drawingLayer.getDANodes().find(n => n.id === id);
      return n ? this.getNodeCenterInStageCoordinates(n) : null;
    }
    if (kind === 'label') {
      for (const e of this.drawingLayer.getDAEdges()) for (const l of e.labels)
        if (l.id === id) return {x: lx + l.x * scale, y: ly + l.y * scale};
      return null;
    }
    const w = this.drawingLayer.getDAWaypoints().find(w => w.id === id);
    return w ? {x: lx + w.x * scale, y: ly + w.y * scale} : null;
  }

  /** The node a traversal or gather should treat as its centre: under the
   *  crosshairs, else the single selected node. */
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

  private getNodeCenterInStageCoordinates(node: DANode): Point {
    return nodeCenterInStage(node, this.camera);
  }

  private getNodeCenterInLayerCoordinates(node: DANode): Point {
    return nodeCenterInLayer(node);
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

  // Kept as a method because tools/qa scripts call it; see
  // tools/qa/contract/component-api.js.
  private finishTweens() {
    this.animations.finishAll();
  }

  private cancelDragAnimation() {
    this.animations.cancelFrame();
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

  private crosshairsInLayerCoords(): Point {
    return this.probe.position;
  }

  /** Edge whose polyline comes closest to `point`, plus the snapped closest
   *  point on that polyline and the segment index it lies on. `segmentIndex`
   *  is the index into `_controlPoints` at which a new waypoint should be
   *  spliced to split the chosen segment (segment 0 splits before the first
   *  control point; segment k splits between cp[k-1] and cp[k]). Returns
   *  undefined if no edges exist. */
  private findNearestEdgeSnap(point: Point):
      {edge: DAEdge; point: Point; segmentIndex: number} | undefined {
    const edges = this.drawingLayer.getDAEdges();
    let bestEdge: DAEdge | undefined;
    let bestSnap: Point | undefined;
    let bestSeg = 0;
    let bestDist = Infinity;
    for (const edge of edges) {
      const snap = this.findSnapOnEdge(edge, point);
      if (snap && snap.distance < bestDist) {
        bestDist = snap.distance;
        bestEdge = edge;
        bestSnap = snap.point;
        bestSeg = snap.segmentIndex;
      }
    }
    if (!bestEdge || !bestSnap) return undefined;
    return {edge: bestEdge, point: bestSnap, segmentIndex: bestSeg};
  }

  /** Closest point on one edge to a drawing-layer point. Keeping this
   *  edge-specific lets Select+Drag turn the exact edge under `v` into a
   *  waypoint drag, even when another edge passes very close by. */
  private findSnapOnEdge(edge: DAEdge, point: Point):
      {point: Point; segmentIndex: number; distance: number} | undefined {
    const pts = edge.getPathPoints();
    let best: {point: Point; segmentIndex: number; distance: number} | undefined;
    for (let i = 0; i < pts.length - 1; i++) {
      const closest = closestPointOnSeg(
        point.x, point.y,
        pts[i].x, pts[i].y,
        pts[i + 1].x, pts[i + 1].y,
      );
      const distance = Math.hypot(closest.x - point.x, closest.y - point.y);
      if (!best || distance < best.distance) {
        best = {point: closest, segmentIndex: i, distance};
      }
    }
    return best;
  }

  private focusNodeForLabelEdit(node: DANode): void {
    this.finishTweens();
    const targetScale = Math.min(
      this.MAX_ZOOM,
      Math.max(
        this.drawingLayer.scaleX(),
        DrawingAreaComponent.NODE_EDIT_ZOOM,
      ),
    );
    // While the focus zoom is in flight, the edit lens must judge legibility
    // by where the zoom is going, not the mid-tween scale — otherwise a lens
    // built during the tween survives at full zoom as a phantom second copy
    // of the freshly added node (da-198).
    this.focusZoomTargetScale = targetScale;
    // And take down any lens built a moment ago, while the graph was still
    // zoomed out: it would otherwise sit there for the whole flight in, a
    // small copy of the node laid over the big one it is becoming.
    this.refreshLabelEditGhost();
    this.centerViewOnLayerPoint(
      this.getNodeCenterInLayerCoordinates(node),
      targetScale,
      () => {
        this.focusZoomTargetScale = null;
        this.refreshLabelEditGhost();
      },
    );
  }

  /** Enter label editing for a node that has just been added. Every label edit
   *  now takes the same focus — at least 100% and centred on the box — since what
   *  you are typing is the thing you want to be looking at. */
  private beginNewNodeLabelEdit(node: DANode): void {
    this.pendingNodeLabelEdit = null;
    this.clearLabelEditGhost();
    if (node.nodeShape === 'junction' || node.nodeShape === 'invisible') return;
    node.setCursorToEnd();
    node.showCursor();
    this.crosshairsLayer.hideCrosshairs();
    this.drawingLayer.batchDraw();
    this.checkAndEmitEditState();
    this.daOut.emit({kind: 'started-label-editing-mode', mode: 'insert'});
    // After the mode is out: typing hides the keyboard, and the viewport it
    // was occupying is the difference between "centred" and "in the top
    // third". The inset lands on the next turn, so the camera waits for it.
    setTimeout(() => this.focusNodeForLabelEdit(node));
  }

  private beginPendingNodeLabelEdit(): void {
    const node = this.pendingNodeLabelEdit;
    this.pendingNodeLabelEdit = null;
    if (!node || !this.drawingLayer.getDANodes().includes(node)) return;
    this.beginNewNodeLabelEdit(node);
  }

  private createNewNode(
    nodeShape?: NodeShape,
    notifyHeldInsert = true,
  ): DANode {
    this.finishTweens();

    // Get currently selected nodes (sources for auto-connect edges)
    const selectedNodes = this.drawingLayer.getSelectedDANodes();

    // Unselect all before creating (new node will auto-select)
    this.drawingLayer.unselectAll();
    this.unselectAllLabels();

    const newNode = this.drawingLayer.createNewNode(this.crosshairsLayer.crosshairsX(), this.crosshairsLayer.crosshairsY(), nodeShape ?? this._defaultNodeShape);

    // Create edges from each previously selected node to the new node. When
    // exactly one link was drawn, that is the one the crosshairs land on once
    // the label is written (da-509).
    const drawn = selectedNodes.map(srcNode => this.addDefaultEdge(srcNode, newNode));
    this.newNodeArrivedByLink = drawn.length > 0;

    const labelable = newNode.nodeShape !== 'junction' &&
      newNode.nodeShape !== 'invisible';
    if (notifyHeldInsert) {
      this.pendingNodeLabelEdit = labelable ? newNode : null;
      if (labelable) {
        newNode.showCursor();
        this.crosshairsLayer.hideCrosshairs();
      }
      this.daOut.emit({kind: 'node-inserted', labelable});
    } else {
      this.pendingNodeLabelEdit = null;
    }
    this.drawingLayer.batchDraw();
    this.checkAndEmitEditState();
    return newNode;
  }


  private getCrosshairsBBoxInDrawingLayer(): ProbeBounds {
    return this.probe.bounds;
  }

  // Kept as methods because tools/qa scripts call them; see
  // tools/qa/contract/component-api.js. Inside this class, ask the probe.
  private getDAEdgesContainingCrosshairs(): DAEdge[] {
    return this.probe.edges();
  }

  private getDANodesContainingCrosshairs(): DANode[] {
    return this.probe.nodes();
  }

  private recenterViewAndCrosshairs(): void {
    this.recenterView();
    this.recenterCrosshairs();
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

    const stageWidth = this.viewport.width;
    const stageHeight = this.viewport.height;

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

    this.animations.startSelfRemoving({
      node: this.drawingLayer,
      duration: this.RECENTER_DURATION,
      scaleX: targetScale,
      scaleY: targetScale,
      x: stageWidth / 2 - centerX * targetScale,
      y: stageHeight / 2 - centerY * targetScale,
      easing: Konva.Easings.EaseInOut,
      onFinish: () => this.emitZoomLevel(),
    });
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
    const fit = Math.min((this.viewport.width * margin) / w, (this.viewport.height * margin) / h);
    // Fitting may go below the interactive MIN_ZOOM — a rescue that stops
    // short of showing the whole graph isn't a rescue. Floor well below it.
    const scale = Math.min(Math.max(fit, 0.02), 1.0);
    this.drawingLayer.scale({ x: scale, y: scale });
    this.drawingLayer.position({
      x: this.viewport.centerX - ((box.minX + box.maxX) / 2) * scale,
      y: this.viewport.centerY - ((box.minY + box.maxY) / 2) * scale,
    });
    this.drawingLayer.batchDraw();
  }

  private recenterCrosshairs() {
    this.finishTweens();
    this.clearCrosshairHoverHighlight(false);

    this.animations.startSelfRemoving({
      node: this.crosshairsLayer.crosshairs.konvaGroup,
      duration: this.RECENTER_CROSSHAIRS_DURATION,
      x: this.viewport.centerX,
      y: this.viewport.centerY,
      easing: Konva.Easings.EaseInOut,
      onFinish: () => this.scheduleCrosshairHoverRefresh(20),
    });
  }

  /** One press of a drag key. The held gesture decides what it moves: the
   *  area-select corner, a node being resized, or the selection. */
  private dragKey(axis: Axis, sign: 1 | -1, tier?: GridTier): void {
    if (this.areaSelect.active) this.areaSelect.step(axis, sign, tier);
    else if (this.resizeTargetNode) this.resizeSelected(sign);
    else this.dragSelected(axis, sign, tier);
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

  /** Move whatever is selected one step along `axis` (KeyboardDrag).
   *  Tools-facing: the tools/qa scripts drive this directly, and since `Axis`
   *  is not reachable from a page.evaluate they pass 'x' or 'y'. Accept both
   *  here and nowhere else. */
  private dragSelected(axis: Axis | AxisKey, sign: 1 | -1, tier?: GridTier) {
    this.hasDragged = true;
    this.keyboardDrag.step(axis instanceof Axis ? axis : Axis.of(axis), sign, tier);
  }

  private placeCrosshairs(at: Point): void {
    this.crosshairsLayer.crosshairs.x = at.x;
    this.crosshairsLayer.crosshairs.y = at.y;
  }

  private panLayerAlong(axis: Axis, delta: number): void {
    if (delta === 0) return;
    const layer = this.drawingLayer;
    if (axis.horizontal) layer.x(layer.x() + delta); else layer.y(layer.y() + delta);
  }

  private updateEdgePoints(edge: DAEdge) {
    edge.refreshGeometry();
    this.drawingLayer.batchDraw();
  }

  private addLabel(notifyHeldAdd = true): DALabel | null {
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
          if (notifyHeldAdd) {
            this.daOut.emit({kind: 'label-added'});
          }
          return label;
        }
      }
    }
    this.log.log('addLabel: no edge found under crosshairs');
    return null;
  }

  /** Show carets on everything about to be edited. A crosshairs point places
   *  the caret spatially for the single target under `i`; selection-driven
   *  editing retains the established end-of-text behavior. */
  private showEditCarets(point?: Point): void {
    const resized = new Map<DANode, Point>();
    this.drawingLayer.getSelectedDANodes().forEach(n => {
      if (point) {
        n.setCursorFromLocalPoint({
          x: point.x - n.group.x(),
          y: point.y - n.group.y(),
        });
      } else {
        n.setCursorToEnd();
      }
      this.toggleNodeCaret(n, () => n.showCursor(), resized);
    });
    this.settleCaretResizes(resized);
    this.getSelectedLabels().forEach(l => {
      if (point) {
        l.setCursorFromLocalPoint({x: point.x - l.x, y: point.y - l.y});
      } else {
        l.setCursorToEnd();
      }
      l.showCursor();
    });
    this.refreshLabelEditGhost();
  }

  /** Rebuild the low-zoom edit lens from the live node so text, selection,
   *  and caret changes appear immediately without zooming the graph. */
  private refreshLabelEditGhost(): void {
    this.keepEditCaretVisible();
    this.clearLabelEditGhost(false);
    const effectiveScale = this.focusZoomTargetScale ?? this.drawingLayer?.scaleX() ?? 1;
    if (!this.crosshairsLayer || !this.drawingLayer ||
        effectiveScale >= DrawingAreaComponent.NODE_EDIT_MIN_ZOOM) {
      return;
    }
    const selected = this.drawingLayer.getSelectedDANodes();
    if (selected.length !== 1) return;
    const node = selected[0];
    const center = this.getNodeCenterInStageCoordinates(node);
    const padding = 12;
    const x = Math.max(this.viewport.minX + padding, Math.min(
      center.x - node.NODE_WIDTH / 2,
      this.viewport.maxX - node.NODE_WIDTH - padding,
    ));
    const y = Math.max(this.viewport.minY + padding, Math.min(
      center.y - node.NODE_HEIGHT / 2,
      this.viewport.maxY - node.NODE_HEIGHT - padding,
    ));
    const ghost = node.konvaGroup.clone({
      name: 'label-edit-ghost',
      x,
      y,
      scaleX: 1,
      scaleY: 1,
      opacity: 0.92,
      listening: false,
    });
    ghost.getChildren().forEach(child => child.listening(false));
    this.labelEditGhost.show(() => ghost);
    this.crosshairsLayer.batchDraw();
  }

  /** Pan without zooming whenever the one active text caret approaches a
   * viewport edge. Three rendered lines remain available above and below. */
  private keepEditCaretVisible(): void {
    if (!this.stage || !this.drawingLayer) return;
    const nodes = this.drawingLayer.getSelectedDANodes();
    const labels = this.getSelectedLabels();
    if (nodes.length + labels.length !== 1) return;

    const layerScaleX = this.drawingLayer.scaleX();
    const layerScaleY = this.drawingLayer.scaleY();
    let local: {x: number; y: number; width: number; height: number; lineHeight: number};
    let targetGroup: Konva.Group;
    if (nodes.length === 1) {
      local = nodes[0].caretViewportBox();
      targetGroup = nodes[0].group;
    } else {
      local = labels[0].caretViewportBox();
      targetGroup = labels[0].group;
    }
    const caret = {
      x: this.drawingLayer.x() +
        (targetGroup.x() + local.x * targetGroup.scaleX()) * layerScaleX,
      y: this.drawingLayer.y() +
        (targetGroup.y() + local.y * targetGroup.scaleY()) * layerScaleY,
      width: local.width * targetGroup.scaleX() * layerScaleX,
      height: local.height * targetGroup.scaleY() * layerScaleY,
    };
    const delta = caretVisibilityPanDelta(
      caret,
      {width: this.viewport.width, height: this.viewport.height},
      local.lineHeight * targetGroup.scaleY() * layerScaleY,
    );
    if (delta.x === 0 && delta.y === 0) return;
    this.drawingLayer.position({
      x: this.drawingLayer.x() + delta.x,
      y: this.drawingLayer.y() + delta.y,
    });
    this.drawingLayer.batchDraw();
  }

  private clearLabelEditGhost(draw = true): void {
    this.labelEditGhost.clear(draw);
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
       this.daOut.emit({kind: "started-label-editing-mode", mode: 'vimNormal'});
       return;
    }

    // 2. If no selection, check under crosshairs for editable items.
    const label = this.getLabelUnderCrosshairs();
    if (label) {
      this.log.log('  -> Found label under crosshairs. Selecting and editing.');
      this.selectOnlyTopItem();
      this.crosshairsLayer.hideCrosshairs();
      this.showEditCarets(this.crosshairsInLayerCoords());
      this.drawingLayer.batchDraw();
      this.daOut.emit({kind: "started-label-editing-mode", mode: 'vimNormal'});
      return;
    }

    const nodes = this.getDANodesContainingCrosshairs();
    this.log.log(`  -> Nodes under crosshairs: ${nodes.length}`);
    if (nodes.length > 0) {
      this.log.log('  -> Found node under crosshairs. Selecting and editing.');
      this.selectOnlyTopItem();
      this.crosshairsLayer.hideCrosshairs();
      this.showEditCarets(this.crosshairsInLayerCoords());
      this.drawingLayer.batchDraw();
      this.daOut.emit({kind: "started-label-editing-mode", mode: 'vimNormal'});
      return;
    }

    // 3. Nothing selected or hovered -> no-op (user should use insert key instead)
    this.log.log('  -> Nothing targeted. Edit command ignored.');
  }

  /** Tap of the add key (a=add / i=insert model, notes/design-add-insert-model.md):
   *  quick-add based on what the crosshairs are over. Empty (or waypoint) →
   *  default node at the crosshairs; node → self-loop; edge → editable label;
   *  label → hint.
   *  Selection is irrelevant to adding. */
  private handleQuickAdd(): void {
    if (this.getLabelUnderCrosshairs()) {
      this.daOut.emit({kind: 'status-message', message: 'Label under crosshairs — tap the edit-text key to edit it.'});
      return;
    }
    const anchor = topmost(this.getDANodesContainingCrosshairs());
    if (anchor) {
      this.quickAddSelfLoop(anchor);
      return;
    }
    if (!this.getWaypointUnderCrosshairs() && this.getDAEdgesContainingCrosshairs().length > 0) {
      this.pushUndoSnapshot({kind: DACommandType.ADD_LABEL});
      const label = this.addLabel(false);
      if (!label) return;
      this.showEditCarets();
      this.daOut.emit({kind: 'started-label-editing-mode', mode: 'insert'});
      this.scheduleVaultAutoSave();
      return;
    }
    this.pushUndoSnapshot({kind: DACommandType.QUICK_ADD});
    const newNode = this.createNewNode(undefined, false);
    this.beginNewNodeLabelEdit(newNode);
    this.scheduleVaultAutoSave();
  }

  // ---------------------------------------------------------------------
  // Grow mode (held add key over a node or empty canvas) —
  // notes/design-add-insert-model.md.
  // Drawing-area-owned: the keymenu is suspended (popup-state) and keys are
  // handled by the document-level listeners below, because stage-3/4 popups
  // must be able to open mid-hold without flushing our state.
  // ---------------------------------------------------------------------

  private growActive = false;
  private growAnchor: DANode | null = null;
  /** Start point for an empty-canvas add, in drawing-layer coordinates. */
  private growOrigin: Point | null = null;
  /** Existing-node landing selected through the Move-by-Node engine. */
  private growTarget: DANode | null = null;
  /** Empty insertion landing selected through the same navigation engine. */
  private growInsertionTarget: GrowGhostTarget | null = null;
  /** All midpoint and source-grid insertion stops for this Add hold. */
  private growGhostTargets: GrowGhostTarget[] = [];
  /** Whether the node being labelled arrived on a link a quick-add just drew;
   *  if so the crosshairs rest on it, hidden, once the label is done. */
  private newNodeArrivedByLink = false;
  /** 0: anchor→target, 1: target→anchor, 2: undirected, 3: bidirectional. */
  private growDirState = 0;
  private growHoldKey = 'a';
  private growKeys: {up: string; left: string; down: string; right: string; cycle: string; newNode: string; search: string; coarse: string; fine: string; edgeSubmenu: string; selfLoop: string} | null = null;
  private growEdgeMenuActive = false;
  private growSelfLoopPending = false;
  /** Edge kinds are a small sticky choice surface: once opened, releasing the
   *  Add hold does not discard it before the user can press its leaf key. */
  private growHoldReleased = false;
  /** Physical keys held during grow mode. This makes nested add chords
   *  tolerant of normal human key overlap instead of turning a rolled Self
   *  Loop into a rightward edge hop. */
  private growPressedKeys = new Set<string>();
  /** Free placement after the type popup picked a kind for a new node. */
  private readonly growPlacement = new GrowPlacement(this.growPlacementHost());
  /** The held-Add preview (grow-ghost.ts). */
  private readonly growGhost = new GrowGhost(this.growGhostHost());

  // These accessors keep the browser-facing names stable while placement
  // state lives with GrowPlacement. The tools and existing white-box specs
  // intentionally reach through TypeScript's private boundary.
  private get growPlacing(): boolean { return this.growPlacement.placing; }
  private set growPlacing(value: boolean) { this.growPlacement.placing = value; }
  private get growShape(): NodeShape | undefined { return this.growPlacement.shape; }
  private set growShape(value: NodeShape | undefined) { this.growPlacement.shape = value; }
  private get growPlacePos(): Point | null { return this.growPlacement.position; }
  private set growPlacePos(value: Point | null) { this.growPlacement.position = value; }
  private get growPlacedRough(): boolean { return this.growPlacement.rough; }
  private set growPlacedRough(value: boolean) { this.growPlacement.rough = value; }
  private get growMods(): Set<string> { return this.growPlacement.modifiers; }
  private set growMods(value: Set<string>) { this.growPlacement.modifiers = value; }

  /** ENTER_ADD_MODE: take the hold as grow mode over a node or genuinely
   *  empty canvas. Edges/labels retain the classic label/waypoint hub. */
  private maybeEnterGrowMode(holdKey: string, keys: NonNullable<DrawingAreaComponent['growKeys']>): void {
    const nodes = this.getDANodesContainingCrosshairs();
    const hasLabel = !!this.getLabelUnderCrosshairs();
    const hasEdge = this.getDAEdgesContainingCrosshairs().length > 0;
    const hasWaypoint = !!this.getWaypointUnderCrosshairs();
    if (hasLabel || (nodes.length === 0 && (hasEdge || hasWaypoint))) return;
    this.finishTweens();
    this.growActive = true;
    this.growAnchor = topmost(nodes);
    this.growOrigin = this.growAnchor
      ? this.getNodeCenterInLayerCoordinates(this.growAnchor)
      : this.crosshairsInLayerCoords();
    this.growTarget = null;
    this.growInsertionTarget = null;
    this.growGhostTargets = this.growAnchor
      ? this.buildCurrentGrowGhostTargets(this.growAnchor)
      : [];
    this.growDirState = this.defaultGrowDirection(this.growAnchor);
    this.growPlacing = false;
    this.growShape = undefined;
    this.growPlacePos = null;
    this.growPlacedRough = false;
    this.growMods.clear();
    this.growEdgeMenuActive = false;
    this.growSelfLoopPending = false;
    this.growHoldReleased = false;
    this.growHoldKey = holdKey;
    this.growKeys = keys;
    this.daOut.emit({
      kind: 'popup-state',
      open: true,
      surface: this.growAnchor ? 'grow-targeting' : 'grow-empty',
    });
    if (this.growAnchor) this.navGrid.showNodeGrid('nodes');
    this.redrawGrowGhost();
  }

  private buildCurrentGrowGhostTargets(anchor: DANode): GrowGhostTarget[] {
    const scale = this.drawingLayer.scaleX();
    const lx = this.drawingLayer.x();
    const ly = this.drawingLayer.y();
    const nodes = this.nodeBoxes();
    const source = nodes.find(node => node.id === anchor.id)!;
    const bounds = {
      minX: -lx / scale,
      minY: -ly / scale,
      maxX: (this.stage.width() - lx) / scale,
      maxY: (this.stage.height() - ly) / scale,
    };
    return buildGrowGhostTargets(
      nodes,
      source,
      bounds,
      // The lattice's rows and columns get their own step, so placing above is
      // as close as the vertical slot says while placing beside still clears
      // a wide anchor box (da-559). Each is rounded up to a whole cell of the
      // major drawing grid: the spots then read as a grid — a coarse one, well
      // above the background's fine squares — rather than as free positions.
      this.growLatticeStep(anchor),
      this.growAnchorHalf(anchor),
    );
  }

  /** Paste text from the system clipboard into the label being edited, e.g.
   *  markdown copied from the agent chat. Text fields handle their own pastes. */
  @HostListener('document:paste', ['$event'])
  onPasteText(event: ClipboardEvent): void {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('input, textarea, [contenteditable="true"]')) return;
    const text = event.clipboardData?.getData('text/plain');
    if (!text) return;
    const editing = this.drawingLayer.getDANodes().some(node => node.isEditingText)
      || this.getAllLabels().some(label => label.isEditingText);
    if (!editing) return;
    event.preventDefault();
    this.insertChar(text);
  }

  @HostListener('document:keydown', ['$event'])
  handleGrowKeyDown(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();
    if (!this.growActive || !this.growKeys) return;
    this.growPressedKeys.add(key);
    if (this.navPopupOpen) return; // the popup owns the keyboard (sticky phase)
    if (event.repeat && key === this.growHoldKey) return;
    const k = this.growKeys;
    const dir = key === k.left ? 'left' : key === k.right ? 'right'
      : key === k.up ? 'up' : key === k.down ? 'down' : null;
    if (this.growEdgeMenuActive) {
      if (key === k.selfLoop) {
        event.preventDefault();
        this.growSelfLoopPending = true;
      } else if (key === 'escape') {
        event.preventDefault();
        if (this.growHoldReleased) {
          this.exitGrowMode();
          this.emitStatus('Add canceled');
          return;
        }
        this.growEdgeMenuActive = false;
        this.growSelfLoopPending = false;
        this.daOut.emit({kind: 'popup-state', open: true, surface: 'grow-targeting'});
        this.navGrid.showNodeGrid('nodes');
        this.redrawGrowGhost();
      }
      return;
    }
    if (!this.growPlacing && key === k.edgeSubmenu) {
      event.preventDefault();
      this.openGrowEdgeMenu();
      return;
    }
    if (key === k.cycle) {
      if (!this.growAnchor) return;
      event.preventDefault();
      this.growDirState = (this.growDirState + 1) % 4;
      this.redrawGrowGhost();
      return;
    }
    if (key === 'escape') {
      this.exitGrowMode();
      this.emitStatus('Add canceled');
      return;
    }
    if (this.growPlacing) {
      if (dir) {
        event.preventDefault();
        this.growPlaceMove(dir);
        return;
      }
      if (key === k.coarse || key === k.fine) {
        this.growPlacement.addModifier(key);
        return;
      }
      if (key === 'enter') {
        // Sticky commit: the hold key was released during the type popup.
        event.preventDefault();
        this.commitGrowPlacement();
      }
      return;
    }
    if (dir) {
      if (!this.growAnchor) return;
      event.preventDefault();
      this.growHop(dir);
      return;
    }
    if (key === k.search) {
      if (!this.growAnchor) return;
      event.preventDefault();
      this.openGrowTargetPopup();
      return;
    }
    if (key === k.newNode) {
      event.preventDefault();
      this.openGrowTypePopup();
    }
  }

  @HostListener('document:keyup', ['$event'])
  handleGrowKeyUp(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();
    this.growPressedKeys.delete(key);
    if (!this.growActive) return;
    this.growPlacement.removeModifier(key);
    if (this.growEdgeMenuActive && this.growSelfLoopPending && key === this.growKeys?.selfLoop) {
      this.growSelfLoopPending = false;
      this.commitGrowSelfLoop();
      return;
    }
    // Sticky phase: with a popup open the hold key is expected to be
    // released (typing needs both hands) — Enter/Esc resolve the flow.
    if (this.navPopupOpen) return;
    if (key !== this.growHoldKey) return;
    if (this.growEdgeMenuActive) {
      this.growHoldReleased = true;
      this.emitStatus('Choose an edge kind, or Esc to cancel');
      return;
    }
    if (this.growPlacing) {
      this.commitGrowPlacement();
      return;
    }
    this.commitGrowMode();
  }

  private openGrowEdgeMenu(): void {
    if (!this.growActive || !this.growKeys ||
        this.growPlacing || this.growEdgeMenuActive) return;
    if (!this.growAnchor) {
      const selected = this.drawingLayer.getSelectedDANodes();
      if (selected.length !== 1) {
        this.emitStatus('⚠ Edge kind needs one node under the crosshairs or selected');
        return;
      }
      this.growAnchor = selected[0];
      this.growOrigin = this.getNodeCenterInLayerCoordinates(this.growAnchor);
      this.growGhostTargets = this.buildCurrentGrowGhostTargets(this.growAnchor);
    }
    this.growEdgeMenuActive = true;
    // If the leaf key arrived just before its submenu key, remember that
    // overlap and commit when the leaf is released.
    this.growSelfLoopPending = this.growPressedKeys.has(this.growKeys.selfLoop);
    this.growGhost.clear(false);
    this.navGrid.hideNodeGrid();
    this.drawingLayer.batchDraw();
    this.daOut.emit({kind: 'popup-state', open: true, surface: 'grow-edge'});
  }

  /** Choose a real-node or insertion-ghost target through the actual Move by
   *  Node engine. The augmented node tier shares its selected strategy,
   *  overlay, crosshair landing, viewport panning, same-direction run, and
   *  turn re-origin semantics. */
  private growHop(direction: HopDirection): void {
    if (!this.growAnchor) return;
    if (this.growHopOnLattice(direction)) return;
    // The crosshairs ride the candidate: Move-by-Node moves them to whatever
    // the hop landed on, and that is the thing being aimed. Pinning them to
    // the anchor instead (da-448) made the pin itself the problem — "it seems
    // to bounce back to the originating node" — so da-551 puts them back on
    // the selection.
    this.navGrid.snapToNodeInDirection(direction, 'nodes');
    const last = this.navGrid.lastStop;
    if (!last || last.kind !== 'node') return;
    const target = this.drawingLayer.getDANodes().find(node => node.id === last.id) ?? null;
    const insertion = this.growGhostTargets.find(item => item.id === last.id) ?? null;
    if (!target && !insertion) return;
    this.growTarget = target;
    this.growInsertionTarget = insertion;
    this.redrawGrowGhost();
  }



  /**
   * A hop between placement spots is a step on the lattice (grow-lattice.ts).
   *
   * Returns whether the lattice handled it. It does not when the press walks
   * off the end, and the caller falls through to Move by Node, which knows
   * about the real nodes beyond.
   */
  private growHopOnLattice(direction: HopDirection): boolean {
    const anchorCentre = this.growOrigin;
    if (!anchorCentre) return false;
    const hop = planGrowHop({
      direction,
      fromTargetId: this.growInsertionTarget?.id ?? null,
      fromNodeCentre: this.growTarget
        ? this.getNodeCenterInLayerCoordinates(this.growTarget)
        : null,
      anchorCentre,
      step: this.growLatticeStep(),
      targets: this.growGhostTargets,
      nodes: this.nodeBoxes(node => node !== this.growAnchor),
      newNodeHalf: this.growAnchorHalf(),
    });
    if (!hop) return false;
    this.landGrowAim(hop.kind === 'cell' ? hop.target : this.nodeById(hop.id)!);
    return true;
  }

  /** Every node as a plain box, for the Konva-free placement modules. */
  private nodeBoxes(keep: (node: DANode) => boolean = () => true): GrowGhostNodeCenter[] {
    return this.drawingLayer.getDANodes().filter(keep).map(node => ({
      id: node.id,
      ...this.getNodeCenterInLayerCoordinates(node),
      halfW: node.NODE_WIDTH / 2,
      halfH: node.NODE_HEIGHT / 2,
    }));
  }

  /** The anchor's own box stands in for the node a spot would create — it is
   *  also what the placement ghost is drawn at, so what the lattice refuses is
   *  exactly what you would have seen land on something (da-510). */
  private growAnchorHalf(anchor: DANode | null = this.growAnchor): {w: number; h: number} {
    return {
      w: (anchor?.NODE_WIDTH ?? DEFAULT_BOX_SIZE) / 2,
      h: (anchor?.NODE_HEIGHT ?? DEFAULT_BOX_SIZE) / 2,
    };
  }

  private nodeById(id: string): DANode | null {
    return this.drawingLayer.getDANodes().find(node => node.id === id) ?? null;
  }


  /** Put the aim on a spot or a node: the ghost follows, the crosshairs ride
   *  it, and Move by Node's memory is kept in step so a later hop off the
   *  lattice carries on from what the reader is looking at. */
  private landGrowAim(aim: GrowGhostTarget | DANode): void {
    this.finishTweens();
    const ghost = 'source' in aim ? aim : null;
    const node = ghost ? null : aim as DANode;
    this.growTarget = node;
    this.growInsertionTarget = ghost;
    // The lattice of spots *is* the overlay while the aim is on it; the bands
    // and rings the engine draws describe a decision that is not being made.
    this.navGrid.hideNodeGrid();
    this.navGrid.hideQuadrantGoalRay();
    const id = ghost ? ghost.id : node!.id;
    this.navGrid.adoptStop({id, kind: 'node'});
    const centre = ghost
      ? {x: ghost.x, y: ghost.y}
      : this.getNodeCenterInLayerCoordinates(node!);
    const scale = this.drawingLayer.scaleX();
    this.navGrid.jumpCrosshairsToStopCenter({
      x: this.drawingLayer.x() + centre.x * scale,
      y: this.drawingLayer.y() + centre.y * scale,
    });
    this.redrawGrowGhost();
  }

  /** `/` in grow mode: fuzzy-search the target by label (sticky phase —
   *  the hold key is naturally released to type; Enter commits the edge,
   *  Esc backs out to the list then cancels the whole add). */
  private openGrowTargetPopup(): void {
    const anchor = this.growAnchor!;
    this.navPopupRows = this.drawingLayer.getDANodes()
      .filter(n => n !== anchor)
      .map(n => ({
        id: n.id,
        title: n.label.text() || n.nodeShape,
        tags: n.tags.length > 0 ? n.tags : undefined,
      }));
    if (this.navPopupRows.length === 0) {
      this.emitStatus('⚠ No other nodes to connect to');
      return;
    }
    this.navGrid.hideNodeGrid();
    this.navPopupPurpose = 'grow-target';
    this.navPopupStartFilter = true;
    this.navPopupHoldKey = null;
    this.navPopupHidden = false;
    this.navPopupDark = this.themeService.theme === 'dark';
    this.positionGrowPopup();
    this.navPopupOpen = true;
    this.daOut.emit({kind: 'popup-state', open: true, surface: 'grow-target-popup'});
  }

  /** Beside the anchor node, east unless clamped. */
  private positionGrowPopup(): void {
    const scale = this.drawingLayer.scaleX();
    const n = this.growAnchor;
    const origin = this.growOrigin!;
    const rect = n ? {
      x: this.drawingLayer.x() + n.group.x() * scale,
      y: this.drawingLayer.y() + n.group.y() * scale,
      w: n.NODE_WIDTH * scale,
    } : {
      x: this.drawingLayer.x() + origin.x * scale,
      y: this.drawingLayer.y() + origin.y * scale,
      w: 0,
    };
    const position = placePopup(rect, this.popupViewport(), popupSize(this.navPopupRows.length), 'right');
    this.navPopupLeft = position.left;
    this.navPopupTop = position.top;
  }

  /** `f` in grow mode: the node-type popup (v1 list = the raw shapes; the
   *  extension node-kinds slot slots in here later). Held-f rhythm: browse
   *  with j/k while f is down, releasing f selects (the popup's holdKey
   *  machinery); Enter also selects. */
  private openGrowTypePopup(): void {
    this.navGrid.hideNodeGrid();
    this.navPopupRows = [
      {id: 'box',       title: 'Box'},
      {id: 'circle',    title: 'Circle'},
      {id: 'diamond',   title: 'Diamond'},
      {id: 'junction',  title: 'Junction'},
      {id: 'invisible', title: 'Invisible'},
    ];
    this.navPopupPurpose = 'grow-type';
    this.navPopupStartFilter = false;
    this.navPopupHoldKey = this.growKeys?.newNode ?? 'f';
    this.navPopupHidden = false;
    this.navPopupDark = this.themeService.theme === 'dark';
    this.positionGrowPopup();
    this.navPopupOpen = true;
    this.daOut.emit({kind: 'popup-state', open: true, surface: 'grow-type-popup'});
  }

  /** The cell of the held-Add lattice: the placement spacing on each axis,
   *  rounded up to a whole major grid cell so every candidate spot sits a whole
   *  number of coarse squares from the anchor. */
  private growLatticeStep(anchor: DANode | null = this.growAnchor): Point {
    const cell = Math.max(1, this.drawingLayer.getGridSpacing());
    const onGrid = (spacing: number) => Math.max(cell, Math.ceil(spacing / cell) * cell);
    return {
      x: onGrid(this.quickAddSpacingFrom('x', anchor)),
      y: onGrid(this.quickAddSpacingFrom('y', anchor)),
    };
  }

  /** Centre-to-centre distance for a node placed beside `anchor` along `axis`.
   *  Measures the two boxes involved and hands them to the spacing rule. */
  private quickAddSpacingFrom(axis: PlacementAxis, anchor: DANode | null = this.growAnchor): number {
    const fresh = this.drawingLayer?.newNodeDefaultSize?.()
      ?? {w: DEFAULT_BOX_SIZE, h: DEFAULT_BOX_SIZE};
    const anchorBox = {
      w: anchor?.NODE_WIDTH ?? DEFAULT_BOX_SIZE,
      h: anchor?.NODE_HEIGHT ?? DEFAULT_BOX_SIZE,
    };
    return quickAddSpacing(axis, anchorBox, fresh);
  }

  /** Type picked: enter the placement sub-mode — ghost node of that shape
   *  at the right-of-anchor default (or at the crosshairs on empty canvas);
   *  hjkl places (first press = rough throw of one full spacing,
   *  then grid steps, coarse/fine tier keys held). Release of the
   *  still-held add key commits; Enter commits the sticky variant. */
  private enterGrowPlacement(shapeId: string): void {
    this.navPopupOpen = false;
    this.navPopupPurpose = 'nav';
    this.growPlacement.enter(shapeId as NodeShape);
    this.growTarget = null;
    this.growInsertionTarget = null;
    this.daOut.emit({kind: 'popup-state', open: true, surface: 'grow-placement'});
    this.redrawGrowGhost();
  }

  /** Placement steering. Rough first (a full spacing thrown in the pressed
   *  direction, replacing the below default), grid steps after; `s`/`d` tier
   *  chords scale the step (coarse = a full spacing, fine = a tenth-grid). */
  private growPlaceMove(direction: GrowPlacementDirection): void {
    this.growPlacement.move(direction);
  }

  private commitGrowPlacement(): void {
    const anchor = this.growAnchor;
    const dirState = this.growDirState;
    const shape = this.growShape;
    const pos = this.growPlacePos!;
    this.exitGrowMode();

    this.finishTweens();
    this.pushUndoSnapshot({kind: DACommandType.QUICK_ADD});
    this.drawingLayer.unselectAll();
    this.unselectAllLabels();
    const at = this.camera.toStage(pos);
    const newNode = this.drawingLayer.createNewNode(at.x, at.y, shape);
    if (anchor) this.wireGrowEdge(anchor, newNode, dirState);
    this.newNodeArrivedByLink = !!anchor;

    const labelable = newNode.nodeShape !== 'junction' && newNode.nodeShape !== 'invisible';
    if (labelable) {
      this.beginNewNodeLabelEdit(newNode);
    } else {
      this.drawingLayer.batchDraw();
      this.checkAndEmitEditState();
    }
    this.scheduleVaultAutoSave();
  }

  /** Popup commit for the grow-target search: wire the edge right away
   *  (sticky semantics — Enter is the commit gesture once the popup owns
   *  the flow). */
  private growCommitToNodeId(nodeId: string): void {
    const anchor = this.growAnchor!;
    const dirState = this.growDirState;
    const target = this.drawingLayer.getDANodes().find(n => n.id === nodeId);
    this.navPopupOpen = false;
    this.navPopupPurpose = 'nav';
    this.exitGrowMode();
    if (!target || target === anchor) return;
    this.commitGrowEdgeTo(anchor, target, dirState);
  }

  /** Wire the grow edge and rest the crosshairs on the target. Shared by every
   *  way of choosing an existing node as the target: walking the ghosts with
   *  hjkl, and the `/` search popup. Only the old select-then-connect path
   *  did this before (`249e6e0`) — held-Add, which is how a link actually
   *  gets drawn, was left out (2026-08-29). */
  private commitGrowEdgeTo(anchor: DANode, target: DANode, dirState: number): void {
    this.finishTweens();
    this.undoRedoService.pushSnapshot(this.drawingLayer.serializeGraph());
    this.wireGrowEdge(anchor, target, dirState);
    this.drawingLayer.batchDraw();
    this.restCrosshairsOn(target);
    this.checkAndEmitEditState();
    this.scheduleVaultAutoSave();
    this.emitStatus(`Edge added: ${this.growEdgeDescription(anchor, target, dirState)}`);
  }

  private commitGrowMode(): void {
    const anchor = this.growAnchor;
    const target = this.growTarget;
    const insertion = this.growInsertionTarget;
    const dirState = this.growDirState;
    this.exitGrowMode();

    if (!anchor) {
      // A plain tap on empty canvas keeps the established quick-add behavior.
      this.handleQuickAdd();
      return;
    }
    if (insertion) {
      this.commitGrowInsertion(anchor, insertion, dirState);
      return;
    }
    if (target === null) {
      // A press and release without navigation is the node-context tap:
      // add an edge from the source back to itself.
      this.quickAddSelfLoop(anchor, dirState);
      return;
    }
    if (target === anchor) return; // came home to cancel

    this.commitGrowEdgeTo(anchor, target, dirState);
  }

  private commitGrowSelfLoop(): void {
    const anchor = this.growAnchor;
    const dirState = this.growDirState;
    this.exitGrowMode();
    if (!anchor) return;
    this.quickAddSelfLoop(anchor, dirState);
  }

  private quickAddSelfLoop(anchor: DANode, dirState?: number): void {
    this.finishTweens();
    this.pushUndoSnapshot({kind: DACommandType.QUICK_ADD});
    this.addSelfEdge(anchor, dirState);
    this.scheduleVaultAutoSave();
  }

  private commitGrowInsertion(
    anchor: DANode,
    insertion: GrowGhostTarget,
    dirState: number,
  ): void {
    this.finishTweens();
    this.pushUndoSnapshot({kind: DACommandType.QUICK_ADD});
    this.drawingLayer.unselectAll();
    this.unselectAllLabels();
    const at = this.camera.toStage(insertion);
    const newNode = this.drawingLayer.createNewNode(at.x, at.y, this._defaultNodeShape);
    this.wireGrowEdge(anchor, newNode, dirState);
    this.newNodeArrivedByLink = true;

    const labelable = newNode.nodeShape !== 'junction' &&
      newNode.nodeShape !== 'invisible';
    if (labelable) {
      this.beginNewNodeLabelEdit(newNode);
    } else {
      this.drawingLayer.batchDraw();
      this.checkAndEmitEditState();
    }
    this.scheduleVaultAutoSave();
  }

  /** Directionality state used when a grow/add gesture begins. The default
   *  directed state is always outgoing from the anchor; explicit user
   *  defaults (undirected/bidirectional) are still respected. */
  private defaultGrowDirection(_anchor: DANode | null): number {
    switch (this._defaultEdgeDirectedness) {
      case 'undirected': return 2;
      case 'bidirectional': return 3;
      default: return 0;
    }
  }

  /** Add an edge using the user's current defaults. Labels are absent by
   *  default because DAEdge starts with an empty label list. */
  /** After connecting two nodes, leave the crosshairs sitting on the new
   *  link near its destination end, so holding the select key picks the edge
   *  up straight away and its direction can be cycled without navigating
   *  back to it (da-345). The destination end is the meaningful one: that is
   *  where the arrowhead is, so which way the link points is what you are
   *  looking at while you change it.
   *
   *  A connect can land off-screen (the crosshairs were over a node at the
   *  viewport edge); in that case leave them where they are rather than
   *  parking them somewhere invisible. */
  /** After a link is drawn, the crosshairs rest on the node it reached,
   *  hidden until the next move, as they are after sitting idle. (They used
   *  to land on the link itself, da-345/da-509; Ben preferred this,
   *  2026-09-19.) */
  private restCrosshairsOn(node: DANode): void {
    this.parkCrosshairsAt(this.getNodeCenterInLayerCoordinates(node));
    this.hideCrosshairsUntilMoved();
  }

  private hideCrosshairsUntilMoved(): void {
    this.crosshairsLayer.hideCrosshairs();
    this.crosshairsLayer.batchDraw();
  }

  /** Move the crosshairs onto a layer point, if it is on screen. */
  private parkCrosshairsAt(anchor: {x: number; y: number}): void {
    const scale = this.drawingLayer.scaleX();
    const sx = this.drawingLayer.x() + anchor.x * scale;
    const sy = this.drawingLayer.y() + anchor.y * scale;
    if (sx < 0 || sx > this.stage.width() || sy < 0 || sy > this.stage.height()) return;
    this.crosshairsLayer.crosshairs.x = sx;
    this.crosshairsLayer.crosshairs.y = sy;
    this.crosshairsLayer.batchDraw();
    this.scheduleCrosshairHoverRefresh(20);
  }

  private addDefaultEdge(src: DANode, dest: DANode): DAEdge {
    const edge = this.drawingLayer.addEdge(src, dest);
    edge.directedness = this._defaultEdgeDirectedness;
    edge.lineStyle = this._defaultLineStyle;
    this.autoRouteNewEdge(edge);
    return edge;
  }

  /** Add a self-loop to an explicit grow anchor, or to the topmost node under
   *  the crosshairs (falling back to the sole selected node for command-palette
   *  and classic Add-menu use). */
  private addSelfEdge(explicitAnchor?: DANode, dirState?: number): DAEdge | null {
    const hovered = this.getDANodesContainingCrosshairs();
    const selected = this.drawingLayer.getSelectedDANodes();
    const anchor = explicitAnchor
      ?? topmost(hovered)
      ?? (selected.length === 1 ? selected[0] : null);
    if (!anchor) {
      this.emitStatus('⚠ Self Loop needs one node under the crosshairs or selected');
      return null;
    }
    const edge = dirState === undefined
      ? this.addDefaultEdge(anchor, anchor)
      : this.wireGrowEdge(anchor, anchor, dirState);
    this.drawingLayer.batchDraw();
    this.checkAndEmitEditState();
    this.emitStatus(`Self loop added to ${anchor.label.text() || anchor.nodeShape}`);
    return edge;
  }

  /** Create the edge for a grow commit per the directionality state. */
  private wireGrowEdge(anchor: DANode, target: DANode, dirState: number): DAEdge {
    const src = dirState === 1 ? target : anchor;
    const dest = dirState === 1 ? anchor : target;
    const edge = this.drawingLayer.addEdge(src, dest);
    edge.directedness = dirState === 2 ? 'undirected'
      : dirState === 3 ? 'bidirectional' : 'directed';
    edge.lineStyle = this._defaultLineStyle;
    this.autoRouteNewEdge(edge);
    return edge;
  }

  private growEdgeDescription(anchor: DANode, target: DANode, dirState: number): string {
    const a = anchor.label.text() || anchor.nodeShape;
    const t = target.label.text() || target.nodeShape;
    switch (dirState) {
      case 1: return `${t} → ${a}`;
      case 2: return `${a} — ${t}`;
      case 3: return `${a} ↔ ${t}`;
      default: return `${a} → ${t}`;
    }
  }

  /** Dashed outline for the placement ghost, per shape. */
  private exitGrowMode(): void {
    this.growActive = false;
    this.growEdgeMenuActive = false;
    this.growSelfLoopPending = false;
    this.growHoldReleased = false;
    this.growPressedKeys.clear();
    this.growGhost.clear(false);
    this.growOrigin = null;
    this.growTarget = null;
    this.growInsertionTarget = null;
    this.growGhostTargets = [];
    this.navGrid.hideNodeGrid();
    this.daOut.emit({kind: 'popup-state', open: false});
    this.drawingLayer.batchDraw();
  }


  /** The dashed preview of what the held Add key is about to create
   *  (grow-ghost.ts). Rebuilt from scratch on every aim change. */
  private redrawGrowGhost(): void {
    this.growGhost.show(this.growAim());
  }

  /** The nine fields of grow state the preview draws from, and no others. */
  private growAim(): GrowAim {
    return {
      anchor: this.growAnchor,
      origin: this.growOrigin!,
      placing: this.growPlacing,
      placePos: this.growPlacePos,
      newNodeShape: this.growShape ?? this._defaultNodeShape,
      slotShape: this._defaultNodeShape,
      target: this.growTarget,
      insertionTarget: this.growInsertionTarget,
      targets: this.growGhostTargets,
      dirState: this.growDirState,
    };
  }

  /** Tap of the edit-text key: enter label edit on whatever text-bearing
   *  thing is under the crosshairs. Never grows the graph — except that an
   *  edge with no label gets an empty one to type into. */
  private editTextAtCrosshairs(): void {
    const label = this.getLabelUnderCrosshairs();
    const node = this.getDANodesContainingCrosshairs().length > 0;
    if (label || node) {
      const cursorPoint = this.crosshairsInLayerCoords();
      this.drawingLayer.unselectAll();
      this.unselectAllLabels();
      this.selectOnlyTopItem();
      this.crosshairsLayer.hideCrosshairs();
      this.showEditCarets(cursorPoint);
      this.drawingLayer.batchDraw();
      this.daOut.emit({kind: 'started-label-editing-mode', mode: 'vimNormal'});
      // The same focus a new box gets: editing a label is close work. It waits
      // a turn for the keyboard's viewport inset to go away.
      const editing = this.drawingLayer.getSelectedDANodes();
      if (editing.length === 1) setTimeout(() => this.focusNodeForLabelEdit(editing[0]));
      return;
    }
    const edges = this.getDAEdgesContainingCrosshairs();
    if (edges.length > 0) {
      const edge = edges[0];
      let mode: Extract<TextCursorMode, 'insert' | 'vimNormal'> = 'vimNormal';
      this.drawingLayer.unselectAll();
      this.unselectAllLabels();
      if (edge.labels.length > 0) {
        edge.labels[0].isSelected = true;
      } else {
        // No label yet: create an empty one at the crosshairs projection
        // (addLabel selects it), then type straight into it.
        this.pushUndoSnapshot({kind: DACommandType.ADD_LABEL});
        this.addLabel(false);
        if (edge.labels.length === 0) return; // addLabel failed; stay put
        mode = 'insert';
        this.scheduleVaultAutoSave();
      }
      this.crosshairsLayer.hideCrosshairs();
      this.showEditCarets();
      this.drawingLayer.batchDraw();
      this.daOut.emit({kind: 'started-label-editing-mode', mode});
      return;
    }
    this.daOut.emit({kind: 'status-message', message: 'Nothing to edit here — tap the add key to create a node.'});
  }

  /** v+o: cycle directedness of the selected edge(s) — directed →
   *  undirected → bidirectional → directed. (Reversing a directed edge is a
   *  future structural op; in the grow mode the pre-commit `o` covers it.) */
  /** Transient cursor into the four-state directionality cycle, per edge id:
   *  0 forward · 1 reversed · 2 undirected · 3 bidirectional. The endpoint
   *  swap happens entering 1 and wrapping 3→0, so four presses land the edge
   *  exactly where it started. */
  private edgeDirCycle = new Map<string, number>();
  private static readonly DIR_CYCLE: {directedness: EdgeDirectedness; label: string}[] = [
    {directedness: 'directed',      label: 'forward →'},
    {directedness: 'directed',      label: 'reversed ←'},
    {directedness: 'undirected',    label: 'undirected —'},
    {directedness: 'bidirectional', label: 'bidirectional ↔'},
  ];

  /** Where an edge sits in the cycle. The stored cursor wins only while it
   *  still agrees with the live directedness — undo, reload and the style
   *  submenu can all change an edge behind our back. */
  private dirCycleIndex(edge: DAEdge): number {
    const stored = this.edgeDirCycle.get(edge.id);
    if (stored !== undefined
        && DrawingAreaComponent.DIR_CYCLE[stored].directedness === edge.directedness) {
      return stored;
    }
    return edge.directedness === 'undirected' ? 2
      : edge.directedness === 'bidirectional' ? 3 : 0;
  }

  private cycleEdgeDirectedness(): void {
    const edges = this.drawingLayer.getSelectedDAEdges();
    if (edges.length === 0) {
      this.daOut.emit({kind: 'status-message', message: '⚠ Select an edge first (hold v over it).'});
      return;
    }
    this.finishTweens();
    let lastLabel = '';
    for (const edge of edges) {
      const from = this.dirCycleIndex(edge);
      const to = (from + 1) % DrawingAreaComponent.DIR_CYCLE.length;
      // Entering 'reversed', or wrapping back to 'forward': flip the endpoints.
      if (to === 1 || from === DrawingAreaComponent.DIR_CYCLE.length - 1) {
        edge.reverseDirection();
      }
      const next = DrawingAreaComponent.DIR_CYCLE[to];
      edge.directedness = next.directedness;
      this.edgeDirCycle.set(edge.id, to);
      lastLabel = next.label;
    }
    this.drawingLayer.batchDraw();
    const suffix = edges.length > 1 ? ` (${edges.length} edges)` : '';
    this.emitStatus(`Direction: ${lastLabel}${suffix}`);
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

  /** Every label on the graph, selected or not. Teardown that must not depend
   *  on selection state uses this. */
  private getAllLabels(): DALabel[] {
    const labels: DALabel[] = [];
    this.drawingLayer.getDAEdges().forEach(edge => {
      edge.labels.forEach(label => labels.push(label));
    });
    return labels;
  }

  private getEdgeForLabel(label: DALabel): DAEdge | null {
    for (const edge of this.drawingLayer.getDAEdges()) {
      if (edge.labels.includes(label)) return edge;
    }
    return null;
  }

  private getLabelUnderCrosshairs(): DALabel | null {
    return this.probe.label();
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
    const entry = this.undoRedoService.undo(this.drawingLayer.serializeGraph());
    if (!entry) return;
    if (entry.kind === 'group') {
      void this.applyHistoryGroup(entry.group, 'undo');
      return;
    }
    this.restoreHistorySnapshot(entry.snapshot);
  }

  private handleRedo(): void {
    this.finishTweens();
    const entry = this.undoRedoService.redo(this.drawingLayer.serializeGraph());
    if (!entry) return;
    if (entry.kind === 'group') {
      void this.applyHistoryGroup(entry.group, 'redo');
      return;
    }
    this.restoreHistorySnapshot(entry.snapshot);
  }

  /** Undo a group from history (apply its inverse) or redo it, putting it
   *  back on its stack if the graph has changed in a way that conflicts. */
  private async applyHistoryGroup(group: UndoGroup, direction: 'undo' | 'redo'): Promise<void> {
    const {applier, invert} = await this.loadOperations();
    const conflict = applier.apply(direction === 'undo' ? invert(group.ops) : group.ops);
    if (conflict) {
      if (direction === 'undo') this.undoRedoService.cancelUndo();
      else this.undoRedoService.cancelRedo();
      this.emitStatus(`Can't ${direction} "${group.label}": ${conflict}`);
      return;
    }
    this.afterOperations();
    this.emitStatus(`${direction === 'undo' ? 'Undid' : 'Redid'}: ${group.label}`);
  }

  private restoreHistorySnapshot(snapshot: GraphSnapshot): void {
    this.clearLabelEditGhost();
    this.drawingLayer.restoreGraph(snapshot);
    this.drawingLayer.batchDraw();
    this.checkAndEmitEditState();
    this.daOut.emit({kind: "exit-label-editing-mode"});
    this.crosshairsLayer.showCrosshairs();
    this.crosshairsLayer.batchDraw();
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
    // The resize handle only captures the gesture when there is nothing to
    // drag: no item under the crosshairs and no current selection. Without
    // this guard a node corner inside the proximity band silently turned
    // every select+drag into a barely visible resize — three coarse drags
    // that "did nothing" in Ben's 2026-08-14 session (da-193).
    if (this.resizeTargetNode &&
        (this.hasItemUnderCrosshairs() || this.hasDragSelection())) {
      this.resizeTargetNode.hideResizeHandle();
      this.resizeTargetNode = null;
      this.drawingLayer.batchDraw();
      return;
    }
    // If resize handle is active, select that node and enter resize drag
    if (this.resizeTargetNode) {
      this.drawingLayer.unselectAll();
      this.resizeTargetNode.isSelected = true;
      return;
    }
    // Held v over genuinely empty canvas starts an area select (da-195):
    // the crosshairs anchor one corner of a marquee, the drag keys move the
    // opposite corner, and everything the box touches joins the selection —
    // the keyboard version of a mouse rubber band. Dragging an existing
    // multi-selection now requires the crosshairs to be over a selected
    // item, matching the mouse convention.
    if (!this.hasItemUnderCrosshairs()) {
      this.areaSelect.begin();
    }
  }

  private hasDragSelection(): boolean {
    return this.drawingLayer.getSelectedDANodes().length > 0 ||
      this.drawingLayer.getSelectedDAWaypoints().length > 0 ||
      this.drawingLayer.getSelectedDAEdges().length > 0 ||
      this.getSelectedLabels().length > 0;
  }

  private exitDragMode() {
    if (this.areaSelect.active) {
      // Release keeps whatever the marquee gathered; the quick-tap toggle
      // below must not fire for an area-select gesture.
      this.areaSelect.finish();
      return;
    }
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


  /** The edges a style command means: the selection, else whatever the
   *  crosshairs are over. */
  private targetEdges(): DAEdge[] {
    const selected = this.drawingLayer.getSelectedDAEdges();
    return selected.length > 0 ? selected : this.getDAEdgesContainingCrosshairs();
  }

  /** Restyle those edges, or say why nothing happened — naming the thing the
   *  user was trying to change, since the command is otherwise silent. */
  private restyleTargetEdges(noun: string, apply: (edge: DAEdge) => void): void {
    const edges = this.targetEdges();
    if (edges.length === 0) {
      this.emitStatus(`Select or hover an edge to change ${noun}`);
      return;
    }
    edges.forEach(apply);
    this.drawingLayer.batchDraw();
  }

  private setEdgeDirectedness(directedness: EdgeDirectedness): void {
    this.log.log('[style] setEdgeDirectedness:', directedness);
    this.restyleTargetEdges('directedness', edge => edge.directedness = directedness);
  }

  private setLineStyle(lineStyle: LineStyle): void {
    this.log.log('[style] setLineStyle:', lineStyle);
    this.restyleTargetEdges('line style', edge => edge.lineStyle = lineStyle);
  }

  private setDefaultEdgeDirectedness(directedness: EdgeDirectedness): void {
    this.log.log('[style] setDefaultEdgeDirectedness:', directedness);
    this._defaultEdgeDirectedness = directedness;
  }

  private setDefaultLineStyle(lineStyle: LineStyle): void {
    this.log.log('[style] setDefaultLineStyle:', lineStyle);
    this._defaultLineStyle = lineStyle;
  }

  private setItemColor(color: ItemColor): void {
    this.log.log('[style] setItemColor:', color);
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

    // Selection first, then whatever the crosshairs are over — the same
    // priority copy/cut (da-272) and the shape commands use. Without the
    // fallback the natural gesture (hover a node, pick a colour) either did
    // nothing or, worse, recoloured a stale selection somewhere off-screen;
    // a thin edge restyled at 50% zoom reads as "nothing happened".
    let nodes = this.drawingLayer.getSelectedDANodes();
    let edges = this.drawingLayer.getSelectedDAEdges();

    if (nodes.length === 0 && edges.length === 0) {
      nodes = topmostSelection(this.getDANodesContainingCrosshairs());
      if (nodes.length === 0) {
        edges = this.getDAEdgesContainingCrosshairs();
      }
    }

    if (nodes.length === 0 && edges.length === 0) {
      this.daOut.emit({kind: 'status-message',
        message: 'Select or point at a node or edge to change color'});
      return;
    }

    nodes.forEach(n => n.applyColors(colors.node));
    edges.forEach(e => e.applyColors(colors.edge));

    this.drawingLayer.batchDraw();

    // Always say what was recoloured. The command is otherwise silent, and
    // its effect can be genuinely hard to see.
    const parts: string[] = [];
    if (nodes.length) parts.push(`${nodes.length} node${nodes.length === 1 ? '' : 's'}`);
    if (edges.length) parts.push(`${edges.length} link${edges.length === 1 ? '' : 's'}`);
    const name = color.charAt(0).toUpperCase() + color.slice(1);
    this.daOut.emit({kind: 'status-message', message: `${name}: ${parts.join(' + ')}`});
  }

}
