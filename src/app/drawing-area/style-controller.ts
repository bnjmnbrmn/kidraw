/**
 * How things look: node shape and text overflow, an edge's direction, line
 * style and colour — for the selection, else whatever the crosshairs are on —
 * and the defaults new nodes and edges start with, which a shape command
 * changes when there is nothing to act on.
 */
import { DACommandType, EdgeDirectedness, ItemColor, LineStyle, NodeShape, TextOverflowMode } from './command.model';
import type { CommandSlice } from './command-handlers';
import type { DAEdge, EdgeColors } from './da-edge';
import type { DANode, NodeColors } from './da-node';
import type { DrawingLayer } from './drawing.layer';

/** What the style commands need from the drawing area. */
export interface StyleHost {
  readonly drawingLayer: DrawingLayer;
  /** The selection, else the topmost node under the crosshairs, narrowed by
   *  `only` after the choice. */
  targetNodes(only?: (node: DANode) => boolean): DANode[];
  /** The shape the graph's diagram type gives new nodes, if it names one. */
  typeNodeShape(): NodeShape | undefined;
  nodeUnderCrosshairs(): DANode | null;
  edgesUnderCrosshairs(): DAEdge[];
  updateEdgePoints(edge: DAEdge): void;
  updateEdgesForResizedNodes(nodes: DANode[]): void;
  finishTweens(): void;
  emitStatus(message: string): void;
  log(...parts: unknown[]): void;
}

/** What new nodes and edges start as. */
export interface StyleDefaults {
  /** Unset until you choose one, and then the diagram type's shape applies
   *  (notes/design-plugin-v0.md: a shape you ask for wins over the type's). */
  nodeShape?: NodeShape;
  edgeDirectedness: EdgeDirectedness;
  lineStyle: LineStyle;
}

/** What each choice of the Color command paints a node and an edge. */
const ITEM_COLORS: Record<Exclude<ItemColor, 'default'>, {node: NodeColors; edge: EdgeColors}> = {
  'red': {node: {fill: '#ffcccc', stroke: '#cc0000', text: '#660000'}, edge: {stroke: '#cc0000', fill: '#cc0000'}},
  'blue': {node: {fill: '#cce0ff', stroke: '#0066cc', text: '#003366'}, edge: {stroke: '#0066cc', fill: '#0066cc'}},
  'green': {node: {fill: '#ccffcc', stroke: '#009900', text: '#004d00'}, edge: {stroke: '#009900', fill: '#009900'}},
  'orange': {node: {fill: '#ffe0cc', stroke: '#cc6600', text: '#663300'}, edge: {stroke: '#cc6600', fill: '#cc6600'}},
  'purple': {node: {fill: '#e0ccff', stroke: '#6600cc', text: '#330066'}, edge: {stroke: '#6600cc', fill: '#6600cc'}},
};

/** The four states v+o steps an edge through. */
const DIR_CYCLE: {directedness: EdgeDirectedness; label: string}[] = [
  {directedness: 'directed',      label: 'forward →'},
  {directedness: 'directed',      label: 'reversed ←'},
  {directedness: 'undirected',    label: 'undirected —'},
  {directedness: 'bidirectional', label: 'bidirectional ↔'},
];

export class StyleController {
  readonly defaults: StyleDefaults = {edgeDirectedness: 'directed', lineStyle: 'solid'};

  /** Transient cursor into the four-state directionality cycle, per edge id:
   *  0 forward · 1 reversed · 2 undirected · 3 bidirectional. The endpoint
   *  swap happens entering 1 and wrapping 3→0, so four presses land the edge
   *  exactly where it started. */
  private edgeDirCycle = new Map<string, number>();

  constructor(private readonly host: StyleHost) {}

  /** Styling what is selected or under the crosshairs. */
  commands() {
    return {
      [DACommandType.SET_TEXT_OVERFLOW_MODE]: c => this.setTextOverflowMode(c.mode),
      [DACommandType.SET_NODE_SHAPE]: c => this.setNodeShape(c.shape),
      [DACommandType.CYCLE_EDGE_DIRECTEDNESS]: () => this.cycleEdgeDirectedness(),
      [DACommandType.SET_LINE_STYLE]: c => this.setLineStyle(c.lineStyle),
      [DACommandType.SET_ITEM_COLOR]: c => this.setItemColor(c.color),
    } satisfies CommandSlice;
  }

  /** The shape a new node takes when none is asked for at insert: the
   *  default you chose, else the diagram type's, else a box. */
  effectiveNodeShape(): NodeShape {
    return this.defaults.nodeShape ?? this.host.typeNodeShape() ?? 'box';
  }

  // ── Nodes ──

  setTextOverflowMode(mode: TextOverflowMode): void {
    const targets = this.host.targetNodes(n => n.nodeShape !== 'junction');
    targets.forEach(node => node.textOverflowMode = mode);
    this.host.updateEdgesForResizedNodes(targets);
    this.host.drawingLayer.batchDraw();
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

  setLineStyle(lineStyle: LineStyle): void {
    this.host.log('[style] setLineStyle:', lineStyle);
    this.restyleTargetEdges('line style', edge => edge.lineStyle = lineStyle);
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

  // ── Color ──

  setItemColor(color: ItemColor): void {
    this.host.log('[style] setItemColor:', color);
    const layer = this.host.drawingLayer;
    // 'default' clears the choice, handing the item back to the theme.
    const colors = color === 'default' ? {node: null, edge: null} : ITEM_COLORS[color];
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

    nodes.forEach(n => n.setCustomColors(colors.node));
    edges.forEach(e => e.setCustomColors(colors.edge));

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
