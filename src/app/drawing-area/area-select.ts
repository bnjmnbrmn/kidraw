/**
 * Area select (da-195): the keyboard's rubber band.
 *
 * Holding the select key over empty canvas anchors one corner of a marquee at
 * the crosshairs. The drag keys then move the crosshairs, and with them the
 * opposite corner, and everything the box touches joins the selection.
 * Shrinking the box releases exactly what it caught — never a selection that
 * was there before the gesture.
 *
 * The anchor is kept in drawing-layer coordinates and the marquee is drawn on
 * the crosshairs layer, so panning part-way through stays true.
 */
import type { InteractionMode } from './interaction-modes';
import Konva from 'konva';
import { Axis } from './axis';
import type { CrosshairsLayer } from './crosshairs.layer';
import type { DAEdge } from './da-edge';
import type { DALabel } from './da-label';
import type { DANode } from './da-node';
import type { DAWaypoint } from './da-waypoint';
import type { DrawingLayer } from './drawing.layer';
import type { GridTier } from './command.model';
import { Overlay } from './overlay';
import { clamp, lineSegmentIntersectsRect, Point } from './utils';
import type { Viewport } from './viewport';

/** What area select needs from the drawing area. */
export interface AreaSelectHost {
  /** This mode is starting: whichever other mode is on stops (interaction-modes.ts). */
  beginMode(): void;
  readonly drawingLayer: DrawingLayer;
  readonly crosshairsLayer: CrosshairsLayer;
  readonly viewport: Viewport;
  crosshairsInLayerCoords(): Point;
  placeCrosshairs(at: Point): void;
  panLayerAlong(axis: Axis, delta: number): void;
  /** How far one press of a drag key moves the crosshairs, in stage pixels. */
  stepDistance(tier: GridTier): number;
  /** The marquee's color: the crosshairs', in the current theme. */
  marqueeColor(): string;
  checkAndEmitEditState(): void;
}

type Selectable = DANode | DAEdge | DAWaypoint | DALabel;

/** A box in drawing-layer coordinates. */
interface LayerRect {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** How close the moving corner may come to the viewport's edge before the
 *  view pans instead. */
const EDGE_MARGIN = 60;

export class AreaSelect implements InteractionMode {
  readonly name = 'area-select';
  private anchor: Point | null = null;
  private readonly captured = new Set<Selectable>();
  private readonly marquee = new Overlay<Konva.Rect>(() => this.host.crosshairsLayer);

  constructor(private readonly host: AreaSelectHost) {}

  /** Whether a gesture is under way: the drag keys move the corner, not the selection. */
  get active(): boolean {
    return this.anchor !== null;
  }

  /** Anchor a new box at the crosshairs. */
  begin(): void {
    this.host.beginMode();
    this.anchor = this.host.crosshairsInLayerCoords();
    this.captured.clear();
    this.refreshMarquee();
  }

  /** Move the free corner one step, and select what the box now touches. */
  step(axis: Axis, sign: 1 | -1, tier?: GridTier): void {
    if (!this.anchor) return;
    this.moveCorner(axis, sign * this.host.stepDistance(tier ?? 'normal'));
    this.updateSelection();
    this.refreshMarquee();
  }

  /** End the gesture, keeping whatever the box selected. */
  finish(): void {
    this.anchor = null;
    this.captured.clear();
    this.marquee.clear(false);
    this.host.crosshairsLayer?.batchDraw();
    this.host.checkAndEmitEditState();
  }

  /** Stop: what the box has already selected stays selected, as on release. */
  cancel(): void {
    this.finish();
  }

  /** Take the marquee down when the drawing area goes away. */
  dispose(): void {
    this.marquee.clear(false);
  }

