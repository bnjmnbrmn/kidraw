/**
 * The transform between the canvas's two coordinate spaces.
 *
 * **Stage pixels** are what the user points at: the crosshairs, the viewport
 * edges, a mouse position, a margin measured in screen pixels. **Layer units**
 * are where the graph lives: node positions, edge paths, waypoints — the
 * numbers that get serialised, and that do not change when you zoom.
 *
 * Converting between them is `(v - origin) / scale` one way and
 * `v * scale + origin` the other. That arithmetic was written out twenty-two
 * times in the drawing area, under four different naming conventions
 * (`...InStageCoordinates`, `...InLayerCoordinates`, `...InLayerCoords`,
 * `...InDrawingLayer`) — four spellings for two spaces, which is what happens
 * to a concept nobody has named. One consequence: the crosshairs-to-layer
 * conversion existed as a method *and* twice more inline, in callers that
 * could have used it.
 *
 * Naming the spaces is the point. A `Point` on its own says nothing about
 * which space it is in; a call to `toLayer` or `toStage` says both where it
 * came from and where it went.
 */
import { Point } from './utils';

/** What a camera needs from the layer it watches. Konva.Layer satisfies it. */
export interface CameraLayer {
  x(): number;
  y(): number;
  scaleX(): number;
}

/** A rectangle, in whichever space its producer names. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A rectangle by its bounds, the form the hit tests want. */
export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export class Camera {
  /** Lazily, because the layer is built in ngAfterViewInit. */
  constructor(private readonly layer: () => CameraLayer) {}

  /**
   * Layer units per stage pixel.
   *
   * One number, not two: every place that scales the drawing layer sets x and
   * y together (zoomAboutCrosshairs, recenterView, fitViewToContent, and the
   * two `scale({x: s, y: s})` calls), so the layer is only ever uniformly
   * scaled. A node's *own* group can be scaled independently — the nav popup
   * enlarges its source that way — and that is read from the node, not here.
   */
  get scale(): number {
    return this.layer().scaleX();
  }

  /** Where the layer's origin sits in stage pixels. */
  get origin(): Point {
    return {x: this.layer().x(), y: this.layer().y()};
  }

  /** Stage pixels → layer units. */
  toLayer(point: Point): Point {
    return {
      x: (point.x - this.layer().x()) / this.scale,
      y: (point.y - this.layer().y()) / this.scale,
    };
  }

  /** Layer units → stage pixels. */
  toStage(point: Point): Point {
    return {
      x: point.x * this.scale + this.layer().x(),
      y: point.y * this.scale + this.layer().y(),
    };
  }

  /** A screen distance in layer units — the `16 / scale` idiom, named. */
  toLayerDistance(stagePixels: number): number {
    return stagePixels / this.scale;
  }

  /** A graph distance in stage pixels. */
  toStageDistance(layerUnits: number): number {
    return layerUnits * this.scale;
  }

  /** A stage-space rectangle as layer-space bounds. */
  boundsToLayer(rect: Rect): Bounds {
    const min = this.toLayer({x: rect.x, y: rect.y});
    const max = this.toLayer({x: rect.x + rect.width, y: rect.y + rect.height});
    return {minX: min.x, minY: min.y, maxX: max.x, maxY: max.y};
  }
}
