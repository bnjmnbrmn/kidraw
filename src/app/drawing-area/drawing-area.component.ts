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
import { DACommand, DACommandType, GridTier, NavTargetKind, NodeShape } from './command.model';
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
import { onMathImageLoaded, onMathReady } from './math-images';
import { NavigationGridController, NavigationGridHost, navigationRayEnd } from './navigation-grid-controller';
import { NavigationGridStop } from './navigation-grid';
import {
  gridSnapStepper,
  nextNormalMovementStep,
  NormalMovementGoal,
  startNormalMovementGoal,
} from './normal-movement';
import {GrowController, GrowHost} from './grow-controller';
import {Gesture, Gestures} from './gestures';
import { LabelEditSession, LabelEditHost } from './label-edit-session';
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
import { PluginSettingsService } from '../plugins/plugin-settings.service';
import { CommandHandlers, CommandSlice, mergeCommandSlices, runCommand } from './command-handlers';
import { AreaSelect, AreaSelectHost } from './area-select';
import { KeyboardDrag, KeyboardDragHost } from './keyboard-drag';
import { GraphSearch, GraphSearchHost } from './graph-search';
import { ClipboardController, ClipboardHost } from './clipboard-controller';
import { HistoryController, HistoryHost } from './history-controller';
import { SelectDrag, SelectDragHost } from './select-drag';
import { StyleController, StyleHost } from './style-controller';
import { LayoutController, LayoutHost } from './layout-controller';
import { AgentCanvasSurface, AgentCanvasHost } from './agent-canvas-surface';
import { CrosshairHover, CrosshairsHover, CrosshairsHoverHost } from './crosshairs-hover';

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
  private undoRedoService = new UndoRedoService();
  private textEditSnapshotCaptured = false;
  /** The stage↔layer transform (camera.ts). Reads the drawing layer
   *  lazily, because that layer is built in ngAfterViewInit. */
  private readonly camera = new Camera(() => this.drawingLayer);
  /** The stage minus whatever the UI overlays cover (viewport.ts). */
  private readonly viewport = new Viewport(() => this.stage, () => this.viewportInset);
  /** Files, the vault, named graphs and display (file-controller.ts). */
  private readonly fileController = new FileController(this.fileHost());
  private readonly textEditor = new TextEditingController(this.textEditingHost());
  /** Opening and closing a text edit, and the view while typing
   *  (label-edit-session.ts). */
  private readonly labelEdit = new LabelEditSession(this.labelEditHost());
  private readonly areaSelect = new AreaSelect(this.areaSelectHost());
  private readonly keyboardDrag = new KeyboardDrag(this.keyboardDragHost());
  private readonly search = new GraphSearch(this.graphSearchHost());
  /** Undo and redo, and the operations agents and plugins change the graph
   *  with (history-controller.ts). */
  private readonly history = new HistoryController(this.historyHost());
  /** The held select key: select, drag, resize, area select (select-drag.ts). */
  private readonly selectDrag = new SelectDrag(this.selectDragHost());
  /** Yank, cut and paste of subgraphs (clipboard-controller.ts). */
  private readonly clipboard = new ClipboardController(this.clipboardHost());
  /** Sizes, shapes, edge styles, color, and the defaults new nodes and
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
  /** Where traversal has been and which way it was going: momentum, the
   *  current node, the focused edge and the jumplist (nav-journey.ts).
   *  Move by Link and the nav popup share it, so one continues the other. */
  private readonly journey = new NavJourney();
  /** The held, popup-free Move by Link mode (link-nav-controller.ts). */
  private readonly linkNav = new LinkNavController(this.linkNavHost());

  /** Grow mode, the held add key (grow-controller.ts). The template binds
   *  its popup. */
  protected readonly grow = new GrowController(this.growHost());
  /** The gestures, at most one on (gestures.ts). Move by Node's is its held
   *  session, not the grid grow borrows while aiming. */
  private readonly gestures = this.allGestures();

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
    this.labelEdit.clearLens(false);
    this.hover.dispose();
    this.areaSelect.dispose();
    this.mathUnsubscribes.forEach(unsubscribe => unsubscribe());
  }

  private mathUnsubscribes: (() => void)[] = [];

  /** Plugins were turned on or off: labels may be written differently now
   *  (Markdown, Math), and so take a different size. */
  private onPluginsChanged(): void {
    this.updateEdgesForResizedNodes(this.drawingLayer.refreshLabelSyntax());
    // A plugin added for this graph's type brings its badges and kind colors.
    this.drawingLayer.refreshTagBadges();
    this.drawingLayer.reapplyTheme();
    this.drawingLayer.batchDraw();
    this.labelEdit.refreshLens();
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
    this.labelEdit.refreshLens();
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
      // One snapshot per hold, and none for an area select (select-drag.ts).
      if (!this.selectDrag.takesUndoSnapshot()) return;
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
   *  initializer, which specs that build the component with `Object.create`
   *  would skip. */
  private get commandHandlers(): CommandHandlers {
    return this._commandHandlers ??= mergeCommandSlices(
      this.crosshairsCommands(), this.graphNavigationCommands(), this.linkNav.commands(), this.navGrid.commands(),
      this.search.commands(), this.viewCommands(), this.selectionCommands(), this.selectDrag.commands(),
      this.structureCommands(), this.labelEdit.commands(), this.textEditor.commands(),
      this.style.commands(), this.layout.commands(), this.grow.commands(), this.fileController.commands(),
      this.history.commands(), this.clipboard.commands(), this.shellCommands(),
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

  /** The view: zoom, pan, and recentering. */
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
      [DACommandType.UNSELECT_ALL]: this.thenEmitEditState(() => this.unselectAll()),
    } satisfies CommandSlice;
  }

  /** Adding, connecting and removing nodes, edges, labels and waypoints. */
  private structureCommands() {
    return {
      [DACommandType.CREATE_NEW_NODE]: c => this.createNewNode(c.nodeShape),
      [DACommandType.QUICK_ADD]: () => this.handleQuickAdd(),
      [DACommandType.BEGIN_NEW_NODE_LABEL_EDIT]: () => this.labelEdit.beginPending(),
      [DACommandType.ADD_SELF_EDGE]: () => this.addSelfEdge(),
      [DACommandType.ADD_LABEL]: () => this.addLabel(),
      [DACommandType.INSERT_WAYPOINT]: this.thenEmitEditState(() => this.insertWaypointAtCrosshairs()),
      [DACommandType.TOGGLE_PIN_SELECTED]: () => this.togglePinSelected(),
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
      applyOperations: async group => da.history.apply(group),
      revertChangeSet: async changeSetId => da.history.revertChangeSet(changeSetId),
      viewChangedByUser: () => da.daOut.emit({kind: 'view-changed-by-user'}),
    };
  }

  /** Lends the held select key what it needs; getters, because the layers
   *  arrive in ngAfterViewInit. */
  private selectDragHost(): SelectDragHost {
    const da = this;
    return {
      get drawingLayer() { return da.drawingLayer; },
      get crosshairsLayer() { return da.crosshairsLayer; },
      get camera() { return da.camera; },
      get resizeStep() { return da.NODE_SIZE_STEP; },
      get areaSelect() { return da.areaSelect; },
      dragStep: (axis, sign, tier) => da.keyboardDrag.step(axis, sign, tier),
      topItemUnderCrosshairs: () => da.topItemUnderCrosshairs(),
      getSelectedLabels: () => da.getSelectedLabels(),
      updateEdgesForResizedNodes: nodes => da.updateEdgesForResizedNodes(nodes),
      rerouteIncidentEdges: nodes => da.layout.rerouteIncidentEdges(nodes),
      unselectAll: () => da.unselectAll(),
      finishTweens: () => da.finishTweens(),
      checkAndEmitEditState: () => da.checkAndEmitEditState(),
    };
  }

  /** Lends the history what it needs, through a getter so the layer can
   *  still be assigned later in ngAfterViewInit. */
  private historyHost(): HistoryHost {
    const da = this;
    return {
      get drawingLayer() { return da.drawingLayer; },
      get undoRedo() { return da.undoRedoService; },
      targetNodes: () => da.targetNodes(),
      isPluginEnabled: id => da.pluginSettings.isEnabled(id),
      updateEdgesForResizedNodes: nodes => da.updateEdgesForResizedNodes(nodes),
      autoRouteNewEdge: edge => da.layout.autoRouteNewEdge(edge),
      finishTweens: () => da.finishTweens(),
      checkAndEmitEditState: () => da.checkAndEmitEditState(),
      scheduleVaultAutoSave: () => da.scheduleVaultAutoSave(),
      emitStatus: message => da.emitStatus(message),
      beforeGraphReplaced: () => {
        da.gestures.cancelAll();
        da.labelEdit.clearLens();
      },
      afterGraphReplaced: () => {
        da.daOut.emit({kind: "exit-label-editing-mode"});
        da.crosshairsLayer.showCrosshairs();
        da.crosshairsLayer.batchDraw();
      },
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
      beginGesture: () => da.gestures.begin(da.areaSelect.name),
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

  /** Every gesture, in one list so at most one is on. */
  private allGestures(): Gestures {
    return new Gestures([this.grow, this.linkNav, this.areaSelect, this.moveByNodeSession()]);
  }

  /** Move by Node's held session as a gesture. The grid it shows is also what
   *  grow aims across, so while grow is on this session is not. */
  private moveByNodeSession(): Gesture {
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
      beginGesture: () => da.gestures.begin(da.grow.name),
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
      beginGesture: () => da.gestures.begin('move-by-node'),
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
      beginGesture: () => da.gestures.begin(da.linkNav.name),
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

  /** Text editing owns mutations and keeps resized boxes centered. */
  private textEditingHost(): TextEditingHost {
    const da = this;
    return {
      get drawingLayer() { return da.drawingLayer; },
      get resizeReflowGap() { return da.RESIZE_REFLOW_GAP; },
      getSelectedLabels: () => da.getSelectedLabels(),
      getEdgeForLabel: label => da.getEdgeForLabel(label),
      finishTweens: () => da.finishTweens(),
      updateEdgesForResizedNodes: nodes => da.updateEdgesForResizedNodes(nodes),
      refreshEditLens: () => da.labelEdit.refreshLens(),
    };
  }

  /** Lends a text edit what it needs; getters, because the layers arrive in
   *  ngAfterViewInit. */
  private labelEditHost(): LabelEditHost {
    const da = this;
    return {
      get drawingLayer() { return da.drawingLayer; },
      get crosshairsLayer() { return da.crosshairsLayer; },
      get stage() { return da.stage; },
      get viewport() { return da.viewport; },
      get maxZoom() { return da.MAX_ZOOM; },
      get textEditor() { return da.textEditor; },
      emit: notification => da.daOut.emit(notification),
      log: message => da.log.log(message),
      finishTweens: () => da.finishTweens(),
      checkAndEmitEditState: () => da.checkAndEmitEditState(),
      scheduleVaultAutoSave: () => da.scheduleVaultAutoSave(),
      pushUndoSnapshot: command => da.pushUndoSnapshot(command),
      addLabel: notifyHeldAdd => da.addLabel(notifyHeldAdd),
      getAllLabels: () => da.getAllLabels(),
      getSelectedLabels: () => da.getSelectedLabels(),
      unselectAllLabels: () => da.unselectAllLabels(),
      getEdgesContainingLabel: label => da.getEdgesContainingLabel(label),
      labelUnderCrosshairs: () => da.getLabelUnderCrosshairs(),
      nodesUnderCrosshairs: () => da.getDANodesContainingCrosshairs(),
      edgeUnderCrosshairs: () => da.edgeUnderCrosshairs(),
      crosshairsInLayerCoords: () => da.crosshairsInLayerCoords(),
      selectTextUnderCrosshairs: () => da.selectTextUnderCrosshairs(),
      nodeCenterInLayer: node => da.getNodeCenterInLayerCoordinates(node),
      nodeCenterInStage: node => da.getNodeCenterInStageCoordinates(node),
      centerViewOnLayerPoint: (point, scale, onFinish) => da.centerViewOnLayerPoint(point, scale, onFinish),
      parkCrosshairsAt: point => da.parkCrosshairsAt(point),
      hideCrosshairsUntilMoved: () => da.hideCrosshairsUntilMoved(),
    };
  }

  /** Layers are assigned after construction; getters keep the host current. */
  private fileHost(): FileHost {
    const da = this;
    return {
      cancelGestures: () => da.gestures.cancelAll(),
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

  private unselectAll() {
    this.finishTweens();
    this.labelEdit.clearLens();
    this.drawingLayer.unselectAll();
    this.unselectAllLabels();
    // Escape also ends the traversal: drop the navigation focus glow.
    this.setGraphNavEdge(null);
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
  /** Tools-facing (tools/qa/contract/component-api.js). */
  private checkResizeHandleProximity(): void {
    this.selectDrag.refreshResizeHandle();
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
    this.labelEdit.arrivedByLink = drawn.length > 0;

    const labelable = newNode.nodeShape !== 'junction' &&
      newNode.nodeShape !== 'invisible';
    if (notifyHeldInsert) {
      this.labelEdit.pendingNode = labelable ? newNode : null;
      if (labelable) {
        newNode.showCursor();
        this.crosshairsLayer.hideCrosshairs();
      }
      this.daOut.emit({kind: 'node-inserted', labelable});
    } else {
      this.labelEdit.pendingNode = null;
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

  /** Center the usable view on the selection at the same zoom; with nothing
   *  selected, this is the rescue command — fit the whole graph and center
   *  it, so it always brings everything on screen. */
  private recenterView() {
    this.finishTweens();

    const selected = this.drawingLayer.getSelectedDANodes();
    const hasSelection = selected.length > 0;
    // The selection's own nodes; the whole graph's edges would pull the
    // center towards the whole graph (they did, from 2026-02 to 09-24).
    const box = hasSelection
      ? this.contentBoundingBox(selected, [])
      : this.contentBoundingBox(this.drawingLayer.getDANodes(), this.drawingLayer.getDAEdges());
    if (!box) return;

    const targetScale = hasSelection ? this.drawingLayer.scaleX() : this.fitScale(box);
    // The usable view's center, below the header: half its size from the top
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

  /** Tools-facing: the tools/qa scripts drive a drag step through here
   *  (select-drag.ts). */
  private dragSelected(axis: Axis | AxisKey, sign: 1 | -1, tier?: GridTier) {
    this.selectDrag.drag(axis, sign, tier);
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
      this.labelEdit.showCarets();
      this.daOut.emit({kind: 'started-label-editing-mode', mode: 'insert'});
      this.scheduleVaultAutoSave();
      return;
    }
    this.pushUndoSnapshot({kind: DACommandType.QUICK_ADD});
    const newNode = this.createNewNode(undefined, false);
    this.labelEdit.beginForNewNode(newNode);
    this.scheduleVaultAutoSave();
  }

  /** Paste text from the system clipboard into the label being edited, e.g.
   *  markdown copied from the agent chat. Text fields handle their own pastes. */
  @HostListener('document:paste', ['$event'])
  onPasteText(event: ClipboardEvent): void {
    const target = event.target;
    if (target instanceof HTMLElement && target.closest('input, textarea, [contenteditable="true"]')) return;
    const text = event.clipboardData?.getData('text/plain');
    if (text && this.labelEdit.paste(text)) event.preventDefault();
  }

  // ── Grow mode (held add): grow-controller.ts owns it; keys reach it here ──

  /** Raw keys, for a mode that has suspended the keymenu (today, grow). */
  @HostListener('document:keydown', ['$event'])
  handleGrowKeyDown(event: KeyboardEvent): void {
    this.gestures.keyDown(event);
  }

  @HostListener('document:keyup', ['$event'])
  handleGrowKeyUp(event: KeyboardEvent): void {
    this.gestures.keyUp(event);
  }

  /** A node grow mode just added: open its label, or settle it if it has
   *  none (junctions and invisibles). */
  private settleNewNode(node: DANode, arrivedByLink: boolean): void {
    this.labelEdit.arrivedByLink = arrivedByLink;
    if (node.nodeShape !== 'junction' && node.nodeShape !== 'invisible') {
      this.labelEdit.beginForNewNode(node);
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
}
