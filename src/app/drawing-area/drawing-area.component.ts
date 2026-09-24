/**
 * The canvas: everything you see and every command that changes it.
 *
 * This is the orchestrator, not the whole drawing area. It owns the Angular
 * lifecycle, the two Konva layers, command dispatch, selection and mode state,
 * and crosshairs movement. The work itself lives beside it — the shapes in
 * `da-*.ts`, routing and layout in their own pure modules, and subsystems that
 * have earned their own file (`navigation-grid-controller.ts`,
 * `text-editing-controller.ts`) behind narrow host interfaces.
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
import { DACommand, DACommandType, GridTier, NavTargetKind, NodeShape, TextCursorMode } from './command.model';
import {
  affectsContextState,
  endsNormalMovementGoal,
  isBlockedWhileRouting,
  mutatesGraph,
  showsMovementIndicators,
} from './command-policy';
import { clamp, Point, topmost, topmostSelection, closestPointOnSegment as closestPointOnSeg } from './utils';
import { Axis, AxisKey } from './axis';
import { Camera } from './camera';
import { Overlay } from './overlay';
import { Viewport } from './viewport';
import { CrosshairsProbe, ProbeBounds } from './crosshairs-probe';
import { Animations } from './animations';
import { FileController, FileHost } from './file-controller';
import { nodeCenterInLayer, nodeCenterInStage } from './node-geometry';
import { projectPointToPath } from './edge-label-anchor';
import { NavPopupComponent } from '../nav-popup/nav-popup.component';
import { GraphOperationApplier } from './graph-operation-applier';
import { GraphOperation, UndoGroup, invertOperations } from './graph-operations';
import { onMathImageLoaded, onMathReady } from './math-images';
import { NavigationGridController, NavigationGridHost, navigationRayEnd } from './navigation-grid-controller';
import { NavigationGridStop } from './navigation-grid';
import {
  gridSnapStepper,
  nextNormalMovementStep,
  NormalMovementGoal,
  startNormalMovementGoal,
} from './normal-movement';
import {caretVisibilityPanDelta} from './edit-viewport';
import {GrowController, GrowHost} from './grow-controller';
import {InteractionMode, InteractionModes} from './interaction-modes';
import {TextEditingController, TextEditingHost} from './text-editing-controller';
import {NavJourney} from './nav-journey';
import {LinkNavController, LinkNavHost} from './link-nav-controller';

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
import { RoutingMetricsService } from '../services/routing-metrics.service';
import { DraftStorageService } from '../services/draft-storage.service';
import { VaultService } from '../services/vault.service';
import { resolveIdentity } from '../plugins/plugin-registry';
import { PLUGIN_REGISTRY } from '../plugins/plugin-registry';
import { PluginCommandCall, PluginCommands } from '../plugins/plugin-commands';
import type { PluginHost, PluginNode } from '../plugins/plugin-host';
import { PluginSettingsService } from '../plugins/plugin-settings.service';
import { GraphSnapshot } from './graph-snapshot';
import { CommandHandlers, CommandSlice, mergeCommandSlices, runCommand } from './command-handlers';
import { AreaSelect, AreaSelectHost } from './area-select';
import { KeyboardDrag, KeyboardDragHost } from './keyboard-drag';
import { GraphSearch, GraphSearchHost } from './graph-search';
import { ClipboardController, ClipboardHost } from './clipboard-controller';
import { StyleController, StyleHost } from './style-controller';
import { LayoutController, LayoutHost } from './layout-controller';
import { AgentCanvasSurface, AgentCanvasHost } from './agent-canvas-surface';
import { CrosshairHover, CrosshairsHover, CrosshairsHoverHost } from './crosshairs-hover';

/** A node as plugins see it: plain data, not the Konva object. */
function pluginNodeOf(node: DANode): PluginNode {
  return {id: node.id, label: node.label.text(), tags: [...node.tags], shape: node.nodeShape};
}

@Component({
  selector: 'app-drawing-area',
  imports: [NavPopupComponent],
  templateUrl: './drawing-area.component.html',
  styleUrl: './drawing-area.component.css'
})
export class DrawingAreaComponent implements AfterViewInit, OnChanges, OnDestroy {

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
  private vaultService = inject(VaultService);
  private pluginSettings = inject(PluginSettingsService);
  private themeSub?: Subscription;
  private visualSub?: Subscription;
  private pluginSub?: Subscription;
  private hasDragged = false;
  private wasAlreadySelectedBeforeDrag = false;
  private undoRedoService = new UndoRedoService();
  private dragSnapshotCaptured = false;
  private textEditSnapshotCaptured = false;
  private resizeTargetNode: DANode | null = null;
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
  /** Yank, cut and paste of subgraphs (clipboard-controller.ts). */
  private readonly clipboard = new ClipboardController(this.clipboardHost());
  /** Sizes, shapes, edge styles, colour, and the defaults new nodes and
   *  edges take (style-controller.ts). */
  private readonly style = new StyleController(this.styleHost());
  /** Layouts and edge routing, and the routing run in flight
   *  (layout-controller.ts). */
  private readonly layout = new LayoutController(this.layoutHost());
  /** What an agent sees of the canvas and may do to it; the shell hands
   *  this to agent mode and reading mode (agent-canvas-surface.ts). */
  readonly agentCanvas = new AgentCanvasSurface(this.agentCanvasHost());
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
  /** Screen-space copy of one edited node at low graph zoom. The real node
   *  remains in place; this lens keeps its text and caret readable. */
  private readonly labelEditGhost = new Overlay<Konva.Group>(() => this.crosshairsLayer);
  /** Destination scale of an in-flight focus zoom (da-198): the edit lens
   *  evaluates legibility against this rather than the animating scale. */
  private focusZoomTargetScale: number | null = null;
  /** Natural-scale copy of the node currently reached by crosshair
   *  navigation, shown only when the real node is not fully readable. */
  private readonly navigationLandingGhost = new Overlay<Konva.Group>(() => this.crosshairsLayer);
  /** Draws both of those (crosshairs-hover.ts). */
  private readonly hover = new CrosshairsHover(this.crosshairsHoverHost());