  /** The crosshairs carry the corner; past the margin, the view pans instead. */
  private moveCorner(axis: Axis, distance: number): void {
    const {viewport, crosshairsLayer: {crosshairs}} = this.host;
    const current = {x: crosshairs.x, y: crosshairs.y};
    const target = axis.of(current) + distance;
    const reached = clamp(target,
      axis.pick(viewport.minX, viewport.minY) + EDGE_MARGIN,
      axis.pick(viewport.maxX, viewport.maxY) - EDGE_MARGIN);
    this.host.placeCrosshairs(axis.point(reached, current));
    this.host.panLayerAlong(axis, -(target - reached));
  }

  /** The box: from the anchor to the crosshairs. */
  private rect(): LayerRect | null {
    return this.anchor && boundsOf(this.anchor, this.host.crosshairsInLayerCoords());
  }

  /** Select what the box touches, and release what it caught but no longer does. */
  private updateSelection(): void {
    const inside = itemsTouching(this.host.drawingLayer, this.rect()!);
    inside.forEach(item => this.capture(item));
    [...this.captured].filter(item => !inside.has(item)).forEach(item => this.release(item));
    this.host.drawingLayer.batchDraw();
  }

  private capture(item: Selectable): void {
    if (item.isSelected) return;
    item.isSelected = true;
    this.captured.add(item);
  }

  private release(item: Selectable): void {
    item.isSelected = false;
    this.captured.delete(item);
  }

  private refreshMarquee(): void {
    const rect = this.rect();
    if (!rect) return;
    const marquee = this.marquee.node ?? this.marquee.show(() => this.buildMarquee());
    marquee.setAttrs(onStage(rect, this.host.drawingLayer));
    marquee.moveToTop();
    this.host.crosshairsLayer.batchDraw();
  }

  private buildMarquee(): Konva.Rect {
    const color = this.host.marqueeColor();
    return new Konva.Rect({
      name: 'area-select-marquee',
      stroke: color,
      strokeWidth: 1.5,
      dash: [6, 4],
      fill: color + '22',
      listening: false,
    });
  }
}

function boundsOf(a: Point, b: Point): LayerRect {
  return {minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y)};
}

/** Where a layer box appears on the stage, at the layer's pan and zoom. */
function onStage(rect: LayerRect, layer: DrawingLayer): {x: number; y: number; width: number; height: number} {
  const scale = layer.scaleX();
  return {
    x: layer.x() + rect.minX * scale,
    y: layer.y() + rect.minY * scale,
    width: (rect.maxX - rect.minX) * scale,
    height: (rect.maxY - rect.minY) * scale,
  };
}

/** Everything the box touches: nodes (not invisible ones), edge labels,
 *  waypoints inside it, and edges whose drawn path crosses it. */
function itemsTouching(layer: DrawingLayer, rect: LayerRect): Set<Selectable> {
  const inside = new Set<Selectable>();
  layer.getDANodes()
    .filter(node => node.nodeShape !== 'invisible' && boxTouches(rect, node.group.x(), node.group.y(), node.NODE_WIDTH, node.NODE_HEIGHT))
    .forEach(node => inside.add(node));
  for (const edge of layer.getDAEdges()) {
    edge.labels.filter(label => boxTouches(rect, label.x, label.y, label.width, label.height)).forEach(label => inside.add(label));
    edge.waypoints.filter(waypoint => contains(rect, waypoint)).forEach(waypoint => inside.add(waypoint));
    if (pathCrosses(edge.getRenderedPathPoints(), rect)) inside.add(edge);
  }
  return inside;
}

function boxTouches(rect: LayerRect, x: number, y: number, width: number, height: number): boolean {
  return x < rect.maxX && x + width > rect.minX && y < rect.maxY && y + height > rect.minY;
}

function contains(rect: LayerRect, point: Point): boolean {
  return point.x >= rect.minX && point.x <= rect.maxX && point.y >= rect.minY && point.y <= rect.maxY;
}

function pathCrosses(path: Point[], rect: LayerRect): boolean {
  return path.slice(1).some((to, i) => lineSegmentIntersectsRect(
    path[i].x, path[i].y, to.x, to.y, rect.minX, rect.minY, rect.maxX, rect.maxY));
}
