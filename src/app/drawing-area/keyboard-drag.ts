/**
 * Moving the selection with the keyboard: each press of a drag key moves
 * whatever is selected one grid step along that key's axis.
 *
 * Four different drags share the keys, and the selection decides which.
 * Labels slide along their own edge; waypoints nudge pointwise; nodes tween,
 * carrying the crosshairs with them and panning the view once the crosshairs
 * reach the margin. An edge selected on its own first grows a waypoint under
 * the crosshairs, so the gesture is select-and-move rather than select, add,
 * select again.
 *
 * What the held gesture does before it gets here — area select, resize, the
 * quick-tap toggle — stays with the drawing area's drag mode.
 */
import { Animations } from './animations';
import { Axis } from './axis';
import type { GridTier } from './command.model';
import type { CrosshairsLayer } from './crosshairs.layer';
import type { DAEdge } from './da-edge';
import type { DALabel } from './da-label';
import type { DANode } from './da-node';
import type { DAWaypoint } from './da-waypoint';
import type { DrawingLayer } from './drawing.layer';
import { clamp, Point, topmost } from './utils';
import type { Viewport } from './viewport';

/** What a keyboard drag needs from the drawing area. */
export interface KeyboardDragHost {
  readonly drawingLayer: DrawingLayer;
  readonly crosshairsLayer: CrosshairsLayer;
  readonly viewport: Viewport;
  readonly animations: Animations;
  /** One step's tween, in seconds. */
  readonly tweenDuration: number;
  crosshairsInLayerCoords(): Point;
  edgesUnderCrosshairs(): DAEdge[];
  findSnapOnEdge(edge: DAEdge, point: Point): {point: Point; segmentIndex: number} | undefined;
  getSelectedLabels(): DALabel[];
  getEdgeForLabel(label: DALabel): DAEdge | null;
  unselectAllLabels(): void;
  placeCrosshairs(at: Point): void;
  panLayerAlong(axis: Axis, delta: number): void;
  updateEdgePoints(edge: DAEdge): void;
  rerouteIncidentEdges(nodes: DANode[]): void;
}

/** One press of a drag key, resolved against the grid. */
interface DragStep {
  spacing: number;
  steps: number;
}

/** Where one node starts and ends on the drag axis. */
interface NodeDragTarget {
  node: DANode;
  initial: number;
  target: number;
}

/** How close the crosshairs may come to the viewport's edge before the view
 *  pans instead. */
const PAN_MARGIN = 60;

export class KeyboardDrag {
  constructor(private readonly host: KeyboardDragHost) {}

  /** One press: whatever is selected moves one step along `axis`. */
  step(axis: Axis, sign: 1 | -1, tier?: GridTier): void {
    this.host.animations.cancelFrame();
    this.host.animations.finishAll();
    const {labels, nodes, waypoints} = this.dragged();
    if (labels.length > 0 && nodes.length === 0 && waypoints.length === 0) {
      this.dragLabelsAlongEdges(labels, axis, sign, tier);
    } else if (waypoints.length > 0 && nodes.length === 0) {
      this.dragWaypoints(waypoints, axis, sign, tier);
    } else {
      this.dragNodesAndFollow(nodes, axis, sign, tier);
    }
  }

  /** What this press moves. An edge selected on its own gives way to a new
   *  waypoint under the crosshairs, which is then what moves. */
  private dragged(): {labels: DALabel[]; nodes: DANode[]; waypoints: DAWaypoint[]} {
    const layer = this.host.drawingLayer;
    const labels = this.host.getSelectedLabels();
    const nodes = layer.getSelectedDANodes();
    const edges = layer.getSelectedDAEdges();
    const waypoints = layer.getSelectedDAWaypoints();
    const edgeAlone = edges.length > 0 && labels.length === 0 && nodes.length === 0 && waypoints.length === 0;
    return {labels, nodes, waypoints: edgeAlone ? this.growWaypointToDrag(edges) : waypoints};
  }

  /** One press of a drag key: the grid spacing it moves by, and how many of
   *  those cells it covers. Fine drops to the sub-grid, coarse covers ten. */
  private dragStep(tier?: GridTier): DragStep {
    const layer = this.host.drawingLayer;
    return {
      spacing: tier === 'fine' ? layer.getSubGridSpacing() : layer.getGridSpacing(),
      steps: tier === 'coarse' ? 10 : 1,
    };
  }

  /**
   * Turn the point under the crosshairs into a waypoint and select it alone.
   *
   * The insertion is restricted to the selected edge under the crosshairs:
   * crossing or parallel edges must not steal the waypoint. Returns the new
   * waypoint, or none if the crosshairs found no point to snap to.
   */
  private growWaypointToDrag(selectedEdges: DAEdge[]): DAWaypoint[] {
    const edge = topmost(this.host.edgesUnderCrosshairs().filter(e => e.isSelected)) ?? selectedEdges[0];
    const snap = this.host.findSnapOnEdge(edge, this.host.crosshairsInLayerCoords());
    if (!snap) return [];
    this.host.drawingLayer.unselectAll();
    this.host.unselectAllLabels();
    const waypoint = edge.insertWaypointAt(snap.point, snap.segmentIndex);
    waypoint.isSelected = true;
    return [waypoint];
  }

