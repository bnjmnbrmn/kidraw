/**
 * Grow mode: the held add key over a node or empty canvas
 * (notes/design-add-insert-model.md).
 *
 * While the key is held, this owns the keyboard: the keymenu is suspended
 * (popup-state) and keys arrive through the drawing area's document-level
 * listeners, because the target search and type popups must be able to open
 * mid-hold without flushing the state here. Aiming walks the placement
 * lattice and the real nodes beyond it; releasing commits an edge to a node,
 * a new linked node on a spot, or (untouched) the tap's self-loop. `o` cycles
 * the direction, `/` searches for a target, `f` picks a node type and then
 * places it freely (grow-placement.ts), `s` opens the edge kinds.
 *
 * It also owns the popup those flows use (nav-popup.component.ts), which had
 * no other client once graph navigation's was retired on 2026-09-24.
 *
 * Moved out of drawing-area.component.ts on 2026-09-24, its code moved and
 * not rewritten; the state lost its `grow` prefix on the way
 * (`growTarget` → `grow.target`).
 */
import type Konva from 'konva';
import { DACommand, DACommandType, NodeShape } from './command.model';
import type { CommandSlice } from './command-handlers';
import type { Camera } from './camera';
import type { DAEdge } from './da-edge';
import type { DALabel } from './da-label';
import type { DANode } from './da-node';
import type { DAWaypoint } from './da-waypoint';
import type { KeyboardSurface } from './da-notification.model';
import type { DrawingLayer } from './drawing.layer';
import { buildGrowGhostTargets, GrowGhostNodeCenter, GrowGhostTarget } from './grow-ghost-targets';
import { GrowAim, GrowGhost } from './grow-ghost';
import { HopDirection, planGrowHop } from './grow-lattice';
import { GrowPlacement, GrowPlacementDirection } from './grow-placement';
import type { NavigationGridController } from './navigation-grid-controller';
import { placePopup, popupSize } from './nav-popup-layout';
import type { PopupRow } from '../nav-popup/nav-popup.component';
import { DEFAULT_BOX_SIZE, PlacementAxis, quickAddSpacing } from './quick-add-spacing';
import type { StyleController } from './style-controller';
import { Point, topmost } from './utils';
import type { Viewport } from './viewport';

/** The keys of the held gesture, from the profile (ENTER_ADD_MODE). */
export interface GrowKeys {
  up: string; left: string; down: string; right: string;
  cycle: string; newNode: string; search: string;
  coarse: string; fine: string; edgeSubmenu: string; selfLoop: string;
}

/** What grow mode needs from the drawing area. */
export interface GrowHost {
  readonly drawingLayer: DrawingLayer;
  readonly stage: Konva.Stage;
  readonly camera: Camera;
  readonly viewport: Viewport;
  readonly navGrid: NavigationGridController;
  readonly style: StyleController;
  /** The node outline colour the preview is drawn in. */
  readonly ghostStroke: string;
  readonly dark: boolean;
  nodesUnderCrosshairs(): DANode[];
  labelUnderCrosshairs(): DALabel | null;
  edgesUnderCrosshairs(): DAEdge[];
  waypointUnderCrosshairs(): DAWaypoint | undefined;
  crosshairsInLayerCoords(): Point;
  nodeCenter(node: DANode): Point;
  finishTweens(): void;
  emitStatus(message: string): void;
  /** Suspend the keymenu on `surface`, or (null) give the keyboard back. */
  emitPopupState(surface: KeyboardSurface | null): void;
  pushUndoSnapshot(command: DACommand): void;
  pushSnapshot(): void;
  scheduleVaultAutoSave(): void;
  checkAndEmitEditState(): void;
  unselectAllLabels(): void;
  autoRouteNewEdge(edge: DAEdge): void;
  restCrosshairsOn(node: DANode): void;
  /** The tap of the add key, for a release on empty canvas. */
  handleQuickAdd(): void;
  quickAddSelfLoop(anchor: DANode, dirState: number): void;
  /** A node just landed: open its label, or settle it if it has none. */
  settleNewNode(node: DANode, arrivedByLink: boolean): void;
}

