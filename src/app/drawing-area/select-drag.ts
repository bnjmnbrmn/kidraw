/**
 * The select key, held: Select+Drag.
 *
 * Pressing it selects whatever is under the crosshairs (a label, else a
 * waypoint, else the topmost node, else the topmost edge). While it is held
 * the drag keys move the selection; over empty canvas they grow an area
 * select instead (area-select.ts); and near a node's bottom-right corner,
 * with nothing else to act on, they resize that node through its handle.
 * Releasing it ends the drag and clears the selection it moved. A quick tap
 * on something already selected deselects it.
 *
 * A drag is one undo step however many key presses it takes.
 */
import { Axis, AxisKey } from './axis';
import { DACommandType, GridTier } from './command.model';
import type { CommandSlice } from './command-handlers';
import type { Camera } from './camera';
import type { CrosshairsLayer } from './crosshairs.layer';
import type { DAEdge } from './da-edge';
import type { DALabel } from './da-label';
import type { DANode } from './da-node';
import type { DAWaypoint } from './da-waypoint';
import type { DrawingLayer } from './drawing.layer';

/** How close, in layer units, the crosshairs must be to a node's corner to
 *  offer its resize handle. */
const RESIZE_HANDLE_REACH = 25;

/** What the held select key needs from the drawing area. */
export interface SelectDragHost {
  readonly drawingLayer: DrawingLayer;
  readonly crosshairsLayer: CrosshairsLayer;
  readonly camera: Camera;
  /** How much one press grows or shrinks a node through its handle. */
  readonly resizeStep: number;
  readonly areaSelect: {
    readonly active: boolean;
    begin(): void;
    step(axis: Axis, sign: 1 | -1, tier?: GridTier): void;
    finish(): void;
  };
  /** Move the selection one step (keyboard-drag.ts). */
  dragStep(axis: Axis, sign: 1 | -1, tier?: GridTier): void;
  topItemUnderCrosshairs(): DALabel | DAWaypoint | DANode | DAEdge | null;
  getSelectedLabels(): DALabel[];
  updateEdgesForResizedNodes(nodes: DANode[]): void;
  rerouteIncidentEdges(nodes: DANode[]): void;
  unselectAll(): void;
  finishTweens(): void;
  checkAndEmitEditState(): void;
}

export class SelectDrag {
  /** Whether this hold has moved or resized anything yet. */
  private dragged = false;
  /** The item under the crosshairs was already selected when the hold began,
   *  so a quick tap means "deselect it". */
  private wasAlreadySelected = false;
  /** Whether this hold's undo snapshot is taken. */
  private snapshotTaken = false;
  /** The node whose resize handle is showing, if any. */
  private resizeTarget: DANode | null = null;

  constructor(private readonly host: SelectDragHost) {}

  commands() {
    return {
      [DACommandType.MULTI_ITEM_SELECT]: () => {
        this.select();
        this.host.checkAndEmitEditState();
      },
      [DACommandType.ENTER_DRAG_MODE]: () => this.begin(),
      [DACommandType.DRAG_SELECTED_LEFT]: c => this.press(Axis.X, -1, c.gridTier),
      [DACommandType.DRAG_SELECTED_RIGHT]: c => this.press(Axis.X, 1, c.gridTier),
      [DACommandType.DRAG_SELECTED_UP]: c => this.press(Axis.Y, -1, c.gridTier),
      [DACommandType.DRAG_SELECTED_DOWN]: c => this.press(Axis.Y, 1, c.gridTier),
      [DACommandType.EXIT_DRAG_MODE]: () => this.end(),
    } satisfies CommandSlice;
  }

  /** Should this drag press take an undo snapshot? Only the first of a hold
   *  does, and none for an area select, which changes only the selection. */
  takesUndoSnapshot(): boolean {
    if (this.host.areaSelect.active || this.snapshotTaken) return false;
    this.snapshotTaken = true;
    return true;
  }

  /** Select what is under the crosshairs, remembering whether it already was. */
  private select(): void {
    this.host.finishTweens();
    const item = this.host.topItemUnderCrosshairs();
    this.wasAlreadySelected = item?.isSelected ?? false;
    if (!item) return;
    item.isSelected = true;
    this.host.drawingLayer.batchDraw();
  }

