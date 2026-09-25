/**
 * A text edit, from opening to closing: which text the edit key opens and in
 * which vim mode, the carets, the camera that keeps the caret readable, and
 * what closing the edit leaves behind.
 *
 * Opening. The edit key over a node or label opens it in vim normal with the
 * caret where the crosshairs are; over a bare edge it adds a label and opens
 * that in insert (notes/design-label-edit-targeting.md). A node just added is
 * opened in insert by `beginForNewNode`, straight away for a tap and when the
 * add key is released for a hold (`pendingNode`).
 *
 * While typing. The view zooms to at least natural size around the node, and
 * pans to keep the caret away from the edges. Zoomed further out, a
 * screen-space copy of the node (the lens) keeps its text readable.
 *
 * Closing. Every caret goes, an empty label is dropped, the selection is
 * cleared, and the crosshairs come back on what was edited.
 *
 * What the text becomes, and the caret's motions, are TextEditingController's.
 */
import Konva from 'konva';
import { DACommandType, TextCursorMode } from './command.model';
import type { DACommand } from './command.model';
import type { CommandSlice } from './command-handlers';
import type { CrosshairsLayer } from './crosshairs.layer';
import type { DAEdge } from './da-edge';
import type { DALabel } from './da-label';
import type { DANode } from './da-node';
import type { DANotification } from './da-notification.model';
import type { DrawingLayer } from './drawing.layer';
import { caretVisibilityPanDelta } from './edit-viewport';
import { Overlay } from './overlay';
import type { TextEditingController } from './text-editing-controller';
import type { Point } from './utils';
import type { Viewport } from './viewport';

/** Where the camera goes when a label is opened for editing: natural size,
 *  so the text is readable without losing the graph around it. A closer view
 *  is kept. (Was 400%, which Ben found too close, 2026-09-19.) */
const EDIT_ZOOM = 1;
/** Below this zoom the edited node gets a readable copy (the lens). */
const LENS_BELOW_ZOOM = 1;

/** What a text edit needs from the drawing area. */
export interface LabelEditHost {
  readonly drawingLayer: DrawingLayer;
  readonly crosshairsLayer: CrosshairsLayer;
  readonly stage: Konva.Stage | undefined;
  readonly viewport: Viewport;
  readonly maxZoom: number;
  readonly textEditor: TextEditingController;
  emit(notification: DANotification): void;
  log(message: string): void;
  finishTweens(): void;
  checkAndEmitEditState(): void;
  scheduleVaultAutoSave(): void;
  pushUndoSnapshot(command: DACommand): void;
  /** Add an empty label where the crosshairs meet an edge, selected. */
  addLabel(notifyHeldAdd: boolean): DALabel | null;

  getAllLabels(): DALabel[];
  getSelectedLabels(): DALabel[];
  unselectAllLabels(): void;
  getEdgesContainingLabel(label: DALabel): DAEdge[];
  labelUnderCrosshairs(): DALabel | null;
  nodesUnderCrosshairs(): DANode[];
  edgeUnderCrosshairs(): DAEdge | null;
  crosshairsInLayerCoords(): Point;
  /** Select just the text the crosshairs are on. */
  selectTextUnderCrosshairs(): void;

  nodeCenterInLayer(node: DANode): Point;
  nodeCenterInStage(node: DANode): Point;
  centerViewOnLayerPoint(point: Point, scale: number, onFinish: () => void): void;
  /** Put the (hidden) crosshairs on a layer point. */
  parkCrosshairsAt(point: Point): void;
  hideCrosshairsUntilMoved(): void;
}

export class LabelEditSession {
  /** A labelable node the held add key created: opened when the hold ends,
   *  after the optional drag phase has settled where it is. */
  pendingNode: DANode | null = null;
  /** Whether the node being labeled arrived on a link an add just drew; if
   *  so the crosshairs rest on it, hidden, once the label is done (da-509). */
  arrivedByLink = false;
  /** Screen-space copy of one edited node at low graph zoom. The real node
   *  stays in place; this lens keeps its text and caret readable. */
  readonly lens = new Overlay<Konva.Group>(() => this.host.crosshairsLayer);
  /** Destination scale of an in-flight focus zoom (da-198): the lens judges
   *  legibility by this rather than the animating scale. */
  private focusZoomTargetScale: number | null = null;

