import {DAEdge} from './da-edge';
import {DANode} from './da-node';
import {DrawingLayer} from './drawing.layer';
import {findConflict, GraphOperation} from './graph-operations';
import {reserveId} from './id-generator';

/** What the applier needs from the drawing area once geometry changes. */
export interface OperationApplierHooks {
  /** Re-lay the edges attached to nodes that were added, moved or resized. */
  nodesChanged(nodes: DANode[]): void;
  /** Route an edge an operation just created without a saved path. */
  edgeAdded(edge: DAEdge): void;
}

/**
 * Applies graph operations to the live canvas, one node or edge at a time,
 * so nothing else on the canvas is rebuilt (unlike restoring a snapshot, which
 * would also throw away a label the user is in the middle of editing).
 */
export class GraphOperationApplier {
  constructor(private readonly layer: DrawingLayer, private readonly hooks: OperationApplierHooks) {}

  /** Apply a batch all-or-nothing. Returns a conflict message, having changed
   *  nothing, when the graph no longer matches what the batch expects. */
  apply(operations: readonly GraphOperation[]): string | null {
    const conflict = findConflict(this.layer.serializeGraph(), operations);
    if (conflict) return conflict;
    const touched = new Set<DANode>();
    for (const operation of operations) this.applyOne(operation, touched);
    this.layer.reapplyTheme();
    this.layer.refreshTagBadges();
    this.hooks.nodesChanged([...touched].filter(node => this.layer.getDANodes().includes(node)));
    this.layer.batchDraw();
    return null;
  }

  private applyOne(operation: GraphOperation, touched: Set<DANode>): void {
    switch (operation.op) {
      case 'add_node': {
        reserveId(operation.node.id);
        touched.add(this.layer.addNodeFromSnapshot(operation.node));
        break;
      }
      case 'remove_node':
        this.layer.removeNode(this.node(operation.node.id));
        break;
      case 'update_node': {
        const node = this.node(operation.id);
        const {text, x, y, tags, nodeShape} = operation.after;
        if (nodeShape !== undefined) this.layer.changeNodeShape(node, nodeShape);
        if (text !== undefined) {
          node.label.text(text);
          node.applyTextOverflow();
        }
        if (x !== undefined || y !== undefined) {
          node.group.position({x: x ?? node.group.x(), y: y ?? node.group.y()});
        }
        if (tags !== undefined) node.tags = [...tags];
        touched.add(node);
        break;
      }
      case 'add_edge': {
        const {edge: snapshot} = operation;
        reserveId(snapshot.id);
        snapshot.labels.forEach(label => reserveId(label.id));
        snapshot.controlPoints?.forEach(point => reserveId(point.waypointId));
        const edge = this.layer.addEdgeFromSnapshot(snapshot);
        if (edge && !snapshot.controlPoints?.length) this.hooks.edgeAdded(edge);
        break;
      }
      case 'remove_edge':
        this.layer.removeEdge(this.edge(operation.edge.id));
        break;
      case 'update_edge': {
        const edge = this.edge(operation.id);
        const {labels, tags, directedness, lineStyle} = operation.after;
        if (labels !== undefined) this.layer.setEdgeLabelTexts(edge, labels);
        if (tags !== undefined) edge.tags = [...tags];
        if (directedness !== undefined) edge.directedness = directedness;
        if (lineStyle !== undefined) edge.lineStyle = lineStyle;
        break;
      }
    }
  }

  // findConflict has already checked these exist.
  private node(id: string): DANode {
    return this.layer.getDANodes().find(node => node.id === id)!;
  }

  private edge(id: string): DAEdge {
    return this.layer.getDAEdges().find(edge => edge.id === id)!;
  }
}