/** The popup's inputs, bound by the drawing area's template. */
export interface GrowPopup {
  open: boolean;
  /** The target search (`/`) or the node types (`f`). */
  purpose: 'grow-target' | 'grow-type' | null;
  rows: PopupRow[];
  left: number;
  top: number;
  dark: boolean;
  /** The key that opened it, while still held: releasing it chooses. */
  holdKey: string | null;
  startFilter: boolean;
  /** The profile's up and down keys, for browsing the list. */
  listKeys: {up: string; down: string};
}

export class GrowController {
  active = false;
  anchor: DANode | null = null;
  /** Start point for an empty-canvas add, in drawing-layer coordinates. */
  origin: Point | null = null;
  /** Existing-node landing selected through the Move-by-Node engine. */
  target: DANode | null = null;
  /** Empty insertion landing selected through the same navigation engine. */
  insertionTarget: GrowGhostTarget | null = null;
  /** All midpoint and source-grid insertion stops for this Add hold. */
  ghostTargets: GrowGhostTarget[] = [];
  /** 0: anchor→target, 1: target→anchor, 2: undirected, 3: bidirectional. */
  dirState = 0;
  holdKey = 'a';
  keys: GrowKeys | null = null;
  edgeMenuActive = false;
  selfLoopPending = false;
  /** Edge kinds are a small sticky choice surface: once opened, releasing the
   *  Add hold does not discard it before the user can press its leaf key. */
  holdReleased = false;
  /** Physical keys held during grow mode. This makes nested add chords
   *  tolerant of normal human key overlap instead of turning a rolled Self
   *  Loop into a rightward edge hop. */
  readonly pressedKeys = new Set<string>();
  /** Free placement after the type popup picked a kind for a new node. */
  readonly placement: GrowPlacement;
  /** The held-Add preview (grow-ghost.ts). */
  readonly ghost: GrowGhost;
  readonly popup: GrowPopup = {
    open: false, purpose: null, rows: [], left: 0, top: 0, dark: false,
    holdKey: null, startFilter: false, listKeys: {up: 'k', down: 'j'},
  };

  constructor(private readonly host: GrowHost) {
    const grow = this;
    this.ghost = new GrowGhost({
      get drawingLayer() { return host.drawingLayer; },
      get stroke() { return host.ghostStroke; },
    });
    this.placement = new GrowPlacement({
      get anchor() { return grow.anchor; },
      get origin() { return grow.origin!; },
      spacing: axis => grow.spacingFrom(axis),
      coarseModifierHeld: () => grow.placement.modifiers.has(grow.keys?.coarse ?? 'coarse'),
      fineModifierHeld: () => grow.placement.modifiers.has(grow.keys?.fine ?? 'fine'),
      redraw: () => grow.redrawGhost(),
    });
  }

  commands() {
    return {
      [DACommandType.ENTER_ADD_MODE]: c => this.enter(c.holdKey, c.keys),
    } satisfies CommandSlice;
  }

  /** ENTER_ADD_MODE: take the hold as grow mode over a node or genuinely
   *  empty canvas. Edges/labels retain the classic label/waypoint hub. */
  enter(holdKey: string, keys: GrowKeys): void {
    const nodes = this.host.nodesUnderCrosshairs();
    const hasLabel = !!this.host.labelUnderCrosshairs();
    const hasEdge = this.host.edgesUnderCrosshairs().length > 0;
    const hasWaypoint = !!this.host.waypointUnderCrosshairs();
    if (hasLabel || (nodes.length === 0 && (hasEdge || hasWaypoint))) return;
    this.host.finishTweens();
    this.active = true;
    this.anchor = topmost(nodes);
    this.origin = this.anchor
      ? this.host.nodeCenter(this.anchor)
      : this.host.crosshairsInLayerCoords();
    this.target = null;
    this.insertionTarget = null;
    this.ghostTargets = this.anchor
      ? this.buildGhostTargets(this.anchor)
      : [];
    this.dirState = this.defaultDirection();
    this.placement.placing = false;
    this.placement.shape = undefined;
    this.placement.position = null;
    this.placement.rough = false;
    this.placement.modifiers.clear();
    this.edgeMenuActive = false;
    this.selfLoopPending = false;
    this.holdReleased = false;
    this.holdKey = holdKey;
    this.keys = keys;
    this.host.emitPopupState(this.anchor ? 'grow-targeting' : 'grow-empty');
    if (this.anchor) this.host.navGrid.showNodeGrid('nodes');
    this.redrawGhost();
  }