  /** Labels ride their own edge, so movement stays screen-directional even
   *  when that edge is reversed or nearly perpendicular to the key. */
  private dragLabelsAlongEdges(labels: DALabel[], axis: Axis, sign: 1 | -1, tier?: GridTier): void {
    const {spacing} = this.dragStep(tier);
    labels.forEach(label => this.host.getEdgeForLabel(label)
      ?.dragLabelToward(label, axis.point(sign), spacing, tier === 'coarse'));
    this.host.drawingLayer.batchDraw();
  }

  /** Waypoint moves are pointwise and snappy — no tween, no crosshair pan. */
  private dragWaypoints(waypoints: DAWaypoint[], axis: Axis, sign: 1 | -1, tier?: GridTier): void {
    const {spacing, steps} = this.dragStep(tier);
    const step = axis.point(sign * steps * spacing);
    waypoints.forEach(wp =>
      this.host.drawingLayer.findEdgeForWaypoint(wp)?.moveWaypoint(wp, step.x, step.y));
    this.host.drawingLayer.batchDraw();
  }

  /**
   * Tween the selected nodes to their next grid cell, carrying their edges and
   * the crosshairs along, and panning the view once the crosshairs reach the
   * margin. Called with no nodes selected, this walks the crosshairs alone.
   */
  private dragNodesAndFollow(nodes: DANode[], axis: Axis, sign: 1 | -1, tier?: GridTier): void {
    const step = this.dragStep(tier);
    const targets = nodes.map(node => nodeDragTarget(node, axis, sign, step));
    this.animateNodeDrag(nodes, targets, axis, sign * crosshairTravel(targets, step));
  }

  /** Run the drag to completion, one frame at a time, then re-route. */
  private animateNodeDrag(nodes: DANode[], targets: NodeDragTarget[], axis: Axis, travel: number): void {
    const edges = incidentEdges(nodes);
    const {crosshairs} = this.host.crosshairsLayer;
    const origin = {x: crosshairs.x, y: crosshairs.y};
    const startTime = Date.now();
    let panned = 0;
    const frame = () => {
      const progress = Math.min((Date.now() - startTime) / (this.host.tweenDuration * 1000), 1);
      this.paintDragFrame(targets, edges, axis, progress);
      panned = this.followCrosshairs(axis, origin, travel * progress, panned);
      this.host.animations.trackFrame(progress < 1 ? requestAnimationFrame(frame) : null);
      // Node(s) landed on their new grid cell: re-route their edges around the
      // changed geometry (same pipeline as adding a new edge).
      if (progress >= 1) this.host.rerouteIncidentEdges(nodes);
    };
    frame();
  }

  /** Place the nodes at this point in the tween, and redraw what they drag. */
  private paintDragFrame(targets: NodeDragTarget[], edges: Set<DAEdge>, axis: Axis, progress: number): void {
    targets.forEach(({node, initial, target}) =>
      axis.moveNode(node, initial + (target - initial) * progress));
    edges.forEach(edge => this.host.updateEdgePoints(edge));
  }

  /**
   * Put the crosshairs `traveled` layer units from where they started, and
   * push the view by however much of that overshoots the margin. Returns the
   * running overshoot, so the next frame pans only the difference.
   */
  private followCrosshairs(axis: Axis, origin: Point, traveled: number, pannedSoFar: number): number {
    const {viewport} = this.host;
    const wanted = axis.of(origin) + traveled * this.host.drawingLayer.scaleX();
    const reached = clamp(wanted,
      axis.pick(viewport.minX, viewport.minY) + PAN_MARGIN,
      axis.pick(viewport.maxX, viewport.maxY) - PAN_MARGIN);
    this.host.placeCrosshairs(axis.point(reached, origin));
    this.host.panLayerAlong(axis, -(wanted - reached - pannedSoFar));
    return wanted - reached;
  }
}

/** A node's center snaps to the grid, then advances one step from there. */
function nodeDragTarget(node: DANode, axis: Axis, sign: 1 | -1, {spacing, steps}: DragStep): NodeDragTarget {
  const initial = axis.nodePosition(node);
  const offset = axis.halfExtent(node);
  const snappedCenter = Math.round((initial + offset) / spacing) * spacing;
  return {node, initial, target: snappedCenter + sign * steps * spacing - offset};
}

/** The crosshairs travel as far as the first node does, so they stay over the
 *  thing being dragged. With nothing selected, they take a nominal step. */
function crosshairTravel(targets: NodeDragTarget[], {spacing, steps}: DragStep): number {
  return targets.length === 0
    ? steps * spacing
    : Math.abs(targets[0].target - targets[0].initial);
}

/** Every edge touching any of these nodes, each once. */
function incidentEdges(nodes: DANode[]): Set<DAEdge> {
  return new Set(nodes.flatMap(node => node.connectedEdges));
}
