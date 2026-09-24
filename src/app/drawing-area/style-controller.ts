/**
 * How things look: node size and shape, text size and overflow, an edge's
 * direction, line style and colour — for the selection, else whatever the
 * crosshairs are on — and the defaults new nodes and edges start with, which
 * a shape or edge style command changes when there is nothing to act on.
 */
import { DACommandType, EdgeDirectedness, ItemColor, LineStyle, NodeShape, TextOverflowMode } from './command.model';
import type { CommandSlice } from './command-handlers';
import type { DAEdge } from './da-edge';
import type { DALabel } from './da-label';
import type { DANode } from './da-node';
import type { DrawingLayer } from './drawing.layer';
import { resolveBoxOverlaps } from './overlap-resolution';

/** What the style commands need from the drawing area. */
export interface StyleHost {
  readonly drawingLayer: DrawingLayer;
  readonly nodeSizeStep: number;
  readonly textSizeStep: number;
  /** Clearance kept between boxes when a resize pushes neighbours aside. */
  readonly resizeReflowGap: number;
  /** The selection, else the topmost node under the crosshairs; `only`
   *  narrows both before the choice. */
  targetNodes(only?: (node: DANode) => boolean): DANode[];
  nodeUnderCrosshairs(): DANode | null;
  edgesUnderCrosshairs(): DAEdge[];
  labelUnderCrosshairs(): DALabel | null;
  getSelectedLabels(): DALabel[];
  updateEdgePoints(edge: DAEdge): void;
  updateEdgesForResizedNodes(nodes: DANode[]): void;
  finishTweens(): void;
  emitStatus(message: string): void;
  log(...parts: unknown[]): void;
}

/** What new nodes and edges start as. */
export interface StyleDefaults {
  nodeShape: NodeShape;
  edgeDirectedness: EdgeDirectedness;
  lineStyle: LineStyle;
}

/** The four states v+o steps an edge through. */
const DIR_CYCLE: {directedness: EdgeDirectedness; label: string}[] = [
  {directedness: 'directed',      label: 'forward →'},
  {directedness: 'directed',      label: 'reversed ←'},
  {directedness: 'undirected',    label: 'undirected —'},
  {directedness: 'bidirectional', label: 'bidirectional ↔'},
];

export class StyleController {
  readonly defaults: StyleDefaults = {nodeShape: 'box', edgeDirectedness: 'directed', lineStyle: 'solid'};

  /** Transient cursor into the four-state directionality cycle, per edge id:
   *  0 forward · 1 reversed · 2 undirected · 3 bidirectional. The endpoint
   *  swap happens entering 1 and wrapping 3→0, so four presses land the edge
   *  exactly where it started. */
  private edgeDirCycle = new Map<string, number>();

  constructor(private readonly host: StyleHost) {}

  /** Styling what is selected or under the crosshairs, and the defaults new
   *  edges take. */
  commands() {
    return {
      [DACommandType.INCREASE_SELECTED_NODE_SIZE]: () => this.adjustNodeSize(this.host.nodeSizeStep),
      [DACommandType.DECREASE_SELECTED_NODE_SIZE]: () => this.adjustNodeSize(-this.host.nodeSizeStep),
      [DACommandType.INCREASE_SELECTED_TEXT_SIZE]: () => this.adjustTextSize(this.host.textSizeStep),
      [DACommandType.DECREASE_SELECTED_TEXT_SIZE]: () => this.adjustTextSize(-this.host.textSizeStep),
      [DACommandType.SET_TEXT_OVERFLOW_MODE]: c => this.setTextOverflowMode(c.mode),
      [DACommandType.SET_NODE_SHAPE]: c => this.setNodeShape(c.shape),
      [DACommandType.TOGGLE_NODE_SHAPE]: () => this.toggleNodeShape(),
      [DACommandType.CYCLE_EDGE_DIRECTEDNESS]: () => this.cycleEdgeDirectedness(),
      [DACommandType.SET_EDGE_DIRECTEDNESS]: c => this.setEdgeDirectedness(c.directedness),
      [DACommandType.SET_LINE_STYLE]: c => this.setLineStyle(c.lineStyle),
      [DACommandType.SET_ITEM_COLOR]: c => this.setItemColor(c.color),
      [DACommandType.SET_DEFAULT_EDGE_DIRECTEDNESS]: c => this.setDefaultEdgeDirectedness(c.directedness),
      [DACommandType.SET_DEFAULT_LINE_STYLE]: c => this.setDefaultLineStyle(c.lineStyle),
    } satisfies CommandSlice;
  }

  // ── Nodes ──

  adjustNodeSize(delta: number): void {
    const resized = this.host.targetNodes().filter(node => node.resizeBy(delta));
    if (resized.length === 0) return;
    // A grown node may now sit on top of its neighbors: push them out of the
    // way (chains included), keeping the resized nodes themselves anchored.
    // Shrinking creates no new overlaps, so the pass is a no-op then.
    const moved = this.resolveOverlapsAround(resized);
    this.host.updateEdgesForResizedNodes([...resized, ...moved]);
    this.host.drawingLayer.batchDraw();
  }