  private begin(): void {
    // Crosshairs stay visible during drag
    this.dragged = false;
    this.snapshotTaken = false;
    // The resize handle only captures the gesture when there is nothing to
    // drag: no item under the crosshairs and no current selection. Without
    // this guard a node corner inside the proximity band silently turned
    // every select+drag into a barely visible resize — three coarse drags
    // that "did nothing" in Ben's 2026-08-14 session (da-193).
    if (this.resizeTarget && this.hasSomethingToDrag()) {
      this.showResizeHandleOn(null);
      return;
    }
    if (this.resizeTarget) {
      this.host.drawingLayer.unselectAll();
      this.resizeTarget.isSelected = true;
      return;
    }
    // Held over genuinely empty canvas starts an area select (da-195): the
    // crosshairs anchor one corner of a marquee, the drag keys move the
    // opposite corner, and everything the box touches joins the selection —
    // the keyboard version of a mouse rubber band. Dragging an existing
    // multi-selection requires the crosshairs to be over a selected item,
    // matching the mouse convention.
    if (!this.host.topItemUnderCrosshairs()) this.host.areaSelect.begin();
  }

  /** One press of a drag key: the area-select corner, a node being resized,
   *  or the selection. */
  private press(axis: Axis, sign: 1 | -1, tier?: GridTier): void {
    if (this.host.areaSelect.active) this.host.areaSelect.step(axis, sign, tier);
    else if (this.resizeTarget) this.resize(this.resizeTarget, sign);
    else this.drag(axis, sign, tier);
  }

  /** Move whatever is selected one step along `axis`. Tools-facing: the
   *  tools/qa scripts drive this, and since `Axis` is not reachable from a
   *  page.evaluate they pass 'x' or 'y'. Accept both here and nowhere else. */
  drag(axis: Axis | AxisKey, sign: 1 | -1, tier?: GridTier): void {
    this.dragged = true;
    this.host.dragStep(axis instanceof Axis ? axis : Axis.of(axis), sign, tier);
  }

  private resize(node: DANode, sign: 1 | -1): void {
    this.dragged = true;
    node.resizeBy(sign * this.host.resizeStep);
    this.host.updateEdgesForResizedNodes([node]);
    this.host.drawingLayer.batchDraw();
  }

  private end(): void {
    if (this.host.areaSelect.active) {
      // Release keeps whatever the marquee gathered; the quick-tap toggle
      // below must not fire for an area-select gesture.
      this.host.areaSelect.finish();
      return;
    }
    this.resizeTarget?.hideResizeHandle();
    this.resizeTarget = null;
    if (this.dragged) {
      // A canceled mid-tween step leaves nodes at their final (part-way)
      // position without the step-completion reroute having fired.
      this.host.rerouteIncidentEdges(this.host.drawingLayer.getSelectedDANodes());
      this.host.unselectAll();
      this.host.checkAndEmitEditState();
    } else if (this.wasAlreadySelected) {
      // A quick tap on an already-selected item toggles it off; on an
      // unselected one it stays selected, as `select` left it.
      this.deselectTopItem();
      this.host.checkAndEmitEditState();
    }
  }

  private deselectTopItem(): void {
    const item = this.host.topItemUnderCrosshairs();
    if (!item) return;
    item.isSelected = !item.isSelected;
    this.host.drawingLayer.batchDraw();
  }

  // ── The resize handle ──

  /** Offer the handle of the node whose corner the crosshairs are nearest,
   *  within reach — only when a drag would have nothing else to act on, the
   *  same stand-down rule as `begin`, so a visible handle always means "the
   *  select key will resize" (da-193). */
  refreshResizeHandle(): void {
    const crosshairs = this.host.camera.toLayer({
      x: this.host.crosshairsLayer.crosshairs.x,
      y: this.host.crosshairsLayer.crosshairs.y,
    });
    const node = this.hasSomethingToDrag() ? null : this.nodeWithCornerNear(crosshairs);
    if (node !== this.resizeTarget) this.showResizeHandleOn(node);
  }

  private nodeWithCornerNear(point: {x: number; y: number}): DANode | null {
    let closest: DANode | null = null;
    let closestDist = RESIZE_HANDLE_REACH;
    for (const node of this.host.drawingLayer.getDANodes()) {
      if (node.nodeShape === 'junction') continue;
      const corner = node.getBottomRightAbsolute();
      const dist = Math.hypot(point.x - corner.x, point.y - corner.y);
      if (dist < closestDist) {
        closestDist = dist;
        closest = node;
      }
    }
    return closest;
  }

  private showResizeHandleOn(node: DANode | null): void {
    this.resizeTarget?.hideResizeHandle();
    this.resizeTarget = node;
    node?.showResizeHandle();
    this.host.drawingLayer.batchDraw();
  }

  /** Something under the crosshairs, or anything selected. */
  private hasSomethingToDrag(): boolean {
    const layer = this.host.drawingLayer;
    return this.host.topItemUnderCrosshairs() !== null
      || layer.getSelectedDANodes().length > 0
      || layer.getSelectedDAWaypoints().length > 0
      || layer.getSelectedDAEdges().length > 0
      || this.host.getSelectedLabels().length > 0;
  }
}