  private buildGhostTargets(anchor: DANode): GrowGhostTarget[] {
    const layer = this.host.drawingLayer;
    const scale = layer.scaleX();
    const lx = layer.x();
    const ly = layer.y();
    const nodes = this.nodeBoxes();
    const source = nodes.find(node => node.id === anchor.id)!;
    const bounds = {
      minX: -lx / scale,
      minY: -ly / scale,
      maxX: (this.host.stage.width() - lx) / scale,
      maxY: (this.host.stage.height() - ly) / scale,
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
      this.latticeStep(anchor),
      this.anchorHalf(anchor),
    );
  }

  keyDown(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();
    if (!this.active || !this.keys) return;
    this.pressedKeys.add(key);
    if (this.popup.open) return; // the popup owns the keyboard (sticky phase)
    if (event.repeat && key === this.holdKey) return;
    const k = this.keys;
    const dir = key === k.left ? 'left' : key === k.right ? 'right'
      : key === k.up ? 'up' : key === k.down ? 'down' : null;
    if (this.edgeMenuActive) {
      if (key === k.selfLoop) {
        event.preventDefault();
        this.selfLoopPending = true;
      } else if (key === 'escape') {
        event.preventDefault();
        if (this.holdReleased) {
          this.exit();
          this.host.emitStatus('Add canceled');
          return;
        }
        this.edgeMenuActive = false;
        this.selfLoopPending = false;
        this.host.emitPopupState('grow-targeting');
        this.host.navGrid.showNodeGrid('nodes');
        this.redrawGhost();
      }
      return;
    }
    if (!this.placement.placing && key === k.edgeSubmenu) {
      event.preventDefault();
      this.openEdgeMenu();
      return;
    }
    if (key === k.cycle) {
      if (!this.anchor) return;
      event.preventDefault();
      this.dirState = (this.dirState + 1) % 4;
      this.redrawGhost();
      return;
    }
    if (key === 'escape') {
      this.exit();
      this.host.emitStatus('Add canceled');
      return;
    }
    if (this.placement.placing) {
      if (dir) {
        event.preventDefault();
        this.placeMove(dir);
        return;
      }
      if (key === k.coarse || key === k.fine) {
        this.placement.addModifier(key);
        return;
      }
      if (key === 'enter') {
        // Sticky commit: the hold key was released during the type popup.
        event.preventDefault();
        this.commitPlacement();
      }
      return;
    }
    if (dir) {
      if (!this.anchor) return;
      event.preventDefault();
      this.hop(dir);
      return;
    }
    if (key === k.search) {
      if (!this.anchor) return;
      event.preventDefault();
      this.openTargetPopup();
      return;
    }
    if (key === k.newNode) {
      event.preventDefault();
      this.openTypePopup();
    }
  }

  keyUp(event: KeyboardEvent): void {
    const key = event.key.toLowerCase();
    this.pressedKeys.delete(key);
    if (!this.active) return;
    this.placement.removeModifier(key);
    if (this.edgeMenuActive && this.selfLoopPending && key === this.keys?.selfLoop) {
      this.selfLoopPending = false;
      this.commitSelfLoop();
      return;
    }
    // Sticky phase: with a popup open the hold key is expected to be
    // released (typing needs both hands) — Enter/Esc resolve the flow.
    if (this.popup.open) return;
    if (key !== this.holdKey) return;
    if (this.edgeMenuActive) {
      this.holdReleased = true;
      this.host.emitStatus('Choose an edge kind, or Esc to cancel');
      return;
    }
    if (this.placement.placing) {
      this.commitPlacement();
      return;
    }
    this.commit();
  }

