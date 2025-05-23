"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DAEdge = void 0;
const konva_1 = __importDefault(require("konva"));
var Group = konva_1.default.Group;
class DAEdge extends Group {
    get isSelected() {
        return this._isSelected;
    }
    set isSelected(value) {
        this._isSelected = value;
        this._line.strokeWidth(this.strokeWidth());
        this._line.stroke(this.stroke());
    }
    strokeWidth() {
        return this._isSelected ? 4 : 2;
    }
    stroke() {
        return this._isSelected ? 'red' : 'black';
    }
    get line() {
        return this._line;
    }
    constructor(srcNode, destNode, label) {
        super();
        this.srcNode = srcNode;
        this.destNode = destNode;
        this.label = label;
        this._isSelected = true;
        this._line = new konva_1.default.Line({
            points: [srcNode.x(), srcNode.y(), destNode.x(), destNode.y()],
            stroke: this.stroke(),
            strokeWidth: this.strokeWidth()
        });
        this.add(this._line);
    }
}
exports.DAEdge = DAEdge;
