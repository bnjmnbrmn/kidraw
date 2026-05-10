import Konva from 'konva';
import {DANode} from './da-node';
import {DAEdge} from './da-edge';
import {DALabel} from './da-label';
import {lineIntersectsGroupBoundingRect, rectContainsPoint} from './utils';
import {GraphSnapshot, DANodeSnapshot, DAEdgeSnapshot} from './graph-snapshot';
import {resetIdCounter} from './id-generator';
import {ThemePalette} from '../services/theme.service';
import {NodeShape, TextOverflowMode} from './command.model';

export class DrawingLayer extends Konva.Layer {
  private readonly gridGroup: Konva.Group;
  private readonly daEdgeGroup: Konva.Group;
  private readonly daNodeGroup: Konva.Group;
  private readonly daNodes: DANode[] = [];
  private readonly daEdges: DAEdge[] = [];
  private _palette?: ThemePalette;
  private gridSpacing = 50;
  private _currentMajorSpacing = 50;
  private _currentMinorSpacing = 5;

  constructor() {
    super();

    this.gridGroup = new Konva.Group({ visible: false, listening: false });
    this.add(this.gridGroup);
    this.daEdgeGroup = new Konva.Group();
    this.add(this.daEdgeGroup);
    this.daNodeGroup = new Konva.Group();
    this.add(this.daNodeGroup);

  }

  /** Rebuild grid lines to cover the given viewport.
   *  Major grid adapts by factors of 10 to keep ~10-20 major squares across the viewport.
   *  Minor (sub-grid) lines are always 1/10th of the major spacing. */
  rebuildGrid(viewportWidth: number, viewportHeight: number): void {
    this.gridGroup.destroyChildren();
    const scale = this.scaleX();

    // Viewport width in drawing-layer coordinates
    const viewportDLWidth = viewportWidth / scale;

    // We want roughly 10–20 major grid squares across the viewport.
    // Target: ~15 squares → target spacing = viewportDLWidth / 15.
    // Round to nearest power of 10 so spacing jumps in decades.
    const targetSpacing = viewportDLWidth / 15;
    const majorSpacing = Math.pow(10, Math.round(Math.log10(targetSpacing)));
    const minorSpacing = majorSpacing / 10;

    this._currentMajorSpacing = majorSpacing;
    this._currentMinorSpacing = minorSpacing;

    const color = this._palette?.keyStrokes?.[0] ?? '#888888';

    // Constant screen-space thickness
    const majorStrokeWidth = 1 / scale;
    const minorStrokeWidth = 0.5 / scale;

    // Extend grid well beyond visible area
    const extent = Math.max(viewportWidth, viewportHeight) * 4 / scale;
    const minCoord = -extent;
    const maxCoord = extent;

    // Minor grid lines (sub-grid)
    for (let x = Math.ceil(minCoord / minorSpacing) * minorSpacing; x <= maxCoord; x += minorSpacing) {
      this.gridGroup.add(new Konva.Line({
        points: [x, minCoord, x, maxCoord],
        stroke: color,
        strokeWidth: minorStrokeWidth,
        opacity: 0.15,
        listening: false,
      }));
    }
    for (let y = Math.ceil(minCoord / minorSpacing) * minorSpacing; y <= maxCoord; y += minorSpacing) {
      this.gridGroup.add(new Konva.Line({
        points: [minCoord, y, maxCoord, y],
        stroke: color,
        strokeWidth: minorStrokeWidth,
        opacity: 0.15,
        listening: false,
      }));
    }

    // Major grid lines (drawn on top of minor)
    for (let x = Math.ceil(minCoord / majorSpacing) * majorSpacing; x <= maxCoord; x += majorSpacing) {
      this.gridGroup.add(new Konva.Line({
        points: [x, minCoord, x, maxCoord],
        stroke: color,
        strokeWidth: majorStrokeWidth,
        opacity: 0.4,
        listening: false,
      }));
    }
    for (let y = Math.ceil(minCoord / majorSpacing) * majorSpacing; y <= maxCoord; y += majorSpacing) {
      this.gridGroup.add(new Konva.Line({
        points: [minCoord, y, maxCoord, y],
        stroke: color,
        strokeWidth: majorStrokeWidth,
        opacity: 0.4,
        listening: false,
      }));
    }
  }

  showGrid(): void {
    this.gridGroup.visible(true);
  }

  hideGrid(): void {
    this.gridGroup.visible(false);
  }

  get gridVisible(): boolean {
    return this.gridGroup.visible();
  }

  getGridSpacing(): number {
    return this._currentMajorSpacing;
  }

  getSubGridSpacing(): number {
    return this._currentMinorSpacing;
  }

