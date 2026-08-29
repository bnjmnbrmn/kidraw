import {AfterViewInit, Component, ElementRef, EventEmitter, HostListener, inject, Input, OnChanges, OnDestroy, Output, SimpleChanges} from '@angular/core';
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
import { DACommand, DACommandType, EdgeDirectedness, GraphItemNavigationStrategy, GridTier, ItemColor, LayoutType, LineStyle, NavTargetKind, NodeShape, RoutingAlgorithm, TaskStatus, TextCursorMode, TextOverflowMode, VimChangeMotion } from './command.model';
import { lineSegmentIntersectsRect, closestPointOnSegment as closestPointOnSeg } from './utils';
import { pointAtT, projectPointToPath } from './edge-label-anchor';
import { endpointFlowDirection, LinkCardinalDirection, linkQuadrant, moveLinkQuadrant, pickEntryCandidate } from './graph-nav';
import { NavPopupComponent, PopupRow } from '../nav-popup/nav-popup.component';
import { planGather, GatherNeighbor, GatherPlacement } from './gather-fisheye';
import {
  bandIndexAtCoordinate,
  bandIndexForStop,
  buildNavigationGrid,
  NavigationAxisBand,
  NavigationGridStop,
} from './navigation-grid';
import {
  adaptiveGoalAngleStep,
  adjustAngleTowardScreenVertical,
  cardinalAngle,
  CardinalDirection,
  distanceToGoalRay,
  GoalVerticalDirection,
  moveUsesQuadrantConstraint,
  navigationQuadrant,
  quadrantForDirection,
} from './navigation-quadrant-grid';
import {
  buildQuadrantRingGrid,
  nextQuadrantRingStop,
  quadrantArcAngles,
  quarterArcPoints,
} from './navigation-quadrant-rings';
import {
  nextNormalMovementStep,
  NormalMovementGoal,
  startNormalMovementGoal,
} from './normal-movement';
import {caretVisibilityPanDelta} from './edit-viewport';
import {buildGrowGhostTargets, GrowGhostTarget} from './grow-ghost-targets';

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

