"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CrosshairsLayer = void 0;
const konva_1 = __importDefault(require("konva"));
const da_crosshairs_1 = require("./da-crosshairs");
class CrosshairsLayer extends konva_1.default.Layer {
    constructor(stage) {
        super();
        this.stage = stage;
        this.crosshairs = new da_crosshairs_1.DACrosshairs({ x: stage.width() / 2, y: stage.height() / 2 });
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
exports.CrosshairsLayer = CrosshairsLayer;
