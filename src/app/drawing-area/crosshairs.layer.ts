/**
 * The Konva layer that sits above the graph: the crosshairs themselves and the
 * overlays that explain what a keystroke will do.
 *
 * Deliberately *not* transformed with the drawing layer. Anything here is in
 * stage coordinates and keeps its size at any zoom, which is what makes the
 * navigation overlays and landing ghosts readable when the graph is small.
 */
import Konva from 'konva';
import {DACrosshairs} from './da-crosshairs.group';

export class CrosshairsLayer extends Konva.Layer {
    readonly crosshairs: DACrosshairs;
    constructor(private stage: Konva.Stage, crosshairsStroke?: string) {
      super();
      // Snap initial position to grid (spacing=50) so first inserted node aligns
      const gridSpacing = 50;
      const x = Math.round((stage.width() / 2) / gridSpacing) * gridSpacing;
      const y = Math.round((stage.height() / 2) / gridSpacing) * gridSpacing;
      this.crosshairs = new DACrosshairs({ x, y }, crosshairsStroke);
      this.add(this.crosshairs.konvaGroup);
    }

    showCrosshairs() {
      this.crosshairs.show();
    }

    hideCrosshairs() {
      this.crosshairs.hide();
    }

    crosshairsX() {
      return this.crosshairs.getAbsolutePosition().x;
    }

    crosshairsY() {
      return this.crosshairs.getAbsolutePosition().y;
    }

    setHitRadii(radiusX: number, radiusY: number) {
      this.crosshairs.setHitRadii(radiusX, radiusY);
      this.batchDraw();
    }

    updateCrosshairsColor(color: string) {
      this.crosshairs.updateStrokeColor(color);
      this.batchDraw();
    }
}