  public readonly MAX_ZOOM = 8.0;
  public readonly MIN_ZOOM = 0.125;
  public readonly CROSSHAIR_MOVEMENT_DURATION = .1;
  public CROSSHAIRS_MOVEMENT_DISTANCE = 50; // one grid cell
  public readonly TWEEN_DURATION = .1;
  public readonly RECENTER_DURATION = 0.3;
  public readonly RECENTER_CROSSHAIRS_DURATION = 0.2;
  public readonly NODE_SIZE_STEP = 20;
  /** Clearance kept between boxes when a resize pushes neighbors aside. */
  public readonly RESIZE_REFLOW_GAP = 16;
  /** Preserve closer views, but never label a new node below natural scale. */
  private static readonly NODE_EDIT_MIN_ZOOM = 1;
  /** Where the camera goes when a label is opened for editing: natural size,
   *  so the text is readable without losing the graph around it. A closer
   *  view is kept. (Was 400%, which Ben found too close, 2026-09-19.) */
  private static readonly NODE_EDIT_ZOOM = 1;
  /** Where traversal has been and which way it was going: momentum, the
   *  current node, the focused edge and the jumplist (nav-journey.ts).
   *  Move by Link and the nav popup share it, so one continues the other. */
  private readonly journey = new NavJourney();
  /** The held, popup-free Move by Link mode (link-nav-controller.ts). */
  private readonly linkNav = new LinkNavController(this.linkNavHost());