  private openEdgeMenu(): void {
    if (!this.active || !this.keys ||
        this.placement.placing || this.edgeMenuActive) return;
    if (!this.anchor) {
      const selected = this.host.drawingLayer.getSelectedDANodes();
      if (selected.length !== 1) {
        this.host.emitStatus('⚠ Edge kind needs one node under the crosshairs or selected');
        return;
      }
      this.anchor = selected[0];
      this.origin = this.host.nodeCenter(this.anchor);
      this.ghostTargets = this.buildGhostTargets(this.anchor);
    }
    this.edgeMenuActive = true;
    // If the leaf key arrived just before its submenu key, remember that
    // overlap and commit when the leaf is released.
    this.selfLoopPending = this.pressedKeys.has(this.keys.selfLoop);
    this.ghost.clear(false);
    this.host.navGrid.hideNodeGrid();
    this.host.drawingLayer.batchDraw();
    this.host.emitPopupState('grow-edge');
  }

  /** Choose a real-node or insertion-ghost target through the actual Move by
   *  Node engine. The augmented node tier shares its selected strategy,
   *  overlay, crosshair landing, viewport panning, same-direction run, and
   *  turn re-origin semantics. */
  private hop(direction: HopDirection): void {
    if (!this.anchor) return;
    if (this.hopOnLattice(direction)) return;
    // The crosshairs ride the candidate: Move-by-Node moves them to whatever
    // the hop landed on, and that is the thing being aimed. Pinning them to
    // the anchor instead (da-448) made the pin itself the problem — "it seems
    // to bounce back to the originating node" — so da-551 puts them back on
    // the selection.
    const navGrid = this.host.navGrid;
    navGrid.snapToNodeInDirection(direction, 'nodes');
    const last = navGrid.lastStop;
    if (!last || last.kind !== 'node') return;
    const target = this.nodeById(last.id);
    const insertion = this.ghostTargets.find(item => item.id === last.id) ?? null;
    if (!target && !insertion) return;
    this.target = target;
    this.insertionTarget = insertion;
    this.redrawGhost();
  }

  /**
   * A hop between placement spots is a step on the lattice (grow-lattice.ts).
   *
   * Returns whether the lattice handled it. It does not when the press walks
   * off the end, and the caller falls through to Move by Node, which knows
   * about the real nodes beyond.
   */
  private hopOnLattice(direction: HopDirection): boolean {
    const anchorCentre = this.origin;
    if (!anchorCentre) return false;
    const hop = planGrowHop({
      direction,
      fromTargetId: this.insertionTarget?.id ?? null,
      fromNodeCentre: this.target ? this.host.nodeCenter(this.target) : null,
      anchorCentre,
      step: this.latticeStep(),
      targets: this.ghostTargets,
      nodes: this.nodeBoxes(node => node !== this.anchor),
      newNodeHalf: this.anchorHalf(),
    });
    if (!hop) return false;
    this.landAim(hop.kind === 'cell' ? hop.target : this.nodeById(hop.id)!);
    return true;
  }

  /** Every node as a plain box, for the Konva-free placement modules. */
  private nodeBoxes(keep: (node: DANode) => boolean = () => true): GrowGhostNodeCenter[] {
    return this.host.drawingLayer.getDANodes().filter(keep).map(node => ({
      id: node.id,
      ...this.host.nodeCenter(node),
      halfW: node.NODE_WIDTH / 2,
      halfH: node.NODE_HEIGHT / 2,
    }));
  }

  /** The anchor's own box stands in for the node a spot would create — it is
   *  also what the placement ghost is drawn at, so what the lattice refuses is
   *  exactly what you would have seen land on something (da-510). */
  private anchorHalf(anchor: DANode | null = this.anchor): {w: number; h: number} {
    return {
      w: (anchor?.NODE_WIDTH ?? DEFAULT_BOX_SIZE) / 2,
      h: (anchor?.NODE_HEIGHT ?? DEFAULT_BOX_SIZE) / 2,
    };
  }

  private nodeById(id: string): DANode | null {
    return this.host.drawingLayer.getDANodes().find(node => node.id === id) ?? null;
  }