  /** Push movable nodes apart until nothing overlaps, treating `anchored` and
   *  pinned nodes as immovable obstacles. Returns the nodes that moved. */
  private resolveOverlapsAround(anchored: DANode[]): DANode[] {
    const all = this.host.drawingLayer.getDANodes();
    const anchoredSet = new Set(anchored);
    const boxes = all.map(n => ({
      x: n.group.x(),
      y: n.group.y(),
      w: n.NODE_WIDTH,
      h: n.NODE_HEIGHT,
      movable: !anchoredSet.has(n) && !n.pinned,
    }));
    const moved: DANode[] = [];
    for (const i of resolveBoxOverlaps(boxes, this.host.resizeReflowGap)) {
      all[i].group.position({x: boxes[i].x, y: boxes[i].y});
      moved.push(all[i]);
    }
    return moved;
  }

  /** The selected nodes' and labels' text; with nothing selected, the node
   *  and the label under the crosshairs. */
  adjustTextSize(delta: number): void {
    let changed = false;
    const selectedNodes = this.host.drawingLayer.getSelectedDANodes();
    const selectedLabels = this.host.getSelectedLabels();

    if (selectedNodes.length === 0 && selectedLabels.length === 0) {
      const node = this.host.nodeUnderCrosshairs();
      if (node) changed = node.adjustLabelFontSizeBy(delta) || changed;
      const label = this.host.labelUnderCrosshairs();
      if (label) changed = label.adjustFontSizeBy(delta) || changed;
    } else {
      selectedNodes.forEach(node => changed = node.adjustLabelFontSizeBy(delta) || changed);
      selectedLabels.forEach(label => changed = label.adjustFontSizeBy(delta) || changed);
    }

    if (changed) this.host.drawingLayer.batchDraw();
  }

  setTextOverflowMode(mode: TextOverflowMode): void {
    const targets = this.host.targetNodes(n => n.nodeShape !== 'junction');
    targets.forEach(node => node.textOverflowMode = mode);
    this.host.updateEdgesForResizedNodes(targets);
    this.host.drawingLayer.batchDraw();
  }

  /** Flip between the two shapes that carry a label, leaving diamond and the
   *  two markers alone. Temporary: the intent is that shape follows a tag or
   *  class rather than being set per node, and this goes when that lands.
   *  Anything that is not a circle becomes a circle, so a mixed selection
   *  converges instead of splitting further. */
  toggleNodeShape(): void {
    const targets = this.host.targetNodes();
    if (targets.length === 0) {
      this.defaults.nodeShape = this.defaults.nodeShape === 'circle' ? 'box' : 'circle';
      this.host.emitStatus(`Default node shape: ${this.defaults.nodeShape}`);
      return;
    }
    const toCircle = targets.some(n => n.nodeShape !== 'circle');
    this.setNodeShape(toCircle ? 'circle' : 'box');
  }

  /** Reshape the target nodes; with none, the shape new nodes take. */
  setNodeShape(shape: NodeShape): void {
    const targets = this.host.targetNodes();
    if (targets.length === 0) {
      this.defaults.nodeShape = shape;
      return;
    }
    const layer = this.host.drawingLayer;
    targets.forEach(node => layer.changeNodeShape(node, shape));
    targets.forEach(node => node.connectedEdges.forEach(e => this.host.updateEdgePoints(e)));
    layer.batchDraw();
  }

  // ── Edges ──

  /** v+o: step the selected edges through forward → reversed → undirected →
   *  bidirectional, and round again. */
  cycleEdgeDirectedness(): void {
    const edges = this.host.drawingLayer.getSelectedDAEdges();
    if (edges.length === 0) {
      this.host.emitStatus('⚠ Select an edge first (hold v over it).');
      return;
    }
    this.host.finishTweens();
    let lastLabel = '';
    for (const edge of edges) {
      const from = this.dirCycleIndex(edge);
      const to = (from + 1) % DIR_CYCLE.length;
      // Entering 'reversed', or wrapping back to 'forward': flip the endpoints.
      if (to === 1 || from === DIR_CYCLE.length - 1) {
        edge.reverseDirection();
      }
      const next = DIR_CYCLE[to];
      edge.directedness = next.directedness;
      this.edgeDirCycle.set(edge.id, to);
      lastLabel = next.label;
    }
    this.host.drawingLayer.batchDraw();
    const suffix = edges.length > 1 ? ` (${edges.length} edges)` : '';
    this.host.emitStatus(`Direction: ${lastLabel}${suffix}`);
  }