  constructor(private readonly host: LabelEditHost) {}

  /** Opening and closing an edit, and typing. (Changing the text and moving
   *  the caret are the TextEditingController's own commands.) */
  commands() {
    return {
      [DACommandType.EDIT_TEXT_AT_CROSSHAIRS]: () => this.editAtCrosshairs(),
      [DACommandType.EXIT_LABEL_EDIT_MODE]: () => this.exit(),
      [DACommandType.INSERT_CHAR]: c => this.type(c.value),
    } satisfies CommandSlice;
  }

  // ── Opening ──

  /** The edit key: open the node or label under the crosshairs in vim
   *  normal, the caret where the crosshairs are; over a bare edge, add a
   *  label and open it in insert. */
  editAtCrosshairs(): void {
    if (this.host.labelUnderCrosshairs() || this.host.nodesUnderCrosshairs().length > 0) {
      this.editTextUnderCrosshairs();
      return;
    }
    const edge = this.host.edgeUnderCrosshairs();
    if (edge) {
      this.editEdgeLabel(edge);
      return;
    }
    this.host.emit({kind: 'status-message', message: 'Nothing to edit here — tap the add key to create a node.'});
  }

  private editTextUnderCrosshairs(): void {
    const cursorPoint = this.host.crosshairsInLayerCoords();
    this.host.selectTextUnderCrosshairs();
    this.host.crosshairsLayer.hideCrosshairs();
    this.showCarets(cursorPoint);
    this.host.drawingLayer.batchDraw();
    this.host.emit({kind: 'started-label-editing-mode', mode: 'vimNormal'});
    // The same focus a new box gets: editing a label is close work. It waits
    // a turn for the keyboard's viewport inset to go away.
    const editing = this.host.drawingLayer.getSelectedDANodes();
    if (editing.length === 1) setTimeout(() => this.focusOn(editing[0]));
  }

  /** An edge's first label, or a new empty one at the crosshairs. */
  private editEdgeLabel(edge: DAEdge): void {
    let mode: Extract<TextCursorMode, 'insert' | 'vimNormal'> = 'vimNormal';
    this.host.drawingLayer.unselectAll();
    this.host.unselectAllLabels();
    if (edge.labels.length > 0) {
      edge.labels[0].isSelected = true;
    } else {
      // No label yet: create an empty one at the crosshairs projection
      // (addLabel selects it), then type straight into it.
      this.host.pushUndoSnapshot({kind: DACommandType.ADD_LABEL});
      this.host.addLabel(false);
      if (edge.labels.length === 0) return; // addLabel failed; stay put
      mode = 'insert';
      this.host.scheduleVaultAutoSave();
    }
    this.host.crosshairsLayer.hideCrosshairs();
    this.showCarets();
    this.host.drawingLayer.batchDraw();
    this.host.emit({kind: 'started-label-editing-mode', mode});
  }

  /** Open a node that has just been added, in insert. Every label edit takes
   *  the same focus — at least 100% and centered on the box — since what you
   *  are typing is the thing you want to be looking at. */
  beginForNewNode(node: DANode): void {
    this.pendingNode = null;
    this.clearLens();
    if (node.nodeShape === 'junction' || node.nodeShape === 'invisible') return;
    node.setCursorToEnd();
    node.showCursor();
    this.host.crosshairsLayer.hideCrosshairs();
    this.host.drawingLayer.batchDraw();
    this.host.checkAndEmitEditState();
    this.host.emit({kind: 'started-label-editing-mode', mode: 'insert'});
    // After the mode is out: typing hides the keyboard, and the viewport it
    // was occupying is the difference between "centered" and "in the top
    // third". The inset lands on the next turn, so the camera waits for it.
    setTimeout(() => this.focusOn(node));
  }

  /** The add key was released: open the node it created, if it still exists. */
  beginPending(): void {
    const node = this.pendingNode;
    this.pendingNode = null;
    if (!node || !this.host.drawingLayer.getDANodes().includes(node)) return;
    this.beginForNewNode(node);
  }

