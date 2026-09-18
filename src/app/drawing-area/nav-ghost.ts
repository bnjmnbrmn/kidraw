import Konva from 'konva';
import type {DANode} from './da-node';
import type {DrawingLayer} from './drawing.layer';
import type {Camera} from './camera';
import type {ThemePalette} from '../services/theme.service';
import type {NavCandidate} from './graph-nav';
import type {Point} from './utils';
import {nodeCenterInLayer} from './node-geometry';
import {boxEdgePoint, ghostLandingPoint, HalfExtents} from './nav-ghost-geometry';
import {Overlay} from './overlay';

export interface NavGhostHost {
  /** Both the layer the ghost is drawn on and the zoom it reads. */
  readonly drawingLayer: DrawingLayer;
  readonly camera: Camera;
  readonly stage: Konva.Stage;
  readonly palette: ThemePalette;
}

/** The look of a navigation ghost, resolved for the current zoom. */
interface GhostStyle {
  /** Inverse-zoom factor keeping ghosts at their 100%-zoom size or larger. */
  boost: number;
  dash: number[];
  palette: ThemePalette;
}

const DASH = [8, 5];
const LABEL_ROW_GAP = 4;
/** Screen-space breathing room between a pulled-in ghost and the viewport edge. */
const EDGE_MARGIN = 16;

/**
 * The preview of a jump the nav popup is offering.
 *
 * Dashed copies of the source node, the edge and its labels, and the
 * destination — drawn without moving the view, so the popup can offer several
 * candidates in turn and each is seen in place. A destination that would land
 * off-screen slides along the source→destination ray until it fits, so the
 * bearing survives even when the distance cannot.
 *
 * The straight ghost edge may cross real nodes and edges. That is the accepted
 * cost of keeping the preview cheap: it is redrawn on every highlight change.
 */
export class NavGhost {
  private readonly overlay: Overlay<Konva.Group>;

  constructor(private readonly host: NavGhostHost) {
    this.overlay = new Overlay<Konva.Group>(() => this.host.drawingLayer);
  }

  /** What is showing, if anything. The browser scripts read every overlay
   *  through `.node`; this one is no exception (tools/qa/contract). */
  get node(): Konva.Group | null {
    return this.overlay.node;
  }

  clear(): void {
    this.overlay.clear();
  }

  /** Draw the preview of travelling from `source` along `candidate`. */
  show(source: DANode, candidate: NavCandidate): void {
    this.clear();
    const style = this.styleForZoom();
    const destination = candidate.other;

    // The source box as rendered: the popup's emphasis scales its group.
    const sourceHalf = {
      w: source.NODE_WIDTH * source.group.scaleX() / 2,
      h: source.NODE_HEIGHT * source.group.scaleY() / 2,
    };
    const sourceCentre = {
      x: source.group.x() + sourceHalf.w,
      y: source.group.y() + sourceHalf.h,
    };
    const destHalf = {w: destination.NODE_WIDTH / 2, h: destination.NODE_HEIGHT / 2};

    const {lo, hi} = this.visibleBounds(destHalf, style.boost);
    const landing = ghostLandingPoint(sourceCentre, nodeCenterInLayer(destination), lo, hi);

    const group = new Konva.Group({listening: false, opacity: 0.8});
    const edge = this.buildEdge(candidate, sourceCentre, sourceHalf, landing, destHalf, style);

    // Arrow first, then the boxes over it. Labels last: they stay readable even
    // when a short ghost edge tucks them under one of the ghost boxes.
    if (edge) group.add(edge.arrow);
    group.add(this.buildBox(sourceCentre, sourceHalf, labelOf(source), style));
    group.add(this.buildBox(landing, destHalf, labelOf(destination), style));
    if (edge?.labels) group.add(edge.labels);

    // On top of the node group: ghosts render over the graph.
    this.overlay.show(() => group);
  }

  /** Ghosts never render below their 100%-zoom size: below that, every ghost
   *  dimension (box, text, stroke, labels) is inflated by 1/scale so
   *  legibility is independent of how far out the view is. Centres stay at
   *  true layer positions — only the ghosts' size is zoom-immune. */
  private styleForZoom(): GhostStyle {
    const scale = this.host.drawingLayer.scaleX();
    return {boost: Math.max(1, 1 / scale), dash: DASH, palette: this.host.palette};
  }

