"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DrawingLayer = void 0;
const konva_1 = __importDefault(require("konva"));
const da_node_1 = require("./da-node");
const da_edge_1 = require("./da-edge");
const utils_1 = require("./utils");
class DrawingLayer extends konva_1.default.Layer {
    constructor() {
        super();
        this.daNodes = [];
        this.daEdges = [];
        this.daEdgeGroup = new konva_1.default.Group();
        this.add(this.daEdgeGroup);
        this.daNodeGroup = new konva_1.default.Group();
        this.add(this.daNodeGroup);
    }
    createNewNode(absoluteX, absoluteY) {
        let daNode = new da_node_1.DANode((absoluteX - this.x()) / this.scaleX(), (absoluteY - this.y()) / this.scaleY(), "");
        this.daNodeGroup.add(daNode);
        this.daNodes.push(daNode);
    }
    getSelectedDANodes() {
        return this.daNodes.filter((daNode) => daNode.isSelected);
    }
    getSelectedDAEdges() {
        return this.daEdges.filter((daEdge) => daEdge.isSelected);
    }
    appendTextToSelected(text) {
        this.getSelectedDANodes().forEach(daNode => {
            daNode.label.text(daNode.label.text() + text);
        });
    }
    unselectAll() {
        this.getSelectedDANodes().forEach(daNode => {
            daNode.isSelected = false;
        });
        this.getSelectedDAEdges().forEach(daEdge => {
            daEdge.isSelected = false;
        });
    }
    getSelectedItems() {
        return this.getSelectedDANodes().concat(this.getSelectedDAEdges());
    }
    getDaNodesContainingPoint(point) {
        return this.daNodes.filter(daNode => {
            return (0, utils_1.rectContainsPoint)(daNode.getClientRect(), point);
        });
    }
    addEdge(srcNode, destNode) {
        let daEdge = new da_edge_1.DAEdge(srcNode, destNode, "");
        this.daEdgeGroup.add(daEdge);
        this.daEdges.push(daEdge);
    }
    getDaEdgesIntersectingGroup(group) {
        return this.daEdges.filter(daEdge => (0, utils_1.lineIntersectsGroupBoundingRect)(daEdge.line, group));
    }
}
exports.DrawingLayer = DrawingLayer;
