/**
 * What the crosshairs are on.
 *
 * Almost every command starts with this question, and four regions of the
 * drawing area asked it independently: the grow gesture, label editing, drag,
 * link navigation. Each reached for `this.drawingLayer` and
 * `this.crosshairsLayer` and did its own hit test, which is why extracting any
 * one of them dragged both layers along behind it.
 *
 * The answers come in the graph's own coordinates. Priority between kinds is
 * NOT decided here — a label beating the node under it is a selection rule,
 * and it lives with selection.
 */
import { Camera, Bounds } from './camera';
import { DAEdge } from './da-edge';
import { DALabel } from './da-label';
import { DANode } from './da-node';
import { DAWaypoint } from './da-waypoint';
import { lineSegmentIntersectsRect, Point } from './utils';

/** What the probe needs from the drawing layer. */
export interface ProbeLayer {
  getDAEdges(): DAEdge[];
  getDAWaypoints(): DAWaypoint[];
  getDaNodesContainingPoint(point: Point): DANode[];
}

/** What the probe needs from the crosshairs. */
export interface ProbeCrosshairs {
  crosshairsX(): number;
  crosshairsY(): number;
  readonly crosshairs: {
    readonly hitRadiusX: number;
    readonly hitRadiusY: number;
    getAbsolutePosition(): Point;
    readonly konvaGroup: {getClientRect(): {x: number; y: number; width: number; height: number}};
  };
}

/** The crosshairs' hit box in layer units, with its center. */
export interface ProbeBounds extends Bounds {
  cx: number;
  cy: number;
}

export class CrosshairsProbe {
  constructor(
    private readonly layer: () => ProbeLayer,
    private readonly crosshairs: () => ProbeCrosshairs,
    private readonly camera: Camera,
  ) {}

  /** Where the crosshairs are, in layer units. */
  get position(): Point {
    const c = this.crosshairs();
    return this.camera.toLayer({x: c.crosshairsX(), y: c.crosshairsY()});
  }

  /** The crosshairs' hit box, in layer units. */
  get bounds(): ProbeBounds {
    const rect = this.crosshairs().crosshairs.konvaGroup.getClientRect();
    const {minX, minY, maxX, maxY} = this.camera.boundsToLayer(rect);
    return {minX, minY, maxX, maxY, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2};
  }

  /** Radius of the selection circle, in layer units. */
  get reach(): number {
    const {hitRadiusX, hitRadiusY} = this.crosshairs().crosshairs;
    return Math.max(hitRadiusX, hitRadiusY) / this.camera.scale;
  }

  /** Every node the crosshairs stand on. Unordered; ask `topmost` for one. */
  nodes(): DANode[] {
    return this.layer().getDaNodesContainingPoint(
      this.crosshairs().crosshairs.getAbsolutePosition());
  }

  /** Every edge whose path crosses the crosshairs' hit box. */
  edges(): DAEdge[] {
    const box = this.bounds;
    return this.layer().getDAEdges().filter(edge => edgeCrosses(edge, box));
  }

  /** The first edge label overlapping the hit box, or null. */
  label(): DALabel | null {
    const box = this.bounds;
    for (const edge of this.layer().getDAEdges()) {
      for (const label of edge.labels) {
        if (labelOverlaps(label, box)) return label;
      }
    }
    return null;
  }

  /**
   * The waypoint nearest the crosshairs whose dot comes within its own RADIUS
   * plus the selection circle's reach — all in layer coordinates.
   *
   * Every waypoint hit test (select, select+drag, pin, delete) goes through
   * here, so they all share the same generous targeting.
   */
  waypoint(): DAWaypoint | undefined {
    const waypoints = this.layer().getDAWaypoints();
    // Before reading the crosshairs: a graph with no waypoints is the common
    // case, and this runs on every hover refresh.
    if (waypoints.length === 0) return undefined;

    const at = this.position;
    const reach = this.reach;
    return waypoints
      .map(wp => ({wp, distance: wp.distanceTo(at)}))
      .filter(({wp, distance}) => distance <= wp.RADIUS + reach)
      .sort((a, b) => a.distance - b.distance)[0]?.wp;
  }
}

function edgeCrosses(edge: DAEdge, box: Bounds): boolean {
  const points = edge.getPathPoints();
  return points.some((p, i) => i < points.length - 1 &&
    lineSegmentIntersectsRect(p.x, p.y, points[i + 1].x, points[i + 1].y,
      box.minX, box.minY, box.maxX, box.maxY));
}

function labelOverlaps(label: DALabel, box: Bounds): boolean {
  return label.x + label.width / 2 >= box.minX &&
    label.x - label.width / 2 <= box.maxX &&
    label.y + label.height / 2 >= box.minY &&
    label.y - label.height / 2 <= box.maxY;
}
