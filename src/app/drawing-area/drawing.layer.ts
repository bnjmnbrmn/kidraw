import Konva from 'konva';
import {DANode} from './da-node';
import {DAEdge} from './da-edge';
import {DALabel} from './da-label';
import {DAWaypoint} from './da-waypoint';
import {lineIntersectsGroupBoundingRect, rectContainsPoint} from './utils';
import {GraphSnapshot, DANodeSnapshot, DAEdgeSnapshot} from './graph-snapshot';
import {resetIdCounter} from './id-generator';
import {ThemePalette} from '../services/theme.service';
import {NodeShape, TextOverflowMode} from './command.model';
import {KidrawExtension} from '../extensions/extension.model';
import {resolveIdentity} from '../extensions/extension-registry';
import {activeTagChoice} from '../extensions/tag-groups';

export class DrawingLayer extends Konva.Layer {
  private readonly gridGroup: Konva.Group;
  private readonly daEdgeGroup: Konva.Group;
  private readonly daNodeGroup: Konva.Group;
  private readonly daNodes: DANode[] = [];
  private readonly daEdges: DAEdge[] = [];
  private _palette?: ThemePalette;
  /** Id of the identity extension bound to this graph (its diagram type).
   *  Serialized with the graph; 'default' is implicit and never persisted. */
  private _diagramType = 'default';
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

    // Skip minor lines when they'd be too close together on screen (<8 px apart)
    // — avoids visual clutter and wasted draw calls at low zoom
    const minorScreenSpacing = minorSpacing * scale;
    const drawMinor = minorScreenSpacing >= 8;

    if (drawMinor) {
      for (let x = Math.ceil(minCoord / minorSpacing) * minorSpacing; x <= maxCoord; x += minorSpacing) {
        this.gridGroup.add(new Konva.Line({
          points: [x, minCoord, x, maxCoord],
          stroke: color,
          strokeWidth: minorStrokeWidth,
          opacity: 0.2,
          listening: false,
        }));
      }
      for (let y = Math.ceil(minCoord / minorSpacing) * minorSpacing; y <= maxCoord; y += minorSpacing) {
        this.gridGroup.add(new Konva.Line({
          points: [minCoord, y, maxCoord, y],
          stroke: color,
          strokeWidth: minorStrokeWidth,
          opacity: 0.2,
          listening: false,
        }));
      }
    }