  /** The viewport in layer coordinates, inset so a boosted ghost box of the
   *  given size lands fully visible: half the rendered box plus a margin. */
  private visibleBounds(half: HalfExtents, boost: number): {lo: Point; hi: Point} {
    const margin = this.host.camera.toLayerDistance(EDGE_MARGIN);
    const inset = {x: half.w * boost + margin, y: half.h * boost + margin};
    const topLeft = this.host.camera.toLayer({x: 0, y: 0});
    const bottomRight = this.host.camera.toLayer(
      {x: this.host.stage.width(), y: this.host.stage.height()});
    return {
      lo: {x: topLeft.x + inset.x, y: topLeft.y + inset.y},
      hi: {x: bottomRight.x - inset.x, y: bottomRight.y - inset.y},
    };
  }

  /** A dashed copy of a node, anchored on its centre. The subgroup carries the
   *  boost, so its contents are laid out at natural (100%-zoom) dimensions. */
  private buildBox(
    centre: Point,
    half: HalfExtents,
    text: string,
    {boost, dash, palette}: GhostStyle,
  ): Konva.Group {
    const w = half.w * 2, h = half.h * 2;
    const box = new Konva.Group({
      x: centre.x, y: centre.y,
      offsetX: half.w, offsetY: half.h,
      scaleX: boost, scaleY: boost,
    });
    box.add(new Konva.Rect({
      width: w, height: h, cornerRadius: 10,
      fill: palette.nodeFill, stroke: palette.nodeStroke, strokeWidth: 2,
      dash,
      shadowColor: palette.highlightShadowColor, shadowBlur: 10, shadowOpacity: 0.35,
    }));
    if (text) {
      box.add(new Konva.Text({
        text, width: w, height: h, align: 'center', verticalAlign: 'middle',
        fontSize: 16, fill: palette.nodeText,
      }));
    }
    return box;
  }

  /** Straight ghost edge between the two ghost boxes' borders, arrowhead
   *  matching the real edge's direction, labels stacked at its midpoint.
   *  Null when the two boxes sit on top of each other. */
  private buildEdge(
    candidate: NavCandidate,
    sourceCentre: Point,
    sourceHalf: HalfExtents,
    destCentre: Point,
    destHalf: HalfExtents,
    style: GhostStyle,
  ): {arrow: Konva.Arrow; labels: Konva.Group | null} | null {
    const {boost, dash, palette} = style;
    const span = {x: destCentre.x - sourceCentre.x, y: destCentre.y - sourceCentre.y};
    if (Math.hypot(span.x, span.y) <= 1e-6) return null;

    const from = boxEdgePoint(sourceCentre, scaleHalf(sourceHalf, boost), span);
    const to = boxEdgePoint(destCentre, scaleHalf(destHalf, boost), {x: -span.x, y: -span.y});

    const arrow = new Konva.Arrow({
      points: candidate.direction === 'out'
        ? [from.x, from.y, to.x, to.y]
        : [to.x, to.y, from.x, from.y],
      stroke: palette.edgeStroke, fill: palette.edgeFill,
      strokeWidth: 2.5 * boost, dash: dash.map(d => d * boost),
      pointerLength: 12 * boost, pointerWidth: 10 * boost,
    });

    const texts = candidate.edge.labels.map(label => label.label).filter(text => text.trim());
    const midpoint = {x: (from.x + to.x) / 2, y: (from.y + to.y) / 2};
    return {arrow, labels: texts.length > 0 ? this.buildLabels(texts, midpoint, style) : null};
  }

  /** The edge's labels as a stack of dashed pills, laid out at natural size
   *  around (0,0) and boost-scaled as a whole onto the ghost edge's midpoint. */
  private buildLabels(
    texts: string[],
    midpoint: Point,
    {boost, palette}: GhostStyle,
  ): Konva.Group {
    const stack = new Konva.Group(
      {x: midpoint.x, y: midpoint.y, scaleX: boost, scaleY: boost});
    let rowY = 0;
    texts.forEach((text, i) => {
      const label = new Konva.Text({text, fontSize: 12, fill: palette.labelText, padding: 5});
      if (i === 0) rowY = -(texts.length * (label.height() + LABEL_ROW_GAP) - LABEL_ROW_GAP) / 2;
      const x = -label.width() / 2;
      stack.add(new Konva.Rect({
        x, y: rowY, width: label.width(), height: label.height(), cornerRadius: 6,
        fill: palette.labelFill, stroke: palette.labelStroke,
        strokeWidth: 1.5, dash: [4, 3],
      }));
      label.position({x, y: rowY});
      stack.add(label);
      rowY += label.height() + LABEL_ROW_GAP;
    });
    return stack;
  }
}

function labelOf(node: DANode): string {
  return (node.label?.text() ?? '').trim();
}

/** Grow half-extents by the ghost boost, so a ray meets the box as drawn. */
function scaleHalf(half: HalfExtents, boost: number): HalfExtents {
  return {w: half.w * boost, h: half.h * boost};
}
