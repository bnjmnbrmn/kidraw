"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DACrosshairs = void 0;
const konva_1 = __importDefault(require("konva"));
class DACrosshairs extends konva_1.default.Group {
    constructor(p) {
        super({ x: p.x, y: p.y, opacity: .5 });
        const horiz = new konva_1.default.Line({
            points: [-20, 0, 20, 0],
            stroke: 'black',
            strokeWidth: 3,
            // opacity: .5
        });
        this.add(horiz);
        const vert = new konva_1.default.Line({
            points: [0, -20, 0, 20],
            stroke: 'black',
            strokeWidth: 3,
            // opacity: .5
        });
        this.add(vert);
    }
}
exports.DACrosshairs = DACrosshairs;