    // Major grid lines — slightly more visible when minor lines are hidden
    const majorOpacity = drawMinor ? 0.4 : 0.55;
    for (let x = Math.ceil(minCoord / majorSpacing) * majorSpacing; x <= maxCoord; x += majorSpacing) {
      this.gridGroup.add(new Konva.Line({
        points: [x, minCoord, x, maxCoord],
        stroke: color,
        strokeWidth: majorStrokeWidth,
        opacity: majorOpacity,
        listening: false,
      }));
    }
    for (let y = Math.ceil(minCoord / majorSpacing) * majorSpacing; y <= maxCoord; y += majorSpacing) {
      this.gridGroup.add(new Konva.Line({
        points: [minCoord, y, maxCoord, y],
        stroke: color,
        strokeWidth: majorStrokeWidth,
        opacity: majorOpacity,
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
    // The identity extension sets the defaults for new nodes; an explicitly
    // requested shape (insert-with-shape submenu) wins over its default shape.
    this.applyIdentityDefaultsToNode(daNode, resolveIdentity(this._diagramType), nodeShape !== undefined);
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

  getDAWaypoints(): DAWaypoint[] {
    return this.daEdges.flatMap(e => e.waypoints);
  }

  getSelectedDAWaypoints(): DAWaypoint[] {
    return this.getDAWaypoints().filter(wp => wp.isSelected);
  }

  updateWaypointVisibility(extraSelectionActive = false): boolean {
    const shouldShow = this.gridVisible || extraSelectionActive || this.hasSelectedItems();
    let changed = false;
    for (const waypoint of this.getDAWaypoints()) {
      const nextVisible = waypoint.isSelected || shouldShow;
      if (waypoint.konvaGroup.visible() !== nextVisible) changed = true;
    }
    this.daEdges.forEach(edge => edge.setWaypointIndicatorsVisible(shouldShow));
    return changed;
  }

  /** Edge that owns the given waypoint, or undefined if not found. */
  findEdgeForWaypoint(wp: DAWaypoint): DAEdge | undefined {
    return this.daEdges.find(e => e.waypoints.includes(wp));
  }

  /** Insert at each selected node's caret (the caret starts at the end, so
   *  plain typing is still an append). Returns the nodes that resized. */
  appendTextToSelected(text: string): DANode[] {
    return this.getSelectedDANodes().filter(daNode => daNode.insertAtCursor(text));
  }

  deleteBeforeCursorFromSelected(): DANode[] {
    return this.getSelectedDANodes().filter(daNode => daNode.deleteBeforeCursor());
  }

  deleteAtCursorFromSelected(): DANode[] {
    return this.getSelectedDANodes().filter(daNode => daNode.deleteAtCursor());
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
    this.getSelectedDAWaypoints().forEach(wp => {
      wp.isSelected = false;
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
  addEdge(srcNode: DANode, destNode: DANode): DAEdge {
    let daEdge = new DAEdge(srcNode, destNode, "", undefined, this.edgeColors());
    daEdge.setDirectionColors({gradient: this._palette?.edgeGradient ?? null,
      undirected: this._palette?.edgeUndirected ?? null,
      bidirectional: this._palette?.edgeBidirectional ?? null});
    this.daEdgeGroup.add(daEdge.konvaGroup);
    this.daEdges.push(daEdge);
    return daEdge;
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
    this._diagramType = 'default';
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
      tags: node.tags.length > 0 ? [...node.tags] : undefined,
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
        edgeT: lbl.edgeT,
        side: lbl.side,
      })),
      controlPoints: edge.controlPoints.length > 0
        ? edge.controlPoints.map(p => ({
            x: p.x,
            y: p.y,
            ...(p.waypointId ? {waypointId: p.waypointId} : {}),
            ...(p.pinned ? {pinned: true} : {}),
          }))
        : undefined,
      directedness: edge.directedness !== 'directed' ? edge.directedness : undefined,
      lineStyle: edge.lineStyle !== 'solid' ? edge.lineStyle : undefined,
      tags: edge.tags.length > 0 ? [...edge.tags] : undefined,
    }));

    return {
      nodes,
      edges,
      ...(this._diagramType !== 'default' ? { diagramType: this._diagramType } : {}),
    };
  }

  /** Bind an identity extension (diagram type) to this graph and restyle the
   *  existing nodes to its defaults. Junction/invisible nodes keep their
   *  fixed geometry. */
  setDiagramType(extension: KidrawExtension): void {
    this._diagramType = extension.id;
    for (const node of this.daNodes) {
      this.applyIdentityDefaultsToNode(node, extension, false);
    }
    this.refreshTagBadges();
  }

  /** Re-derive every node's tag badge (e.g. task status) from its tags and
   *  the bound identity's tag groups. */
  refreshTagBadges(): void {
    const identity = resolveIdentity(this._diagramType);
    for (const node of this.daNodes) {
      node.setStatusBadge(activeTagChoice(identity, node.tags));
    }
  }

  get diagramType(): string {
    return this._diagramType;
  }

  private applyIdentityDefaultsToNode(node: DANode, extension: KidrawExtension, keepShape: boolean): void {
    const d = extension.nodeDefaults;
    if (!keepShape && d.shape && node.nodeShape !== d.shape
        && node.nodeShape !== 'junction' && node.nodeShape !== 'invisible') {
      node.changeShape(d.shape, this.nodeColors());
    }
    if (node.nodeShape === 'junction' || node.nodeShape === 'invisible') return;
    node.restoreState(
      d.width ?? node.NODE_WIDTH,
      d.height ?? node.NODE_HEIGHT,
      d.fontSize ?? node.FONT_SIZE,
      d.textOverflow ?? node.textOverflowMode,
    );
    node.applyTextOverflow();
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
    // Legacy snapshots (plugin v0) recorded the identity as plugins:
    // ['todo-graph']; migrate it to the identity slot on restore.
    this._diagramType = snapshot.diagramType
      ?? (snapshot.plugins?.includes('todo-graph') ? 'todo-graph' : 'default');

    // Rebuild nodes
    const nodeMap = new Map<string, DANode>();
    let maxNumericId = 0;

    for (const ns of snapshot.nodes) {
      const node = new DANode(ns.x, ns.y, ns.text, ns.id, undefined, ns.nodeShape);
      node.restoreState(ns.width, ns.height, ns.fontSize, ns.textOverflowMode, ns.baseWidth, ns.baseHeight, ns.baseFontSize);
      node.applyTextOverflow();
      node.isSelected = ns.isSelected;
      node.pinned = ns.pinned ?? false;
      node.tags = [...(ns.tags ?? [])];
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
        edge.restoreControlPoints(es.controlPoints);
      }
      if (es.directedness) edge.directedness = es.directedness;
      if (es.lineStyle) edge.lineStyle = es.lineStyle;
      edge.tags = [...(es.tags ?? [])];
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
        if (ls.edgeT !== undefined) {
          lbl.edgeT = ls.edgeT;
          lbl.side = ls.side ?? 'on';
        } else {
          // Legacy snapshot: absolute x/y is the source of truth — derive
          // the anchor from it before addLabel re-places the label.
          edge.adoptLabelPosition(lbl);
        }
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
    this.refreshTagBadges();
    this.updateWaypointVisibility();
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
      e.setDirectionColors({gradient: palette.edgeGradient ?? null,
        undirected: palette.edgeUndirected ?? null,
        bidirectional: palette.edgeBidirectional ?? null});
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

  private hasSelectedItems(): boolean {
    return this.daNodes.some(node => node.isSelected) ||
      this.daEdges.some(edge => edge.isSelected || edge.waypoints.some(wp => wp.isSelected) || edge.labels.some(label => label.isSelected));
  }
}
