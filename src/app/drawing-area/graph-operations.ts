import {EdgeDirectedness, LineStyle, NodeShape} from './command.model';
import {DAEdgeSnapshot, DANodeSnapshot, GraphSnapshot} from './graph-snapshot';

/**
 * Graph operations: the smallest changes to a graph, as data
 * (notes/idea-multiplayer-readiness.md).
 *
 * Every operation carries what it needs to be inverted, and every update or
 * removal carries what it expects to find. That lets a batch be checked
 * against the graph before anything is touched (all-or-nothing), undone later
 * without rewinding changes made since, and eventually published to
 * collaborators.
 */

/** Node fields an operation can change in place. */
export interface NodeFields {
  text?: string;
  x?: number;
  y?: number;
  tags?: string[];
  nodeShape?: NodeShape;
}

/** Edge fields an operation can change in place. `labels` are label texts, in order. */
export interface EdgeFields {
  labels?: string[];
  tags?: string[];
  directedness?: EdgeDirectedness;
  lineStyle?: LineStyle;
}

export type GraphOperation =
  | {op: 'add_node'; node: DANodeSnapshot}
  /** Carries the whole node, so undo can bring it back. Its edges must already be removed. */
  | {op: 'remove_node'; node: DANodeSnapshot}
  | {op: 'update_node'; id: string; before: NodeFields; after: NodeFields}
  | {op: 'add_edge'; edge: DAEdgeSnapshot}
  | {op: 'remove_edge'; edge: DAEdgeSnapshot}
  | {op: 'update_edge'; id: string; before: EdgeFields; after: EdgeFields};

/**
 * The operations from one action, applied together and undone as one step.
 * Groups that share a `changeSetId` form a change set (e.g. one agent turn)
 * that can be reverted as a unit even after other changes.
 */
export interface UndoGroup {
  /** Who made the change: 'user', or an agent such as 'agent:codex'. */
  author: string;
  /** Short description for status messages and undo, e.g. "Agent: add 3 steps". */
  label: string;
  ops: GraphOperation[];
  changeSetId?: string;
}

export function invertOperation(operation: GraphOperation): GraphOperation {
  switch (operation.op) {
    case 'add_node': return {op: 'remove_node', node: operation.node};
    case 'remove_node': return {op: 'add_node', node: operation.node};
    case 'update_node': return {op: 'update_node', id: operation.id, before: operation.after, after: operation.before};
    case 'add_edge': return {op: 'remove_edge', edge: operation.edge};
    case 'remove_edge': return {op: 'add_edge', edge: operation.edge};
    case 'update_edge': return {op: 'update_edge', id: operation.id, before: operation.after, after: operation.before};
  }
}

/** The operations that undo a batch: each one inverted, in reverse order. */
export function invertOperations(operations: readonly GraphOperation[]): GraphOperation[] {
  return [...operations].reverse().map(invertOperation);
}

// ─── Checking a batch before applying it ─────────────────────────────────

interface SimNode extends Required<Pick<NodeFields, 'text' | 'x' | 'y' | 'tags' | 'nodeShape'>> {}
interface SimEdge extends Required<EdgeFields> {
  src: string;
  dest: string;
}

function nodeFieldsOf(node: DANodeSnapshot): SimNode {
  return {text: node.text, x: node.x, y: node.y, tags: node.tags ?? [], nodeShape: node.nodeShape ?? 'box'};
}

function edgeFieldsOf(edge: DAEdgeSnapshot): SimEdge {
  return {
    src: edge.srcNodeId, dest: edge.destNodeId,
    labels: edge.labels.map(label => label.text), tags: edge.tags ?? [],
    directedness: edge.directedness ?? 'directed', lineStyle: edge.lineStyle ?? 'solid',
  };
}

function sameValue(a: unknown, b: unknown): boolean {
  if (typeof a === 'number' && typeof b === 'number') return Math.abs(a - b) < 0.5;
  return JSON.stringify(a) === JSON.stringify(b);
}

/** The first expected field that no longer matches, or null. */
function mismatch(current: object, expected: object): string | null {
  for (const [key, value] of Object.entries(expected)) {
    if (value !== undefined && !sameValue((current as Record<string, unknown>)[key], value)) return key;
  }
  return null;
}

/**
 * Check a batch against the graph without changing it. Operations are
 * considered in order, so a batch may add a node and then connect it. Returns
 * null when the whole batch applies cleanly, or a message naming the first
 * conflict (the graph changed since the batch was planned).
 */
