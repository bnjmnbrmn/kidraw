"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DANode = void 0;
const konva_1 = __importDefault(require("konva"));
var Group = konva_1.default.Group;
var Rect = konva_1.default.Rect;
var Text = konva_1.default.Text;
class DANode extends Group {
    get isSelected() {
        return this._isSelected;
    }
    set isSelected(value) {
        this._isSelected = value;
        this.rect.strokeWidth(this.strokeWidth());
    }
    strokeWidth() {
        return this._isSelected ? 4 : 2;
    }
    get rect() {
        return this._rect;
    }
    get label() {
        return this._label;
    }
    constructor(x, y, initialText) {
        super({ x, y });
        this._isSelected = true;
        const width = 100;
        const height = 100;
        this._rect = new Rect({
            width: width,
            height: height,
            fill: 'white',
            stroke: 'black',
            strokeWidth: this.strokeWidth(),
            // cornerRadius: 5,
            offsetX: width / 2,
            offsetY: height / 2,
        });
        this._label = new Text({
            text: initialText,
            fontSize: 16,
            width: width,
            height: height,
            align: 'center',
            verticalAlign: 'middle',
            offsetX: width / 2,
            offsetY: height / 2,
        });
        this.add(this._rect);
        this.add(this._label);
    }
}
exports.DANode = DANode;