  /** Show carets on everything about to be edited. A crosshairs point places
   *  the caret spatially for the single target under `i`; selection-driven
   *  editing keeps the caret at the end of the text. */
  showCarets(point?: Point): void {
    const resized = new Map<DANode, Point>();
    this.host.drawingLayer.getSelectedDANodes().forEach(n => {
      if (point) n.setCursorFromLocalPoint({x: point.x - n.group.x(), y: point.y - n.group.y()});
      else n.setCursorToEnd();
      this.host.textEditor.toggleNodeCaret(n, () => n.showCursor(), resized);
    });
    this.host.textEditor.settleCaretResizes(resized);
    this.host.getSelectedLabels().forEach(l => {
      if (point) l.setCursorFromLocalPoint({x: point.x - l.x, y: point.y - l.y});
      else l.setCursorToEnd();
      l.showCursor();
    });
    this.refreshLens();
  }

  // ── Typing ──

  type(text: string): void {
    this.host.crosshairsLayer.hideCrosshairs();
    this.host.textEditor.insertChar(text);
  }

  /** Paste into the text being edited, if any. Whether it was taken. */
  paste(text: string): boolean {
    const editing = this.host.drawingLayer.getDANodes().some(node => node.isEditingText)
      || this.host.getAllLabels().some(label => label.isEditingText);
    if (editing) this.type(text);
    return editing;
  }

  // ── The view while typing ──

  /** Zoom to at least natural size around the node being edited. */
  private focusOn(node: DANode): void {
    this.host.finishTweens();
    const targetScale = Math.min(this.host.maxZoom, Math.max(this.host.drawingLayer.scaleX(), EDIT_ZOOM));
    // While the focus zoom is in flight, the lens must judge legibility by
    // where the zoom is going, not the mid-tween scale — otherwise a lens
    // built during the tween survives at full zoom as a phantom second copy
    // of the freshly added node (da-198).
    this.focusZoomTargetScale = targetScale;
    // And take down any lens built a moment ago, while the graph was still
    // zoomed out: it would otherwise sit there for the whole flight in, a
    // small copy of the node laid over the big one it is becoming.
    this.refreshLens();
    this.host.centerViewOnLayerPoint(this.host.nodeCenterInLayer(node), targetScale, () => {
      this.focusZoomTargetScale = null;
      this.refreshLens();
    });
  }

  /** Rebuild the low-zoom lens from the live node, so text, selection and
   *  caret changes show at once without zooming the graph. */
  refreshLens(): void {
    this.keepCaretVisible();
    this.clearLens(false);
    const layer = this.host.drawingLayer;
    const effectiveScale = this.focusZoomTargetScale ?? layer?.scaleX() ?? 1;
    if (!this.host.crosshairsLayer || !layer || effectiveScale >= LENS_BELOW_ZOOM) return;
    const selected = layer.getSelectedDANodes();
    if (selected.length !== 1) return;
    const ghost = this.lensOf(selected[0]);
    this.lens.show(() => ghost);
    this.host.crosshairsLayer.batchDraw();
  }

  /** A natural-size copy of the node, over where it is, kept on screen. */
  private lensOf(node: DANode): Konva.Group {
    const center = this.host.nodeCenterInStage(node);
    const viewport = this.host.viewport;
    const padding = 12;
    const x = Math.max(viewport.minX + padding,
      Math.min(center.x - node.NODE_WIDTH / 2, viewport.maxX - node.NODE_WIDTH - padding));
    const y = Math.max(viewport.minY + padding,
      Math.min(center.y - node.NODE_HEIGHT / 2, viewport.maxY - node.NODE_HEIGHT - padding));
    const ghost = node.konvaGroup.clone({
      name: 'label-edit-ghost', x, y, scaleX: 1, scaleY: 1, opacity: 0.92, listening: false,
    });
    ghost.getChildren().forEach(child => child.listening(false));
    return ghost;
  }

  clearLens(draw = true): void {
    this.lens.clear(draw);
  }