  /** Put the aim on a spot or a node: the ghost follows, the crosshairs ride
   *  it, and Move by Node's memory is kept in step so a later hop off the
   *  lattice carries on from what the reader is looking at. */
  private landAim(aim: GrowGhostTarget | DANode): void {
    this.host.finishTweens();
    const ghost = 'source' in aim ? aim : null;
    const node = ghost ? null : aim as DANode;
    this.target = node;
    this.insertionTarget = ghost;
    // The lattice of spots *is* the overlay while the aim is on it; the bands
    // and rings the engine draws describe a decision that is not being made.
    const navGrid = this.host.navGrid;
    navGrid.hideNodeGrid();
    navGrid.hideQuadrantGoalRay();
    navGrid.adoptStop({id: ghost ? ghost.id : node!.id, kind: 'node'});
    const centre = ghost ? {x: ghost.x, y: ghost.y} : this.host.nodeCenter(node!);
    const layer = this.host.drawingLayer;
    const scale = layer.scaleX();
    navGrid.jumpCrosshairsToStopCenter({
      x: layer.x() + centre.x * scale,
      y: layer.y() + centre.y * scale,
    });
    this.redrawGhost();
  }

  // ── The popup ──

  /** `/` in grow mode: fuzzy-search the target by label (sticky phase —
   *  the hold key is naturally released to type; Enter commits the edge,
   *  Esc backs out to the list then cancels the whole add). */
  private openTargetPopup(): void {
    const anchor = this.anchor!;
    const rows = this.host.drawingLayer.getDANodes()
      .filter(n => n !== anchor)
      .map(n => ({
        id: n.id,
        title: n.label.text() || n.nodeShape,
        tags: n.tags.length > 0 ? n.tags : undefined,
      }));
    if (rows.length === 0) {
      this.host.emitStatus('⚠ No other nodes to connect to');
      return;
    }
    this.openPopup('grow-target', rows, {startFilter: true, holdKey: null});
    this.host.emitPopupState('grow-target-popup');
  }

  /** `f` in grow mode: the node-type popup (v1 list = the raw shapes; the
   *  plugin node-kinds slot slots in here later). Held-f rhythm: browse
   *  with j/k while f is down, releasing f selects (the popup's holdKey
   *  machinery); Enter also selects. */
  private openTypePopup(): void {
    this.openPopup('grow-type', [
      {id: 'box',       title: 'Box'},
      {id: 'circle',    title: 'Circle'},
      {id: 'diamond',   title: 'Diamond'},
      {id: 'junction',  title: 'Junction'},
      {id: 'invisible', title: 'Invisible'},
    ], {startFilter: false, holdKey: this.keys?.newNode ?? 'f'});
    this.host.emitPopupState('grow-type-popup');
  }

  private openPopup(purpose: GrowPopup['purpose'], rows: PopupRow[],
                    how: {startFilter: boolean; holdKey: string | null}): void {
    this.host.navGrid.hideNodeGrid();
    Object.assign(this.popup, {purpose, rows, ...how, dark: this.host.dark});
    if (this.keys) this.popup.listKeys = {up: this.keys.up, down: this.keys.down};
    this.positionPopup();
    this.popup.open = true;
  }

  /** Beside the anchor node, east unless clamped. */
  private positionPopup(): void {
    const layer = this.host.drawingLayer;
    const scale = layer.scaleX();
    const n = this.anchor;
    const origin = this.origin!;
    const rect = n ? {
      x: layer.x() + n.group.x() * scale,
      y: layer.y() + n.group.y() * scale,
      w: n.NODE_WIDTH * scale,
    } : {
      x: layer.x() + origin.x * scale,
      y: layer.y() + origin.y * scale,
      w: 0,
    };
    const {minX, maxX, minY, maxY} = this.host.viewport;
    const position = placePopup(rect, {minX, maxX, minY, maxY}, popupSize(this.popup.rows.length), 'right');
    this.popup.left = position.left;
    this.popup.top = position.top;
  }

  /** Selection moved in the popup: in the target search, the ghost edge
   *  follows the highlighted node. */
  onPopupHighlight(nodeId: string): void {
    if (this.popup.purpose !== 'grow-target') return;
    const node = this.nodeById(nodeId);
    if (node && node !== this.anchor) {
      this.target = node;
      this.redrawGhost();
    }
  }

  onPopupCommit(event: {id: string}): void {
    if (this.popup.purpose === 'grow-target') this.commitToNodeId(event.id);
    else if (this.popup.purpose === 'grow-type') this.enterPlacement(event.id);
  }

