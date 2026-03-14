import Konva from 'konva';
import {DACrosshairs} from './da-crosshairs.group';

export class CrosshairsLayer extends Konva.Layer {
    readonly crosshairs: DACrosshairs;
    constructor(private stage: Konva.Stage, crosshairsStroke?: string) {
      super();
      this.crosshairs = new DACrosshairs({ x: stage.width() / 2, y: stage.height() / 2 }, crosshairsStroke);
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

    setHeading(angleRadians: number) {
      this.crosshairs.setHeading(angleRadians);
      this.batchDraw();
    }

    setHeadingVisible(visible: boolean) {
      this.crosshairs.setHeadingVisible(visible);
      this.batchDraw();
    }

    updateCrosshairsColor(color: string) {
      this.crosshairs.updateStrokeColor(color);
      this.batchDraw();
    }
}
