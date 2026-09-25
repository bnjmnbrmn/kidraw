import Konva from 'konva';
import type {DANode} from './da-node';
import type {DrawingLayer} from './drawing.layer';
import type {NodeShape} from './command.model';
import type {Point} from './utils';
import type {GrowGhostTarget} from './grow-ghost-targets';
import {Overlay} from './overlay';

/** The dashed box a new node is previewed at, before it exists to measure. */
export const GROW_GHOST_BOX = {w: 140, h: 60};

/**
 * What a held Add gesture is aiming at — everything the preview draws from,
 * and nothing else.
 *
 * Grow mode carries about twenty fields; nine of them are the aim. Naming that
 * subset is what lets the preview move out of the component: the renderer
 * takes one value and reads no state at all.
 */
export interface GrowAim {
  /** The node being grown from. Null on an empty-canvas add, which therefore
   *  previews a node but no edge. */
  anchor: DANode | null;
  /** The anchor's center in layer coordinates, fixed when the gesture began. */
  origin: Point;
  /** Placement sub-mode: the new node is being positioned freely rather than
   *  aimed at one of the lattice spots. */
  placing: boolean;
  placePos: Point | null;
  /** Shape of the node that would land. */
  newNodeShape: NodeShape;
  /** Shape the lattice spots are drawn as. Only ever the default: while
   *  placing, the spots are not drawn at all. */
  slotShape: NodeShape;
  /** An existing node aimed at. */
  target: DANode | null;
  /** A lattice spot aimed at. */
  insertionTarget: GrowGhostTarget | null;
  /** Every spot on offer, drawn faintly with the aimed-at one at full strength. */
  targets: readonly GrowGhostTarget[];
  /** Where the directedness cycle is: 0 forward, 1 back, 2 none, 3 both. */
  dirState: number;
}

export interface GrowGhostHost {
  /** Both the layer the preview is drawn on and the zoom it reads. */
  readonly drawingLayer: DrawingLayer;
  /** The one palette color the preview draws with. */
  readonly stroke: string;
}

/** Where the trimmed ghost edge ends, and how big the thing there is. */
interface GhostEnd {
  center: Point;
  half: {w: number; h: number};
}

/**
 * The dashed preview of what the held Add key is about to create: the
 * candidate slots around the anchor, the node that would land, and the edge
 * that would connect it.
 *
 * Rebuilt from scratch on every aim change — cheap enough, and it means there
 * is no incremental update path to get wrong.
 */
export class GrowGhost {
  private readonly overlay: Overlay<Konva.Group>;

  constructor(private readonly host: GrowGhostHost) {
    this.overlay = new Overlay<Konva.Group>(() => this.host.drawingLayer);
  }

  /** What is showing, if anything. The browser scripts read it (tools/qa). */
  get node(): Konva.Group | null {
    return this.overlay.node;
  }

  clear(draw = true): boolean {
    return this.overlay.clear(draw);
  }

  show(aim: GrowAim): void {
    this.overlay.show(() => {
      const ghost = new Konva.Group({listening: false, opacity: 0.55});
      this.draw(ghost, aim);
      return ghost;
    });
    this.host.drawingLayer.batchDraw();
  }

  /** Fill `ghost` with the preview for `aim`. Returns early at each aim that
   *  draws no connecting edge. */
  private draw(ghost: Konva.Group, aim: GrowAim): void {
    const scale = this.host.drawingLayer.scaleX();
    const anchor = aim.anchor;

    if (anchor && !aim.placing) this.addSlots(ghost, aim, scale);

    // Anchored but aimed at nothing yet: the offer is a self-loop.
    if (anchor && !aim.placing && !aim.target && !aim.insertionTarget) {
      this.addSelfLoop(ghost, anchor, aim.dirState, scale);
      return;
    }

    // Aimed back at the anchor: outline it. An edge here would have zero length.
    if (anchor && aim.target === anchor) {
      ghost.add(this.outline(anchor, scale, 'grow-home-target'));
      return;
    }

    const end = this.addNode(ghost, aim, scale);

    // Empty-canvas adds have no anchor and therefore no ghost edge.
    if (!anchor) return;
    this.addEdge(ghost, anchor, aim, end, scale);
  }

  /** A dashed "+" slot at each place the new node could go, the aimed-at one
   *  drawn at full strength. */
  private addSlots(ghost: Konva.Group, aim: GrowAim, scale: number): void {
    for (const target of aim.targets) {
      const active = target.id === aim.insertionTarget?.id;
      const marker = this.shapeOf(
        aim.slotShape, target, GROW_GHOST_BOX.w, GROW_GHOST_BOX.h, scale);
      marker.name(active ? 'grow-insertion-target-active' : 'grow-insertion-target');
      marker.setAttr('ghostSource', target.source);
      marker.dash([2, 7]);
      marker.opacity(active ? 1 : 0.24);
      ghost.add(marker);
      ghost.add(new Konva.Text({
        name: `grow-insertion-kind grow-insertion-kind-${target.source}`,
        x: target.x - 24 / scale,
        y: target.y - 10 / scale,
        width: 48 / scale,
        align: 'center',
        text: '+',
        fontSize: 20 / scale,
        fontStyle: 'bold',
        fill: this.host.stroke,
        opacity: active ? 1 : 0.5,
        listening: false,
      }));
    }
  }

