/**
 * Making sense of what the agent names. The agent refers to nodes by id, by
 * label, or by something close to a label; `resolveNodeRef` turns that into
 * a node, or an error that lists candidates so the agent can retry with an
 * id. `resolveChanges` does the same for every node a batch of changes names,
 * once the batch's shape has been checked against the shared schema
 * (@kidraw/agent-protocol/tools).
 */
import {fuzzyMatch} from '../lib/fuzzy-match';
import type {CanvasChange, CanvasNode} from '../drawing-area/canvas-port';

export type NodeResolution = {node: CanvasNode} | {error: string};

/**
 * An exact id, an exact label (ignoring case), a unique substring, or a
 * clearly best fuzzy match. Ambiguity is an error.
 */
export function resolveNodeRef(query: string, nodes: CanvasNode[]): NodeResolution {
  const q = query.trim();
  if (!q) return {error: 'Empty node reference'};
  const byId = nodes.find(n => n.id === q);
  if (byId) return {node: byId};

  const lower = q.toLowerCase();
  const exact = nodes.filter(n => n.label.trim().toLowerCase() === lower);
  if (exact.length === 1) return {node: exact[0]};
  if (exact.length > 1) return {error: ambiguous(q, exact)};

  const containing = nodes.filter(n => n.label.toLowerCase().includes(lower));
  if (containing.length === 1) return {node: containing[0]};

  const scored = nodes
    .map(n => ({node: n, match: fuzzyMatch(q, n.label)}))
    .filter((s): s is {node: CanvasNode; match: NonNullable<typeof s.match>} => s.match !== null)
    .sort((a, b) => b.match.score - a.match.score);
  if (scored.length === 1 || (scored.length > 1 && scored[0].match.score >= scored[1].match.score + 8)) {
    return {node: scored[0].node};
  }
  const candidates = (containing.length > 1 ? containing : scored.map(s => s.node)).slice(0, 6);
  return candidates.length > 0
    ? {error: ambiguous(q, candidates)}
    : {error: `No node matches "${q}". Call get_outline or find_nodes for ids.`};
}

function ambiguous(query: string, nodes: CanvasNode[]): string {
  const list = nodes.map(n => `${n.id}: "${n.label}"`).join(', ');
  return `"${query}" matches several nodes (${list}). Use an id.`;
}

/** Resolves one node reference in a change; `field` says where, for errors. */
type RefResolver = (ref: string, field: string) => string;

/**
 * Resolve every node a batch names to an id. A handle declared by an earlier
 * add_node in the batch stays as it is. Edges are referenced by id already.
 * Throws with the change number on the first reference that matches nothing,
 * or more than one node.
 */
export function resolveChanges(changes: readonly CanvasChange[], nodes: CanvasNode[]): CanvasChange[] {
  const handles = new Set<string>();
  return changes.map((change, index) => {
    const resolve: RefResolver = (ref, field) => {
      if (handles.has(ref)) return ref;
      const resolution = resolveNodeRef(ref, nodes);
      if ('error' in resolution) throw new Error(`change ${index + 1} ${field}: ${resolution.error}`);
      return resolution.node.id;
    };
    const resolved = withNodeIds(change, resolve);
    if (change.kind === 'add_node' && change.handle !== undefined) handles.add(change.handle);
    return resolved;
  });
}

/** The change with each node it names resolved. */
function withNodeIds(change: CanvasChange, resolve: RefResolver): CanvasChange {
  switch (change.kind) {
    case 'add_node':
      return change.near === undefined ? change : {...change, near: resolve(change.near, 'near')};
    case 'update_node':
    case 'delete_node':
      return {...change, node: resolve(change.node, 'node')};
    case 'add_edge':
      return {...change, from: resolve(change.from, 'from'), to: resolve(change.to, 'to')};
    case 'set_reading_order':
      return {...change, nodes: change.nodes.map((ref, i) => resolve(ref, `nodes[${i}]`))};
    default:
      return change;
  }
}
