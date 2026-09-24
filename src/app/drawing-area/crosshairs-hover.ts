/**
 * What the crosshairs are on, shown: a dashed trace around the one item
 * they are resting on — in selection's priority order, label, waypoint, top
 * node, top edge — or, for a node that is off-screen, too small to read or
 * covered by another, a readable copy of it at natural size (the landing
 * ghost), which then carries the trace instead (da-434).
 *
 * Neither is selection: both are drawn into overlays the drawing area owns
 * and never serialized.
 */
import Konva from 'konva';
import type { ThemePalette } from '../services/theme.service';
import type { Camera, Rect } from './camera';
import type { CrosshairsLayer } from './crosshairs.layer';
import type { DAEdge } from './da-edge';
import type { DALabel } from './da-label';
import type { DANode } from './da-node';
import type { DAWaypoint } from './da-waypoint';
import type { DrawingLayer } from './drawing.layer';
import { nodeStageRect } from './node-geometry';
import type { Overlay } from './overlay';
import type { Viewport } from './viewport';

/** What the hover cues need from the drawing area. */
export interface CrosshairsHoverHost {
  readonly drawingLayer: DrawingLayer;
  /** Unset until the view is built. */
  readonly crosshairsLayer: CrosshairsLayer | undefined;
  readonly stage: Konva.Stage | undefined;
  readonly camera: Camera;
  readonly viewport: Viewport;
  /** The dashed trace, on the drawing layer. */
  readonly trace: Overlay<Konva.Shape>;
  /** The landing ghost, on the crosshairs layer. */
  readonly ghost: Overlay<Konva.Group>;
  /** How long one crosshairs step animates, in seconds. */
  readonly movementDuration: number;
  palette(): ThemePalette;
  labelUnderCrosshairs(): DALabel | null;
  waypointUnderCrosshairs(): DAWaypoint | undefined;
  nodeUnderCrosshairs(): DANode | null;
  edgeUnderCrosshairs(): DAEdge | null;
}

/** What the crosshairs are resting on, and the trace drawn around it.
 *  `trace` is null when the item is shown by a navigation landing ghost. */
export interface CrosshairHover {
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

export class CrosshairsHover {
  private refreshTimer: number | null = null;

  constructor(private readonly host: CrosshairsHoverHost) {}

  /** Refresh once the crosshairs have finished moving: after their step's
   *  tween by default, or after `delayMs`. A later call replaces an earlier. */
  scheduleRefresh(delayMs?: number): void {
    if (this.refreshTimer !== null) {
      clearTimeout(this.refreshTimer);
    }
    const delay = delayMs ??
      Math.ceil(this.host.movementDuration * 1000) + 30;
    this.refreshTimer = window.setTimeout(() => {
      this.refreshTimer = null;
      this.refresh();
    }, delay);
  }

  /**
   * Show one non-semantic hover trace for the top item under the crosshairs.
   * The hit priority matches selection: label, waypoint, top node, top edge.
   * Using a separate overlay keeps this cue visually and behaviorally
   * independent from the blue selection treatment.
   */
  refresh(): void {
    this.clear(false);
    const {drawingLayer, crosshairsLayer} = this.host;
    if (!drawingLayer || !crosshairsLayer ||
        !crosshairsLayer.crosshairs.konvaGroup.visible()) {
      drawingLayer?.batchDraw();
      return;
    }

    const hover = this.target();
    if (hover?.trace) {
      const trace = hover.trace;
      trace.setAttr('targetKind', hover.kind);
      trace.setAttr('targetId', hover.id);
      this.host.trace.show(() => trace);
    }
    if (hover?.node) {
      this.showGhost(hover.node, hover.ghostReasons);
    }
    drawingLayer.batchDraw();
  }

  /** The one item the crosshairs are on, in selection's priority order, with
   *  the trace to draw around it. Null when they are over empty canvas. */
  target(): CrosshairHover | null {
    const style = this.traceStyle();

    const label = this.host.labelUnderCrosshairs();
    if (label) {
      return {kind: 'label', id: label.id, trace: labelTrace(label, style)};
    }

    const waypoint = this.host.waypointUnderCrosshairs();
    if (waypoint) {
      return {kind: 'waypoint', id: waypoint.id, trace: waypointTrace(waypoint, style)};
    }

    const node = this.host.nodeUnderCrosshairs();
    if (node) {
      // A node that earns a landing ghost gets its dashed trace on the ghost
      // instead. Ringing the real node as well put two dashed outlines of the
      // same node on screen at once (da-434).
      const ghostReasons = this.ghostReasons(node);
      return {
        kind: 'node',
        id: node.id,
        node,
        ghostReasons,
        trace: ghostReasons.length > 0 ? null : nodeTrace(node, style),
      };
    }

    const edge = this.host.edgeUnderCrosshairs();
    if (edge) {
      return {kind: 'edge', id: edge.id, trace: edgeTrace(edge, style)};
    }

    return null;
  }

  clear(draw = true): void {
    // The landing ghost carries the trace for a node that earned one, so the
    // two come down together (da-434). Both layers repaint: the trace lives on
    // the drawing layer, the ghost on the crosshairs layer.
    const removedTrace = this.host.trace.clear(false);
    const removedGhost = this.clearGhost(false);
    const changed = removedTrace || removedGhost;
    if (draw && changed) {
      this.host.drawingLayer.batchDraw();
      this.host.crosshairsLayer?.batchDraw();
    }
  }

