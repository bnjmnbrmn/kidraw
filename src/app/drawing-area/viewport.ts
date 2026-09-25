/**
 * The usable viewport: the stage, minus whatever the UI covers its edges with.
 *
 * The header, the keymenu and the agent panel are DOM overlays sitting on top
 * of the canvas. The canvas is still full-size underneath them, so "center this
 * node" or "keep the crosshairs off the edge" measured against the stage puts
 * things under a panel where nobody can see them. Everything that reasons about
 * where the user can actually look measures against this instead.
 *
 * Stage coordinates throughout — this is about the screen, not the graph.
 */
import { Point } from './utils';

/** How much of each edge is covered, in stage pixels. */
export interface ViewportInset {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/** What a viewport needs from the stage. Konva.Stage satisfies it. */
export interface ViewportStage {
  width(): number;
  height(): number;
}

/** No overlay may take more than this share of an axis (see `edgeInset`). */
const MAX_INSET_SHARE = 0.45;

export class Viewport {
  constructor(
    private readonly stage: () => ViewportStage,
    private readonly inset: () => ViewportInset | undefined,
  ) {}

  get minX(): number { return this.edgeInset('left'); }
  get maxX(): number { return this.stage().width() - this.edgeInset('right'); }
  get minY(): number { return this.edgeInset('top'); }
  get maxY(): number { return this.stage().height() - this.edgeInset('bottom'); }

  /** At least 1, so a viewport squeezed to nothing cannot divide by zero. */
  get width(): number { return Math.max(this.maxX - this.minX, 1); }
  get height(): number { return Math.max(this.maxY - this.minY, 1); }

  get centerX(): number { return this.minX + this.width / 2; }
  get centerY(): number { return this.minY + this.height / 2; }
  get center(): Point { return {x: this.centerX, y: this.centerY}; }

  /** Bring `point` inside, keeping `margin` clear of each edge. */
  clamp(point: Point, margin: Point = {x: 0, y: 0}): Point {
    return {
      x: Math.min(Math.max(point.x, this.minX + margin.x), this.maxX - margin.x),
      y: Math.min(Math.max(point.y, this.minY + margin.y), this.maxY - margin.y),
    };
  }

  /**
   * How far in one edge is, in stage pixels.
   *
   * An unbound or partly bound inset degrades to the full stage. An overlay
   * taller or wider than the window would otherwise leave a zero-sized
   * viewport and freeze navigation, so no edge may claim more than
   * MAX_INSET_SHARE of its axis; the graph gets the room back and shows
   * through instead.
   */
  private edgeInset(edge: keyof ViewportInset): number {
    const raw = this.inset()?.[edge] ?? 0;
    const extent = edge === 'left' || edge === 'right'
      ? this.stage().width()
      : this.stage().height();
    return Math.min(raw, extent * MAX_INSET_SHARE);
  }
}
