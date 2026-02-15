import Konva from 'konva';
import {DANode} from './da-node';
import {DAEdge} from './da-edge';
import {lineIntersectsGroupBoundingRect, rectContainsPoint} from './utils';

export class DrawingLayer extends Konva.Layer {
  private readonly daEdgeGroup: Konva.Group;
  private readonly daNodeGroup: Konva.Group;
  private readonly daNodes: DANode[] = [];
  private readonly daEdges: DAEdge[] = [];

  constructor() {
    super();

    this.daEdgeGroup = new Konva.Group();
    this.add(this.daEdgeGroup);
    this.daNodeGroup = new Konva.Group();
    this.add(this.daNodeGroup);

  }

  createNewNode(absoluteX: number, absoluteY: number): DANode {
    // Transform absolute coordinates to drawing layer coordinates (accounting for zoom and pan)
    const layerX = (absoluteX - this.x()) / this.scaleX();
    const layerY = (absoluteY - this.y()) / this.scaleY();
    
    // Calculate position so node center is at the crosshairs position
    const NODE_WIDTH = 100;
    const NODE_HEIGHT = 100;
    const nodeCenterX = layerX - (NODE_WIDTH / 2);
    const nodeCenterY = layerY - (NODE_HEIGHT / 2);
    
    let daNode = new DANode(nodeCenterX, nodeCenterY, "");
    this.daNodeGroup.add(daNode.konvaGroup);
    this.daNodes.push(daNode);
    // Select the new node for editing
    daNode.isSelected = true;
    return daNode;
  }

  getSelectedDANodes(): DANode[] {
    return this.daNodes.filter((daNode) => daNode.isSelected);
  }

  getSelectedDAEdges(): DAEdge[] {
    return this.daEdges.filter((daEdge) => daEdge.isSelected);
  }

  getDANodes(): DANode[] {
    return this.daNodes;
  }

  getDAEdges(): DAEdge[] {
    return this.daEdges;
  }

  appendTextToSelected(text: string) {
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
    return (this.getSelectedDANodes() as (DANode|DAEdge)[]).concat(this.getSelectedDAEdges());
  }

  getDaNodesContainingPoint(point: { x: number; y: number }) {
    return this.daNodes.filter(daNode => {
        return rectContainsPoint(daNode.getClientRect(), point);
      }
    );
  }

  removeNode(node: DANode): void {
    // Remove all edges connected to this node first
    const connectedEdges = this.daEdges.filter(e => e.srcNode === node || e.destNode === node);
    connectedEdges.forEach(edge => this.removeEdge(edge));
    
    node.konvaGroup.remove();
    const index = this.daNodes.indexOf(node);
    if (index >= 0) {
      this.daNodes.splice(index, 1);
    }
  }

  removeEdge(edge: DAEdge): void {
    edge.konvaGroup.remove();
    const index = this.daEdges.indexOf(edge);
    if (index >= 0) {
      this.daEdges.splice(index, 1);
    }
  }
  addEdge(srcNode: DANode, destNode: DANode) {
    let daEdge = new DAEdge(srcNode, destNode, "");
    this.daEdgeGroup.add(daEdge.konvaGroup);
    this.daEdges.push(daEdge);
  }

  getDaEdgesIntersectingGroup(group: Konva.Group) {
    return this.daEdges.filter(daEdge => lineIntersectsGroupBoundingRect(daEdge.line, group));
  }
}