interface NavigationViewport {
  x: number;
  y: number;
  scale: number;
  width: number;
  height: number;
}
import { DANotification } from './da-notification.model';
import { Observable } from 'rxjs';
import Konva from 'konva';
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
import { Vault, VaultService, ensureKidrawFilename, normalizeVaultPath } from '../services/vault.service';
import {
  isYamlFilename,
  parseGraphDocByFilename,
  serializeGraphDocByFilename,
} from '../lib/file-format/parser';
import { snapshotToFiles, filesToSnapshot } from '../lib/file-format/snapshot-mapping';
import { getExtension, resolveIdentity } from '../extensions/extension-registry';
import { applyExclusiveTag } from '../extensions/tag-groups';
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
  private tweens: Konva.Tween[] = [];
  private currentDragRafId: number | null = null;
  private demoDataService = inject(DemoDataService);
  private log = inject(DebugLogService);
  private themeService = inject(ThemeService);
  private visualConfigService = inject(VisualConfigService);
  private metrics = inject(RoutingMetricsService);
  private draftStorage = inject(DraftStorageService);
  /** Viewport from the draft loaded at startup, so a vault reopen keeps the
   *  user's place instead of re-fitting. Consumed once by initVault. */
  private startupDraftView: {x: number; y: number; scale: number} | null = null;
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
  private _defaultNodeShape: NodeShape = 'box';
  private _defaultEdgeDirectedness: EdgeDirectedness = 'directed';
  private _defaultLineStyle: LineStyle = 'solid';
  private resizeTargetNode: DANode | null = null;
  private gatheredNodePositions: Map<DANode, {x: number; y: number}> = new Map();
  /** Labelable node created by the held insert hub. It is focused only when
   *  the hold ends, after the optional drag phase has established its final
   *  position. */
  private pendingNodeLabelEdit: DANode | null = null;
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
  /** Ordinary hjkl movement follows this fixed line until the axis changes
   *  or the movement indicators time out. */
  private normalMovementGoal: NormalMovementGoal | null = null;
  private normalMovementGoalLine: Konva.Line | null = null;
  /** Dashed crosshair-colored trace around the single top-priority graph item
   *  currently under the crosshairs. This is intentionally separate from
   *  selection state and is never serialized. */
  private crosshairHoverHighlight: Konva.Shape | null = null;
  private crosshairHoverRefreshTimer: number | null = null;
  /** Screen-space copy of one edited node at low graph zoom. The real node
   *  remains in place; this lens keeps its text and caret readable. */
  private labelEditGhost: Konva.Group | null = null;
  /** Destination scale of an in-flight focus zoom (da-198): the edit lens
   *  evaluates legibility against this rather than the animating scale. */
  private focusZoomTargetScale: number | null = null;
  /** Natural-scale copy of the node currently reached by crosshair
   *  navigation, shown only when the real node is not fully readable. */
  private navigationLandingGhost: Konva.Group | null = null;

  public readonly MAX_ZOOM = 8.0;
  public readonly MIN_ZOOM = 0.125;
  public readonly CROSSHAIR_MOVEMENT_DURATION = .1;
  public CROSSHAIRS_MOVEMENT_DISTANCE = 50; // one grid cell
  public readonly TWEEN_DURATION = .1;
  public readonly RECENTER_DURATION = 0.3;
  /** Placement used fixed slots — 300 across, 150 down — which read as a
   *  chasm next to a small box and as a squeeze next to a wide one. The gap
   *  is now a fraction of the box you are growing from, so a graph of 60px
   *  nodes places them 60px apart and a graph of big ones spreads out
   *  (2026-08-29). Horizontal gaps run wider because labels run across.
   *  Bounds keep tiny boxes from touching and huge ones from throwing the
   *  new node off screen. */
  private static readonly QUICK_ADD_GAP_H_RATIO = 0.5;
  private static readonly QUICK_ADD_GAP_V_RATIO = 0.35;
  private static readonly QUICK_ADD_GAP_MIN = 24;
  private static readonly QUICK_ADD_GAP_MAX_H = 120;
  private static readonly QUICK_ADD_GAP_MAX_V = 90;
  /** Fallback box when there is no anchor to measure — DANode's default. */
  private static readonly QUICK_ADD_FALLBACK_BOX = 120;

  /** Centre-to-centre distance for a node placed beside `anchor`: the box it
   *  has to clear, plus a gap proportional to that box. */
  private quickAddSlot(vertical: boolean, anchor: DANode | null = this.growAnchor): number {
    const D = DrawingAreaComponent;
    const box = vertical
      ? (anchor?.NODE_HEIGHT ?? D.QUICK_ADD_FALLBACK_BOX)
      : (anchor?.NODE_WIDTH ?? D.QUICK_ADD_FALLBACK_BOX);
    const ratio = vertical ? D.QUICK_ADD_GAP_V_RATIO : D.QUICK_ADD_GAP_H_RATIO;
    const maxGap = vertical ? D.QUICK_ADD_GAP_MAX_V : D.QUICK_ADD_GAP_MAX_H;
    const gap = Math.min(maxGap, Math.max(D.QUICK_ADD_GAP_MIN, box * ratio));
    return Math.round(box + gap);
  }
  public readonly RECENTER_CROSSHAIRS_DURATION = 0.2;
  public readonly STEERING_ROTATION_STEP_RADIANS = Math.PI / 18;
  public readonly STEERING_SPEED_STEP = 10;
  public readonly MIN_STEERING_SPEED = 20;
  public readonly MAX_STEERING_SPEED = 200;
  public readonly NODE_SIZE_STEP = 20;
  public readonly TEXT_SIZE_STEP = 2;
  /** Clearance kept between boxes when a resize pushes neighbors aside. */
  public readonly RESIZE_REFLOW_GAP = 16;
  /** Preserve closer views, but never label a new node below natural scale. */
  private static readonly NODE_EDIT_MIN_ZOOM = 1;
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
  /** Source and focus state for the held, popup-free Move by Link mode. */
  private linkNavSource: DANode | null = null;
  private linkNavDirectionalFocus = false;
  private linkNavQuadrantLines: Konva.Group | null = null;
  private linkNavQuadrantRefreshTimer: number | null = null;
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
  navPopupStartFilter = false;
  navPopupSelectedId: string | null = null;
  navPopupDirectionKeys = {up: 'k', left: 'h', down: 'j', right: 'l'};
  /** Who owns the popup right now: graph navigation or the grow-target search. */
  private navPopupPurpose: 'nav' | 'grow-target' | 'grow-type' = 'nav';
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
  /** Initial row highlighting is only a preview; the first directional key
   *  establishes the geometric edge focus. */
  private navDirectionalFocus = false;
  /** Translucent dashed preview of the highlighted candidate (copies of the
   *  source node, a straightened edge + labels, and the destination node
   *  pulled into the viewport). The view itself never moves while browsing. */
  private navGhostGroup: Konva.Group | null = null;
  /** Pre-gather control points of every edge Gather re-routed, so Ungather
   *  restores the wiring exactly. */
  private gatheredEdgeControlPoints = new Map<DAEdge, EdgeControlPoint[]>();

  private static readonly CONTEXT_AFFECTING_COMMANDS = new Set<DACommandType>([
    DACommandType.CREATE_NEW_NODE,
    DACommandType.ADD_SELF_EDGE,
    DACommandType.CONNECT_SELECTED_NODES,
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
    DACommandType.ADJUST_GRAPH_ITEM_GOAL_SOUTH,
    DACommandType.ADJUST_GRAPH_ITEM_GOAL_NORTH,
    DACommandType.TRAVERSE_SMART,
    DACommandType.ENTER_LINK_NAV,
    DACommandType.MOVE_LINK_LEFT,
    DACommandType.MOVE_LINK_RIGHT,
    DACommandType.MOVE_LINK_UP,
    DACommandType.MOVE_LINK_DOWN,
    DACommandType.RELEASE_LINK_NAV,
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
    DACommandType.TOGGLE_NODE_SHAPE,
    DACommandType.QUICK_ADD,
    DACommandType.CYCLE_EDGE_DIRECTEDNESS,
    DACommandType.SEARCH_GRAPH,
    DACommandType.SEARCH_NEXT_MATCH,
    DACommandType.SEARCH_PREV_MATCH,
  ]);

  /** Move-by-node has its own spatial overlay. Showing the ordinary drawing
   * grid for these commands makes the band model visually ambiguous. */
  private static readonly MOVE_BY_NODE_COMMANDS = new Set<DACommandType>([
    DACommandType.SET_GRAPH_ITEM_NAVIGATION_STRATEGY,
    DACommandType.SHOW_NODE_GRID,
    DACommandType.HIDE_NODE_GRID,
    DACommandType.SNAP_TO_NODE_LEFT,
    DACommandType.SNAP_TO_NODE_RIGHT,
    DACommandType.SNAP_TO_NODE_UP,
    DACommandType.SNAP_TO_NODE_DOWN,
    DACommandType.ADJUST_GRAPH_ITEM_GOAL_SOUTH,
    DACommandType.ADJUST_GRAPH_ITEM_GOAL_NORTH,
  ]);

  private static readonly MUTATING_COMMANDS = new Set<DACommandType>([
    DACommandType.CREATE_NEW_NODE,
    DACommandType.ADD_SELF_EDGE,
    DACommandType.CYCLE_EDGE_DIRECTEDNESS,
    DACommandType.INSERT_WAYPOINT,
    DACommandType.CONNECT_SELECTED_NODES,
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
    DACommandType.TOGGLE_NODE_SHAPE,
    DACommandType.SET_DIAGRAM_TYPE,
    DACommandType.SET_TASK_STATUS,
    DACommandType.CUT_SELECTION,
    DACommandType.PASTE_CLIPBOARD,
  ]);

  private static readonly ROUTING_LOCKED_COMMANDS = new Set<DACommandType>([
    DACommandType.CREATE_NEW_NODE,
    DACommandType.ADD_SELF_EDGE,
    DACommandType.INSERT_WAYPOINT,
    DACommandType.CONNECT_SELECTED_NODES,
    DACommandType.ADD_LABEL,
    DACommandType.EDIT_SELECTED,
    DACommandType.QUICK_ADD,
    DACommandType.CYCLE_EDGE_DIRECTEDNESS,
    DACommandType.INSERT_CHAR,
    DACommandType.DELETE_LAST_CHAR,
    DACommandType.DELETE,
    DACommandType.CUT_SELECTION,
    DACommandType.PASTE_CLIPBOARD,
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
    DACommandType.TOGGLE_NODE_SHAPE,
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
    DACommandType.SET_TASK_STATUS,
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
      if (this.normalMovementGoal) this.redrawNormalMovementGoalLine();
      if (this.linkNavSource) this.redrawLinkNavQuadrantLines(this.linkNavSource);
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
          // Keep the user's place across a refresh; fall back to fit only
          // when the draft predates viewport persistence. Stash it so the
          // vault reopen (initVault) honors it instead of re-fitting.
          this.startupDraftView = draft.view ?? null;
          if (!this.restoreViewport(draft.view) && snapshot.nodes.length > 0) {
            this.fitViewToContent();
          }
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
    this.refreshCrosshairHoverHighlight();

    this.resizeObserver = new ResizeObserver(entries => {
      this.stage.width(this.componentNE.offsetWidth);
      this.stage.height(this.componentNE.offsetHeight);
      if (this.nodeGridVisible) this.redrawNodeGrid();
      if (this.linkNavSource) this.redrawLinkNavQuadrantLines(this.linkNavSource);
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
  /** Where along a freshly connected link the crosshairs land: near the
   *  destination, but not so close that the arrowhead sits under them. */
  private static readonly NEW_EDGE_FOCUS_T = 0.8;

  ngOnInit(): void {
  }

  private _beforeUnloadHandler?: () => void;

  ngOnDestroy(): void {
    this.stopRouting();
    this.cancelQuadrantGoalRayFade();
    this.themeSub?.unsubscribe();
    this.visualSub?.unsubscribe();
    if (this._beforeUnloadHandler) {
      window.removeEventListener('beforeunload', this._beforeUnloadHandler);
    }
    if (this.vaultSaveTimer !== null) clearTimeout(this.vaultSaveTimer);
    if (this.vaultPollTimer !== null) clearInterval(this.vaultPollTimer);
    if (this.crosshairHoverRefreshTimer !== null) {
      clearTimeout(this.crosshairHoverRefreshTimer);
    }
    this.clearLinkNavQuadrantLines();
    this.clearLabelEditGhost(false);
    this.clearNavigationLandingGhost(false);
    this.crosshairHoverHighlight?.destroy();
    this.areaSelectMarquee?.destroy();
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
      // Area-select steps only change selection state, never geometry —
      // they don't belong in the undo history.
      if (this.areaSelectActive) return;
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

    // The ordinary goal line describes one uninterrupted normal-movement
    // gesture. Any other command ends that gesture immediately rather than
    // leaving a stale guide over editing, dragging, or graph navigation.
    switch (command.kind) {
      case DACommandType.MOVE_CROSSHAIRS_LEFT:
      case DACommandType.MOVE_CROSSHAIRS_RIGHT:
      case DACommandType.MOVE_CROSSHAIRS_UP:
      case DACommandType.MOVE_CROSSHAIRS_DOWN:
        if (command.gridTier && command.gridTier !== 'normal') {
          this.clearNormalMovementGoal();
        }
        break;
      default:
        this.clearNormalMovementGoal();
    }

    // Push undo snapshot before mutating commands
    if (DrawingAreaComponent.MUTATING_COMMANDS.has(command.kind)) {
      this.pushUndoSnapshot(command);
    }

    // Show grid and indicators for any spatial/manipulation command
    if (!DrawingAreaComponent.MOVE_BY_NODE_COMMANDS.has(command.kind) &&
        command.kind !== DACommandType.INSERT_CHAR &&
        command.kind !== DACommandType.DELETE_LAST_CHAR &&
        command.kind !== DACommandType.EXIT_LABEL_EDIT_MODE &&
        command.kind !== DACommandType.EDIT_SELECTED &&
        command.kind !== DACommandType.QUICK_ADD &&
        command.kind !== DACommandType.BEGIN_NEW_NODE_LABEL_EDIT &&
        command.kind !== DACommandType.ENTER_ADD_MODE &&
        command.kind !== DACommandType.EDIT_TEXT_AT_CROSSHAIRS &&
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
        this.traverseSmart(command.keys);
        break;
      case DACommandType.ENTER_LINK_NAV:
        this.enterLinkNav();
        break;
      case DACommandType.MOVE_LINK_LEFT:
        this.moveLinkNav('west');
        break;
      case DACommandType.MOVE_LINK_RIGHT:
        this.moveLinkNav('east');
        break;
      case DACommandType.MOVE_LINK_UP:
        this.moveLinkNav('north');
        break;
      case DACommandType.MOVE_LINK_DOWN:
        this.moveLinkNav('south');
        break;
      case DACommandType.RELEASE_LINK_NAV:
        this.releaseLinkNav();
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
      case DACommandType.SET_GRAPH_ITEM_NAVIGATION_STRATEGY:
        this.setGraphItemNavigationStrategy(command.strategy);
        break;
      case DACommandType.SHOW_NODE_GRID:
        this.showNodeGrid(command.targets ?? 'labels');
        break;
      case DACommandType.HIDE_NODE_GRID:
        this.hideNodeGrid();
        break;
      case DACommandType.SNAP_TO_NODE_LEFT:
        this.snapToNodeInDirection('left', command.targets ?? 'labels');
        break;
      case DACommandType.SNAP_TO_NODE_RIGHT:
        this.snapToNodeInDirection('right', command.targets ?? 'labels');
        break;
      case DACommandType.SNAP_TO_NODE_UP:
        this.snapToNodeInDirection('up', command.targets ?? 'labels');
        break;
      case DACommandType.SNAP_TO_NODE_DOWN:
        this.snapToNodeInDirection('down', command.targets ?? 'labels');
        break;
      case DACommandType.ADJUST_GRAPH_ITEM_GOAL_SOUTH:
        this.adjustQuadrantGoalAngle('south', command.targets ?? 'labels');
        break;
      case DACommandType.ADJUST_GRAPH_ITEM_GOAL_NORTH:
        this.adjustQuadrantGoalAngle('north', command.targets ?? 'labels');
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
      case DACommandType.ADD_SELF_EDGE:
        this.addSelfEdge();
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
      case DACommandType.SHOW_CROSSHAIRS:
        this.holdCrosshairsVisible();
        break;
      case DACommandType.RELEASE_CROSSHAIRS:
        this.releaseCrosshairsVisible();
        break;
      case DACommandType.OPEN_EX_LINE:
        // AppComponent owns the ex line and intercepts this before the
        // drawing area sees it; the case is here for exhaustiveness.
        break;
      case DACommandType.EX_COMMAND:
        void this.runExCommand(command.text);
        break;
      case DACommandType.COPY_SELECTION:
        this.copySelection();
        break;
      case DACommandType.CUT_SELECTION:
        this.cutSelection();
        this.checkAndEmitEditState();
        break;
      case DACommandType.PASTE_CLIPBOARD:
        this.pasteClipboard();
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
        this.recenterCrosshairs();
        this.checkAndEmitEditState();
        break;
      case DACommandType.RECENTER_CROSSHAIRS:
        this.recenterCrosshairs();
        this.checkAndEmitEditState();
        break;
      case DACommandType.RECENTER_VIEW_ON_CROSSHAIRS:
        this.recenterViewOnCrosshairs();
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
      case DACommandType.QUICK_ADD:
        this.handleQuickAdd();
        break;
      case DACommandType.BEGIN_NEW_NODE_LABEL_EDIT:
        this.beginPendingNodeLabelEdit();
        break;
      case DACommandType.ENTER_ADD_MODE:
        this.maybeEnterGrowMode(command.holdKey, command.keys);
        break;
      case DACommandType.EDIT_TEXT_AT_CROSSHAIRS:
        this.editTextAtCrosshairs();
        break;
      case DACommandType.CYCLE_EDGE_DIRECTEDNESS:
        this.cycleEdgeDirectedness();
        break;
      case DACommandType.DELETE_LAST_CHAR:
        this.deleteLastChar();
        break;
      case DACommandType.DELETE_CHAR_AT_CURSOR:
        this.deleteCharAtCursor();
        break;
      case DACommandType.REPLACE_CHAR_AT_CURSOR:
        this.replaceCharAtCursor(command.value);
        break;
      case DACommandType.CHANGE_TEXT_AT_CURSOR:
        this.changeTextAtCursor(command.motion);
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
      case DACommandType.CURSOR_WORD_END:
        this.moveEditCursor(t => t.cursorWordEnd());
        break;
      case DACommandType.CURSOR_WORD_BACK:
        this.moveEditCursor(t => t.cursorWordBack());
        break;
      case DACommandType.SELECT_INNER_WORD:
        this.drawingLayer.getSelectedDANodes().forEach(n => n.selectInnerWord());
        this.getSelectedLabels().forEach(l => l.selectInnerWord());
        this.drawingLayer.batchDraw();
        this.refreshLabelEditGhost();
        break;
      case DACommandType.SET_TEXT_CURSOR_MODE:
        this.drawingLayer.getSelectedDANodes().forEach(n => n.setCursorMode(command.mode));
        this.getSelectedLabels().forEach(l => l.setCursorMode(command.mode));
        this.drawingLayer.batchDraw();
        this.refreshLabelEditGhost();
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
      case DACommandType.TOGGLE_NODE_SHAPE:
        this.toggleNodeShape();
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
      case DACommandType.SET_TASK_STATUS:
        this.setTaskStatus(command.status);
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
    // Commands may tween either the crosshairs or the drawing beneath them.
    // Refresh just after the standard movement tween, coalescing held-key
    // repeats so the highlight never trails several landings behind.
    if (this.crosshairsLayer.crosshairs.konvaGroup.visible()) {
      this.scheduleCrosshairHoverRefresh();
    } else {
      this.refreshCrosshairHoverHighlight();
    }

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
    this.draftStorage.saveSnapshot(snapshot, {view: this.currentViewport()});
  }

  /** The drawing-layer viewport: pan (stage px) + uniform scale. */
  private currentViewport(): {x: number; y: number; scale: number} {
    return {x: this.drawingLayer.x(), y: this.drawingLayer.y(), scale: this.drawingLayer.scaleX()};
  }

  /** Restore a saved viewport (pan + zoom) and re-center the crosshairs in
   *  the visible area. Returns false if the view was absent/invalid so the
   *  caller can fall back to fit-to-content. */
  private restoreViewport(view: {x: number; y: number; scale: number} | undefined): boolean {
    if (!view || !isFinite(view.x) || !isFinite(view.y) || !(view.scale > 0)) return false;
    this.drawingLayer.scale({x: view.scale, y: view.scale});
    this.drawingLayer.position({x: view.x, y: view.y});
    this.crosshairsLayer.crosshairs.x = this.viewCenterX();
    this.crosshairsLayer.crosshairs.y = this.viewCenterY();
    this.drawingLayer.batchDraw();
    this.emitZoomLevel();
    return true;
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
    const selected = this.drawingLayer.getSelectedDANodes();
    const hovered = this.getDANodesContainingCrosshairs();
    const targets = (selected.length > 0 ? selected
        : hovered.length > 0 ? [hovered.reduce((a, b) => a.zIndex() > b.zIndex() ? a : b)] : [])
      .filter(n => n.nodeShape !== 'junction' && n.nodeShape !== 'invisible');
    if (targets.length === 0) {
      this.emitStatus('⚠ Select or hover a node to set its status');
      return;
    }
    this.finishTweens();
    this.undoRedoService.pushSnapshot(this.drawingLayer.serializeGraph());
    for (const node of targets) {
      node.tags = applyExclusiveTag(node.tags, group, choice);
      node.setStatusBadge(choice);
    }
    this.drawingLayer.batchDraw();
    const suffix = targets.length > 1 ? ` (${targets.length} nodes)` : '';
    this.emitStatus(choice ? `Status: ${choice.label}${suffix}` : `Status cleared${suffix}`);
  }

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
      if (path && await this.loadVaultFile(path, { restoreView: this.startupDraftView, recenter: true })) {
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

  private async runExCommand(text: string): Promise<void> {
    const [name, ...rest] = text.trim().split(/\s+/);
    const arg = rest.join(' ').trim();

    switch (name) {
      case 'w':
      case 'write':
        await this.exWrite(arg);
        return;
      case 'e':
      case 'edit':
      case 'o':
      case 'open':
        await this.exEdit(arg);
        return;
      case 'ls':
      case 'files':
        await this.exList();
        return;
      case 'enew':
      case 'new':
        this.newGraph();
        this.emitStatus('New graph.');
        return;
      default:
        this.emitStatus(`Not an editor command: ${name}`);
    }
  }

  /** `:w` saves to the open vault file; `:w <name>` saves as that name and
   *  makes it the open file, so the next bare `:w` goes there. */
  private async exWrite(arg: string): Promise<void> {
    if (!this.vaultService.isConnected) {
      this.emitStatus('No vault connected — use the File menu → Vault: Connect first.');
      return;
    }
    let path = arg === '' ? this.vaultService.currentFilePath : null;
    if (arg !== '') {
      try {
        path = ensureKidrawFilename(arg);
      } catch (e) {
        this.emitStatus((e as Error).message);
        return;
      }
    }
    if (!path) {
      this.emitStatus('No file name — use :w <name>.');
      return;
    }
    this.cancelVaultAutoSave();
    if (await this.writeGraphToVault(path)) {
      this.emitStatus(`Wrote ${path}`);
    }
  }

  /** `:e <name-or-number>` opens another vault file — the file switching
   *  this command line was asked for. */
  private async exEdit(arg: string): Promise<void> {
    if (!this.vaultService.isConnected) {
      this.emitStatus('No vault connected — use the File menu → Vault: Connect first.');
      return;
    }
    if (arg === '') {
      this.emitStatus('Which file? Use :e <name> (:ls lists them).');
      return;
    }
    const files = await this.exVaultFiles();
    const path = /^\d+$/.test(arg)
      ? files[parseInt(arg, 10) - 1]
      : files.find(f => f === normalizeVaultPath(arg)) ?? normalizeVaultPath(arg);
    if (!path) {
      this.emitStatus(`No such file: ${arg}`);
      return;
    }
    this.cancelVaultAutoSave();
    if (await this.loadVaultFile(path, {recenter: true})) {
      this.emitStatus(`Opened ${path}`);
    } else {
      this.emitStatus(`Could not open ${path}`);
    }
  }

  private async exList(): Promise<void> {
    if (!this.vaultService.isConnected) {
      this.emitStatus('No vault connected — use the File menu → Vault: Connect first.');
      return;
    }
    const files = await this.exVaultFiles();
    if (files.length === 0) {
      this.emitStatus('No graph files in the vault yet.');
      return;
    }
    const open = this.vaultService.currentFilePath;
    this.emitStatus(files
      .map((f, i) => `${i + 1}. ${f}${f === open ? '  (open)' : ''}`)
      .join('   '));
  }

  private async exVaultFiles(): Promise<string[]> {
    const vault = this.vaultService.vault;
    if (!vault) return [];
    return (await vault.list()).filter(f => /\.kidraw\./i.test(f));
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
  private async loadVaultFile(path: string,
      opts: { recenter?: boolean; restoreView?: {x: number; y: number; scale: number} | null } = {}): Promise<boolean> {
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
    if (opts.restoreView && this.restoreViewport(opts.restoreView)) {
      // Draft viewport wins on a startup reopen — keeps the user's place.
    } else if (opts.recenter) {
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

    const crossLinks = applyLayout(layout, nodes, edges, layoutSpacingFor(nodes));
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
    // The link this node arrived on is the thing you are most likely to want
    // next — its direction, usually. Same landing as connecting two existing
    // nodes, just deferred until the label is written (da-509).
    const edge = this.newNodeEdgeFocus;
    this.newNodeEdgeFocus = null;
    if (edge && this.drawingLayer.getDAEdges().includes(edge)) {
      this.parkCrosshairsOnNewEdge(edge);
    }
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
    const scale = this.drawingLayer.scaleX();
    const pasted = this.drawingLayer.pasteSubgraph(
      this.clipboard,
      (this.crosshairsLayer.crosshairsX() - this.drawingLayer.x()) / scale,
      (this.crosshairsLayer.crosshairsY() - this.drawingLayer.y()) / scale,
    );
    this.updateEdgesForResizedNodes(pasted);
    this.drawingLayer.batchDraw();
    this.checkAndEmitEditState();
    const n = pasted.length;
    this.emitStatus(`Pasted ${n} node${n === 1 ? '' : 's'}.`);
  }

  private insertChar(key: string) {
    this.finishTweens()
    this.crosshairsLayer.hideCrosshairs();
    const centres = this.selectedNodeCentres();
    const resized = this.drawingLayer.appendTextToSelected(key);
    this.settleGrowingNodes(resized, centres);
    this.updateEdgesForResizedNodes(resized);
    // Also insert into selected labels; re-place from the anchor so a growing
    // box keeps its above/below clearance from the line.
    this.getSelectedLabels().forEach(l => {
      l.insertAtCursor(key);
      this.getEdgeForLabel(l)?.refreshGeometry();
    });
    this.drawingLayer.batchDraw();
    this.refreshLabelEditGhost();
  }

  /** Box centres of the nodes being edited, read before their text changes. */
  private selectedNodeCentres(): Map<DANode, {x: number; y: number}> {
    const centres = new Map<DANode, {x: number; y: number}>();
    for (const node of this.drawingLayer.getSelectedDANodes()) {
      centres.set(node, {
        x: node.group.x() + node.NODE_WIDTH / 2,
        y: node.group.y() + node.NODE_HEIGHT / 2,
      });
    }
    return centres;
  }

  /** Typing grows a box from its top-left corner, so a node walks down and
   *  right over whatever is there — usually the node it was just connected
   *  to (da-446). Two rules keep it out of the way: it grows about its own
   *  centre, and if it still lands on a neighbour it is the one that moves,
   *  not the neighbour. The rest of the graph holds still while you type. */
  private settleGrowingNodes(
    grown: DANode[],
    centres: Map<DANode, {x: number; y: number}>,
  ): void {
    if (grown.length === 0) return;
    for (const node of grown) {
      const centre = centres.get(node);
      if (!centre || node.pinned) continue;
      node.group.x(centre.x - node.NODE_WIDTH / 2);
      node.group.y(centre.y - node.NODE_HEIGHT / 2);
    }
    const all = this.drawingLayer.getDANodes();
    const growing = new Set(grown);
    const boxes = all.map(node => ({
      x: node.group.x(),
      y: node.group.y(),
      w: node.NODE_WIDTH,
      h: node.NODE_HEIGHT,
      movable: growing.has(node) && !node.pinned,
    }));
    for (const i of resolveBoxOverlaps(boxes, this.RESIZE_REFLOW_GAP)) {
      all[i].group.x(boxes[i].x);
      all[i].group.y(boxes[i].y);
    }
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
    this.refreshLabelEditGhost();
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
    this.refreshLabelEditGhost();
  }

  private replaceCharAtCursor(value: string) {
    this.finishTweens();
    const resized = this.drawingLayer.getSelectedDANodes()
      .filter(node => node.replaceAtCursor(value));
    this.updateEdgesForResizedNodes(resized);
    this.getSelectedLabels().forEach(label => {
      label.replaceAtCursor(value);
      this.getEdgeForLabel(label)?.refreshGeometry();
    });
    this.drawingLayer.batchDraw();
    this.refreshLabelEditGhost();
  }

  private changeTextAtCursor(motion: VimChangeMotion) {
    this.finishTweens();
    const resized = this.drawingLayer.getSelectedDANodes()
      .filter(node => node.changeAtCursor(motion));
    this.updateEdgesForResizedNodes(resized);
    this.getSelectedLabels().forEach(label => {
      label.changeAtCursor(motion);
      this.getEdgeForLabel(label)?.refreshGeometry();
    });
    this.drawingLayer.batchDraw();
    this.refreshLabelEditGhost();
  }

  /** Apply a caret motion to everything being edited (selected nodes and
   *  edge labels). Motions never change geometry — just the caret. */
  private moveEditCursor(motion: (target: {
    moveCursorH(d: number): void; moveCursorV(d: number): void;
    cursorToLineStart(): void; cursorToLineEnd(): void;
    cursorWordForward(): void; cursorWordEnd(): void; cursorWordBack(): void;
  }) => void) {
    this.drawingLayer.getSelectedDANodes().forEach(n => motion(n));
    this.getSelectedLabels().forEach(l => motion(l));
    this.drawingLayer.batchDraw();
    this.refreshLabelEditGhost();
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

  /** Selection if there is one, else the topmost node under the crosshairs.
   *  Empty means "no node addressed" — the shape commands read that as a
   *  change to the default for new nodes. */
  private nodeShapeTargets(): DANode[] {
    const selected = this.drawingLayer.getSelectedDANodes();
    if (selected.length > 0) return selected;
    const hovered = this.getDANodesContainingCrosshairs();
    return hovered.length > 0 ? [hovered.reduce((a, b) => a.zIndex() > b.zIndex() ? a : b)] : [];
  }

  /** Flip between the two shapes that carry a label, leaving diamond and the
   *  two markers alone. Temporary: the intent is that shape follows a tag or
   *  class rather than being set per node, and this goes when that lands.
   *  Anything that is not a circle becomes a circle, so a mixed selection
   *  converges instead of splitting further. */
  private toggleNodeShape() {
    const targets = this.nodeShapeTargets();
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
    const targets = this.nodeShapeTargets();

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
        const edge = this.addDefaultEdge(srcNode, destNode);
        this.unselectAll();
        this.parkCrosshairsOnNewEdge(edge);
      } else {
        return;
      }
    } else if (selectedDANodes.length == 1 && daNodesContainingCrosshairs.length == 1) {
      const destNode = daNodesContainingCrosshairs[0];
      const srcNode = selectedDANodes[0];
      const edge = this.addDefaultEdge(srcNode, destNode);
      this.unselectAll();
      this.parkCrosshairsOnNewEdge(edge);
      return;
    } else if (selectedDANodes.length == 1 && daNodesContainingCrosshairs.length == 0) {
      //todo: create new connected node
    } else {
      return;
    }
  }

  private zoomIn() {
    this.finishTweens()
    this.clearCrosshairHoverHighlight(false);

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
        if (this.nodeGridVisible) this.redrawNodeGrid();
        this.scheduleCrosshairHoverRefresh(20);
      }

    }).play());
  }

  private zoomOut() {
    this.finishTweens()
    this.clearCrosshairHoverHighlight(false);

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
        if (this.nodeGridVisible) this.redrawNodeGrid();
        this.scheduleCrosshairHoverRefresh(20);
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

  /** Screen-space keep-out band between the crosshairs and the drawing-area
   *  edge: cross it and movement pans the view instead of advancing the
   *  crosshairs. A flat band clips whatever you land on — navigate onto a
   *  wide card near the edge and half its text sits outside the viewport —
   *  so the band grows to half the landed-on node's rendered box plus
   *  padding. Capped at 40% of the viewport so it can never swallow it. */
  /** Left edge of the usable viewport, in stage coordinates. An unbound or
   *  partially bound inset degrades to the full stage. */
  private inset(edge: 'left' | 'right' | 'top' | 'bottom'): number {
    const raw = this.viewportInset?.[edge] ?? 0;
    // An overlay taller/wider than the window would otherwise leave a
    // zero-sized viewport and freeze navigation; give the graph the room
    // back and let it show through instead.
    const extent = edge === 'left' || edge === 'right'
      ? this.stage.width()
      : this.stage.height();
    return Math.min(raw, extent * 0.45);
  }
  private viewMinX(): number { return this.inset('left'); }
  private viewMaxX(): number { return this.stage.width() - this.inset('right'); }
  private viewMinY(): number { return this.inset('top'); }
  private viewMaxY(): number { return this.stage.height() - this.inset('bottom'); }
  private viewWidth(): number { return Math.max(this.viewMaxX() - this.viewMinX(), 1); }
  private viewHeight(): number { return Math.max(this.viewMaxY() - this.viewMinY(), 1); }
  private viewCenterX(): number { return this.viewMinX() + this.viewWidth() / 2; }
  private viewCenterY(): number { return this.viewMinY() + this.viewHeight() / 2; }

  private crosshairsEdgeMargin(target: {x: number; y: number}): {x: number; y: number} {
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
      x: Math.min(mx, this.viewWidth() * 0.4),
      y: Math.min(my, this.viewHeight() * 0.4),
    };
  }

  private moveCrosshairsBy(deltaX: number, deltaY: number, tier?: GridTier,
                           showMovementGrid = true) {
    this.finishTweens();
    this.clearCrosshairHoverHighlight(false);
    this.crosshairsLayer.showCrosshairs();
    this.crosshairsLayer.batchDraw();

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

      // Normal movement follows a visible goal line in fixed, configured
      // steps. Item-aware travel belongs to Move by Node and Move by Link.
      // Fine/coarse retain direct grid movement and start a fresh goal on the
      // next normal key.
      if (tier === 'normal' && axis) {
        const current = {x: currentDlX, y: currentDlY};
        if (!this.normalMovementGoal || this.normalMovementGoal.axis !== axis) {
          this.normalMovementGoal = startNormalMovementGoal(axis, current);
        }
        const sign = (axis === 'x' ? Math.sign(deltaX) : Math.sign(deltaY)) as -1 | 1;
        const stepDistance = this.movementDistanceForTier(
          'normal', minorSpacing, majorSpacing,
        );
        const step = nextNormalMovementStep(
          this.normalMovementGoal,
          sign,
          stepDistance,
        );
        this.normalMovementGoal = step.state;
        this.redrawNormalMovementGoalLine();
        this.updateCrosshairsProbeShape(
          axis, tier, minorSpacing, majorSpacing, stepDistance, scale,
        );
        targetX = step.target.x * scale + this.drawingLayer.x();
        targetY = step.target.y * scale + this.drawingLayer.y();
      } else {
        this.clearNormalMovementGoal();
        const spacing = this.movementDistanceForTier(tier, minorSpacing, majorSpacing);
        this.updateCrosshairsProbeShape(
          axis, tier, minorSpacing, majorSpacing, spacing, scale,
        );
        const snappedDlX = deltaX !== 0
          ? Math.round(currentDlX / spacing) * spacing + spacing * Math.sign(deltaX)
          : currentDlX;
        const snappedDlY = deltaY !== 0
          ? Math.round(currentDlY / spacing) * spacing + spacing * Math.sign(deltaY)
          : currentDlY;
        targetX = snappedDlX * scale + this.drawingLayer.x();
        targetY = snappedDlY * scale + this.drawingLayer.y();
      }
    } else {
      // Raw pixel movement (focusNode, moveByNode, zoom, etc.)
      this.clearNormalMovementGoal();
      targetX = currentX + deltaX;
      targetY = currentY + deltaY;
    }

    const margin = this.crosshairsEdgeMargin({x: targetX, y: targetY});
    const minX = this.viewMinX() + margin.x;
    const maxX = this.viewMaxX() - margin.x;
    const minY = this.viewMinY() + margin.y;
    const maxY = this.viewMaxY() - margin.y;

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
        onFinish: () => {
          // Konva can finish a short tween one frame shy of its requested
          // endpoint. Snapping must be exact or the following goal-line step
          // slowly accumulates screen-pixel drift.
          this.crosshairsLayer.crosshairs.konvaGroup.position({
            x: clampedX,
            y: clampedY,
          });
          this.checkResizeHandleProximity();
          if (this.nodeGridVisible) this.redrawNodeGrid();
          this.scheduleCrosshairHoverRefresh(20);
        },
      }).play());
    }

    if (overflowX !== 0 || overflowY !== 0) {
      const layerTarget = {
        x: this.drawingLayer.x() - overflowX,
        y: this.drawingLayer.y() - overflowY,
      };
      this.tweens.push(new Konva.Tween({
        node: this.drawingLayer,
        duration: this.CROSSHAIR_MOVEMENT_DURATION,
        x: layerTarget.x,
        y: layerTarget.y,
        easing: Konva.Easings.Linear,
        onFinish: () => {
          this.drawingLayer.position(layerTarget);
          if (this.nodeGridVisible) this.redrawNodeGrid();
          this.scheduleCrosshairHoverRefresh(20);
        },
      }).play());
    }

    // Show grid and indicators on movement, then fade after 5s
    if (showMovementGrid) this.showMovementIndicators();
  }

  /** Draw the current goal in drawing-layer space, just above the ordinary
   *  grid and below graph content. It therefore stays registered with the
   *  diagram during any edge-of-viewport pan. */
  private redrawNormalMovementGoalLine(): void {
    this.normalMovementGoalLine?.destroy();
    this.normalMovementGoalLine = null;
    const goal = this.normalMovementGoal;
    if (!goal) return;

    const scale = this.drawingLayer.scaleX();
    const minX = -this.drawingLayer.x() / scale - this.stage.width() / scale;
    const maxX = (this.stage.width() - this.drawingLayer.x()) / scale +
      this.stage.width() / scale;
    const minY = -this.drawingLayer.y() / scale - this.stage.height() / scale;
    const maxY = (this.stage.height() - this.drawingLayer.y()) / scale +
      this.stage.height() / scale;
    const line = new Konva.Line({
      name: 'normal-movement-goal-line',
      points: goal.axis === 'x'
        ? [minX, goal.line, maxX, goal.line]
        : [goal.line, minY, goal.line, maxY],
      stroke: this.visualConfigService
        .getEffectivePalette(this.themeService.theme).crosshairsStroke,
      strokeWidth: 1.5 / scale,
      dash: [10 / scale, 7 / scale],
      opacity: 0.58,
      listening: false,
    });
    this.drawingLayer.add(line);
    line.zIndex(1);
    this.normalMovementGoalLine = line;
    this.drawingLayer.batchDraw();
  }

  private clearNormalMovementGoal(draw = true): void {
    this.normalMovementGoal = null;
    if (this.normalMovementGoalLine) {
      this.normalMovementGoalLine.destroy();
      this.normalMovementGoalLine = null;
      if (draw) this.drawingLayer.batchDraw();
    }
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
    const scale = Math.max(this.drawingLayer.scaleX(), 0.001);
    const palette = this.visualConfigService
      .getEffectivePalette(this.themeService.theme);
    const color = palette.crosshairsStroke;
    const pad = 6 / scale;
    const common = {
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
    };

    let highlight: Konva.Shape | null = null;
    let targetKind = '';
    let targetId = '';
    let targetNode: DANode | null = null;
    let ghostReasons: string[] = [];

    const label = this.getLabelUnderCrosshairs();
    if (label) {
      targetKind = 'label';
      targetId = label.id;
      highlight = new Konva.Rect({
        ...common,
        x: label.x - label.width / 2 - pad,
        y: label.y - label.height / 2 - pad,
        width: label.width + pad * 2,
        height: label.height + pad * 2,
        cornerRadius: 5 / scale,
      });
    } else {
      const waypoint = this.getWaypointUnderCrosshairs();
      if (waypoint) {
        targetKind = 'waypoint';
        targetId = waypoint.id;
        highlight = new Konva.Circle({
          ...common,
          x: waypoint.x,
          y: waypoint.y,
          radius: waypoint.RADIUS + pad,
        });
      } else {
        const nodes = this.getDANodesContainingCrosshairs();
        if (nodes.length > 0) {
          const node = nodes.reduce((a, b) =>
            a.zIndex() > b.zIndex() ? a : b);
          targetNode = node;
          targetKind = 'node';
          targetId = node.id;
          // A node that earns a landing ghost gets its dashed trace on the
          // ghost instead. Ringing the real node as well put two dashed
          // outlines of the same node on screen at once (da-434).
          ghostReasons = this.navigationGhostReasons(node);
          highlight = ghostReasons.length > 0 ? null
            // A circle node is an ellipse once its label stretches it, and a
            // rounded rectangle around one reads as a different shape than
            // the thing it is tracing (da-442).
            : node.nodeShape === 'circle' ? new Konva.Ellipse({
              ...common,
              x: node.group.x() + node.NODE_WIDTH / 2,
              y: node.group.y() + node.NODE_HEIGHT / 2,
              radiusX: node.NODE_WIDTH / 2 + pad,
              radiusY: node.NODE_HEIGHT / 2 + pad,
            })
            : new Konva.Rect({
              ...common,
              x: node.group.x() - pad,
              y: node.group.y() - pad,
              width: node.NODE_WIDTH + pad * 2,
              height: node.NODE_HEIGHT + pad * 2,
              cornerRadius: 7 / scale,
            });
        } else {
          const edges = this.getDAEdgesContainingCrosshairs();
          if (edges.length > 0) {
            const edge = edges.reduce((a, b) =>
              a.zIndex() > b.zIndex() ? a : b);
            targetKind = 'edge';
            targetId = edge.id;
            highlight = new Konva.Line({
              ...common,
              // Trace the exact polyline Konva paints, including the
              // render-only endpoint stubs used by smooth edges. Applying
              // tension to the raw control points produced a similar, but
              // visibly different, dotted curve.
              points: edge.getRenderedPathPoints().flatMap(p => [p.x, p.y]),
              tension: 0,
              strokeWidth: 5,
              opacity: 0.72,
            });
          }
        }
      }
    }

    if (highlight) {
      highlight.setAttr('targetKind', targetKind);
      highlight.setAttr('targetId', targetId);
      this.drawingLayer.add(highlight);
      highlight.moveToTop();
      this.crosshairHoverHighlight = highlight;
    }
    if (targetNode) this.refreshNavigationLandingGhost(targetNode, ghostReasons);
    this.drawingLayer.batchDraw();
  }

  private clearCrosshairHoverHighlight(draw = true): void {
    let changed = false;
    if (this.crosshairHoverHighlight) {
      this.crosshairHoverHighlight.destroy();
      this.crosshairHoverHighlight = null;
      changed = true;
    }
    if (this.navigationLandingGhost) {
      this.clearNavigationLandingGhost(false);
      changed = true;
    }
    if (draw && changed) {
      this.drawingLayer.batchDraw();
      this.crosshairsLayer?.batchDraw();
    }
  }

  private nodeStageRect(node: DANode): {x: number; y: number; width: number; height: number} {
    const scaleX = this.drawingLayer.scaleX();
    const scaleY = this.drawingLayer.scaleY();
    return {
      x: this.drawingLayer.x() + node.group.x() * scaleX,
      y: this.drawingLayer.y() + node.group.y() * scaleY,
      width: node.NODE_WIDTH * node.group.scaleX() * scaleX,
      height: node.NODE_HEIGHT * node.group.scaleY() * scaleY,
    };
  }

  /** Why the real navigation target needs a readable screen-space copy. */
  private navigationGhostReasons(node: DANode): string[] {
    if (!this.stage || node.nodeShape === 'junction' || node.nodeShape === 'invisible') return [];
    const rect = this.nodeStageRect(node);
    const pad = 8;
    const reasons: string[] = [];
    if (rect.x < this.viewMinX() + pad || rect.y < this.viewMinY() + pad ||
        rect.x + rect.width > this.viewMaxX() - pad ||
        rect.y + rect.height > this.viewMaxY() - pad) {
      reasons.push('offscreen');
    }
    if (node.FONT_SIZE * node.group.scaleY() * this.drawingLayer.scaleY() < 12) {
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
      this.viewMinX(), this.viewMaxX());
    const y = clampedStart(center.y - node.NODE_HEIGHT / 2, node.NODE_HEIGHT,
      this.viewMinY(), this.viewMaxY());
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
    this.crosshairsLayer.add(group);
    group.moveToTop();
    this.navigationLandingGhost = group;
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

  private clearNavigationLandingGhost(draw = true): void {
    if (!this.navigationLandingGhost) return;
    this.navigationLandingGhost.destroy();
    this.navigationLandingGhost = null;
    if (draw) this.crosshairsLayer?.batchDraw();
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

    // Convert crosshairs position to drawing-layer coordinates
    const scale = this.drawingLayer.scaleX();
    const crosshairsX = (this.crosshairsLayer.crosshairs.x - this.drawingLayer.x()) / scale;
    const crosshairsY = (this.crosshairsLayer.crosshairs.y - this.drawingLayer.y()) / scale;

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
    this.tweens.push(new Konva.Tween({
      node: this.drawingLayer,
      duration: this.CROSSHAIR_MOVEMENT_DURATION,
      x: this.drawingLayer.x() + deltaX,
      y: this.drawingLayer.y() + deltaY,
      easing: Konva.Easings.Linear,
      onFinish: () => {
        if (this.nodeGridVisible) this.redrawNodeGrid();
        this.scheduleCrosshairHoverRefresh(20);
      },
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

  private nearestNodeToCrosshairs(): DANode | null {
    const nodes = this.drawingLayer.getDANodes();
    if (nodes.length === 0) return null;
    const x = this.crosshairsLayer.crosshairsX();
    const y = this.crosshairsLayer.crosshairsY();
    return nodes.reduce((best, node) => {
      const b = this.getNodeCenterInStageCoordinates(best);
      const n = this.getNodeCenterInStageCoordinates(node);
      return Math.hypot(n.x - x, n.y - y) < Math.hypot(b.x - x, b.y - y)
        ? node
        : best;
    });
  }

  /** Begin a held Move by Link session at the node under the crosshairs. */
  private enterLinkNav(): void {
    this.finishTweens();
    const underCrosshairs = this.getDANodesContainingCrosshairs();
    const source = underCrosshairs.length > 0
      ? underCrosshairs.reduce((a, b) => a.zIndex() > b.zIndex() ? a : b)
      : this.nearestNodeToCrosshairs();
    this.linkNavSource = source;
    this.linkNavDirectionalFocus = false;
    this.setGraphNavEdge(null);
    if (!source) {
      this.emitStatus('Move the crosshairs onto a node to navigate.');
      return;
    }
    const snappedToNearest = underCrosshairs.length === 0;
    if (snappedToNearest) {
      this.jumpCrosshairsToStopCenter(this.getNodeCenterInStageCoordinates(source));
    }
    const continuingJourney = source === this.validGraphNavLastNode();
    this.graphNavLastNode = source;
    const entry = this.focusLinkNavEntry(
      source,
      continuingJourney ? this.graphNavMomentum : null,
    );
    if (!entry) {
      this.redrawLinkNavQuadrantLines(source);
      if (snappedToNearest) this.scheduleLinkNavQuadrantRefresh(source);
      this.emitStatus('No edges here.');
      return;
    }
    this.redrawLinkNavQuadrantLines(source);
    if (snappedToNearest) this.scheduleLinkNavQuadrantRefresh(source);
    const label = (entry.other.label?.text() ?? '').trim() || '(unlabeled)';
    this.emitStatus(`Link: ${label}`);
  }

  /** Select the entry edge for a source node and make its visible highlight
   *  the active quadrant cursor. Momentum prefers continuing onward after a
   *  traversal; a cold start uses clockwise order from North. */
  private focusLinkNavEntry(
    source: DANode,
    momentum: {x: number; y: number} | null,
  ): NavCandidate | null {
    const navCandidates = this.navCandidatesFor(source);
    if (navCandidates.length === 0) {
      this.linkNavDirectionalFocus = false;
      this.setGraphNavEdge(null);
      return null;
    }
    const geometry = this.linkNavGeometryCandidates(source, navCandidates);
    const entryIndex = pickEntryCandidate(
      geometry.map(candidate => candidate.direction),
      momentum,
    );
    const entry = entryIndex >= 0 ? navCandidates[entryIndex] : navCandidates[0];
    // The visible highlight is the active scan position. Perpendicular keys
    // can move away from it without an extra along-quadrant confirmation.
    this.linkNavDirectionalFocus = true;
    this.setGraphNavEdge(entry.edge);
    return entry;
  }

  /** Select/scan an NSEW link. A unique link in the requested quadrant walks
   *  immediately; ambiguous quadrants focus before an along-link press. */
  private moveLinkNav(direction: LinkCardinalDirection): void {
    const source = this.linkNavSource;
    if (!source) return;
    const navCandidates = this.navCandidatesFor(source);
    const candidates = this.linkNavGeometryCandidates(source, navCandidates);
    const move = moveLinkQuadrant(
      candidates,
      this.linkNavDirectionalFocus ? this.graphNavEdge?.id ?? null : null,
      direction,
      true,
    );
    if (!move.id) {
      this.emitStatus(`No link in the ${direction} quadrant.`);
      return;
    }
    const candidate = navCandidates.find(c => c.edge.id === move.id);
    if (!candidate) return;
    if (!move.traverse) {
      this.linkNavDirectionalFocus = true;
      this.setGraphNavEdge(candidate.edge);
      this.redrawLinkNavQuadrantLines(source);
      const label = (candidate.other.label?.text() ?? '').trim() || '(unlabeled)';
      this.emitStatus(`${direction}: ${label}`);
      return;
    }

    this.traverseLinkNavCandidate(source, candidate);
  }

  private linkNavGeometryCandidates(
    source: DANode,
    navCandidates: readonly NavCandidate[],
  ): {id: string; direction: {x: number; y: number} | null}[] {
    return navCandidates.map(candidate => {
      const path = candidate.edge.getPathPoints();
      const flow = endpointFlowDirection(path, candidate.direction === 'out' ? 'src' : 'dest');
      const away = flow
        ? (candidate.direction === 'out' ? flow : {x: -flow.x, y: -flow.y})
        : (() => {
            const s = this.getNodeCenterInLayerCoordinates(source);
            const d = this.getNodeCenterInLayerCoordinates(candidate.other);
            const length = Math.hypot(d.x - s.x, d.y - s.y);
            return length > 1e-9
              ? {x: (d.x - s.x) / length, y: (d.y - s.y) / length}
              : null;
          })();
      return {id: candidate.edge.id, direction: away};
    });
  }

  private traverseLinkNavCandidate(source: DANode, candidate: NavCandidate): void {
    const dest = candidate.other;
    this.recordNavVisit(source.id, dest.id);
    this.graphNavLastNode = dest;
    this.navDirection = candidate.direction;
    const sC = this.getNodeCenterInLayerCoordinates(source);
    const dC = this.getNodeCenterInLayerCoordinates(dest);
    const length = Math.hypot(dC.x - sC.x, dC.y - sC.y);
    if (length > 1e-6) {
      this.graphNavMomentum = {x: (dC.x - sC.x) / length, y: (dC.y - sC.y) / length};
    }
    this.linkNavSource = dest;
    this.focusLinkNavEntry(dest, this.graphNavMomentum);
    this.jumpCrosshairsToStopCenter(this.getNodeCenterInStageCoordinates(dest));
    this.redrawLinkNavQuadrantLines(dest);
    this.scheduleLinkNavQuadrantRefresh(dest);
    const label = (dest.label?.text() ?? '').trim() || '(unlabeled)';
    this.emitStatus(`${candidate.direction === 'out' ? '→' : '←'} ${label}`);
  }

  /** Releasing the held root key only exits. Traversal belongs to an explicit
   * directional press, never to the mechanically unrelated key-up event. */
  private releaseLinkNav(): void {
    this.linkNavSource = null;
    this.linkNavDirectionalFocus = false;
    this.setGraphNavEdge(null);
    this.clearLinkNavQuadrantLines();
  }

  /** Dashed 45° rays expose the exact N/E/S/W quadrant boundaries used by
   *  moveLinkQuadrant. They live in stage coordinates so their dash/stroke
   *  stays screen-stable at every drawing zoom. */
  private redrawLinkNavQuadrantLines(source: DANode): void {
    this.linkNavQuadrantLines?.destroy();
    const group = new Konva.Group({name: 'move-by-link-quadrants', listening: false});
    const origin = this.getNodeCenterInStageCoordinates(source);
    const palette = this.visualConfigService.getEffectivePalette(this.themeService.theme);
    const focused = this.graphNavEdge;
    const navCandidates = this.navCandidatesFor(source);
    const geometry = this.linkNavGeometryCandidates(source, navCandidates);
    const focusedDirection = focused
      ? geometry.find(candidate => candidate.id === focused.id)?.direction ?? null
      : null;
    const activeQuadrant = linkQuadrant(focusedDirection);
    if (activeQuadrant) {
      const reach = this.stage.width() + this.stage.height();
      const points = {
        north: [origin.x, origin.y, origin.x - reach, origin.y - reach,
          origin.x + reach, origin.y - reach],
        south: [origin.x, origin.y, origin.x - reach, origin.y + reach,
          origin.x + reach, origin.y + reach],
        east: [origin.x, origin.y, origin.x + reach, origin.y - reach,
          origin.x + reach, origin.y + reach],
        west: [origin.x, origin.y, origin.x - reach, origin.y - reach,
          origin.x - reach, origin.y + reach],
      }[activeQuadrant];
      group.add(new Konva.Line({
        name: 'move-by-link-active-quadrant',
        points,
        closed: true,
        fill: palette.crosshairsStroke,
        opacity: 0.1,
        listening: false,
      }));
    }
    for (const angle of [
      Math.PI / 4,
      Math.PI * 3 / 4,
      Math.PI * 5 / 4,
      Math.PI * 7 / 4,
    ]) {
      const end = this.navigationRayEnd(origin, angle, this.stage.width(), this.stage.height());
      if (!end) continue;
      group.add(new Konva.Line({
        name: 'move-by-link-diagonal',
        points: [origin.x, origin.y, end.x, end.y],
        stroke: palette.crosshairsStroke,
        strokeWidth: 1.5,
        strokeScaleEnabled: false,
        opacity: 0.46,
        dash: [7, 5],
        listening: false,
      }));
    }
    this.crosshairsLayer.add(group);
    group.moveToBottom();
    this.linkNavQuadrantLines = group;
    this.crosshairsLayer.batchDraw();
  }

  private scheduleLinkNavQuadrantRefresh(source: DANode): void {
    if (this.linkNavQuadrantRefreshTimer !== null) {
      window.clearTimeout(this.linkNavQuadrantRefreshTimer);
    }
    this.linkNavQuadrantRefreshTimer = window.setTimeout(() => {
      this.linkNavQuadrantRefreshTimer = null;
      if (this.linkNavSource === source) this.redrawLinkNavQuadrantLines(source);
    }, Math.ceil(this.CROSSHAIR_MOVEMENT_DURATION * 1000) + 30);
  }

  private clearLinkNavQuadrantLines(): void {
    if (this.linkNavQuadrantRefreshTimer !== null) {
      window.clearTimeout(this.linkNavQuadrantRefreshTimer);
      this.linkNavQuadrantRefreshTimer = null;
    }
    this.linkNavQuadrantLines?.destroy();
    this.linkNavQuadrantLines = null;
    this.crosshairsLayer?.batchDraw();
  }

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
    this.navDirectionalFocus = false;
    // The popup opens with the top row selected; its highlight emit is
    // deferred, so seed the candidate now for the initial popup placement.
    this.navHighlightCand = ordered[0];
    this.navPopupSelectedId = ordered[0].edge.id;
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
    const candidates = [...this.navCandidates.values()].map(c => {
      const path = c.edge.getPathPoints();
      const flow = endpointFlowDirection(path, c.direction === 'out' ? 'src' : 'dest');
      const away = flow
        ? (c.direction === 'out' ? flow : {x: -flow.x, y: -flow.y})
        : (() => {
            const s = this.getNodeCenterInLayerCoordinates(source);
            const d = this.getNodeCenterInLayerCoordinates(c.other);
            const length = Math.hypot(d.x - s.x, d.y - s.y);
            return length > 1e-9 ? {x: (d.x - s.x) / length, y: (d.y - s.y) / length} : null;
          })();
      return {id: c.edge.id, direction: away};
    });
    const move = moveLinkQuadrant(
      candidates,
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
      x: this.viewCenterX() - dC.x * scale,
      y: this.viewCenterY() - dC.y * scale,
    });
    this.crosshairsLayer.crosshairs.x = this.viewCenterX();
    this.crosshairsLayer.crosshairs.y = this.viewCenterY();
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
    this.navPopupLeft = Math.max(this.viewMinX() + 8,
      Math.min(left, this.viewMaxX() - POPUP_W - 8));
    this.navPopupTop = Math.max(this.viewMinY() + 8,
      Math.min(rect.y, this.viewMaxY() - POPUP_H - 8));
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
  /** Vim-`zz` for the canvas: pan the view so the graph point under the
   *  crosshairs lands at screen center. The crosshairs ride along (still
   *  over the same graph point) and the zoom level is untouched. */
  private recenterViewOnCrosshairs(): void {
    this.finishTweens();
    const scale = this.drawingLayer.scaleX();
    this.centerViewOnLayerPoint({
      x: (this.crosshairsLayer.crosshairsX() - this.drawingLayer.x()) / scale,
      y: (this.crosshairsLayer.crosshairsY() - this.drawingLayer.y()) / scale,
    });
  }

  private centerViewOnLayerPoint(
    p: {x: number; y: number},
    targetScale = this.drawingLayer.scaleX(),
    onFinish?: () => void,
  ): void {
    const centerX = this.viewCenterX();
    const centerY = this.viewCenterY();
    this.tweens.push(new Konva.Tween({
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
  private navStopCenter(id: string, kind: 'node'|'label'|'waypoint'): {x: number; y: number} | null {
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

  /** All nodes inside the direction's 45° cone from `fromPoint`, nearest
   *  first (grow-mode target hop; node-only). */
  private nodesInDirection(direction: 'left' | 'right' | 'up' | 'down',
                           fromPoint?: {x: number; y: number}): DANode[] {
    const origin = fromPoint ?? {x: this.crosshairsLayer.crosshairsX(), y: this.crosshairsLayer.crosshairsY()};
    const MIN_OFFSET = 5;
    const isHorizontal = direction === 'left' || direction === 'right';
    const scored: {node: DANode; score: number}[] = [];
    for (const node of this.drawingLayer.getDANodes()) {
      const c = this.getNodeCenterInStageCoordinates(node);
      const dx = c.x - origin.x, dy = c.y - origin.y;
      const along = direction === 'right' ? dx : direction === 'left' ? -dx : direction === 'down' ? dy : -dy;
      const offAxis = Math.abs(isHorizontal ? dy : dx);
      if (along <= MIN_OFFSET || along < offAxis) continue;
      scored.push({node, score: along + offAxis * 2});
    }
    scored.sort((a, b) => a.score - b.score);
    return scored.map(s => s.node);
  }

  private findNodeInDirection(direction: 'left' | 'right' | 'up' | 'down',
                              fromPoint?: {x: number; y: number}): DANode | null {
    return this.nodesInDirection(direction, fromPoint)[0] ?? null;
  }

  // ── Grid navigation (move-by-node): notes/design-grid-navigation.md ──
  // Purely spatial (no edges). Visible stops form a fixed spreadsheet-like
  // grid; navigation and the overlay share the same band model. A press steps
  // one row/column and snaps to the goal position on the perpendicular axis.
  // Goals live in drawing-layer coordinates so viewport pans cannot stale them.
  private navGoalX: number | null = null;
  private navGoalY: number | null = null;
  /** Explicit so the known-good Cartesian grid remains available beside
   *  navigation experiments. */
  private graphItemNavigationStrategy: GraphItemNavigationStrategy = 'adaptive-quadrant-rings';
  /** Fixed for one run of the same hjkl direction, unless the viewport changes. */
  private quadrantOriginLayer: {x: number; y: number} | null = null;
  private quadrantOriginViewport: NavigationViewport | null = null;
  /** The direction of the current run. A different hjkl key re-origins at
   *  the current stop before that move is evaluated. */
  private quadrantLastDirection: CardinalDirection | null = null;
  /** Screen-space bearing of the goal ray from the origin. */
  private quadrantGoalAngle = 0;
  private quadrantGoalAdjusted = false;
  /** The goal ray is normally absent. n/p reveal it briefly, then a
   *  dedicated tween fades it without changing navigation state. */
  private quadrantGoalRayVisible = false;
  private quadrantGoalRayFadeDelay: number | null = null;
  private quadrantGoalRayFadeTween: Konva.Tween | null = null;
  private quadrantNavLast: {id: string; kind: 'node'|'label'|'waypoint'} | null = null;
  /** Which remembered perpendicular coordinate the next same-axis step will
   *  try to return to: x for vertical travel, y for horizontal travel. */
  private navGoalAxis: 'x' | 'y' | null = null;
  /** The stop the last grid step landed on. Reset detection recomputes its
   *  center (pan-safe): if the crosshairs are no longer on it, a fresh
   *  navigation started and the goal position is reset. */
  private navGridLast: {id: string; kind: 'node'|'label'|'waypoint'} | null = null;

  /** Maximum stage-pixel span of one row/column band. Smaller when more stops
   *  are visible (finer grid); tunable by feel. */
  private navGridTolerance(visibleCount: number): number {
    return Math.max(12, Math.min(60, 180 / Math.sqrt(Math.max(1, visibleCount))));
  }

  private usesQuadrantOrigin(strategy = this.graphItemNavigationStrategy): boolean {
    return strategy === 'adaptive-quadrant-grid' ||
      strategy === 'adaptive-quadrant-rings';
  }

  private setGraphItemNavigationStrategy(strategy: GraphItemNavigationStrategy): void {
    this.graphItemNavigationStrategy = strategy;
    this.navGoalX = null;
    this.navGoalY = null;
    this.navGoalAxis = null;
    this.navGridLast = null;
    this.resetQuadrantNavigation();
    if (this.usesQuadrantOrigin(strategy) && this.nodeGridVisible) {
      this.captureQuadrantOrigin();
    }
    if (this.nodeGridVisible) this.redrawNodeGrid();
    this.emitStatus(({
      'adaptive-band-grid': 'Graph-item navigation: Adaptive band grid',
      'adaptive-quadrant-grid': 'Graph-item navigation: Adaptive quadrant grid',
      'adaptive-quadrant-rings': 'Graph-item navigation: Adaptive quadrant rings',
    } as const)[strategy]);
  }

  private snapToNodeInDirection(direction: 'left' | 'right' | 'up' | 'down', targets: NavTargetKind = 'labels') {
    switch (this.graphItemNavigationStrategy) {
      case 'adaptive-band-grid':
        this.snapWithAdaptiveBandGrid(direction, targets);
        return;
      case 'adaptive-quadrant-grid':
        this.snapWithQuadrantGrid(direction, targets);
        return;
      case 'adaptive-quadrant-rings':
        this.snapWithQuadrantRings(direction, targets);
        return;
    }
  }

  private resetQuadrantNavigation(): void {
    this.quadrantOriginLayer = null;
    this.quadrantOriginViewport = null;
    this.quadrantLastDirection = null;
    this.quadrantGoalAngle = 0;
    this.quadrantGoalAdjusted = false;
    this.hideQuadrantGoalRay();
    this.quadrantNavLast = null;
  }

  private cancelQuadrantGoalRayFade(): void {
    if (this.quadrantGoalRayFadeDelay !== null) {
      window.clearTimeout(this.quadrantGoalRayFadeDelay);
      this.quadrantGoalRayFadeDelay = null;
    }
    this.quadrantGoalRayFadeTween?.destroy();
    this.quadrantGoalRayFadeTween = null;
  }

  private hideQuadrantGoalRay(): void {
    this.cancelQuadrantGoalRayFade();
    this.quadrantGoalRayVisible = false;
  }

  private scheduleQuadrantGoalRayFade(): void {
    this.cancelQuadrantGoalRayFade();
    if (!this.quadrantGoalRayVisible) return;
    const ray = this.nodeGridGroup
      ?.findOne<Konva.Line>('.quadrant-grid-goal-ray');
    if (!ray) return;

    this.quadrantGoalRayFadeDelay = window.setTimeout(() => {
      this.quadrantGoalRayFadeDelay = null;
      const tween = new Konva.Tween({
        node: ray,
        duration: 0.8,
        opacity: 0,
        onFinish: () => {
          if (this.quadrantGoalRayFadeTween !== tween) return;
          this.quadrantGoalRayFadeTween = null;
          this.quadrantGoalRayVisible = false;
          ray.destroy();
          this.crosshairsLayer.batchDraw();
        },
      });
      this.quadrantGoalRayFadeTween = tween;
      tween.play();
    }, 650);
  }

  private currentNavigationViewport(): NavigationViewport {
    return {
      x: this.drawingLayer.x(),
      y: this.drawingLayer.y(),
      scale: this.drawingLayer.scaleX(),
      width: this.stage.width(),
      height: this.stage.height(),
    };
  }

  private navigationViewportMatches(snapshot: NavigationViewport | null): boolean {
    if (!snapshot) return false;
    const current = this.currentNavigationViewport();
    return Math.abs(current.x - snapshot.x) < 0.01 &&
      Math.abs(current.y - snapshot.y) < 0.01 &&
      Math.abs(current.scale - snapshot.scale) < 0.0001 &&
      current.width === snapshot.width &&
      current.height === snapshot.height;
  }

  private captureQuadrantOrigin(): void {
    const scale = this.drawingLayer.scaleX();
    this.quadrantOriginLayer = {
      x: (this.crosshairsLayer.crosshairs.x - this.drawingLayer.x()) / scale,
      y: (this.crosshairsLayer.crosshairs.y - this.drawingLayer.y()) / scale,
    };
    this.quadrantOriginViewport = this.currentNavigationViewport();
    this.quadrantLastDirection = null;
    this.quadrantGoalAngle = 0;
    this.quadrantGoalAdjusted = false;
    this.hideQuadrantGoalRay();
    this.quadrantNavLast = null;
  }

  private ensureQuadrantOrigin(): void {
    if (!this.quadrantOriginLayer ||
        !this.navigationViewportMatches(this.quadrantOriginViewport)) {
      this.captureQuadrantOrigin();
    }
  }

  private quadrantOriginInStage(): {x: number; y: number} | null {
    if (!this.quadrantOriginLayer) return null;
    const scale = this.drawingLayer.scaleX();
    return {
      x: this.drawingLayer.x() + this.quadrantOriginLayer.x * scale,
      y: this.drawingLayer.y() + this.quadrantOriginLayer.y * scale,
    };
  }

  private adjustQuadrantGoalAngle(
    direction: GoalVerticalDirection,
    targets: NavTargetKind,
  ): void {
    if (this.graphItemNavigationStrategy !== 'adaptive-quadrant-grid') {
      this.emitStatus('Select Adaptive quadrant grid with g → o first.');
      return;
    }
    this.finishTweens();
    this.ensureQuadrantOrigin();
    const visibleCount = this.navStops(targets).filter(stop =>
      stop.cx >= 0 && stop.cx <= this.stage.width() &&
      stop.cy >= 0 && stop.cy <= this.stage.height()).length;
    const step = adaptiveGoalAngleStep(visibleCount);
    const adjusted = adjustAngleTowardScreenVertical(
      this.quadrantGoalAngle,
      direction,
      step,
    );
    const changed = adjusted !== this.quadrantGoalAngle;
    this.quadrantGoalAngle = adjusted;
    this.quadrantGoalAdjusted = true;
    this.quadrantGoalRayVisible = true;
    this.nodeGridTargets = targets;
    if (this.nodeGridVisible) this.redrawNodeGrid();
    const degrees = Math.round(step * 180 / Math.PI);
    this.emitStatus(changed
      ? `Goal ray: ${direction} (${degrees}° step)`
      : `Goal ray is already due ${direction}`);
  }

  private snapWithQuadrantGrid(direction: CardinalDirection, targets: NavTargetKind): void {
    this.finishTweens();
    this.ensureQuadrantOrigin();
    if (this.quadrantLastDirection !== null &&
        this.quadrantLastDirection !== direction) {
      this.captureQuadrantOrigin();
    }
    this.quadrantLastDirection = direction;
    const origin = this.quadrantOriginInStage();
    if (!origin) return;
    const cx = this.crosshairsLayer.crosshairs.x;
    const cy = this.crosshairsLayer.crosshairs.y;
    const vertical = direction === 'up' || direction === 'down';
    const positive = direction === 'right' || direction === 'down';
    const allStops = this.navStops(targets);
    const inView = (stop: NavigationGridStop) =>
      stop.cx >= 0 && stop.cx <= this.stage.width() &&
      stop.cy >= 0 && stop.cy <= this.stage.height();
    const visible = allStops.filter(inView);
    if (visible.length === 0) return;
    const tolerance = this.navGridTolerance(visible.length);
    const grid = buildNavigationGrid(
      visible,
      this.stage.width(),
      this.stage.height(),
      tolerance,
    );
    const bands = vertical ? grid.rows : grid.columns;
    const primary = (stop: NavigationGridStop) => vertical ? stop.cy : stop.cx;
    const here = vertical ? cy : cx;
    const currentStop = visible.find(stop =>
      Math.abs(stop.cx - cx) < 4 && Math.abs(stop.cy - cy) < 4);
    const atOrigin = Math.max(Math.abs(cx - origin.x), Math.abs(cy - origin.y)) < 4;
    const currentQuadrant = navigationQuadrant(cx - origin.x, cy - origin.y)
      ?? quadrantForDirection(direction);

    const lastCenter = this.quadrantNavLast
      ? this.navStopCenter(this.quadrantNavLast.id, this.quadrantNavLast.kind)
      : null;
    const onLast = !!lastCenter && Math.abs(lastCenter.x - cx) < 4 && Math.abs(lastCenter.y - cy) < 4;
    if (this.quadrantNavLast && !onLast) {
      this.quadrantGoalAngle = Math.atan2(cy - origin.y, cx - origin.x);
      this.quadrantGoalAdjusted = false;
    } else if (atOrigin && !this.quadrantGoalAdjusted) {
      this.quadrantGoalAngle = cardinalAngle(direction);
    }

    const constrainToQuadrant = moveUsesQuadrantConstraint(currentQuadrant, direction);
    const candidatesFor = (stops: NavigationGridStop[]) => constrainToQuadrant
      ? stops.filter(stop => {
          const stopQuadrant = navigationQuadrant(stop.cx - origin.x, stop.cy - origin.y);
          return stopQuadrant === null || stopQuadrant === currentQuadrant;
        })
      : stops;

    let startIndex: number;
    if (currentStop) {
      startIndex = bandIndexForStop(bands, currentStop) + (positive ? 1 : -1);
    } else if (positive) {
      startIndex = bands.findIndex(band => band.center > here);
    } else {
      startIndex = -1;
      for (let i = bands.length - 1; i >= 0; i--) {
        if (bands[i].center < here) {
          startIndex = i;
          break;
        }
      }
    }

    let candidates: NavigationGridStop[] | null = null;
    for (let index = startIndex;
         index >= 0 && index < bands.length;
         index += positive ? 1 : -1) {
      const inBand = candidatesFor(bands[index].stops);
      if (inBand.length > 0) {
        candidates = inBand;
        break;
      }
    }

    // If the constrained region has no visible destination, bring the nearest
    // matching off-screen band into view. That pan deliberately re-origins the
    // quadrant grid when it finishes.
    if (!candidates) {
      const offscreenAhead = candidatesFor(allStops.filter(stop =>
        !inView(stop) &&
        (positive
          ? primary(stop) > here + tolerance
          : primary(stop) < here - tolerance)));
      if (offscreenAhead.length === 0) {
        if (this.nodeGridVisible) this.redrawNodeGrid();
        return;
      }
      const bandEdge = positive
        ? Math.min(...offscreenAhead.map(primary))
        : Math.max(...offscreenAhead.map(primary));
      candidates = offscreenAhead.filter(stop =>
        Math.abs(primary(stop) - bandEdge) <= tolerance);
    }

    this.nodeGridTargets = targets;
    const perpendicular = (stop: NavigationGridStop) => vertical ? stop.cx : stop.cy;
    const currentPerpendicular = vertical ? cx : cy;
    const target = candidates.reduce((a, b) => {
      const aRay = distanceToGoalRay(origin, this.quadrantGoalAngle, a);
      const bRay = distanceToGoalRay(origin, this.quadrantGoalAngle, b);
      if (Math.abs(aRay - bRay) >= 0.01) return aRay < bRay ? a : b;
      return Math.abs(perpendicular(a) - currentPerpendicular) <=
        Math.abs(perpendicular(b) - currentPerpendicular) ? a : b;
    });
    this.quadrantNavLast = {id: target.id, kind: target.kind};
    this.jumpCrosshairsToStopCenter({x: target.cx, y: target.cy});
  }

  /**
   * Each same-direction run walks outward through the one-stop rings in that
   * direction's quadrant. A turn captures the current stop as a fresh origin,
   * preserving the existing h h h j turn-sensitive interaction.
   */
  private snapWithQuadrantRings(
    direction: CardinalDirection,
    targets: NavTargetKind,
  ): void {
    this.finishTweens();
    this.ensureQuadrantOrigin();
    if (this.quadrantLastDirection !== null &&
        this.quadrantLastDirection !== direction) {
      this.captureQuadrantOrigin();
    }
    this.quadrantLastDirection = direction;

    const origin = this.quadrantOriginInStage();
    if (!origin) return;
    const grid = buildQuadrantRingGrid(this.navStops(targets), origin);
    const cx = this.crosshairsLayer.crosshairs.x;
    const cy = this.crosshairsLayer.crosshairs.y;
    const lastCenter = this.quadrantNavLast
      ? this.navStopCenter(
          this.quadrantNavLast.id,
          this.quadrantNavLast.kind,
        )
      : null;
    const onLast = !!lastCenter &&
      Math.abs(lastCenter.x - cx) < 4 &&
      Math.abs(lastCenter.y - cy) < 4;
    const current = (onLast
      ? grid.stops.find(stop =>
          stop.source.id === this.quadrantNavLast?.id &&
          stop.source.kind === this.quadrantNavLast?.kind)
      : grid.stops.find(stop =>
          Math.abs(stop.source.cx - cx) < 4 &&
          Math.abs(stop.source.cy - cy) < 4)) ?? null;
    const target = nextQuadrantRingStop(
      grid,
      quadrantForDirection(direction),
      current,
    );
    if (!target) {
      if (this.nodeGridVisible) this.redrawNodeGrid();
      return;
    }

    this.nodeGridTargets = targets;
    this.quadrantNavLast = {
      id: target.source.id,
      kind: target.source.kind,
    };
    this.jumpCrosshairsToStopCenter({
      x: target.source.cx,
      y: target.source.cy,
    });
  }

  private snapWithAdaptiveBandGrid(direction: 'left' | 'right' | 'up' | 'down', targets: NavTargetKind) {
    this.finishTweens();
    const cx = this.crosshairsLayer.crosshairs.x;
    const cy = this.crosshairsLayer.crosshairs.y;
    const scale = this.drawingLayer.scaleX();
    const lx = this.drawingLayer.x(), ly = this.drawingLayer.y();
    const currentLayerX = (cx - lx) / scale;
    const currentLayerY = (cy - ly) / scale;
    const vertical = direction === 'up' || direction === 'down';
    const positive = direction === 'down' || direction === 'right';

    // Fresh navigation? The goal position resets unless we're still standing
    // on the stop the last grid step landed on.
    const lastCenter = this.navGridLast ? this.navStopCenter(this.navGridLast.id, this.navGridLast.kind) : null;
    const onLast = !!lastCenter && Math.abs(lastCenter.x - cx) < 4 && Math.abs(lastCenter.y - cy) < 4;
    if (!onLast) {
      this.navGoalX = currentLayerX;
      this.navGoalY = currentLayerY;
      this.navGoalAxis = null;
    }

    this.nodeGridTargets = targets;

    const allStops = this.navStops(targets);
    const inView = (s: NavigationGridStop) =>
      s.cx >= 0 && s.cx <= this.stage.width() && s.cy >= 0 && s.cy <= this.stage.height();
    const visible = allStops.filter(inView);
    const T = this.navGridTolerance(visible.length);
    const grid = buildNavigationGrid(visible, this.stage.width(), this.stage.height(), T);
    const bands = vertical ? grid.rows : grid.columns;
    const prim = (s: NavigationGridStop) => vertical ? s.cy : s.cx;
    const perp = (s: NavigationGridStop) => vertical ? s.cx : s.cy;
    const goal = vertical
      ? lx + (this.navGoalX ?? currentLayerX) * scale
      : ly + (this.navGoalY ?? currentLayerY) * scale;
    const here = vertical ? cy : cx;
    const currentStop = visible.find(stop =>
      Math.abs(stop.cx - cx) < 4 && Math.abs(stop.cy - cy) < 4);

    let targetBandIndex: number;
    if (currentStop) {
      const currentBandIndex = bandIndexForStop(bands, currentStop);
      targetBandIndex = currentBandIndex + (positive ? 1 : -1);
    } else if (positive) {
      targetBandIndex = bands.findIndex(band => band.center > here);
    } else {
      targetBandIndex = -1;
      for (let i = bands.length - 1; i >= 0; i--) {
        if (bands[i].center < here) { targetBandIndex = i; break; }
      }
    }

    let targetBand: NavigationGridStop[] | null =
      targetBandIndex >= 0 && targetBandIndex < bands.length
        ? bands[targetBandIndex].stops
        : null;

    // Past the visible spreadsheet edge, choose the nearest off-screen band
    // and let moveCrosshairsBy pan it into view. It will be part of the fixed
    // visible grid rebuilt after the pan completes.
    if (!targetBand) {
      const offscreenAhead = allStops.filter(stop => !inView(stop) &&
        (positive ? prim(stop) > here + T : prim(stop) < here - T));
      if (offscreenAhead.length === 0) {
        if (this.nodeGridVisible) this.redrawNodeGrid();
        return;
      }
      const bandEdge = positive
        ? Math.min(...offscreenAhead.map(prim))
        : Math.max(...offscreenAhead.map(prim));
      targetBand = offscreenAhead.filter(stop => Math.abs(prim(stop) - bandEdge) <= T);
    }

    const target = targetBand.reduce((a, b) =>
      Math.abs(perp(a) - goal) <= Math.abs(perp(b) - goal) ? a : b);

    this.jumpCrosshairsToStopCenter({x: target.cx, y: target.cy});
    const targetLayerX = (target.cx - lx) / scale;
    const targetLayerY = (target.cy - ly) / scale;
    if (vertical) {
      this.navGoalY = targetLayerY; // moved along y; keep goalX (the column)
      this.navGoalAxis = 'x';
    } else {
      this.navGoalX = targetLayerX; // moved along x; keep goalY (the row)
      this.navGoalAxis = 'y';
    }
    this.navGridLast = {id: target.id, kind: target.kind};
  }

  private jumpCrosshairsToStopCenter(c: {x: number; y: number}): void {
    this.moveCrosshairsBy(c.x - this.crosshairsLayer.crosshairs.x,
                          c.y - this.crosshairsLayer.crosshairs.y,
                          undefined, false);
  }

  // ── Move-by-node grid overlay (design-grid-navigation.md, stage 2) ──
  // While the move-by-node key is held, the row/column bands the navigation
  // uses are drawn over the viewport so the grid is visible; the band the
  // crosshairs sit in is emphasised. Redrawn on every step (the view pans).
  private nodeGridVisible = false;
  private nodeGridGroup: Konva.Group | null = null;
  private nodeGridTargets: NavTargetKind = 'labels';

  private showNodeGrid(targets: NavTargetKind = 'labels'): void {
    const opening = !this.nodeGridVisible;
    this.nodeGridVisible = true;
    this.nodeGridTargets = targets;
    if (opening && this.usesQuadrantOrigin()) {
      this.captureQuadrantOrigin();
    }
    // Move-by-node's band grid replaces the ordinary drawing grid while held.
    this.drawingLayer.hideGrid();
    this.drawingLayer.batchDraw();
    this.redrawNodeGrid();
  }

  private hideNodeGrid(): void {
    this.nodeGridVisible = false;
    this.resetQuadrantNavigation();
    this.nodeGridGroup?.destroy();
    this.nodeGridGroup = null;
    this.crosshairsLayer.batchDraw();
  }

  private redrawNodeGrid(): void {
    if (!this.nodeGridVisible) return;
    this.nodeGridGroup?.destroy();
    const group = new Konva.Group({listening: false});
    this.nodeGridGroup = group;

    if (this.graphItemNavigationStrategy === 'adaptive-quadrant-grid') {
      this.drawQuadrantNodeGrid(group);
      this.crosshairsLayer.add(group);
      group.moveToBottom();
      this.scheduleQuadrantGoalRayFade();
      this.crosshairsLayer.batchDraw();
      return;
    }
    if (this.graphItemNavigationStrategy === 'adaptive-quadrant-rings') {
      this.drawQuadrantRingGrid(group);
      this.crosshairsLayer.add(group);
      group.moveToBottom();
      this.crosshairsLayer.batchDraw();
      return;
    }

    const W = this.stage.width(), H = this.stage.height();
    const stops = this.navStops(this.nodeGridTargets)
      .filter(s => s.cx >= 0 && s.cx <= W && s.cy >= 0 && s.cy <= H);
    const T = this.navGridTolerance(stops.length);
    const grid = buildNavigationGrid(stops, W, H, T);
    const cx = this.crosshairsLayer.crosshairs.x, cy = this.crosshairsLayer.crosshairs.y;
    const palette = this.visualConfigService.getEffectivePalette(this.themeService.theme);
    const stroke = palette.crosshairsStroke;

    const stopUnderCrosshairs = stops.find(stop =>
      Math.abs(stop.cx - cx) < 4 && Math.abs(stop.cy - cy) < 4);
    const activeColumn = stopUnderCrosshairs
      ? bandIndexForStop(grid.columns, stopUnderCrosshairs)
      : bandIndexAtCoordinate(grid.columns, cx);
    const activeRow = stopUnderCrosshairs
      ? bandIndexForStop(grid.rows, stopUnderCrosshairs)
      : bandIndexAtCoordinate(grid.rows, cy);

    // Alternating low-opacity fills make rows and columns read as areas rather
    // than centerlines. The active row/column, then their cell intersection,
    // are layered on top like a spreadsheet selection.
    const fillBand = (band: NavigationAxisBand, vertical: boolean, opacity: number) =>
      new Konva.Rect({
        x: vertical ? band.start : 0,
        y: vertical ? 0 : band.start,
        width: vertical ? band.end - band.start : W,
        height: vertical ? H : band.end - band.start,
        fill: stroke,
        opacity,
        listening: false,
      });
    grid.columns.forEach((band, index) => {
      if (index % 2 === 1) group.add(fillBand(band, true, 0.035));
    });
    grid.rows.forEach((band, index) => {
      if (index % 2 === 1) group.add(fillBand(band, false, 0.035));
    });
    if (activeColumn >= 0) group.add(fillBand(grid.columns[activeColumn], true, 0.075));
    if (activeRow >= 0) group.add(fillBand(grid.rows[activeRow], false, 0.075));
    if (activeColumn >= 0 && activeRow >= 0) {
      const column = grid.columns[activeColumn], row = grid.rows[activeRow];
      group.add(new Konva.Rect({
        x: column.start, y: row.start,
        width: column.end - column.start, height: row.end - row.start,
        fill: stroke, opacity: 0.1, listening: false,
      }));
    }

    const boundary = (points: number[]) => new Konva.Line({
      points, stroke, strokeWidth: 1, opacity: 0.3, listening: false,
    });
    for (let i = 1; i < grid.columns.length; i++) {
      group.add(boundary([grid.columns[i].start, 0, grid.columns[i].start, H]));
    }
    for (let i = 1; i < grid.rows.length; i++) {
      group.add(boundary([0, grid.rows[i].start, W, grid.rows[i].start]));
    }

    // Boundaries are inferred from centers and can legitimately cross a wide
    // item. Give every stop its own compact membership legend: the horizontal
    // arm carries its row's light/dark cadence, and the vertical arm carries
    // its column's. A node remains readable even when the distant boundary is
    // visually ambiguous.
    const markerOpacity = (bandIndex: number) => bandIndex % 2 === 1 ? 0.9 : 0.48;
    for (const stop of stops) {
      const rowIndex = bandIndexForStop(grid.rows, stop);
      const columnIndex = bandIndexForStop(grid.columns, stop);
      const marker = new Konva.Group({
        name: 'node-grid-membership-marker',
        x: stop.cx,
        y: stop.cy,
        listening: false,
      });
      const arm = (points: number[], name: string, opacity: number) => {
        marker.add(new Konva.Line({
          points,
          stroke: palette.nodeFill,
          strokeWidth: 5,
          opacity: 0.9,
          lineCap: 'round',
          listening: false,
        }));
        marker.add(new Konva.Line({
          name,
          points,
          stroke,
          strokeWidth: 2,
          opacity,
          lineCap: 'round',
          listening: false,
        }));
      };
      arm([-9, 0, 9, 0], 'node-grid-row-arm', markerOpacity(rowIndex));
      arm([0, -9, 0, 9], 'node-grid-column-arm', markerOpacity(columnIndex));
      group.add(marker);
    }

    // A text-editor-style goal column/row survives a gap: the current stop
    // may sit off it temporarily, then a later step re-acquires it. Paint that
    // remembered coordinate more strongly than the cell boundaries so the
    // snap-back behavior is visible rather than surprising.
    const lastCenter = this.navGridLast
      ? this.navStopCenter(this.navGridLast.id, this.navGridLast.kind)
      : null;
    const stillInSequence = !!lastCenter &&
      Math.abs(lastCenter.x - cx) < 4 && Math.abs(lastCenter.y - cy) < 4;
    if (stillInSequence && this.navGoalAxis) {
      const scale = this.drawingLayer.scaleX();
      const guideCoordinate = this.navGoalAxis === 'x'
        ? this.drawingLayer.x() + (this.navGoalX ?? 0) * scale
        : this.drawingLayer.y() + (this.navGoalY ?? 0) * scale;
      const currentCoordinate = this.navGoalAxis === 'x' ? cx : cy;
      const points = this.navGoalAxis === 'x'
        ? [guideCoordinate, 0, guideCoordinate, H]
        : [0, guideCoordinate, W, guideCoordinate];
      // The highlighted active row/column is enough while we are already on
      // the goal. Reveal the extra guide only when a gap has displaced us.
      if (Math.abs(currentCoordinate - guideCoordinate) >= 4) {
        group.add(new Konva.Line({
          name: 'node-grid-goal-guide',
          points,
          stroke,
          strokeWidth: 2,
          opacity: 0.75,
          dash: [8, 6],
          listening: false,
        }));
      }
    }

    this.crosshairsLayer.add(group);
    group.moveToBottom();
    this.crosshairsLayer.batchDraw();
  }

  private drawQuadrantRingGrid(group: Konva.Group): void {
    this.ensureQuadrantOrigin();
    const origin = this.quadrantOriginInStage();
    if (!origin) return;

    const W = this.stage.width(), H = this.stage.height();
    const grid = buildQuadrantRingGrid(
      this.navStops(this.nodeGridTargets),
      origin,
    );
    const palette = this.visualConfigService.getEffectivePalette(this.themeService.theme);
    const stroke = palette.crosshairsStroke;
    const cx = this.crosshairsLayer.crosshairs.x;
    const cy = this.crosshairsLayer.crosshairs.y;
    const activeStop = grid.stops.find(stop =>
      Math.abs(stop.source.cx - cx) < 4 &&
      Math.abs(stop.source.cy - cy) < 4) ?? null;
    const activeQuadrant = activeStop?.quadrant ??
      (this.quadrantLastDirection
        ? quadrantForDirection(this.quadrantLastDirection)
        : null);
    const maxReach = Math.max(
      Math.hypot(origin.x, origin.y),
      Math.hypot(W - origin.x, origin.y),
      Math.hypot(origin.x, H - origin.y),
      Math.hypot(W - origin.x, H - origin.y),
    );
    const toDegrees = 180 / Math.PI;
    const quadrants = ['north', 'south', 'east', 'west'] as const;

    // A low-opacity wash makes the active radial region legible without
    // overwhelming the independently alternating ring bands.
    if (activeQuadrant) {
      const angles = quadrantArcAngles(activeQuadrant);
      group.add(new Konva.Arc({
        name: 'quadrant-ring-active-quadrant',
        x: origin.x,
        y: origin.y,
        innerRadius: 0,
        outerRadius: maxReach,
        angle: 90,
        rotation: angles.start * toDegrees,
        fill: stroke,
        opacity: 0.035,
        listening: false,
      }));
    }

    for (const quadrant of quadrants) {
      const angles = quadrantArcAngles(quadrant);
      const rings = grid.rings[quadrant];
      rings.forEach((ring, index) => {
        const innerRadius = Math.min(ring.innerRadius, maxReach);
        const outerRadius = Math.min(ring.outerRadius, maxReach);
        const active = ring.stop === activeStop;
        if (outerRadius > innerRadius && (index % 2 === 1 || active)) {
          group.add(new Konva.Arc({
            name: active
              ? 'quadrant-ring-active-band'
              : 'quadrant-ring-band',
            x: origin.x,
            y: origin.y,
            innerRadius,
            outerRadius,
            angle: 90,
            rotation: angles.start * toDegrees,
            fill: stroke,
            opacity: active ? 0.105 : 0.025,
            listening: false,
          }));
        }

        if (Number.isFinite(ring.outerRadius) &&
            ring.outerRadius > 0 &&
            ring.outerRadius <= maxReach) {
          group.add(new Konva.Line({
            name: 'quadrant-ring-boundary',
            points: quarterArcPoints(
              origin,
              ring.outerRadius,
              quadrant,
            ),
            stroke,
            strokeWidth: 1,
            opacity: 0.34,
            listening: false,
          }));
        }
      });
    }

    // Unlike the moving ghost frame in the rectangular experiment, these
    // diagonals are the actual edges of the four independently spaced ring
    // systems, so they stay attached to the active origin.
    for (const angle of [
      Math.PI / 4,
      Math.PI * 3 / 4,
      Math.PI * 5 / 4,
      Math.PI * 7 / 4,
    ]) {
      const end = this.navigationRayEnd(origin, angle, W, H);
      if (!end) continue;
      group.add(new Konva.Line({
        name: 'quadrant-ring-diagonal',
        points: [origin.x, origin.y, end.x, end.y],
        stroke,
        strokeWidth: 1.5,
        opacity: 0.46,
        dash: [7, 5],
        listening: false,
      }));
    }

    group.add(new Konva.Circle({
      name: 'quadrant-ring-origin',
      x: origin.x,
      y: origin.y,
      radius: 6,
      fill: palette.nodeFill,
      stroke,
      strokeWidth: 2,
      opacity: 0.9,
      listening: false,
    }));
  }

  private drawQuadrantNodeGrid(group: Konva.Group): void {
    this.ensureQuadrantOrigin();
    const origin = this.quadrantOriginInStage();
    if (!origin) return;

    const W = this.stage.width(), H = this.stage.height();
    const stops = this.navStops(this.nodeGridTargets)
      .filter(stop => stop.cx >= 0 && stop.cx <= W && stop.cy >= 0 && stop.cy <= H);
    const grid = buildNavigationGrid(
      stops,
      W,
      H,
      this.navGridTolerance(stops.length),
    );
    const palette = this.visualConfigService.getEffectivePalette(this.themeService.theme);
    const stroke = palette.crosshairsStroke;
    const cx = this.crosshairsLayer.crosshairs.x;
    const cy = this.crosshairsLayer.crosshairs.y;

    // The adaptive rows/columns remain visible as a deliberately subordinate
    // movement grid. These are roughly one third of the former fill/boundary
    // opacity, with no active row, column, or cell highlight.
    const fillBand = (
      band: NavigationAxisBand,
      vertical: boolean,
      name: string,
    ) => new Konva.Rect({
      name,
      x: vertical ? band.start : 0,
      y: vertical ? 0 : band.start,
      width: vertical ? band.end - band.start : W,
      height: vertical ? H : band.end - band.start,
      fill: stroke,
      opacity: 0.012,
      listening: false,
    });
    grid.columns.forEach((band, index) => {
      if (index % 2 === 1) {
        group.add(fillBand(band, true, 'quadrant-grid-column-band'));
      }
    });
    grid.rows.forEach((band, index) => {
      if (index % 2 === 1) {
        group.add(fillBand(band, false, 'quadrant-grid-row-band'));
      }
    });
    for (let index = 1; index < grid.columns.length; index++) {
      group.add(new Konva.Line({
        name: 'quadrant-grid-column-boundary',
        points: [grid.columns[index].start, 0, grid.columns[index].start, H],
        stroke,
        strokeWidth: 1,
        opacity: 0.1,
        listening: false,
      }));
    }
    for (let index = 1; index < grid.rows.length; index++) {
      group.add(new Konva.Line({
        name: 'quadrant-grid-row-boundary',
        points: [0, grid.rows[index].start, W, grid.rows[index].start],
        stroke,
        strokeWidth: 1,
        opacity: 0.1,
        listening: false,
      }));
    }

    // The darker diagonal wash remains the primary region cue.
    const activeQuadrant = navigationQuadrant(cx - origin.x, cy - origin.y) ??
      (this.quadrantLastDirection
        ? quadrantForDirection(this.quadrantLastDirection)
        : null);
    if (activeQuadrant) {
      const reach = W + H;
      const quadrantPoints = {
        north: [
          origin.x, origin.y,
          origin.x - reach, origin.y - reach,
          origin.x + reach, origin.y - reach,
        ],
        south: [
          origin.x, origin.y,
          origin.x - reach, origin.y + reach,
          origin.x + reach, origin.y + reach,
        ],
        east: [
          origin.x, origin.y,
          origin.x + reach, origin.y - reach,
          origin.x + reach, origin.y + reach,
        ],
        west: [
          origin.x, origin.y,
          origin.x - reach, origin.y - reach,
          origin.x - reach, origin.y + reach,
        ],
      }[activeQuadrant];
      group.add(new Konva.Line({
        name: 'quadrant-grid-active-quadrant',
        points: quadrantPoints,
        closed: true,
        fill: stroke,
        opacity: 0.1,
        listening: false,
      }));
    }

    const diagonalAngles = [
      Math.PI / 4,
      Math.PI * 3 / 4,
      Math.PI * 5 / 4,
      Math.PI * 7 / 4,
    ];
    const addGhostDiagonalRays = (center: {x: number; y: number}) => {
      for (const angle of diagonalAngles) {
        const end = this.navigationRayEnd(center, angle, W, H);
        if (end) {
          group.add(new Konva.Line({
            name: 'quadrant-grid-ghost-diagonal',
            points: [center.x, center.y, end.x, end.y],
            stroke,
            strokeWidth: 1.5,
            opacity: 0.42,
            dash: [7, 5],
            listening: false,
          }));
        }
      }
    };

    // Preview the diagonal frame that would become active on the next
    // direction change. It follows the crosshairs; the quadrant wash now
    // communicates the active frame without a second, darker set of lines.
    addGhostDiagonalRays({x: cx, y: cy});

    const markerOpacity = (bandIndex: number) => bandIndex % 2 === 1 ? 0.9 : 0.48;
    for (const stop of stops) {
      const rowIndex = bandIndexForStop(grid.rows, stop);
      const columnIndex = bandIndexForStop(grid.columns, stop);
      const marker = new Konva.Group({
        name: 'quadrant-grid-membership-marker',
        x: stop.cx,
        y: stop.cy,
        listening: false,
      });
      const arm = (points: number[], name: string, opacity: number) => {
        marker.add(new Konva.Line({
          points,
          stroke: palette.nodeFill,
          strokeWidth: 5,
          opacity: 0.9,
          lineCap: 'round',
          listening: false,
        }));
        marker.add(new Konva.Line({
          name,
          points,
          stroke,
          strokeWidth: 2,
          opacity,
          lineCap: 'round',
          listening: false,
        }));
      };
      arm([-9, 0, 9, 0], 'quadrant-grid-row-arm', markerOpacity(rowIndex));
      arm([0, -9, 0, 9], 'quadrant-grid-column-arm', markerOpacity(columnIndex));
      group.add(marker);
    }

    const goalEnd = this.quadrantGoalRayVisible
      ? this.navigationRayEnd(origin, this.quadrantGoalAngle, W, H)
      : null;
    if (goalEnd) {
      group.add(new Konva.Line({
        name: 'quadrant-grid-goal-ray',
        points: [origin.x, origin.y, goalEnd.x, goalEnd.y],
        stroke,
        strokeWidth: 2,
        opacity: 0.8,
        dash: [8, 6],
        listening: false,
      }));
    }

    group.add(new Konva.Circle({
      name: 'quadrant-grid-origin',
      x: origin.x,
      y: origin.y,
      radius: 6,
      fill: palette.nodeFill,
      stroke,
      strokeWidth: 2,
      opacity: 0.9,
      listening: false,
    }));
  }

  private navigationRayEnd(
    origin: {x: number; y: number},
    angle: number,
    width: number,
    height: number,
  ): {x: number; y: number} | null {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const candidates: number[] = [];
    if (dx > 1e-9) candidates.push((width - origin.x) / dx);
    else if (dx < -1e-9) candidates.push((0 - origin.x) / dx);
    if (dy > 1e-9) candidates.push((height - origin.y) / dy);
    else if (dy < -1e-9) candidates.push((0 - origin.y) / dy);
    const positive = candidates.filter(value => value > 0);
    if (positive.length === 0) return null;
    const distance = Math.min(...positive);
    return {x: origin.x + dx * distance, y: origin.y + dy * distance};
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
  private findSnapOnEdge(edge: DAEdge, point: {x: number; y: number}):
      {point: {x: number; y: number}; segmentIndex: number; distance: number} | undefined {
    const pts = edge.getPathPoints();
    let best: {point: {x: number; y: number}; segmentIndex: number; distance: number} | undefined;
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

  private focusNewNodeForLabelEdit(node: DANode): void {
    this.finishTweens();
    const targetScale = Math.min(
      this.MAX_ZOOM,
      Math.max(
        this.drawingLayer.scaleX(),
        DrawingAreaComponent.NODE_EDIT_MIN_ZOOM,
      ),
    );
    // While the focus zoom is in flight, the edit lens must judge legibility
    // by where the zoom is going, not the mid-tween scale — otherwise a lens
    // built during the tween survives at full zoom as a phantom second copy
    // of the freshly added node (da-198).
    this.focusZoomTargetScale = targetScale;
    this.centerViewOnLayerPoint(
      this.getNodeCenterInLayerCoordinates(node),
      targetScale,
      () => {
        this.focusZoomTargetScale = null;
        this.refreshLabelEditGhost();
      },
    );
  }

  /** Enter label editing for a node that has just been added. Existing-node
   *  edits intentionally keep their current viewport; insertion gets this
   *  stronger focus treatment because the new node may have landed far from
   *  its anchor or while the whole graph was fit at a tiny scale. */
  private beginNewNodeLabelEdit(node: DANode): void {
    this.pendingNodeLabelEdit = null;
    this.clearLabelEditGhost();
    if (node.nodeShape === 'junction' || node.nodeShape === 'invisible') return;
    node.setCursorToEnd();
    node.showCursor();
    this.crosshairsLayer.hideCrosshairs();
    this.focusNewNodeForLabelEdit(node);
    this.drawingLayer.batchDraw();
    this.checkAndEmitEditState();
    this.daOut.emit({kind: 'started-label-editing-mode', mode: 'insert'});
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
    this.newNodeEdgeFocus = drawn.length === 1 ? drawn[0] : null;

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

    const stageWidth = this.viewWidth();
    const stageHeight = this.viewHeight();

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
    const fit = Math.min((this.viewWidth() * margin) / w, (this.viewHeight() * margin) / h);
    // Fitting may go below the interactive MIN_ZOOM — a rescue that stops
    // short of showing the whole graph isn't a rescue. Floor well below it.
    const scale = Math.min(Math.max(fit, 0.02), 1.0);
    this.drawingLayer.scale({ x: scale, y: scale });
    this.drawingLayer.position({
      x: this.viewCenterX() - ((box.minX + box.maxX) / 2) * scale,
      y: this.viewCenterY() - ((box.minY + box.maxY) / 2) * scale,
    });
    this.drawingLayer.batchDraw();
  }

  private recenterCrosshairs() {
    this.finishTweens();
    this.clearCrosshairHoverHighlight(false);

    const tween = new Konva.Tween({
      node: this.crosshairsLayer.crosshairs.konvaGroup,
      duration: this.RECENTER_CROSSHAIRS_DURATION,
      x: this.viewCenterX(),
      y: this.viewCenterY(),
      easing: Konva.Easings.EaseInOut,
      onFinish: () => {
        const index = this.tweens.indexOf(tween);
        if (index > -1) {
          this.tweens.splice(index, 1);
        }
        this.scheduleCrosshairHoverRefresh(20);
      }
    });

    this.tweens.push(tween);
    tween.play();
  }

  private dragSelectedLeft(tier?: GridTier)  {
    if (this.areaSelectActive) { this.areaSelectStep('x', -1, tier); return; }
    if (this.resizeTargetNode) { this.resizeSelected(-1); return; }
    this.dragSelected('x', -1, tier);
  }
  private dragSelectedRight(tier?: GridTier) {
    if (this.areaSelectActive) { this.areaSelectStep('x', +1, tier); return; }
    if (this.resizeTargetNode) { this.resizeSelected(1); return; }
    this.dragSelected('x', +1, tier);
  }
  private dragSelectedUp(tier?: GridTier)    {
    if (this.areaSelectActive) { this.areaSelectStep('y', -1, tier); return; }
    if (this.resizeTargetNode) { this.resizeSelected(-1); return; }
    this.dragSelected('y', -1, tier);
  }
  private dragSelectedDown(tier?: GridTier)  {
    if (this.areaSelectActive) { this.areaSelectStep('y', +1, tier); return; }
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

    // If only labels are selected, movement remains screen-directional even
    // when the owning edge is reversed or nearly perpendicular to the key.
    const selectedLabels = this.getSelectedLabels();
    const selectedNodes = this.drawingLayer.getSelectedDANodes();
    let selectedWaypoints = this.drawingLayer.getSelectedDAWaypoints();
    const selectedEdges = this.drawingLayer.getSelectedDAEdges();

    // Holding v over an edge selects it. The first movement key turns the
    // point under the crosshairs into a waypoint and immediately applies
    // that same drag step, so the gesture is v+hjkl rather than v, add, v.
    // Restrict the insertion to the selected edge under the crosshairs:
    // crossing/parallel edges must not steal the waypoint.
    if (selectedEdges.length > 0 && selectedLabels.length === 0 &&
        selectedNodes.length === 0 && selectedWaypoints.length === 0) {
      const edgeUnderCrosshairs = this.getDAEdgesContainingCrosshairs()
        .filter(edge => edge.isSelected)
        .reduce<DAEdge | null>(
          (top, edge) => !top || edge.zIndex() > top.zIndex() ? edge : top,
          null,
        );
      const edge = edgeUnderCrosshairs ?? selectedEdges[0];
      const snap = this.findSnapOnEdge(edge, this.crosshairsInLayerCoords());
      if (snap) {
        this.drawingLayer.unselectAll();
        this.unselectAllLabels();
        const waypoint = edge.insertWaypointAt(snap.point, snap.segmentIndex);
        waypoint.isSelected = true;
        selectedWaypoints = [waypoint];
      }
    }

    if (selectedLabels.length > 0 && selectedNodes.length === 0 && selectedWaypoints.length === 0) {
      const effectiveTier = tier ?? 'normal';
      selectedLabels.forEach(label => {
        const edge = this.getEdgeForLabel(label);
        if (!edge) return;
        const distance = effectiveTier === 'fine'
          ? this.drawingLayer.getSubGridSpacing()
          : this.drawingLayer.getGridSpacing();
        edge.dragLabelToward(
          label,
          axis === 'x' ? {x: sign, y: 0} : {x: 0, y: sign},
          distance,
          effectiveTier === 'coarse',
        );
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
    const dragEdgeMargin = 60;
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
    const dragViewLo = axis === 'x' ? this.viewMinX() : this.viewMinY();
    const dragViewHi = axis === 'x' ? this.viewMaxX() : this.viewMaxY();
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
      const clamped = Math.min(
        Math.max(targetCrosshairs, dragViewLo + dragEdgeMargin),
        dragViewHi - dragEdgeMargin,
      );
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
  private showEditCarets(point?: {x: number; y: number}): void {
    this.drawingLayer.getSelectedDANodes().forEach(n => {
      if (point) {
        n.setCursorFromLocalPoint({
          x: point.x - n.group.x(),
          y: point.y - n.group.y(),
        });
      } else {
        n.setCursorToEnd();
      }
      n.showCursor();
    });
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
    const x = Math.max(this.viewMinX() + padding, Math.min(
      center.x - node.NODE_WIDTH / 2,
      this.viewMaxX() - node.NODE_WIDTH - padding,
    ));
    const y = Math.max(this.viewMinY() + padding, Math.min(
      center.y - node.NODE_HEIGHT / 2,
      this.viewMaxY() - node.NODE_HEIGHT - padding,
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
    this.crosshairsLayer.add(ghost);
    ghost.moveToTop();
    this.labelEditGhost = ghost;
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
      {width: this.viewWidth(), height: this.viewHeight()},
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
    if (!this.labelEditGhost) return;
    this.labelEditGhost.destroy();
    this.labelEditGhost = null;
    if (draw) this.crosshairsLayer?.batchDraw();
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
      this.singleItemSelect();
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
      this.singleItemSelect();
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
    const nodes = this.getDANodesContainingCrosshairs();
    if (nodes.length > 0) {
      const anchor = nodes.reduce((a, b) => a.zIndex() > b.zIndex() ? a : b);
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
  private growOrigin: {x: number; y: number} | null = null;
  /** Existing-node landing selected through the Move-by-Node engine. */
  private growTarget: DANode | null = null;
  /** Empty insertion landing selected through the same navigation engine. */
  private growInsertionTarget: GrowGhostTarget | null = null;
  /** All midpoint and source-grid insertion stops for this Add hold. */
  private growGhostTargets: GrowGhostTarget[] = [];
  /** Where Move-by-Node's cursor sits while grow mode holds the crosshairs
   *  on the anchor (da-448). Null outside a grow gesture. */
  private growNavCursor: {x: number; y: number} | null = null;
  /** The edge a quick-add just drew, held while its new node is being
   *  labelled so the crosshairs can land on it when the label is done
   *  (da-509) — the same landing connecting two existing nodes gets. */
  private newNodeEdgeFocus: DAEdge | null = null;
  private growParkTimer: number | null = null;
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
  // Placement sub-mode (after the type popup picked a kind for a NEW node).
  private growPlacing = false;
  private growShape: NodeShape | undefined = undefined;
  /** Ghost position in drawing-layer coordinates (node center). */
  private growPlacePos: {x: number; y: number} | null = null;
  /** First directional press = rough slot throw; later presses = grid steps. */
  private growPlacedRough = false;
  private growMods = new Set<string>();
  private growGhost: Konva.Group | null = null;

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
    this.growAnchor = nodes.length > 0
      ? nodes.reduce((a, b) => a.zIndex() > b.zIndex() ? a : b)
      : null;
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
    if (this.growAnchor) this.showNodeGrid('nodes');
    this.redrawGrowGhost();
  }

  private buildCurrentGrowGhostTargets(anchor: DANode): GrowGhostTarget[] {
    const scale = this.drawingLayer.scaleX();
    const lx = this.drawingLayer.x();
    const ly = this.drawingLayer.y();
    const layerNodes = this.drawingLayer.getDANodes();
    const nodes = layerNodes.map(node => ({
      id: node.id,
      ...this.getNodeCenterInLayerCoordinates(node),
      halfW: node.NODE_WIDTH / 2,
      halfH: node.NODE_HEIGHT / 2,
    }));
    const source = nodes.find(node => node.id === anchor.id)!;
    const bounds = {
      minX: -lx / scale,
      minY: -ly / scale,
      maxX: (this.stage.width() - lx) / scale,
      maxY: (this.stage.height() - ly) / scale,
    };
    const visibleIds = new Set(layerNodes
      .filter(node => {
        const p = node.group.position();
        return p.x + node.NODE_WIDTH >= bounds.minX && p.x <= bounds.maxX &&
          p.y + node.NODE_HEIGHT >= bounds.minY && p.y <= bounds.maxY;
      })
      .map(node => node.id));
    return buildGrowGhostTargets(
      nodes,
      source,
      this.drawingLayer.getGridSpacing(),
      bounds,
      // The ghost lattice is square, so it takes the wider of the two needs:
      // a vertical-sized step would drop targets inside a wide anchor box.
      this.quickAddSlot(false, anchor),
      nodes.filter(node => visibleIds.has(node.id)),
      // The anchor's own box stands in for the node a target would create —
      // it is also what the placement ghost is drawn at, so what is refused
      // is exactly what you would have seen land on something (da-510).
      {w: anchor.NODE_WIDTH / 2, h: anchor.NODE_HEIGHT / 2},
    );
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
        this.showNodeGrid('nodes');
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
        this.growMods.add(key);
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
    this.growMods.delete(key);
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
    this.growGhost?.destroy();
    this.growGhost = null;
    this.hideNodeGrid();
    this.drawingLayer.batchDraw();
    this.daOut.emit({kind: 'popup-state', open: true, surface: 'grow-edge'});
  }

  /** Choose a real-node or insertion-ghost target through the actual Move by
   *  Node engine. The augmented node tier shares its selected strategy,
   *  overlay, crosshair landing, viewport panning, same-direction run, and
   *  turn re-origin semantics. */
  private growHop(direction: 'left' | 'right' | 'up' | 'down'): void {
    if (!this.growAnchor) return;
    // Move-by-Node walks from wherever the crosshairs are, so the walk needs
    // them at the last candidate — but during a grow gesture the thing you
    // are aiming is the ghost, and watching the crosshairs wander off the
    // node you are growing from reads as the node itself moving (da-448).
    // The engine's cursor is kept here instead, and the crosshairs are put
    // back on the anchor after each hop.
    if (this.growNavCursor && this.crosshairsLayer?.crosshairs) {
      const scale = this.drawingLayer.scaleX();
      this.crosshairsLayer.crosshairs.x =
        this.drawingLayer.x() + this.growNavCursor.x * scale;
      this.crosshairsLayer.crosshairs.y =
        this.drawingLayer.y() + this.growNavCursor.y * scale;
    }
    this.snapToNodeInDirection(direction, 'nodes');
    const last = this.graphItemNavigationStrategy === 'adaptive-band-grid'
      ? this.navGridLast
      : this.quadrantNavLast;
    if (!last || last.kind !== 'node') return;
    const target = this.drawingLayer.getDANodes().find(node => node.id === last.id) ?? null;
    const insertion = this.growGhostTargets.find(item => item.id === last.id) ?? null;
    if (!target && !insertion) return;
    this.growTarget = target;
    this.growInsertionTarget = insertion;
    // The engine's cursor is the stop it just landed on, not the crosshairs:
    // those are still animating towards it, and a mid-flight position would
    // not match any stop on the next hop, stalling the walk.
    this.parkGrowCrosshairsOnAnchor(this.navStopCenter?.(last.id, last.kind) ?? null);
    // A hop that reaches the edge of the viewport pans, and the pan is a
    // tween — so the anchor's screen position a moment later is not the one
    // just read. Re-place once it has settled.
    window.clearTimeout(this.growParkTimer ?? undefined);
    this.growParkTimer = window.setTimeout(() => {
      this.growParkTimer = null;
      if (this.growActive) this.parkGrowCrosshairsOnAnchor();
    }, Math.ceil(this.TWEEN_DURATION * 1000) + 60);
    this.redrawGrowGhost();
  }

  /** Hold the crosshairs on the node being grown from, remembering where the
   *  navigation engine actually is (in layer space, so a pan cannot make it
   *  stale). Skipped when the anchor has been panned off screen — crosshairs
   *  you cannot see are worse than crosshairs that moved. */
  private parkGrowCrosshairsOnAnchor(navCursor?: {x: number; y: number} | null): void {
    if (!this.growAnchor || !this.stage || !this.crosshairsLayer?.crosshairs) return;
    const crosshairs = this.crosshairsLayer.crosshairs;
    const scale = this.drawingLayer.scaleX();
    if (navCursor !== undefined) {
      const cursor = navCursor ?? {x: crosshairs.x, y: crosshairs.y};
      this.growNavCursor = {
        x: (cursor.x - this.drawingLayer.x()) / scale,
        y: (cursor.y - this.drawingLayer.y()) / scale,
      };
    }
    const c = this.getNodeCenterInStageCoordinates(this.growAnchor);
    if (c.x < 0 || c.x > this.stage.width() || c.y < 0 || c.y > this.stage.height()) return;
    crosshairs.x = c.x;
    crosshairs.y = c.y;
    this.crosshairsLayer.batchDraw();
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
    this.hideNodeGrid();
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
    const POPUP_W = 210;
    const POPUP_H = Math.min(38 + this.navPopupRows.length * 28 + 16, 220);
    const GAP = 14;
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
    this.navPopupLeft = Math.max(this.viewMinX() + 8,
      Math.min(rect.x + rect.w + GAP, this.viewMaxX() - POPUP_W - 8));
    this.navPopupTop = Math.max(this.viewMinY() + 8,
      Math.min(rect.y, this.viewMaxY() - POPUP_H - 8));
  }

  /** `f` in grow mode: the node-type popup (v1 list = the raw shapes; the
   *  extension node-kinds slot slots in here later). Held-f rhythm: browse
   *  with j/k while f is down, releasing f selects (the popup's holdKey
   *  machinery); Enter also selects. */
  private openGrowTypePopup(): void {
    this.hideNodeGrid();
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

  /** Type picked: enter the placement sub-mode — ghost node of that shape
   *  at the right-of-anchor default (or at the crosshairs on empty canvas);
   *  hjkl places (first press = rough slot
   *  throw, then grid steps, coarse/fine tier keys held). Release of the
   *  still-held add key commits; Enter commits the sticky variant. */
  private enterGrowPlacement(shapeId: string): void {
    this.navPopupOpen = false;
    this.navPopupPurpose = 'nav';
    this.growPlacing = true;
    this.growShape = shapeId as NodeShape;
    this.growTarget = null;
    this.growInsertionTarget = null;
    this.growPlacedRough = false;
    const c = this.growOrigin!;
    this.growPlacePos = this.growAnchor
      ? {x: c.x + this.quickAddSlot(false), y: c.y}
      : {...c};
    this.daOut.emit({kind: 'popup-state', open: true, surface: 'grow-placement'});
    this.redrawGrowGhost();
  }

  /** Placement steering. Rough first (slot throw in the pressed direction,
   *  replacing the below default), grid steps after; `s`/`d` tier chords
   *  scale the step (coarse = a full slot, fine = a tenth-grid). */
  private growPlaceMove(direction: 'left' | 'right' | 'up' | 'down'): void {
    const k = this.growKeys!;
    const c = this.growOrigin!;
    const dx = direction === 'left' ? -1 : direction === 'right' ? 1 : 0;
    const dy = direction === 'up' ? -1 : direction === 'down' ? 1 : 0;
    if (!this.growPlacedRough) {
      this.growPlacedRough = true;
      const slot = this.quickAddSlot(dy !== 0);
      this.growPlacePos = {x: c.x + dx * slot, y: c.y + dy * slot};
    } else {
      // A coarse step is "one more slot in this direction", so it follows the
      // same axis split as the rough throw above.
      const step = this.growMods.has(k.coarse)
          ? this.quickAddSlot(dy !== 0)
        : this.growMods.has(k.fine) ? 10 : 50;
      this.growPlacePos = {
        x: this.growPlacePos!.x + dx * step,
        y: this.growPlacePos!.y + dy * step,
      };
    }
    this.redrawGrowGhost();
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
    const scale = this.drawingLayer.scaleX();
    const newNode = this.drawingLayer.createNewNode(
      pos.x * scale + this.drawingLayer.x(),
      pos.y * scale + this.drawingLayer.y(),
      shape);
    this.newNodeEdgeFocus = anchor ? this.wireGrowEdge(anchor, newNode, dirState) : null;

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

  /** Wire the grow edge and leave the crosshairs on it, near the destination,
   *  so cycling its direction is one keypress away (da-345). Shared by every
   *  way of choosing an existing node as the target: walking the ghosts with
   *  hjkl, and the `/` search popup. Only the old select-then-connect path
   *  did this before (`249e6e0`) — held-Add, which is how a link actually
   *  gets drawn, was left out (2026-08-29). */
  private commitGrowEdgeTo(anchor: DANode, target: DANode, dirState: number): void {
    this.finishTweens();
    this.undoRedoService.pushSnapshot(this.drawingLayer.serializeGraph());
    const edge = this.wireGrowEdge(anchor, target, dirState);
    this.drawingLayer.batchDraw();
    this.parkCrosshairsOnNewEdge(edge);
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
    const scale = this.drawingLayer.scaleX();
    const newNode = this.drawingLayer.createNewNode(
      insertion.x * scale + this.drawingLayer.x(),
      insertion.y * scale + this.drawingLayer.y(),
      this._defaultNodeShape,
    );
    this.newNodeEdgeFocus = this.wireGrowEdge(anchor, newNode, dirState);

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
  private parkCrosshairsOnNewEdge(edge: DAEdge): void {
    const anchor = pointAtT(edge.getRenderedPathPoints(), DrawingAreaComponent.NEW_EDGE_FOCUS_T);
    if (!anchor) return;
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
      ?? (hovered.length > 0
        ? hovered.reduce((a, b) => a.zIndex() > b.zIndex() ? a : b)
        : (selected.length === 1 ? selected[0] : null));
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
  private growGhostShape(shape: NodeShape, center: {x: number; y: number},
                         w: number, h: number, stroke: string, scale: number): Konva.Shape {
    const common = {stroke, dash: [6, 4], strokeWidth: 2 / scale};
    switch (shape) {
      case 'circle':
        return new Konva.Ellipse({x: center.x, y: center.y, radiusX: w / 2, radiusY: h / 2, ...common});
      case 'diamond':
        return new Konva.Line({closed: true, ...common, points: [
          center.x, center.y - h / 2, center.x + w / 2, center.y,
          center.x, center.y + h / 2, center.x - w / 2, center.y]});
      case 'junction':
      case 'invisible':
        return new Konva.Circle({x: center.x, y: center.y, radius: 10, ...common});
      default:
        return new Konva.Rect({x: center.x - w / 2, y: center.y - h / 2,
          width: w, height: h, cornerRadius: 4, ...common});
    }
  }

  private exitGrowMode(): void {
    this.growActive = false;
    this.growNavCursor = null;
    window.clearTimeout(this.growParkTimer ?? undefined);
    this.growParkTimer = null;
    this.growEdgeMenuActive = false;
    this.growSelfLoopPending = false;
    this.growHoldReleased = false;
    this.growPressedKeys.clear();
    this.growGhost?.destroy();
    this.growGhost = null;
    this.growOrigin = null;
    this.growTarget = null;
    this.growInsertionTarget = null;
    this.growGhostTargets = [];
    this.hideNodeGrid();
    this.daOut.emit({kind: 'popup-state', open: false});
    this.drawingLayer.batchDraw();
  }

  private addGrowSelfLoopPreview(
    ghost: Konva.Group,
    anchor: DANode,
    stroke: string,
    scale: number,
  ): void {
    const pos = anchor.group.position();
    const width = anchor.NODE_WIDTH;
    const height = anchor.NODE_HEIGHT;
    const offsetX = Math.max(28, width * 0.32);
    const offsetY = Math.max(18, height * 0.2);
    const d = this.growDirState;
    ghost.add(new Konva.Arrow({
      name: 'grow-self-loop-preview',
      points: [
        pos.x + width, pos.y + height * 0.35,
        pos.x + width + offsetX, pos.y + height * 0.22 - offsetY,
        pos.x + width + offsetX, pos.y + height * 0.78 + offsetY,
        pos.x + width, pos.y + height * 0.65,
      ],
      stroke,
      fill: stroke,
      dash: [8, 6],
      strokeWidth: 3 / scale,
      tension: 0.5,
      pointerLength: 14,
      pointerWidth: 14,
      pointerAtEnding: d === 0 || d === 3,
      pointerAtBeginning: d === 1 || d === 3,
    }));
  }

  /** Translucent preview of the augmented held-Add navigation surface. Every
   *  midpoint/source-grid insertion stop is shown as a faint node; the
   *  current real or ghost landing gets a stronger outline and live edge.
   *  Before the first hop the release result is the node's self-loop. */
  private redrawGrowGhost(): void {
    this.growGhost?.destroy();
    const ghost = new Konva.Group({listening: false, opacity: 0.55});
    this.growGhost = ghost;
    const anchor = this.growAnchor;
    const scale = this.drawingLayer.scaleX();
    const aCenter = this.growOrigin!;
    const palette = this.visualConfigService.getEffectivePalette(this.themeService.theme);
    const stroke = palette.nodeStroke;

    if (anchor && !this.growPlacing) {
      for (const target of this.growGhostTargets) {
        const active = target.id === this.growInsertionTarget?.id;
        const marker = this.growGhostShape(
          this._defaultNodeShape,
          target,
          140,
          60,
          stroke,
          scale,
        );
        marker.name(active ? 'grow-insertion-target-active' : 'grow-insertion-target');
        marker.setAttr('ghostSource', target.source);
        marker.dash(target.source === 'midpoint' ? [10, 5] : [2, 7]);
        marker.opacity(active ? 1 : target.source === 'midpoint' ? 0.42 : 0.24);
        ghost.add(marker);
        ghost.add(new Konva.Text({
          name: `grow-insertion-kind grow-insertion-kind-${target.source}`,
          x: target.x - 24 / scale,
          y: target.y - 10 / scale,
          width: 48 / scale,
          align: 'center',
          text: target.source === 'midpoint' ? '½' : '+',
          fontSize: 20 / scale,
          fontStyle: 'bold',
          fill: stroke,
          opacity: active ? 1 : target.source === 'midpoint' ? 0.7 : 0.5,
          listening: false,
        }));
      }
    }

    if (anchor && !this.growPlacing && !this.growTarget && !this.growInsertionTarget) {
      this.addGrowSelfLoopPreview(ghost, anchor, stroke, scale);
      this.drawingLayer.add(ghost);
      ghost.moveToTop();
      this.drawingLayer.batchDraw();
      return;
    }

    if (anchor && this.growTarget === anchor) {
      const pos = anchor.group.position();
      ghost.add(new Konva.Rect({
        name: 'grow-home-target',
        x: pos.x - 6,
        y: pos.y - 6,
        width: anchor.NODE_WIDTH + 12,
        height: anchor.NODE_HEIGHT + 12,
        stroke,
        dash: [6, 4],
        strokeWidth: 3 / scale,
        cornerRadius: 6,
      }));
      this.drawingLayer.add(ghost);
      ghost.moveToTop();
      this.drawingLayer.batchDraw();
      return;
    }

    let endCenter: {x: number; y: number};
    let endHalf: {w: number; h: number};
    if (this.growPlacing && this.growPlacePos) {
      endCenter = this.growPlacePos;
      const w = 140, h = 60;
      endHalf = {w: w / 2, h: h / 2};
      ghost.add(this.growGhostShape(this.growShape ?? this._defaultNodeShape, endCenter, w, h, stroke, scale));
    } else if (anchor && this.growInsertionTarget) {
      endCenter = this.growInsertionTarget;
      endHalf = {w: 70, h: 30};
    } else if (anchor && this.growTarget && this.growTarget !== anchor) {
      const t = this.growTarget;
      const tPos = t.group.position();
      endCenter = {x: tPos.x + t.NODE_WIDTH / 2, y: tPos.y + t.NODE_HEIGHT / 2};
      endHalf = {w: t.NODE_WIDTH / 2, h: t.NODE_HEIGHT / 2};
      ghost.add(new Konva.Rect({
        x: tPos.x - 6, y: tPos.y - 6,
        width: t.NODE_WIDTH + 12, height: t.NODE_HEIGHT + 12,
        stroke, dash: [6, 4], strokeWidth: 3 / scale, cornerRadius: 6,
      }));
    } else {
      const w = 140, h = 60;
      endCenter = {...aCenter};
      endHalf = {w: w / 2, h: h / 2};
      ghost.add(new Konva.Rect({
        x: endCenter.x - w / 2, y: endCenter.y - h / 2,
        width: w, height: h,
        stroke, dash: [6, 4], strokeWidth: 2 / scale, cornerRadius: 4,
      }));
    }

    // Empty-canvas adds have no anchor and therefore no ghost edge.
    if (!anchor) {
      this.drawingLayer.add(ghost);
      ghost.moveToTop();
      this.drawingLayer.batchDraw();
      return;
    }

    // Chord from the anchor boundary to the end boundary (axis-aligned trim).
    const dx = endCenter.x - aCenter.x, dy = endCenter.y - aCenter.y;
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const trimA = Math.min(anchor.NODE_WIDTH, anchor.NODE_HEIGHT) / 2;
    const trimB = Math.min(endHalf.w * 2, endHalf.h * 2) / 2;
    const start = {x: aCenter.x + ux * trimA, y: aCenter.y + uy * trimA};
    const end = {x: endCenter.x - ux * trimB, y: endCenter.y - uy * trimB};
    const d = this.growDirState;
    ghost.add(new Konva.Arrow({
      points: [start.x, start.y, end.x, end.y],
      stroke, fill: stroke, dash: [8, 6],
      strokeWidth: 3 / scale,
      pointerLength: 14, pointerWidth: 14,
      pointerAtEnding: d === 0 || d === 3,
      pointerAtBeginning: d === 1 || d === 3,
    }));

    this.drawingLayer.add(ghost);
    ghost.moveToTop();
    this.drawingLayer.batchDraw();
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
      this.singleItemSelect();
      this.crosshairsLayer.hideCrosshairs();
      this.showEditCarets(cursorPoint);
      this.drawingLayer.batchDraw();
      this.daOut.emit({kind: 'started-label-editing-mode', mode: 'vimNormal'});
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
    this.undoRedoService.pushSnapshot(this.drawingLayer.serializeGraph());
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
      this.clearLabelEditGhost();
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
      this.clearLabelEditGhost();
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
      this.beginAreaSelect();
    }
  }

  /** Anything the select+drag gesture could act on, same hit priority as
   *  ensureTopItemSelected: label → waypoint → node → edge. */
  private hasItemUnderCrosshairs(): boolean {
    return !!this.getLabelUnderCrosshairs() ||
      !!this.getWaypointUnderCrosshairs() ||
      this.getDANodesContainingCrosshairs().length > 0 ||
      this.getDAEdgesContainingCrosshairs().length > 0;
  }

  // ---------------------------------------------------------------------
  // Area select (da-195): keyboard rubber band from a held v over empty
  // canvas. Anchor in drawing-layer coordinates; marquee drawn in stage
  // coordinates on the crosshairs layer so pan/zoom mid-gesture stays true.
  // ---------------------------------------------------------------------

  private areaSelectActive = false;
  private areaSelectAnchor: {x: number; y: number} | null = null;
  private areaSelectMarquee: Konva.Rect | null = null;
  /** Items this marquee selected — shrinking the box releases exactly these,
   *  never a selection the user had before the gesture. */
  private areaSelectCaptured = new Set<DANode | DAEdge | DAWaypoint | DALabel>();

  private beginAreaSelect(): void {
    this.finishTweens();
    this.areaSelectActive = true;
    this.areaSelectAnchor = this.crosshairsInLayerCoords();
    this.areaSelectCaptured.clear();
    this.refreshAreaSelectMarquee();
  }

  private areaSelectStep(axis: 'x' | 'y', sign: 1 | -1, tier?: GridTier): void {
    if (!this.areaSelectActive || !this.areaSelectAnchor) return;
    const effectiveTier = tier ?? 'normal';
    const distance = this.movementDistanceForTier(
      effectiveTier,
      this.drawingLayer.getSubGridSpacing(),
      this.drawingLayer.getGridSpacing(),
    ) * this.drawingLayer.scaleX();
    const edgeMargin = 60;
    const lo = (axis === 'x' ? this.viewMinX() : this.viewMinY()) + edgeMargin;
    const hi = (axis === 'x' ? this.viewMaxX() : this.viewMaxY()) - edgeMargin;
    const current = axis === 'x'
      ? this.crosshairsLayer.crosshairs.x
      : this.crosshairsLayer.crosshairs.y;
    const target = current + sign * distance;
    const clamped = Math.min(Math.max(target, lo), hi);
    const overflow = target - clamped;
    if (axis === 'x') {
      this.crosshairsLayer.crosshairs.x = clamped;
      if (overflow !== 0) this.drawingLayer.x(this.drawingLayer.x() - overflow);
    } else {
      this.crosshairsLayer.crosshairs.y = clamped;
      if (overflow !== 0) this.drawingLayer.y(this.drawingLayer.y() - overflow);
    }
    this.updateAreaSelection();
    this.refreshAreaSelectMarquee();
  }

  /** Marquee corners in drawing-layer coordinates. */
  private areaSelectRect(): {minX: number; minY: number; maxX: number; maxY: number} | null {
    if (!this.areaSelectAnchor) return null;
    const c = this.crosshairsInLayerCoords();
    return {
      minX: Math.min(this.areaSelectAnchor.x, c.x),
      minY: Math.min(this.areaSelectAnchor.y, c.y),
      maxX: Math.max(this.areaSelectAnchor.x, c.x),
      maxY: Math.max(this.areaSelectAnchor.y, c.y),
    };
  }

  private updateAreaSelection(): void {
    const rect = this.areaSelectRect();
    if (!rect) return;
    const boxHits = (x: number, y: number, w: number, h: number) =>
      x < rect.maxX && x + w > rect.minX && y < rect.maxY && y + h > rect.minY;
    const inside = new Set<DANode | DAEdge | DAWaypoint | DALabel>();

    for (const node of this.drawingLayer.getDANodes()) {
      if (node.nodeShape === 'invisible') continue;
      if (boxHits(node.group.x(), node.group.y(), node.NODE_WIDTH, node.NODE_HEIGHT)) {
        inside.add(node);
      }
    }
    for (const edge of this.drawingLayer.getDAEdges()) {
      for (const label of edge.labels) {
        if (boxHits(label.x, label.y, label.width, label.height)) inside.add(label);
      }
      for (const wp of edge.waypoints) {
        if (wp.x >= rect.minX && wp.x <= rect.maxX &&
            wp.y >= rect.minY && wp.y <= rect.maxY) {
          inside.add(wp);
        }
      }
      const path = edge.getRenderedPathPoints();
      for (let i = 0; i < path.length - 1; i++) {
        if (lineSegmentIntersectsRect(
          path[i].x, path[i].y, path[i + 1].x, path[i + 1].y,
          rect.minX, rect.minY, rect.maxX, rect.maxY,
        )) {
          inside.add(edge);
          break;
        }
      }
    }

    for (const item of inside) {
      if (!item.isSelected) {
        item.isSelected = true;
        this.areaSelectCaptured.add(item);
      }
    }
    for (const item of [...this.areaSelectCaptured]) {
      if (!inside.has(item)) {
        item.isSelected = false;
        this.areaSelectCaptured.delete(item);
      }
    }
    this.drawingLayer.batchDraw();
  }

  private refreshAreaSelectMarquee(): void {
    const rect = this.areaSelectRect();
    if (!rect) return;
    const scale = this.drawingLayer.scaleX();
    const stage = {
      x: this.drawingLayer.x() + rect.minX * scale,
      y: this.drawingLayer.y() + rect.minY * scale,
      width: (rect.maxX - rect.minX) * scale,
      height: (rect.maxY - rect.minY) * scale,
    };
    const palette = this.visualConfigService.getEffectivePalette(this.themeService.theme);
    if (!this.areaSelectMarquee) {
      this.areaSelectMarquee = new Konva.Rect({
        name: 'area-select-marquee',
        stroke: palette.crosshairsStroke,
        strokeWidth: 1.5,
        dash: [6, 4],
        fill: palette.crosshairsStroke + '22',
        listening: false,
      });
      this.crosshairsLayer.add(this.areaSelectMarquee);
    }
    this.areaSelectMarquee.setAttrs(stage);
    this.areaSelectMarquee.moveToTop();
    this.crosshairsLayer.batchDraw();
  }

  private finalizeAreaSelect(): void {
    this.areaSelectActive = false;
    this.areaSelectAnchor = null;
    this.areaSelectCaptured.clear();
    this.areaSelectMarquee?.destroy();
    this.areaSelectMarquee = null;
    this.crosshairsLayer?.batchDraw();
    this.checkAndEmitEditState();
  }

  private hasDragSelection(): boolean {
    return this.drawingLayer.getSelectedDANodes().length > 0 ||
      this.drawingLayer.getSelectedDAWaypoints().length > 0 ||
      this.drawingLayer.getSelectedDAEdges().length > 0 ||
      this.getSelectedLabels().length > 0;
  }

  private exitDragMode() {
    if (this.areaSelectActive) {
      // Release keeps whatever the marquee gathered; the quick-tap toggle
      // below must not fire for an area-select gesture.
      this.finalizeAreaSelect();
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

    // Selection first, then whatever the crosshairs are over — the same
    // priority copy/cut (da-272) and the shape commands use. Without the
    // fallback the natural gesture (hover a node, pick a colour) either did
    // nothing or, worse, recoloured a stale selection somewhere off-screen;
    // a thin edge restyled at 50% zoom reads as "nothing happened".
    let nodes = this.drawingLayer.getSelectedDANodes();
    let edges = this.drawingLayer.getSelectedDAEdges();

    if (nodes.length === 0 && edges.length === 0) {
      const hoveredNodes = this.getDANodesContainingCrosshairs();
      if (hoveredNodes.length > 0) {
        nodes = [hoveredNodes.reduce((a, b) => a.zIndex() > b.zIndex() ? a : b)];
      } else {
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

  private lineSegmentIntersectsBox(p1: {x: number; y: number}, p2: {x: number; y: number}, box: {minX: number; minY: number; maxX: number; maxY: number}): boolean {
    return lineSegmentIntersectsRect(p1.x, p1.y, p2.x, p2.y, box.minX, box.minY, box.maxX, box.maxY);
  }

}
