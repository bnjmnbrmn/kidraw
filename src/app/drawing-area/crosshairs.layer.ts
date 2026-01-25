import Konva from 'konva';
import {DACrosshairs} from './da-crosshairs.group';

export class CrosshairsLayer extends Konva.Layer {
    readonly crosshairs: DACrosshairs;
    constructor(private stage: Konva.Stage) {
      super();
      this.crosshairs = new DACrosshairs({ x: stage.width() / 2, y: stage.height() / 2 });
      this.add(this.crosshairs);
    }

    showCrosshairs() {
      this.crosshairs.show();
    }

    hideCrosshairs() {
      this.crosshairs.hide();
    }

    crosshairsX() {
      return this.crosshairs.getAbsolutePosition(this).x;
    }

    crosshairsY() {
      return this.crosshairs.getAbsolutePosition(this).y;
    }
}