  /** Escape / backdrop: a grow popup closing cancels the whole add. */
  onPopupClosed(): void {
    this.closePopup();
    this.exit();
    this.host.emitStatus('Add canceled');
  }

  private closePopup(): void {
    this.popup.open = false;
    this.popup.purpose = null;
  }

  // ── Where a new node goes ──

  /** The cell of the held-Add lattice: the placement spacing on each axis,
   *  rounded up to a whole major grid cell so every candidate spot sits a whole
   *  number of coarse squares from the anchor. */
  latticeStep(anchor: DANode | null = this.anchor): Point {
    const cell = Math.max(1, this.host.drawingLayer.getGridSpacing());
    const onGrid = (spacing: number) => Math.max(cell, Math.ceil(spacing / cell) * cell);
    return {
      x: onGrid(this.spacingFrom('x', anchor)),
      y: onGrid(this.spacingFrom('y', anchor)),
    };
  }

  /** Centre-to-centre distance for a node placed beside `anchor` along `axis`.
   *  Measures the two boxes involved and hands them to the spacing rule. */
  private spacingFrom(axis: PlacementAxis, anchor: DANode | null = this.anchor): number {
    const fresh = this.host.drawingLayer?.newNodeDefaultSize?.()
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
  private enterPlacement(shapeId: string): void {
    this.closePopup();
    this.placement.enter(shapeId as NodeShape);
    this.target = null;
    this.insertionTarget = null;
    this.host.emitPopupState('grow-placement');
    this.redrawGhost();
  }

  /** Placement steering. Rough first (a full spacing thrown in the pressed
   *  direction, replacing the below default), grid steps after; `s`/`d` tier
   *  chords scale the step (coarse = a full spacing, fine = a tenth-grid). */
  placeMove(direction: GrowPlacementDirection): void {
    this.placement.move(direction);
  }

  // ── Committing ──

  private commitPlacement(): void {
    const anchor = this.anchor;
    const dirState = this.dirState;
    const shape = this.placement.shape;
    const pos = this.placement.position!;
    this.exit();
    this.addNodeAt(pos, shape, anchor, dirState);
  }

  /** Popup commit for the grow-target search: wire the edge right away
   *  (sticky semantics — Enter is the commit gesture once the popup owns
   *  the flow). */
  private commitToNodeId(nodeId: string): void {
    const anchor = this.anchor!;
    const dirState = this.dirState;
    const target = this.nodeById(nodeId);
    this.closePopup();
    this.exit();
    if (!target || target === anchor) return;
    this.commitEdgeTo(anchor, target, dirState);
  }

  /** Wire the grow edge and rest the crosshairs on the target. Shared by every
   *  way of choosing an existing node as the target: walking the ghosts with
   *  hjkl, and the `/` search popup. Only the old select-then-connect path
   *  did this before (`249e6e0`) — held-Add, which is how a link actually
   *  gets drawn, was left out (2026-08-29). */
  private commitEdgeTo(anchor: DANode, target: DANode, dirState: number): void {
    this.host.finishTweens();
    this.host.pushSnapshot();
    this.wireEdge(anchor, target, dirState);
    this.host.drawingLayer.batchDraw();
    this.host.restCrosshairsOn(target);
    this.host.checkAndEmitEditState();
    this.host.scheduleVaultAutoSave();
    this.host.emitStatus(`Edge added: ${edgeDescription(anchor, target, dirState)}`);
  }

  commit(): void {
    const anchor = this.anchor;
    const target = this.target;
    const insertion = this.insertionTarget;
    const dirState = this.dirState;
    this.exit();

    if (!anchor) {
      // A plain tap on empty canvas keeps the established quick-add behavior.
      this.host.handleQuickAdd();
      return;
    }
    if (insertion) {
      this.addNodeAt(insertion, this.host.style.defaults.nodeShape, anchor, dirState);
      return;
    }
    if (target === null) {
      // A press and release without navigation is the node-context tap:
      // add an edge from the source back to itself.
      this.host.quickAddSelfLoop(anchor, dirState);
      return;
    }
    if (target === anchor) return; // came home to cancel

    this.commitEdgeTo(anchor, target, dirState);
  }

  commitSelfLoop(): void {
    const anchor = this.anchor;
    const dirState = this.dirState;
    this.exit();
    if (!anchor) return;
    this.host.quickAddSelfLoop(anchor, dirState);
  }

  /** A new node at a layer point — a lattice spot, or where placement put it —
   *  linked from `anchor` if there is one, and straight into its label. */
  private addNodeAt(at: Point, shape: NodeShape | undefined, anchor: DANode | null, dirState: number): void {
    this.host.finishTweens();
    this.host.pushUndoSnapshot({kind: DACommandType.QUICK_ADD});
    this.host.drawingLayer.unselectAll();
    this.host.unselectAllLabels();
    const stage = this.host.camera.toStage(at);
    const newNode = this.host.drawingLayer.createNewNode(stage.x, stage.y, shape);
    if (anchor) this.wireEdge(anchor, newNode, dirState);
    this.host.settleNewNode(newNode, !!anchor);
    this.host.scheduleVaultAutoSave();
  }

  /** Directionality state used when a grow/add gesture begins. The default
   *  directed state is always outgoing from the anchor; explicit user
   *  defaults (undirected/bidirectional) are still respected. */
  private defaultDirection(): number {
    switch (this.host.style.defaults.edgeDirectedness) {
      case 'undirected': return 2;
      case 'bidirectional': return 3;
      default: return 0;
    }
  }

  /** Create the edge for a grow commit per the directionality state. */
  wireEdge(anchor: DANode, target: DANode, dirState: number): DAEdge {
    const src = dirState === 1 ? target : anchor;
    const dest = dirState === 1 ? anchor : target;
    const edge = this.host.drawingLayer.addEdge(src, dest);
    edge.directedness = dirState === 2 ? 'undirected'
      : dirState === 3 ? 'bidirectional' : 'directed';
    edge.lineStyle = this.host.style.defaults.lineStyle;
    this.host.autoRouteNewEdge(edge);
    return edge;
  }

  exit(): void {
    this.active = false;
    this.edgeMenuActive = false;
    this.selfLoopPending = false;
    this.holdReleased = false;
    this.pressedKeys.clear();
    this.ghost.clear(false);
    this.origin = null;
    this.target = null;
    this.insertionTarget = null;
    this.ghostTargets = [];
    this.host.navGrid.hideNodeGrid();
    this.host.emitPopupState(null);
    this.host.drawingLayer.batchDraw();
  }

  // ── What Move by Node and the preview read ──

  /** The spots Move by Node may land on while aiming, in layer coordinates. */
  aimableSpots(): readonly GrowGhostTarget[] {
    return this.active && this.anchor && !this.placement.placing && !this.edgeMenuActive
      ? this.ghostTargets : [];
  }

  /** A spot of this hold by id, while it lasts. */
  spot(id: string): GrowGhostTarget | undefined {
    return this.active ? this.ghostTargets.find(target => target.id === id) : undefined;
  }

  /** The dashed preview of what the held Add key is about to create
   *  (grow-ghost.ts). Rebuilt from scratch on every aim change. */
  redrawGhost(): void {
    this.ghost.show(this.aim());
  }

  /** The fields of grow state the preview draws from, and no others. */
  private aim(): GrowAim {
    const style = this.host.style;
    return {
      anchor: this.anchor,
      origin: this.origin!,
      placing: this.placement.placing,
      placePos: this.placement.position,
      newNodeShape: this.placement.shape ?? style.effectiveNodeShape(),
      slotShape: style.effectiveNodeShape(),
      target: this.target,
      insertionTarget: this.insertionTarget,
      targets: this.ghostTargets,
      dirState: this.dirState,
    };
  }
}

function edgeDescription(anchor: DANode, target: DANode, dirState: number): string {
  const a = anchor.label.text() || anchor.nodeShape;
  const t = target.label.text() || target.nodeShape;
  switch (dirState) {
    case 1: return `${t} → ${a}`;
    case 2: return `${a} — ${t}`;
    case 3: return `${a} ↔ ${t}`;
    default: return `${a} → ${t}`;
  }
}