  /** Pan without zooming whenever the one active caret nears a viewport
   *  edge. Three rendered lines stay available above and below. */
  private keepCaretVisible(): void {
    const layer = this.host.drawingLayer;
    if (!this.host.stage || !layer) return;
    const target = this.caretTarget();
    if (!target) return;
    const local = target.caretViewportBox();
    const group = target.group;
    const sx = group.scaleX() * layer.scaleX();
    const sy = group.scaleY() * layer.scaleY();
    const caret = {
      x: layer.x() + (group.x() + local.x * group.scaleX()) * layer.scaleX(),
      y: layer.y() + (group.y() + local.y * group.scaleY()) * layer.scaleY(),
      width: local.width * sx,
      height: local.height * sy,
    };
    const viewport = this.host.viewport;
    const delta = caretVisibilityPanDelta(caret, {width: viewport.width, height: viewport.height},
      local.lineHeight * sy);
    if (delta.x === 0 && delta.y === 0) return;
    layer.position({x: layer.x() + delta.x, y: layer.y() + delta.y});
    layer.batchDraw();
  }

  /** The one node or label being edited, if exactly one is. */
  private caretTarget(): DANode | DALabel | null {
    const nodes = this.host.drawingLayer.getSelectedDANodes();
    const labels = this.host.getSelectedLabels();
    if (nodes.length + labels.length !== 1) return null;
    return nodes[0] ?? labels[0];
  }

  // ── Closing ──

  exit(): void {
    this.host.finishTweens();
    this.host.log('case exit-label-edit-mode');
    this.clearLens();
    this.host.crosshairsLayer.showCrosshairs();
    this.hideAllCarets();
    const editedNodes = this.host.drawingLayer.getSelectedDANodes();
    const editedLabels = this.host.getSelectedLabels().filter(label => label.label.trim() !== '');
    this.dropEmptyLabels();
    this.host.drawingLayer.unselectAll();
    this.host.unselectAllLabels();
    this.host.drawingLayer.batchDraw();
    const drewLink = this.arrivedByLink;
    this.arrivedByLink = false;
    this.returnCrosshairsTo(editedNodes, editedLabels);
    // A node that arrived on a new link rests the crosshairs on it, the same
    // landing as connecting two existing nodes.
    if (drewLink) this.host.hideCrosshairsUntilMoved();
  }

  /** Deliberately every node and label, not just the selected ones. A caret
   *  is shown before selection settles — a freshly created node awaiting its
   *  label gets one while unselected (beginForNewNode) — so keying the
   *  teardown off selection left that node's blink timer running for the rest
   *  of the session, with a caret visible on a node nobody was editing.
   *  hideCursor on a node without one is a no-op. */
  private hideAllCarets(): void {
    const resized = new Map<DANode, Point>();
    this.host.drawingLayer.getDANodes()
      .forEach(n => this.host.textEditor.toggleNodeCaret(n, () => n.hideCursor(), resized));
    this.host.textEditor.settleCaretResizes(resized);
    this.host.getAllLabels().forEach(l => l.hideCursor());
  }

  /** A label left empty has no visible content: drop it rather than leave an
   *  invisible hit-target on the edge. */
  private dropEmptyLabels(): void {
    this.host.getSelectedLabels()
      .filter(label => label.label.trim() === '')
      .forEach(label => this.host.getEdgesContainingLabel(label).forEach(edge => edge.removeLabel(label)));
  }

  /** Keeping the caret in view pans the graph under the hidden crosshairs,
   *  so editing could end with them off the thing just edited, and the edit
   *  key then found nothing there. Put them back on it. */
  private returnCrosshairsTo(editedNodes: DANode[], editedLabels: DALabel[]): void {
    if (editedNodes.length === 1 && !this.host.nodesUnderCrosshairs().includes(editedNodes[0])) {
      this.host.parkCrosshairsAt(this.host.nodeCenterInLayer(editedNodes[0]));
    } else if (editedNodes.length === 0 && editedLabels.length === 1
        && this.host.labelUnderCrosshairs() !== editedLabels[0]) {
      this.host.parkCrosshairsAt({x: editedLabels[0].x, y: editedLabels[0].y});
    }
  }
}