  /** Where an edge sits in the cycle. The stored cursor wins only while it
   *  still agrees with the live directedness — undo, reload and the style
   *  submenu can all change an edge behind our back. */
  private dirCycleIndex(edge: DAEdge): number {
    const stored = this.edgeDirCycle.get(edge.id);
    if (stored !== undefined && DIR_CYCLE[stored].directedness === edge.directedness) {
      return stored;
    }
    return edge.directedness === 'undirected' ? 2
      : edge.directedness === 'bidirectional' ? 3 : 0;
  }

  setEdgeDirectedness(directedness: EdgeDirectedness): void {
    this.host.log('[style] setEdgeDirectedness:', directedness);
    this.restyleTargetEdges('directedness', edge => edge.directedness = directedness);
  }

  setLineStyle(lineStyle: LineStyle): void {
    this.host.log('[style] setLineStyle:', lineStyle);
    this.restyleTargetEdges('line style', edge => edge.lineStyle = lineStyle);
  }

  setDefaultEdgeDirectedness(directedness: EdgeDirectedness): void {
    this.host.log('[style] setDefaultEdgeDirectedness:', directedness);
    this.defaults.edgeDirectedness = directedness;
  }

  setDefaultLineStyle(lineStyle: LineStyle): void {
    this.host.log('[style] setDefaultLineStyle:', lineStyle);
    this.defaults.lineStyle = lineStyle;
  }

  /** The edges a style command means: the selection, else whatever the
   *  crosshairs are over. */
  private targetEdges(): DAEdge[] {
    const selected = this.host.drawingLayer.getSelectedDAEdges();
    return selected.length > 0 ? selected : this.host.edgesUnderCrosshairs();
  }

  /** Restyle those edges, or say why nothing happened — naming the thing the
   *  user was trying to change, since the command is otherwise silent. */
  private restyleTargetEdges(noun: string, apply: (edge: DAEdge) => void): void {
    const edges = this.targetEdges();
    if (edges.length === 0) {
      this.host.emitStatus(`Select or hover an edge to change ${noun}`);
      return;
    }
    edges.forEach(apply);
    this.host.drawingLayer.batchDraw();
  }

  // ── Colour ──

  setItemColor(color: ItemColor): void {
    this.host.log('[style] setItemColor:', color);
    const layer = this.host.drawingLayer;
    const COLOR_MAP: Record<ItemColor, {node: {fill: string; stroke: string; text: string}; edge: {stroke: string; fill: string}}> = {
      'default': {node: layer.nodeColors()!, edge: layer.edgeColors()!},
      'red': {node: {fill: '#ffcccc', stroke: '#cc0000', text: '#660000'}, edge: {stroke: '#cc0000', fill: '#cc0000'}},
      'blue': {node: {fill: '#cce0ff', stroke: '#0066cc', text: '#003366'}, edge: {stroke: '#0066cc', fill: '#0066cc'}},
      'green': {node: {fill: '#ccffcc', stroke: '#009900', text: '#004d00'}, edge: {stroke: '#009900', fill: '#009900'}},
      'orange': {node: {fill: '#ffe0cc', stroke: '#cc6600', text: '#663300'}, edge: {stroke: '#cc6600', fill: '#cc6600'}},
      'purple': {node: {fill: '#e0ccff', stroke: '#6600cc', text: '#330066'}, edge: {stroke: '#6600cc', fill: '#6600cc'}},
    };
    const colors = COLOR_MAP[color];
    if (!colors) return;

    // Selection first, then whatever the crosshairs are over — the same
    // priority copy/cut (da-272) and the shape commands use. Without the
    // fallback the natural gesture (hover a node, pick a colour) either did
    // nothing or, worse, recoloured a stale selection somewhere off-screen;
    // a thin edge restyled at 50% zoom reads as "nothing happened".
    let nodes = layer.getSelectedDANodes();
    let edges = layer.getSelectedDAEdges();

    if (nodes.length === 0 && edges.length === 0) {
      const hovered = this.host.nodeUnderCrosshairs();
      nodes = hovered ? [hovered] : [];
      if (nodes.length === 0) {
        edges = this.host.edgesUnderCrosshairs();
      }
    }

    if (nodes.length === 0 && edges.length === 0) {
      this.host.emitStatus('Select or point at a node or edge to change color');
      return;
    }

    nodes.forEach(n => n.applyColors(colors.node));
    edges.forEach(e => e.applyColors(colors.edge));

    layer.batchDraw();

    // Always say what was recoloured. The command is otherwise silent, and
    // its effect can be genuinely hard to see.
    const parts: string[] = [];
    if (nodes.length) parts.push(`${nodes.length} node${nodes.length === 1 ? '' : 's'}`);
    if (edges.length) parts.push(`${edges.length} link${edges.length === 1 ? '' : 's'}`);
    const name = color.charAt(0).toUpperCase() + color.slice(1);
    this.host.emitStatus(`${name}: ${parts.join(' + ')}`);
  }
}