  /** Grow mode, the held add key (grow-controller.ts). The template binds
   *  its popup. */
  protected readonly grow = new GrowController(this.growHost());
  /** The interaction modes, at most one on (interaction-modes.ts). Move by
   *  Node's is its held session, not the grid grow borrows while aiming. */
  private readonly modes = this.interactionModes();

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
      this.hover.refresh();
    };
    const reapplyConfig = () => {
      reapplyTheme();
      this.CROSSHAIRS_MOVEMENT_DISTANCE = this.visualConfigService.config.cursor.gridSpacing;
    };
    this.themeSub = this.themeService.themeChanged$.subscribe(reapplyTheme);
    this.visualSub = this.visualConfigService.configChanged$.subscribe(reapplyConfig);

    this.drawingLayer = new DrawingLayer();
    this.drawingLayer.palette = effectivePalette();
    this.drawingLayer.isPluginEnabled = id => this.pluginSettings.isEnabled(id);
    this.pluginSub = this.pluginSettings.changed$.subscribe(() => this.onPluginsChanged());
    this.stage.add(this.drawingLayer);
    // Math in labels lays out as TeX source until MathJax has loaded, then again at its real size.
    this.mathUnsubscribes = [
      onMathReady(() => this.relayoutMathLabels()),
      onMathImageLoaded(() => {
        this.drawingLayer.batchDraw();
        this.crosshairsLayer?.batchDraw();
      }),
    ];
    this.agentCanvas.watchUserViewChanges();
    this.crosshairsLayer = new CrosshairsLayer(this.stage, effectivePalette().crosshairsStroke);
    this.stage.add(this.crosshairsLayer);


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
    this.emitContextState();
    this.hover.refresh();

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

  /** True while a key that owns the view is held (Pan/Zoom). The idle fade
   *  is suspended for the duration — you cannot aim a pan at something you
   *  cannot see (da-257). */
  private crosshairsHeldVisible = false;

  ngOnInit(): void {
  }

  private _beforeUnloadHandler?: () => void;

  ngOnDestroy(): void {
    this.layout.stop();
    this.navGrid.cancelQuadrantGoalRayFade();
    this.themeSub?.unsubscribe();
    this.visualSub?.unsubscribe();
    this.pluginSub?.unsubscribe();
    if (this._beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this._beforeUnloadHandler);
    }
    this.fileController.dispose();
    this.linkNav.clear();
    this.clearLabelEditGhost(false);
    this.hover.dispose();
    this.areaSelect.dispose();
    this.mathUnsubscribes.forEach(unsubscribe => unsubscribe());
  }

  private mathUnsubscribes: (() => void)[] = [];

  /** Plugins were turned on or off: labels may be written differently now
   *  (Markdown, Math), and so take a different size. */
  private onPluginsChanged(): void {
    this.updateEdgesForResizedNodes(this.drawingLayer.refreshLabelSyntax());
    // A plugin added for this graph's type brings its badges and kind colours.
    this.drawingLayer.refreshTagBadges();
    this.drawingLayer.reapplyTheme();
    this.drawingLayer.batchDraw();
    this.refreshLabelEditGhost();
  }

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

    if (this.layout.running && isBlockedWhileRouting(command.kind)) {
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
      this.style.commands(), this.layout.commands(), this.grow.commands(), this.fileController.commands(),
      this.historyCommands(), this.clipboard.commands(), this.diagramTypeCommands(), this.shellCommands(),
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
      [DACommandType.SHOW_CROSSHAIRS]: () => this.holdCrosshairsVisible(),
      [DACommandType.RELEASE_CROSSHAIRS]: () => this.releaseCrosshairsVisible(),
    } satisfies CommandSlice;
  }

  /** Moving along the graph: smart traverse, the walk's history, and
   *  snapping to the nearest node. (Move by Link and move by node bring their
   *  own commands.) */
  private graphNavigationCommands() {
    return {
      [DACommandType.NAV_HISTORY_BACK]: () => this.navHistoryGo(-1),
      [DACommandType.NAV_HISTORY_FORWARD]: () => this.navHistoryGo(1),
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
      [DACommandType.BEGIN_NEW_NODE_LABEL_EDIT]: () => this.beginPendingNodeLabelEdit(),
      [DACommandType.ADD_SELF_EDGE]: () => this.addSelfEdge(),
      [DACommandType.ADD_LABEL]: () => this.addLabel(),
      [DACommandType.INSERT_WAYPOINT]: this.thenEmitEditState(() => this.insertWaypointAtCrosshairs()),
      [DACommandType.TOGGLE_PIN_SELECTED]: () => this.togglePinSelected(),
    } satisfies CommandSlice;
  }

  /** Starting and leaving a text edit, and typing. (Changing the text and
   *  moving the caret are the TextEditingController's own commands.) */
  private textEditingCommands() {
    return {
      [DACommandType.EDIT_TEXT_AT_CROSSHAIRS]: () => this.editTextAtCrosshairs(),
      [DACommandType.EXIT_LABEL_EDIT_MODE]: () => this.exitLabelEditMode(),
      [DACommandType.INSERT_CHAR]: c => this.insertChar(c.value),
    } satisfies CommandSlice;
  }

  /** Undo and redo. (Cut, copy and paste are the clipboard's.) */
  private historyCommands() {
    return {
      [DACommandType.UNDO]: () => this.handleUndo(),
      [DACommandType.REDO]: () => this.handleRedo(),
    } satisfies CommandSlice;
  }

  /** The graph's diagram type, and the commands plugins bring — each goes to
   *  the plugin that owns it (plugins/plugin-commands.ts). */
  private diagramTypeCommands() {
    return {
      [DACommandType.PLUGIN_COMMAND]: c => this.runPluginCommand(c.call),
    } satisfies CommandSlice;
  }

  private _pluginCommands?: PluginCommands;

  /** Run a plugin's command. The table of them is built on first use, with
   *  what plugins may use of the canvas. */
  private runPluginCommand(call: PluginCommandCall): void {
    this._pluginCommands ??= new PluginCommands(this.pluginHost(), PLUGIN_REGISTRY.values(),
      id => this.pluginSettings.isEnabled(id));
    if (!this._pluginCommands.run(call)) this.emitStatus(`No plugin has the command ${call.id}`);
  }

  /** Lends plugins what their commands may use (plugins/plugin-host.ts). */
  private pluginHost(): PluginHost {
    return {
      diagramType: () => this.drawingLayer.diagramType,
      identity: () => resolveIdentity(this.drawingLayer.diagramType),
      targetNodes: () => this.targetNodes().map(pluginNodeOf),
      apply: (label, ops) => this.applyOperationsNow({author: 'user', label, ops}),
      status: message => this.emitStatus(message),
    };
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
      this.hover.scheduleRefresh();
    } else {
      this.hover.refresh();
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
      ?? this.nodeUnderCrosshairs()
      ?? this.edgeUnderCrosshairs();
  }

  /** The node the crosshairs are on: where nodes overlap, the one drawn on
   *  top — the one the hover trace is around, and so the one every command
   *  that acts on "the node under the crosshairs" means. */
  private nodeUnderCrosshairs(): DANode | null {
    return topmost(this.getDANodesContainingCrosshairs());
  }

  /** The edge the crosshairs are on, the same way. */
  private edgeUnderCrosshairs(): DAEdge | null {
    return topmost(this.getDAEdgesContainingCrosshairs());
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

  /** Select the text the edit keys mean, and nothing else: the label under
   *  the crosshairs, else the node — where nodes overlap, the one on top.
   *  Not simply the top item: a waypoint within reach outranks the node
   *  beneath it for the select key, but has no text, and taking it entered
   *  label editing with nothing to edit (seen 2026-09-24). */
  private selectTextUnderCrosshairs(): void {
    this.finishTweens();
    this.drawingLayer.unselectAll();
    this.unselectAllLabels();
    const item = this.getLabelUnderCrosshairs() ?? this.nodeUnderCrosshairs();
    if (item) item.isSelected = true;
    this.drawingLayer.batchDraw();
  }

  /** Select the item under the crosshairs and nothing else — the item the
   *  hover trace is on. */
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

  /** Lends the clipboard what it needs, through a getter so the layer can
   *  still be assigned later in ngAfterViewInit. */
  private clipboardHost(): ClipboardHost {
    const da = this;
    return {
      get drawingLayer() { return da.drawingLayer; },
      getSelectedLabels: () => da.getSelectedLabels(),
      labelUnderCrosshairs: () => da.getLabelUnderCrosshairs(),
      waypointUnderCrosshairs: () => da.getWaypointUnderCrosshairs(),
      nodeUnderCrosshairs: () => da.nodeUnderCrosshairs(),
      crosshairsInLayerCoords: () => da.crosshairsInLayerCoords(),
      deleteSelected: () => da.deleteSelected(),
      finishTweens: () => da.finishTweens(),
      updateEdgesForResizedNodes: nodes => da.updateEdgesForResizedNodes(nodes),
      checkAndEmitEditState: () => da.checkAndEmitEditState(),
      emitStatus: message => da.emitStatus(message),
    };
  }

  /** Lends the style commands what they need, through getters so the layer
   *  can still be assigned later in ngAfterViewInit. */
  private styleHost(): StyleHost {
    const da = this;
    return {
      get drawingLayer() { return da.drawingLayer; },
      targetNodes: only => da.targetNodes(only),
      typeNodeShape: () => resolveIdentity(da.drawingLayer.diagramType).nodeDefaults.shape,
      nodeUnderCrosshairs: () => da.nodeUnderCrosshairs(),
      edgesUnderCrosshairs: () => da.getDAEdgesContainingCrosshairs(),
      updateEdgePoints: edge => da.updateEdgePoints(edge),
      updateEdgesForResizedNodes: nodes => da.updateEdgesForResizedNodes(nodes),
      finishTweens: () => da.finishTweens(),
      emitStatus: message => da.emitStatus(message),
      log: (...parts) => da.log.log(...parts),
    };
  }

  /** Lends the hover cues what they need, through getters so the stage and
   *  layers can still be assigned later in ngAfterViewInit. */
  private crosshairsHoverHost(): CrosshairsHoverHost {
    const da = this;
    return {
      get drawingLayer() { return da.drawingLayer; },
      get crosshairsLayer() { return da.crosshairsLayer; },
      get stage() { return da.stage; },
      get camera() { return da.camera; },
      get viewport() { return da.viewport; },
      get trace() { return da.hoverTrace; },
      get ghost() { return da.navigationLandingGhost; },
      get movementDuration() { return da.CROSSHAIR_MOVEMENT_DURATION; },
      palette: () => da.visualConfigService.getEffectivePalette(da.themeService.theme),
      labelUnderCrosshairs: () => da.getLabelUnderCrosshairs(),
      waypointUnderCrosshairs: () => da.getWaypointUnderCrosshairs(),
      nodeUnderCrosshairs: () => da.nodeUnderCrosshairs(),
      edgeUnderCrosshairs: () => da.edgeUnderCrosshairs(),
    };
  }

  /** Lends the agent's surface what it needs, through getters so the stage
   *  and layer can still be assigned later in ngAfterViewInit. */
  private agentCanvasHost(): AgentCanvasHost {
    const da = this;
    return {
      get drawingLayer() { return da.drawingLayer; },
      get viewport() { return da.viewport; },
      get stage() { return da.stage; },
      get recenterDuration() { return da.RECENTER_DURATION; },
      nodeUnderCrosshairs: () => da.nodeUnderCrosshairs(),
      nodeCenter: node => da.getNodeCenterInLayerCoordinates(node),
      finishTweens: () => da.finishTweens(),
      centerViewOnLayerPoint: point => da.centerViewOnLayerPoint(point),
      updateEdgesForResizedNodes: nodes => da.updateEdgesForResizedNodes(nodes),
      applyOperations: group => da.applyOperations(group),
      revertChangeSet: changeSetId => da.revertChangeSet(changeSetId),
      viewChangedByUser: () => da.daOut.emit({kind: 'view-changed-by-user'}),
    };
  }

  /** Lends layout and routing what they need, through a getter so the layer
   *  can still be assigned later in ngAfterViewInit. */
  private layoutHost(): LayoutHost {
    const da = this;
    return {
      get drawingLayer() { return da.drawingLayer; },
      finishTweens: () => da.finishTweens(),
      pushUndoSnapshot: () => da.undoRedoService.pushSnapshot(da.drawingLayer.serializeGraph()),
      updateEdgesForResizedNodes: nodes => da.updateEdgesForResizedNodes(nodes),
      refreshWaypointVisibility: draw => da.refreshWaypointVisibility(draw),
      computeMetrics: (nodes, edges) => da.metrics.compute(nodes, edges),
      status: message => da.daOut.emit({kind: 'status-message', message}),
      log: message => da.log.log(message),
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
      rerouteIncidentEdges: nodes => da.layout.rerouteIncidentEdges(nodes),
    };
  }

  /** Lends area select what it needs, through getters so the layers can
   *  still be assigned later in ngAfterViewInit. */
  private areaSelectHost(): AreaSelectHost {
    const da = this;
    return {
      beginMode: () => da.modes.begin(da.areaSelect.name),
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

  /** Every interaction mode, in one list so at most one is on. */
  private interactionModes(): InteractionModes {
    return new InteractionModes([this.grow, this.linkNav, this.areaSelect, this.moveByNodeSession()]);
  }

  /** Move by Node's held session as a mode. The grid it shows is also what
   *  grow aims across, so while grow is on this session is not. */
  private moveByNodeSession(): InteractionMode {
    const da = this;
    return {
      name: 'move-by-node',
      get active() { return da.navGrid.visible && !da.grow.active; },
      cancel: () => da.navGrid.hideNodeGrid(),
    };
  }

  /** Grow mode reads the canvas and the crosshairs, and hands every change
   *  back through here. Getters, because the layers arrive in ngAfterViewInit. */
  private growHost(): GrowHost {
    const da = this;
    return {
      beginMode: () => da.modes.begin(da.grow.name),
      get drawingLayer() { return da.drawingLayer; },
      get stage() { return da.stage; },
      get camera() { return da.camera; },
      get viewport() { return da.viewport; },
      get navGrid() { return da.navGrid; },
      get style() { return da.style; },
      get ghostStroke() { return da.visualConfigService.getEffectivePalette(da.themeService.theme).nodeStroke; },
      get dark() { return da.themeService.theme === 'dark'; },
      nodesUnderCrosshairs: () => da.getDANodesContainingCrosshairs(),
      labelUnderCrosshairs: () => da.getLabelUnderCrosshairs(),
      edgesUnderCrosshairs: () => da.getDAEdgesContainingCrosshairs(),
      waypointUnderCrosshairs: () => da.getWaypointUnderCrosshairs(),
      crosshairsInLayerCoords: () => da.crosshairsInLayerCoords(),
      nodeCenter: node => da.getNodeCenterInLayerCoordinates(node),
      finishTweens: () => da.finishTweens(),
      emitStatus: message => da.emitStatus(message),
      emitPopupState: surface => da.daOut.emit(surface === null
        ? {kind: 'popup-state', open: false}
        : {kind: 'popup-state', open: true, surface}),
      pushUndoSnapshot: command => da.pushUndoSnapshot(command),
      pushSnapshot: () => da.undoRedoService.pushSnapshot(da.drawingLayer.serializeGraph()),
      scheduleVaultAutoSave: () => da.scheduleVaultAutoSave(),
      checkAndEmitEditState: () => da.checkAndEmitEditState(),
      unselectAllLabels: () => da.unselectAllLabels(),
      autoRouteNewEdge: edge => da.layout.autoRouteNewEdge(edge),
      restCrosshairsOn: node => da.restCrosshairsOn(node),
      handleQuickAdd: () => da.handleQuickAdd(),
      quickAddSelfLoop: (anchor, dirState) => da.quickAddSelfLoop(anchor, dirState),
      settleNewNode: (node, arrivedByLink) => da.settleNewNode(node, arrivedByLink),
    };
  }

  /** Lends move-by-node what it needs, through getters so the layers can
   *  still be assigned later in ngAfterViewInit. */
  private navigationGridHost(): NavigationGridHost {
    const da = this;
    return {
      beginMode: () => da.modes.begin('move-by-node'),
      get crosshairsLayer() { return da.crosshairsLayer; },
      get drawingLayer() { return da.drawingLayer; },
      get stage() { return da.stage; },
      get themeService() { return da.themeService; },
      get visualConfigService() { return da.visualConfigService; },
      get growActive() { return da.grow.active; },
      emitStatus: message => da.emitStatus(message),
      finishTweens: () => da.finishTweens(),
      moveCrosshairsBy: (dx, dy, tier, showGrid) => da.moveCrosshairsBy(dx, dy, tier, showGrid),
      navStops: targets => da.navStops(targets),
      navStopCenter: (id, kind) => da.navStopCenter(id, kind),
    };
  }

  /** Move by Link reads the crosshairs and the shared walk, and draws one
   *  overlay. Layers are assigned after construction, so these are getters. */
  private linkNavHost(): LinkNavHost {
    const da = this;
    return {
      beginMode: () => da.modes.begin(da.linkNav.name),
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
      cancelModes: () => da.modes.cancelAll(),
      get drawingLayer() { return da.drawingLayer; },
      get crosshairsLayer() { return da.crosshairsLayer; },
      get viewport() { return da.viewport; },
      get daOut() { return da.daOut; },

      get vaultService() { return da.vaultService; },
      get demoDataService() { return da.demoDataService; },
      get draftStorage() { return da.draftStorage; },
      get undoRedoService() { return da.undoRedoService; },
      get themeService() { return da.themeService; },
      get visualConfigService() { return da.visualConfigService; },
      get log() { return da.log; },
      get pluginSettings() { return da.pluginSettings; },

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

  private emitStatus(message: string): void {
    // Status messages double as the vault/search diagnostic trail in
    // tools/debug.log (via the log server).
    this.log.log('[status]', message);
    this.daOut.emit({ kind: 'status-message', message });
  }

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

  /** Pin or unpin: a selection first (waypoints, else nodes), and only
   *  without one the waypoint, else the topmost node, under the crosshairs.
   *  Ben's rule (Ben, 2026-09-24): if things are selected, actions affect
   *  those things. A mixed set goes one way, pinned unless all already are
   *  (inferred, 2026-09-24 — what the waypoints already did). */
  private togglePinSelected(): void {
    const waypoints = this.drawingLayer.getSelectedDAWaypoints();
    const nodes = this.drawingLayer.getSelectedDANodes();
    const hoveredWaypoint = this.getWaypointUnderCrosshairs();
    if (waypoints.length > 0) this.togglePins(waypoints);
    else if (nodes.length > 0) this.togglePins(nodes);
    else if (hoveredWaypoint) this.togglePins([hoveredWaypoint]);
    else this.togglePins(this.targetNodes());
    this.drawingLayer.batchDraw();
  }

  private togglePins(items: DAWaypoint[] | DANode[]): void {
    const pinned = !items.every(item => item.pinned);
    for (const item of items) {
      if (item instanceof DAWaypoint) this.drawingLayer.findEdgeForWaypoint(item)?.setWaypointPinned(item, pinned);
      else item.pinned = pinned;
    }
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

  /**
   * The nodes a command means: the selection if there is one, else the topmost
   * node under the crosshairs. Empty means "no node addressed" — the shape
   * commands read that as a change to the default for new nodes.
   *
   * `only` narrows the choice after it is made: a selection wins even when
   * none of it qualifies, and then the command acts on nothing rather than on
   * the node under the crosshairs. Ben's rule (Ben, 2026-09-24): if things are
   * selected, actions affect those things; if not, what is under the
   * crosshairs is considered. Before, `only` narrowed first
   * (notes/bug-node-target-filter-order.md).
   */
  private targetNodes(only: (node: DANode) => boolean = () => true): DANode[] {
    const selected = this.drawingLayer.getSelectedDANodes();
    return (selected.length > 0 ? selected : topmostSelection(this.getDANodesContainingCrosshairs())).filter(only);
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
    if (this.crosshairsLayer?.crosshairs) this.hover.refresh();
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
    this.hover.clear(false);
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
    this.hover.clear(false);
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
    this.hover.scheduleRefresh(20);
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

  // Kept as methods because tools/qa scripts call them; see
  // tools/qa/contract/component-api.js. Inside this class, ask `hover`.
  private refreshCrosshairHoverHighlight(): void {
    this.hover.refresh();
  }

  private crosshairHoverTarget(): CrosshairHover | null {
    return this.hover.target();
  }

  private clearCrosshairHoverHighlight(draw = true): void {
    this.hover.clear(draw);
  }

  private refreshNavigationLandingGhost(node: DANode, knownReasons?: string[]): void {
    this.hover.showGhost(node, knownReasons);
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
      this.hover.clear(false);
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
    this.hover.clear(false);
    this.tween({
      node: this.drawingLayer,
      duration: this.CROSSHAIR_MOVEMENT_DURATION,
      x: this.drawingLayer.x() + deltaX,
      y: this.drawingLayer.y() + deltaY,
      easing: Konva.Easings.Linear,
      onFinish: () => this.afterMovementTween(),
    });
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
      defaultNodeShape: this.style.effectiveNodeShape(),
      defaultEdgeDirectedness: this.style.defaults.edgeDirectedness,
      defaultLineStyle: this.style.defaults.lineStyle,
      canUndo: this.undoRedoService.canUndo,
      canRedo: this.undoRedoService.canRedo,
      diagramTypeId: this.drawingLayer.diagramType,
      diagramTypeName: this.drawingLayer.diagramType === 'default'
        ? '' : resolveIdentity(this.drawingLayer.diagramType).name,
    });
  }

  // --- Move-by-graph traversal (see graph-nav.ts for the geometry) ---

  private setGraphNavEdge(edge: DAEdge | null): void {
    if (this.journey.focusEdge(edge)) this.drawingLayer.batchDraw();
  }

  // ── Move by Link (held NSEW quadrants): delegated to LinkNavController ──

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

  /** Vim-`zz` for the canvas: pan the view so the graph point under the
   *  crosshairs lands at screen center. The crosshairs ride along (still
   *  over the same graph point) and the zoom level is untouched. */
  private recenterViewOnCrosshairs(): void {
    this.finishTweens();
    this.centerViewOnLayerPoint(this.crosshairsInLayerCoords());
  }

  // ─── Operations: the write path for changes that aren't keymenu commands ──

  private operationsRuntime: {
    applier: GraphOperationApplier;
    invert: (ops: readonly GraphOperation[]) => GraphOperation[];
  } | null = null;

  /** The operations code loads with the app. It was a lazy chunk while only
   *  agent edits used it; plugin commands edit through it from the keyboard,
   *  where waiting for the chunk let a second key press plan against a graph
   *  the first had not changed yet (+1.5 kB, 2026-09-23). */
  private loadOperations() {
    return Promise.resolve(this.operationsNow());
  }

  private operationsNow() {
    return this.operationsRuntime ??= {
      applier: new GraphOperationApplier(this.drawingLayer, {
        nodesChanged: nodes => this.updateEdgesForResizedNodes(nodes),
        edgeAdded: edge => this.layout.autoRouteNewEdge(edge),
      }),
      invert: invertOperations,
    };
  }

  /**
   * Apply an undo group (today: agent edits) all-or-nothing, record it for
   * undo, and save. Resolves to a conflict message instead, having changed
   * nothing, when the graph no longer matches what the operations expect.
   */
  async applyOperations(group: UndoGroup): Promise<string | null> {
    return this.applyOperationsNow(group);
  }

  /** `applyOperations` within the current keystroke, for plugin commands: a
   *  command that reads the graph and writes it in one go leaves no gap for a
   *  second key press to plan against a graph the first has not changed. */
  private applyOperationsNow(group: UndoGroup): string | null {
    this.finishTweens();
    const conflict = this.operationsNow().applier.apply(group.ops);
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

  /** Pan the view (no rescale) so the layer point sits at the stage center,
   *  tweening the crosshairs onto it in step. */
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
    if (targets === 'nodes') {
      for (const target of this.grow.aimableSpots()) {
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
      const ghost = this.grow.spot(id);
      if (ghost) {
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

    const newNode = this.drawingLayer.createNewNode(this.crosshairsLayer.crosshairsX(), this.crosshairsLayer.crosshairsY(), nodeShape ?? this.style.defaults.nodeShape);

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

  /** Centre the usable view on the selection at the same zoom; with nothing
   *  selected, this is the rescue command — fit the whole graph and centre
   *  it, so it always brings everything on screen. */
  private recenterView() {
    this.finishTweens();

    const selected = this.drawingLayer.getSelectedDANodes();
    const hasSelection = selected.length > 0;
    // The selection's own nodes; the whole graph's edges would pull the
    // centre towards the whole graph (they did, from 2026-02 to 09-24).
    const box = hasSelection
      ? this.contentBoundingBox(selected, [])
      : this.contentBoundingBox(this.drawingLayer.getDANodes(), this.drawingLayer.getDAEdges());
    if (!box) return;

    const targetScale = hasSelection ? this.drawingLayer.scaleX() : this.fitScale(box);
    // The usable view's centre, below the header: half its size from the top
    // of the stage put the graph higher by the header's height (to 09-24).
    this.animations.startSelfRemoving({
      node: this.drawingLayer,
      duration: this.RECENTER_DURATION,
      scaleX: targetScale,
      scaleY: targetScale,
      x: this.viewport.centerX - ((box.minX + box.maxX) / 2) * targetScale,
      y: this.viewport.centerY - ((box.minY + box.maxY) / 2) * targetScale,
      easing: Konva.Easings.EaseInOut,
      onFinish: () => this.emitZoomLevel(),
    });
  }

  /** The zoom that fits `box` in the usable view with a margin: never in
   *  past 100%, and floored well below the interactive MIN_ZOOM — a rescue
   *  that stops short of showing the whole graph isn't a rescue. */
  private fitScale(box: {minX: number; minY: number; maxX: number; maxY: number}): number {
    const margin = 0.9;
    const w = Math.max(box.maxX - box.minX, 1);
    const h = Math.max(box.maxY - box.minY, 1);
    const fit = Math.min((this.viewport.width * margin) / w, (this.viewport.height * margin) / h);
    return Math.min(Math.max(fit, 0.02), 1.0);
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
    const scale = this.fitScale(box);
    this.drawingLayer.scale({ x: scale, y: scale });
    this.drawingLayer.position({
      x: this.viewport.centerX - ((box.minX + box.maxX) / 2) * scale,
      y: this.viewport.centerY - ((box.minY + box.maxY) / 2) * scale,
    });
    this.drawingLayer.batchDraw();
  }

  private recenterCrosshairs() {
    this.finishTweens();
    this.hover.clear(false);

    this.animations.startSelfRemoving({
      node: this.crosshairsLayer.crosshairs.konvaGroup,
      duration: this.RECENTER_CROSSHAIRS_DURATION,
      x: this.viewport.centerX,
      y: this.viewport.centerY,
      easing: Konva.Easings.EaseInOut,
      onFinish: () => this.hover.scheduleRefresh(20),
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

  /** Add an empty label to the edge under the crosshairs — where edges
   *  cross, the one the hover trace is on — anchored where the crosshairs
   *  project onto it. */
  private addLabel(notifyHeldAdd = true): DALabel | null {
    const edge = this.edgeUnderCrosshairs();
    if (!edge) {
      this.log.log('addLabel: no edge found under crosshairs');
      return null;
    }
    const box = this.getCrosshairsBBoxInDrawingLayer();
    const projected = projectPointToPath(edge.getPathPoints(), {x: box.cx, y: box.cy});
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

  /** Whether the node being labelled arrived on a link a quick-add just drew;
   *  if so the crosshairs rest on it, hidden, once the label is done. */
  private newNodeArrivedByLink = false;

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

  // ── Grow mode (held add): grow-controller.ts owns it; keys reach it here ──

  /** Raw keys, for a mode that has suspended the keymenu (today, grow). */
  @HostListener('document:keydown', ['$event'])
  handleGrowKeyDown(event: KeyboardEvent): void {
    this.modes.keyDown(event);
  }

  @HostListener('document:keyup', ['$event'])
  handleGrowKeyUp(event: KeyboardEvent): void {
    this.modes.keyUp(event);
  }

  /** A node grow mode just added: open its label, or settle it if it has
   *  none (junctions and invisibles). */
  private settleNewNode(node: DANode, arrivedByLink: boolean): void {
    this.newNodeArrivedByLink = arrivedByLink;
    if (node.nodeShape !== 'junction' && node.nodeShape !== 'invisible') {
      this.beginNewNodeLabelEdit(node);
    } else {
      this.drawingLayer.batchDraw();
      this.checkAndEmitEditState();
    }
  }

  private quickAddSelfLoop(anchor: DANode, dirState?: number): void {
    this.finishTweens();
    this.pushUndoSnapshot({kind: DACommandType.QUICK_ADD});
    this.addSelfEdge(anchor, dirState);
    this.scheduleVaultAutoSave();
  }

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
    this.hover.scheduleRefresh(20);
  }

  /** Add an edge using the user's current defaults. Labels are absent by
   *  default because DAEdge starts with an empty label list. */
  private addDefaultEdge(src: DANode, dest: DANode): DAEdge {
    const edge = this.drawingLayer.addEdge(src, dest);
    edge.directedness = this.style.defaults.edgeDirectedness;
    edge.lineStyle = this.style.defaults.lineStyle;
    this.layout.autoRouteNewEdge(edge);
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
      : this.grow.wireEdge(anchor, anchor, dirState);
    this.drawingLayer.batchDraw();
    this.checkAndEmitEditState();
    this.emitStatus(`Self loop added to ${anchor.label.text() || anchor.nodeShape}`);
    return edge;
  }

  /** Tap of the edit-text key: enter label edit on whatever text-bearing
   *  thing is under the crosshairs. Never grows the graph — except that an
   *  edge with no label gets an empty one to type into. */
  private editTextAtCrosshairs(): void {
    const label = this.getLabelUnderCrosshairs();
    const node = this.getDANodesContainingCrosshairs().length > 0;
    if (label || node) {
      const cursorPoint = this.crosshairsInLayerCoords();
      this.selectTextUnderCrosshairs();
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
    const edge = this.edgeUnderCrosshairs();
    if (edge) {
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
    this.modes.cancelAll();
    this.clearLabelEditGhost();
    this.drawingLayer.restoreGraph(snapshot);
    this.drawingLayer.batchDraw();
    this.checkAndEmitEditState();
    this.daOut.emit({kind: "exit-label-editing-mode"});
    this.crosshairsLayer.showCrosshairs();
    this.crosshairsLayer.batchDraw();
  }

  private deleteSelected(): void {
    // A selection wins, in the order waypoints > nodes > edges > labels;
    // without one, the item under the crosshairs.
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

    // Nothing selected: delete what the hover trace is around, in the order
    // select uses. A label on its edge used to take the edge with it; Ben
    // chose the label alone (Ben, 2026-09-24).
    const item = this.topItemUnderCrosshairs();
    if (item) {
      this.deleteItem(item);
      this.drawingLayer.batchDraw();
    }
  }

  private deleteItem(item: DALabel | DAWaypoint | DANode | DAEdge): void {
    if (item instanceof DALabel) this.getEdgesContainingLabel(item).forEach(edge => edge.removeLabel(item));
    else if (item instanceof DAWaypoint) this.drawingLayer.findEdgeForWaypoint(item)?.removeWaypoint(item);
    else if (item instanceof DANode) this.drawingLayer.removeNode(item);
    else this.drawingLayer.removeEdge(item);
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
      this.layout.rerouteIncidentEdges(this.drawingLayer.getSelectedDANodes());
      this.unselectAll();
      this.checkAndEmitEditState();
    } else if (this.wasAlreadySelectedBeforeDrag) {
      // Quick tap vv on already-selected item: toggle it off
      this.toggleTopItemSelection();
      this.checkAndEmitEditState();
    }
    // Quick tap vv on unselected item: leave it selected (ensureTopItemSelected already did it)
  }

}