  /** The node that would land, and where the ghost edge should stop. */
  private addNode(ghost: Konva.Group, aim: GrowAim, scale: number): GhostEnd {
    const half = {w: GROW_GHOST_BOX.w / 2, h: GROW_GHOST_BOX.h / 2};

    if (aim.placing && aim.placePos) {
      ghost.add(this.shapeOf(
        aim.newNodeShape, aim.placePos, GROW_GHOST_BOX.w, GROW_GHOST_BOX.h, scale));
      return {center: aim.placePos, half};
    }

    // The slot marker is already drawn, by addSlots.
    if (aim.anchor && aim.insertionTarget) {
      return {center: aim.insertionTarget, half};
    }

    if (aim.anchor && aim.target && aim.target !== aim.anchor) {
      const target = aim.target;
      const pos = target.group.position();
      ghost.add(this.outline(target, scale));
      return {
        center: {x: pos.x + target.NODE_WIDTH / 2, y: pos.y + target.NODE_HEIGHT / 2},
        half: {w: target.NODE_WIDTH / 2, h: target.NODE_HEIGHT / 2},
      };
    }

    const center = {...aim.origin};
    ghost.add(new Konva.Rect({
      x: center.x - half.w,
      y: center.y - half.h,
      width: GROW_GHOST_BOX.w,
      height: GROW_GHOST_BOX.h,
      stroke: this.host.stroke,
      dash: [6, 4],
      strokeWidth: 2 / scale,
      cornerRadius: 4,
    }));
    return {center, half};
  }

  /** The arrow from anchor to ghosted node, trimmed at both boundaries so it
   *  starts and ends on the boxes rather than inside them. */
  private addEdge(
    ghost: Konva.Group,
    anchor: DANode,
    aim: GrowAim,
    end: GhostEnd,
    scale: number,
  ): void {
    const dx = end.center.x - aim.origin.x;
    const dy = end.center.y - aim.origin.y;
    const length = Math.hypot(dx, dy) || 1;
    const ux = dx / length, uy = dy / length;
    // Trim by the smaller half-extent of each box: an axis-aligned
    // approximation that keeps the arrow clear of both at any angle.
    const trimFrom = Math.min(anchor.NODE_WIDTH, anchor.NODE_HEIGHT) / 2;
    const trimTo = Math.min(end.half.w, end.half.h);
    ghost.add(new Konva.Arrow({
      points: [
        aim.origin.x + ux * trimFrom, aim.origin.y + uy * trimFrom,
        end.center.x - ux * trimTo, end.center.y - uy * trimTo,
      ],
      stroke: this.host.stroke, fill: this.host.stroke, dash: [8, 6],
      strokeWidth: 3 / scale,
      pointerLength: 14, pointerWidth: 14,
      ...arrowheads(aim.dirState),
    }));
  }

  /** The loop offered before the first hop: release here and the anchor gets
   *  an edge back to itself. */
  private addSelfLoop(
    ghost: Konva.Group,
    anchor: DANode,
    dirState: number,
    scale: number,
  ): void {
    const pos = anchor.group.position();
    const width = anchor.NODE_WIDTH;
    const height = anchor.NODE_HEIGHT;
    const offsetX = Math.max(28, width * 0.32);
    const offsetY = Math.max(18, height * 0.2);
    ghost.add(new Konva.Arrow({
      name: 'grow-self-loop-preview',
      points: [
        pos.x + width, pos.y + height * 0.35,
        pos.x + width + offsetX, pos.y + height * 0.22 - offsetY,
        pos.x + width + offsetX, pos.y + height * 0.78 + offsetY,
        pos.x + width, pos.y + height * 0.65,
      ],
      stroke: this.host.stroke,
      fill: this.host.stroke,
      dash: [8, 6],
      strokeWidth: 3 / scale,
      tension: 0.5,
      pointerLength: 14,
      pointerWidth: 14,
      ...arrowheads(dirState),
    }));
  }

  /** The dashed box drawn just outside an existing node to show it is aimed at. */
  private outline(node: DANode, scale: number, name?: string): Konva.Rect {
    const pos = node.group.position();
    const inset = 6;
    return new Konva.Rect({
      ...(name ? {name} : {}),
      x: pos.x - inset,
      y: pos.y - inset,
      width: node.NODE_WIDTH + inset * 2,
      height: node.NODE_HEIGHT + inset * 2,
      stroke: this.host.stroke,
      dash: [6, 4],
      strokeWidth: 3 / scale,
      cornerRadius: 6,
    });
  }

  /** A dashed outline of the given node shape, centered on a point. */
  private shapeOf(
    shape: NodeShape,
    center: Point,
    w: number,
    h: number,
    scale: number,
  ): Konva.Shape {
    const common = {stroke: this.host.stroke, dash: [6, 4], strokeWidth: 2 / scale};
    switch (shape) {
      case 'circle':
        return new Konva.Ellipse(
          {x: center.x, y: center.y, radiusX: w / 2, radiusY: h / 2, ...common});
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
}

/** Which ends of a preview arrow get a head, from the directedness cycle. */
function arrowheads(dirState: number): {pointerAtEnding: boolean; pointerAtBeginning: boolean} {
  return {
    pointerAtEnding: dirState === 0 || dirState === 3,
    pointerAtBeginning: dirState === 1 || dirState === 3,
  };
}