export function findConflict(graph: GraphSnapshot, operations: readonly GraphOperation[]): string | null {
  const nodes = new Map(graph.nodes.map(node => [node.id, nodeFieldsOf(node)]));
  const edges = new Map(graph.edges.map(edge => [edge.id, edgeFieldsOf(edge)]));
  const hasEdges = (nodeId: string) => [...edges.values()].some(e => e.src === nodeId || e.dest === nodeId);

  for (const operation of operations) {
    switch (operation.op) {
      case 'add_node':
        if (nodes.has(operation.node.id) || edges.has(operation.node.id)) return `${operation.node.id} already exists`;
        nodes.set(operation.node.id, nodeFieldsOf(operation.node));
        break;
      case 'remove_node': {
        const node = nodes.get(operation.node.id);
        if (!node) return `node ${operation.node.id} no longer exists`;
        const changed = mismatch(node, {text: operation.node.text, tags: operation.node.tags ?? []});
        if (changed) return `node ${operation.node.id} changed (${changed}) since this was planned`;
        if (hasEdges(operation.node.id)) return `node ${operation.node.id} still has edges`;
        nodes.delete(operation.node.id);
        break;
      }
      case 'update_node': {
        const node = nodes.get(operation.id);
        if (!node) return `node ${operation.id} no longer exists`;
        const changed = mismatch(node, operation.before);
        if (changed) return `node ${operation.id} changed (${changed}) since this was planned`;
        Object.assign(node, withoutUndefined(operation.after));
        break;
      }
      case 'add_edge': {
        const {id, srcNodeId, destNodeId} = operation.edge;
        if (edges.has(id) || nodes.has(id)) return `${id} already exists`;
        if (!nodes.has(srcNodeId)) return `node ${srcNodeId} no longer exists`;
        if (!nodes.has(destNodeId)) return `node ${destNodeId} no longer exists`;
        edges.set(id, edgeFieldsOf(operation.edge));
        break;
      }
      case 'remove_edge': {
        const edge = edges.get(operation.edge.id);
        if (!edge) return `edge ${operation.edge.id} no longer exists`;
        const expected = edgeFieldsOf(operation.edge);
        const changed = mismatch(edge, {labels: expected.labels, tags: expected.tags});
        if (changed) return `edge ${operation.edge.id} changed (${changed}) since this was planned`;
        edges.delete(operation.edge.id);
        break;
      }
      case 'update_edge': {
        const edge = edges.get(operation.id);
        if (!edge) return `edge ${operation.id} no longer exists`;
        const changed = mismatch(edge, operation.before);
        if (changed) return `edge ${operation.id} changed (${changed}) since this was planned`;
        Object.assign(edge, withoutUndefined(operation.after));
        break;
      }
    }
  }
  return null;
}

function withoutUndefined<T extends object>(fields: T): Partial<T> {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== undefined)) as Partial<T>;
}

// ─── Planning operations from the current graph ──────────────────────────

/** Operations that remove a node: its edges first, then the node. */
export function removeNodeOperations(graph: GraphSnapshot, nodeId: string): GraphOperation[] {
  const node = graph.nodes.find(n => n.id === nodeId);
  if (!node) throw new Error(`No node ${nodeId}`);
  const incident = graph.edges.filter(e => e.srcNodeId === nodeId || e.destNodeId === nodeId);
  return [
    ...incident.map(edge => ({op: 'remove_edge', edge}) as GraphOperation),
    {op: 'remove_node', node},
  ];
}

/** An update whose expectations are the node's current values for the fields being changed. */
export function updateNodeOperation(graph: GraphSnapshot, nodeId: string, after: NodeFields): GraphOperation {
  const node = graph.nodes.find(n => n.id === nodeId);
  if (!node) throw new Error(`No node ${nodeId}`);
  const current = nodeFieldsOf(node);
  const before = Object.fromEntries(Object.keys(withoutUndefined(after)).map(key => [key, current[key as keyof SimNode]]));
  return {op: 'update_node', id: nodeId, before, after};
}

/** An update whose expectations are the edge's current values for the fields being changed. */
export function updateEdgeOperation(graph: GraphSnapshot, edgeId: string, after: EdgeFields): GraphOperation {
  const edge = graph.edges.find(e => e.id === edgeId);
  if (!edge) throw new Error(`No edge ${edgeId}`);
  const current = edgeFieldsOf(edge);
  const before = Object.fromEntries(Object.keys(withoutUndefined(after)).map(key => [key, current[key as keyof EdgeFields]]));
  return {op: 'update_edge', id: edgeId, before, after};
}