  /** Stop a pending refresh and take both cues down, without drawing. */
  dispose(): void {
    if (this.refreshTimer !== null) {
      clearTimeout(this.refreshTimer);
    }
    this.clear(false);
  }

  /** Dash, colour and glow shared by every hover trace, plus the zoom-corrected
   *  padding that keeps the trace clear of the thing it traces. */
  private traceStyle(): HoverTraceStyle {
    const scale = Math.max(this.host.drawingLayer.scaleX(), 0.001);
    const color = this.host.palette().crosshairsStroke;
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

  // ── The landing ghost ──

  private nodeStageRect(node: DANode): Rect {
    return nodeStageRect(node, this.host.camera);
  }

  /** Why the real navigation target needs a readable screen-space copy. */
  ghostReasons(node: DANode): string[] {
    if (!this.host.stage || node.nodeShape === 'junction' || node.nodeShape === 'invisible') return [];
    const {drawingLayer, viewport} = this.host;
    const rect = this.nodeStageRect(node);
    const reasons: string[] = [];
    // The ghost is a copy of the node at its *natural* size, so it is only
    // worth drawing when the real node is harder to read than that copy would
    // be.
    const drawnScale = node.group.scaleY() * drawingLayer.scaleY();
    const pad = 8;
    if (drawnScale > 1) {
      // Zoomed in past natural size there is no stand-in worth drawing: the
      // copy is made at natural size, so it would be *smaller* than the box it
      // stands in for. A pan that pushed a 400% box part-way out of frame used
      // to earn one anyway, and a small dashed copy would appear on top of the
      // very large node it was supposedly standing in for.
    } else if (rect.x < viewport.minX + pad || rect.y < viewport.minY + pad ||
        rect.x + rect.width > viewport.maxX - pad ||
        rect.y + rect.height > viewport.maxY - pad) {
      reasons.push('offscreen');
    }
    if (node.FONT_SIZE * drawnScale < 12) {
      reasons.push('too-small');
    }
    const overlaps = (a: typeof rect, b: typeof rect) =>
      a.x < b.x + b.width && a.x + a.width > b.x &&
      a.y < b.y + b.height && a.y + a.height > b.y;
    if (drawingLayer.getDANodes().some(other =>
      other !== node && other.nodeShape !== 'invisible' && other.konvaGroup.visible() &&
      other.zIndex() > node.zIndex() && overlaps(rect, this.nodeStageRect(other)))) {
      reasons.push('occluded');
    }
    return reasons;
  }

  /** Overlay the actual node (shape, text, status, selection) at natural
   *  scale on the chrome layer. Its position follows the real node when
   *  possible and clamps wholly inside the viewport otherwise. */
  showGhost(node: DANode, knownReasons?: string[]): void {
    this.clearGhost(false);
    const {crosshairsLayer, viewport} = this.host;
    if (!this.host.stage || !crosshairsLayer) return;
    const reasons = knownReasons ?? this.ghostReasons(node);
    if (reasons.length === 0) return;
    const rect = this.nodeStageRect(node);
    const center = {x: rect.x + rect.width / 2, y: rect.y + rect.height / 2};
    const pad = 12;
    const clampedStart = (start: number, size: number, lo: number, hi: number) =>
      size + pad * 2 > hi - lo
        ? lo + (hi - lo - size) / 2
        : Math.max(lo + pad, Math.min(start, hi - size - pad));
    const x = clampedStart(center.x - node.NODE_WIDTH / 2, node.NODE_WIDTH,
      viewport.minX, viewport.maxX);
    const y = clampedStart(center.y - node.NODE_HEIGHT / 2, node.NODE_HEIGHT,
      viewport.minY, viewport.maxY);
    const palette = this.host.palette();
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
    group.add(ghostOutline(node, {
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
    group.add(ghostOutline(node, {
      stroke: palette.crosshairsStroke,
      strokeWidth: 2,
      dash: [7, 5],
    }));
    this.host.ghost.show(() => group);
    crosshairsLayer.batchDraw();
  }

  clearGhost(draw = true): boolean {
    return this.host.ghost.clear(draw);
  }
}

// ── The traces ──

function labelTrace(label: DALabel, {common, pad, scale}: HoverTraceStyle): Konva.Shape {
  return new Konva.Rect({
    ...common,
    x: label.x - label.width / 2 - pad,
    y: label.y - label.height / 2 - pad,
    width: label.width + pad * 2,
    height: label.height + pad * 2,
    cornerRadius: 5 / scale,
  });
}

function waypointTrace(waypoint: DAWaypoint, {common, pad}: HoverTraceStyle): Konva.Shape {
  return new Konva.Circle({...common, x: waypoint.x, y: waypoint.y, radius: waypoint.RADIUS + pad});
}

function nodeTrace(node: DANode, {common, pad, scale}: HoverTraceStyle): Konva.Shape {
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

function edgeTrace(edge: DAEdge, {common}: HoverTraceStyle): Konva.Shape {
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

/** The ghost's backing and its dashed outline, in the node's own shape:
 *  an ellipse for a circle node — which a long label stretches into a real
 *  ellipse — and a rounded box otherwise (da-442). Local to the ghost
 *  group, whose origin is the node's top-left. */
function ghostOutline(node: DANode, style: Record<string, unknown>): Konva.Shape {
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
