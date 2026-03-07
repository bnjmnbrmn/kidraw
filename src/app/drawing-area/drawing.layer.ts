import Konva from 'konva';
import {DANode} from './da-node';
import {DAEdge} from './da-edge';
import {DAWaypoint} from './da-waypoint';
import {DALabel} from './da-label';
import {lineIntersectsGroupBoundingRect, rectContainsPoint} from './utils';
import {GraphSnapshot, DANodeSnapshot, DAEdgeSnapshot} from './graph-snapshot';
import {resetIdCounter} from './id-generator';
import {ThemePalette} from '../services/theme.service';

export class DrawingLayer extends Konva.Layer {
  private readonly daEdgeGroup: Konva.Group;
  private readonly daNodeGroup: Konva.Group;
  private readonly daNodes: DANode[] = [];
  private readonly daEdges: DAEdge[] = [];
  private _palette?: ThemePalette;

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
    
    let daNode = new DANode(nodeCenterX, nodeCenterY, "", undefined, this.nodeColors());
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

  deleteLastCharFromSelected() {
    this.getSelectedDANodes().forEach(daNode => {
      const currentText = daNode.label.text();
      if (currentText.length > 0) {
        daNode.label.text(currentText.slice(0, -1));
      }
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
    edge.srcNode.removeOutgoingEdge(edge);
    edge.destNode.removeIncomingEdge(edge);
    edge.konvaGroup.remove();
    const index = this.daEdges.indexOf(edge);
    if (index >= 0) {
      this.daEdges.splice(index, 1);
    }
  }
  addEdge(srcNode: DANode, destNode: DANode) {
    let daEdge = new DAEdge(srcNode, destNode, "", undefined, this.edgeColors());
    this.daEdgeGroup.add(daEdge.konvaGroup);
    this.daEdges.push(daEdge);
  }

  getDaEdgesIntersectingGroup(group: Konva.Group) {
    return this.daEdges.filter(daEdge => lineIntersectsGroupBoundingRect(daEdge.line, group));
  }

  serializeGraph(): GraphSnapshot {
    const nodes: DANodeSnapshot[] = this.daNodes.map(node => ({
      id: node.id,
      x: node.group.x(),
      y: node.group.y(),
      text: node.label.text(),
      width: node.NODE_WIDTH,
      height: node.NODE_HEIGHT,
      fontSize: node.FONT_SIZE,
      isSelected: node.isSelected,
    }));

    const edges: DAEdgeSnapshot[] = this.daEdges.map(edge => ({
      id: edge.id,
      srcNodeId: edge.srcNode.id,
      destNodeId: edge.destNode.id,
      isSelected: edge.isSelected,
      waypoints: edge.waypoints.map(wp => ({
        id: wp.id,
        x: wp.x,
        y: wp.y,
        isSelected: wp.isSelected,
      })),
      labels: edge.labels.map(lbl => ({
        id: lbl.id,
        x: lbl.x,
        y: lbl.y,
        text: lbl.label,
        fontSize: lbl.fontSize,
        isSelected: lbl.isSelected,
      })),
    }));

    return { nodes, edges };
  }

  restoreGraph(snapshot: GraphSnapshot): void {
    // Destroy all existing Konva objects
    while (this.daNodes.length > 0) {
      const node = this.daNodes.pop()!;
      node.konvaGroup.destroy();
    }
    while (this.daEdges.length > 0) {
      const edge = this.daEdges.pop()!;
      edge.konvaGroup.destroy();
    }

    // Rebuild nodes
    const nodeMap = new Map<string, DANode>();
    let maxNumericId = 0;

    for (const ns of snapshot.nodes) {
      const node = new DANode(ns.x, ns.y, ns.text, ns.id);
      node.restoreState(ns.width, ns.height, ns.fontSize);
      node.isSelected = ns.isSelected;
      this.daNodeGroup.add(node.konvaGroup);
      this.daNodes.push(node);
      nodeMap.set(ns.id, node);
      const num = parseInt(ns.id.replace('da-', ''), 10);
      if (!isNaN(num) && num > maxNumericId) maxNumericId = num;
    }

    // Rebuild edges
    for (const es of snapshot.edges) {
      const srcNode = nodeMap.get(es.srcNodeId);
      const destNode = nodeMap.get(es.destNodeId);
      if (!srcNode || !destNode) continue;

      const edge = new DAEdge(srcNode, destNode, '', es.id);
      edge.isSelected = es.isSelected;
      this.daEdgeGroup.add(edge.konvaGroup);
      this.daEdges.push(edge);

      const num = parseInt(es.id.replace('da-', ''), 10);
      if (!isNaN(num) && num > maxNumericId) maxNumericId = num;

      // Restore waypoints
      for (const ws of es.waypoints) {
        const wp = new DAWaypoint(ws.x, ws.y, ws.id);
        wp.isSelected = ws.isSelected;
        edge.addWaypoint(wp);
        const wpNum = parseInt(ws.id.replace('da-', ''), 10);
        if (!isNaN(wpNum) && wpNum > maxNumericId) maxNumericId = wpNum;
      }

      // Restore labels
      for (const ls of es.labels) {
        const lbl = new DALabel(ls.x, ls.y, ls.text, ls.id);
        if (ls.fontSize !== lbl.DEFAULT_FONT_SIZE) {
          lbl.adjustFontSizeBy(ls.fontSize - lbl.DEFAULT_FONT_SIZE);
        }
        lbl.isSelected = ls.isSelected;
        edge.addLabel(lbl);
        const lblNum = parseInt(ls.id.replace('da-', ''), 10);
        if (!isNaN(lblNum) && lblNum > maxNumericId) maxNumericId = lblNum;
      }

      // Update edge visual
      const points = edge.calculatePoints(srcNode, destNode);
      edge._line.points(points);
      edge.refreshSegments();
    }

    // Reset ID counter above max used ID
    resetIdCounter(maxNumericId);

    // Apply current theme to restored objects
    if (this._palette) {
      this.applyThemeColors(this._palette);
    }
  }

  set palette(p: ThemePalette) {
    this._palette = p;
  }

  applyThemeColors(palette: ThemePalette): void {
    this._palette = palette;
    const nc = { fill: palette.nodeFill, stroke: palette.nodeStroke, text: palette.nodeText };
    const ec = { stroke: palette.edgeStroke, fill: palette.edgeFill };
    const lc = { fill: palette.labelFill, stroke: palette.labelStroke, text: palette.labelText };
    const wc = { fill: palette.waypointFill, stroke: palette.waypointStroke };

    this.daNodes.forEach(n => n.applyColors(nc));
    this.daEdges.forEach(e => {
      e.applyColors(ec);
      e.waypoints.forEach(w => w.applyColors(wc));
      e.labels.forEach(l => l.applyColors(lc));
    });
  }

  private nodeColors() {
    if (!this._palette) return undefined;
    return { fill: this._palette.nodeFill, stroke: this._palette.nodeStroke, text: this._palette.nodeText };
  }

  private edgeColors() {
    if (!this._palette) return undefined;
    return { stroke: this._palette.edgeStroke, fill: this._palette.edgeFill };
  }

  waypointColors() {
    if (!this._palette) return undefined;
    return { fill: this._palette.waypointFill, stroke: this._palette.waypointStroke };
  }

  labelColors() {
    if (!this._palette) return undefined;
    return { fill: this._palette.labelFill, stroke: this._palette.labelStroke, text: this._palette.labelText };
  }
}
