/**
 * Making sense of what the agent names. The agent refers to nodes by id, by
 * label, or by something close to a label; `resolveNodeRef` turns that into
 * a node or an error that lists candidates, so the agent can retry with an
 * id. `resolveChanges` checks an apply_changes batch the same way, before
 * anything is planned.
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

/** One raw change from the agent, with what it needs to read its fields. */
interface RawChange {
  get(key: string): unknown;
  has(key: string): boolean;
  /** A node reference in this field, resolved to an id (or a batch handle). */
  node(key: string): string;
  /** The same, for a reference that is not a field (e.g. a list entry). */
  nodeRef(value: unknown, where: string): string;
  /** `{key: value}` as text if the field is present, else nothing. */
  text(key: string): Record<string, string>;
  /** `{tags}` if the field is a list, else nothing. */
  tags(): {tags?: string[]};
  where: string;
}

/** How each kind of change is read. */
const CHANGE_READERS: Record<string, (change: RawChange) => CanvasChange> = {
  add_node: change => ({
    kind: 'add_node', text: String(change.get('text') ?? ''),
    ...(typeof change.get('handle') === 'string' ? {handle: change.get('handle') as string} : {}),
    ...(change.has('near') ? {near: change.node('near')} : {}),
    ...change.tags(),
    ...change.text('nodeKind'),
  }),
  update_node: change => ({
    kind: 'update_node', node: change.node('node'), ...change.text('text'), ...change.tags(),
    ...(change.get('nodeKind') === null ? {nodeKind: null} : change.text('nodeKind')),
  }),
  delete_node: change => ({kind: 'delete_node', node: change.node('node')}),
  add_edge: change => ({
    kind: 'add_edge', from: change.node('from'), to: change.node('to'), ...change.text('edgeKind'), ...change.text('label'),
  }),
  update_edge: change => ({
    kind: 'update_edge', edge: String(change.get('edge') ?? ''), ...change.text('label'),
    ...(change.get('edgeKind') === null ? {edgeKind: null} : change.text('edgeKind')),
    ...change.tags(),
  }),
  delete_edge: change => ({kind: 'delete_edge', edge: String(change.get('edge') ?? '')}),
  set_reading_order: change => {
    const refs = change.get('nodes');
    if (!Array.isArray(refs) || refs.length === 0) throw new Error(`${change.where} nodes: list the statements in reading order`);
    return {kind: 'set_reading_order', nodes: refs.map((ref, i) => change.nodeRef(ref, `${change.where} nodes[${i}]`))};
  },
  arrange: () => ({kind: 'arrange'}),
};

/**
 * Check an apply_changes batch and resolve its node references: a handle
 * declared by an earlier add_node in the batch stays as it is; anything else
 * is resolved like any node reference (id, label, fuzzy) to an id. Edges are
 * referenced by id. Throws with the change number on the first bad entry.
 */
export function resolveChanges(raw: unknown, nodes: CanvasNode[]): CanvasChange[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('changes must be a non-empty array');
  const handles = new Set<string>();
  return raw.map((item, index) => {
    const fields = (item ?? {}) as Record<string, unknown>;
    const where = `change ${index + 1}`;
    const read = CHANGE_READERS[String(fields['kind'])];
    if (!read) throw new Error(`${where}: unknown kind "${String(fields['kind'])}"`);
    const change = read(rawChange(fields, where, handles, nodes));
    if (change.kind === 'add_node' && change.handle !== undefined) handles.add(change.handle);
    return change;
  });
}

function rawChange(fields: Record<string, unknown>, where: string, handles: Set<string>, nodes: CanvasNode[]): RawChange {
  const nodeRef = (value: unknown, at: string): string => {
    const text = String(value ?? '');
    if (handles.has(text)) return text;
    const resolution = resolveNodeRef(text, nodes);
    if ('error' in resolution) throw new Error(`${at}: ${resolution.error}`);
    return resolution.node.id;
  };
  return {
    where,
    get: key => fields[key],
    has: key => fields[key] !== undefined,
    node: key => nodeRef(fields[key], `${where} ${key}`),
    nodeRef,
    text: key => (fields[key] !== undefined ? {[key]: String(fields[key])} : {}),
    tags: () => (Array.isArray(fields['tags']) ? {tags: fields['tags'].map(String)} : {}),
  };
}