  createNewNode(absoluteX: number, absoluteY: number, nodeShape?: NodeShape): DANode {
    // Transform absolute coordinates to drawing layer coordinates (accounting for zoom and pan)
    const layerX = (absoluteX - this.x()) / this.scaleX();
    const layerY = (absoluteY - this.y()) / this.scaleY();

    // Create node first so we can read its actual size constants
    const daNode = new DANode(0, 0, "", undefined, this.nodeColors(), nodeShape);
    const nodeW = daNode.NODE_WIDTH;
    const nodeH = daNode.NODE_HEIGHT;
    // Position so node center is at the crosshairs position
    const x = layerX - nodeW / 2;
    const y = layerY - nodeH / 2;
    daNode.konvaGroup.x(x);
    daNode.konvaGroup.y(y);
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

  appendTextToSelected(text: string): DANode[] {
    const resized: DANode[] = [];
    this.getSelectedDANodes().forEach(daNode => {
      daNode.label.text(daNode.label.text() + text);
      if (daNode.applyTextOverflow()) {
        resized.push(daNode);
      }
    });
    return resized;
  }

  deleteLastCharFromSelected(): DANode[] {
    const resized: DANode[] = [];
    this.getSelectedDANodes().forEach(daNode => {
      const currentText = daNode.label.text();
      if (currentText.length > 0) {
        daNode.label.text(currentText.slice(0, -1));
        if (daNode.applyTextOverflow()) {
          resized.push(daNode);
        }
      }
    });
    return resized;
  }

  changeNodeShape(node: DANode, newShape: NodeShape): void {
    node.changeShape(newShape, this.nodeColors() ?? undefined);
  }

  setTextOverflowModeOnSelected(mode: TextOverflowMode): DANode[] {
    const resized: DANode[] = [];
    this.getSelectedDANodes()
      .filter(n => n.nodeShape !== 'junction')
      .forEach(daNode => {
        daNode.textOverflowMode = mode;
        resized.push(daNode);
      });
    return resized;
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

  clearAll(): void {
    // Remove all edges first (cleans up node references)
    while (this.daEdges.length > 0) {
      this.removeEdge(this.daEdges[this.daEdges.length - 1]);
    }
    // Remove all nodes
    while (this.daNodes.length > 0) {
      const node = this.daNodes[this.daNodes.length - 1];
      node.konvaGroup.remove();
      this.daNodes.pop();
    }
    resetIdCounter();
  }

  addRawNode(node: DANode): void {
    this.daNodeGroup.add(node.konvaGroup);
    this.daNodes.push(node);
  }

  addRawEdge(edge: DAEdge): void {
    this.daEdgeGroup.add(edge.konvaGroup);
    this.daEdges.push(edge);
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
      nodeShape: node.nodeShape,
      textOverflowMode: node.textOverflowMode,
      baseWidth: node.BASE_WIDTH,
      baseHeight: node.BASE_HEIGHT,
      baseFontSize: node.BASE_FONT_SIZE,
      pinned: node.pinned,
    }));

    const edges: DAEdgeSnapshot[] = this.daEdges.map(edge => ({
      id: edge.id,
      srcNodeId: edge.srcNode.id,
      destNodeId: edge.destNode.id,
      isSelected: edge.isSelected,
      labels: edge.labels.map(lbl => ({
        id: lbl.id,
        x: lbl.x,
        y: lbl.y,
        text: lbl.label,
        fontSize: lbl.fontSize,
        isSelected: lbl.isSelected,
      })),
      controlPoints: edge.controlPoints.length > 0
        ? edge.controlPoints.map(p => ({x: p.x, y: p.y}))
        : undefined,
      directedness: edge.directedness !== 'directed' ? edge.directedness : undefined,
      lineStyle: edge.lineStyle !== 'solid' ? edge.lineStyle : undefined,
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
      const node = new DANode(ns.x, ns.y, ns.text, ns.id, undefined, ns.nodeShape);
      node.restoreState(ns.width, ns.height, ns.fontSize, ns.textOverflowMode, ns.baseWidth, ns.baseHeight, ns.baseFontSize);
      node.applyTextOverflow();
      node.isSelected = ns.isSelected;
      node.pinned = ns.pinned ?? false;
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
      if (es.controlPoints && es.controlPoints.length > 0) {
        edge.setControlPoints(es.controlPoints);
      }
      if (es.directedness) edge.directedness = es.directedness;
      if (es.lineStyle) edge.lineStyle = es.lineStyle;
      this.daEdgeGroup.add(edge.konvaGroup);
      this.daEdges.push(edge);

      const num = parseInt(es.id.replace('da-', ''), 10);
      if (!isNaN(num) && num > maxNumericId) maxNumericId = num;

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
      edge.refreshGeometry();
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

    this.daNodes.forEach(n => n.applyColors(nc));
    this.daEdges.forEach(e => {
      e.applyColors(ec);
      e.labels.forEach(l => l.applyColors(lc));
    });
  }

  nodeColors() {
    if (!this._palette) return undefined;
    return { fill: this._palette.nodeFill, stroke: this._palette.nodeStroke, text: this._palette.nodeText };
  }

  edgeColors() {
    if (!this._palette) return undefined;
    return { stroke: this._palette.edgeStroke, fill: this._palette.edgeFill };
  }

  labelColors() {
    if (!this._palette) return undefined;
    return { fill: this._palette.labelFill, stroke: this._palette.labelStroke, text: this._palette.labelText };
  }
}
