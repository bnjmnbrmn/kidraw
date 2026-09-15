import type {AgentChange, AgentChangeResult, AgentEditMeta} from '../agent/agent-canvas';
import {resolveIdentity} from '../extensions/extension-registry';
import {APP_NODE_DEFAULTS} from '../lib/file-format/snapshot-mapping';
import {EdgeDirectedness, NodeShape, TextOverflowMode} from './command.model';
import {GraphOperation, UndoGroup, updateEdgeOperation, updateNodeOperation} from './graph-operations';
import {DAEdgeSnapshot, DANodeSnapshot, GraphSnapshot} from './graph-snapshot';

export interface ChangePlan {
  ops: GraphOperation[];
  created: {kind: 'node' | 'edge'; id: string; handle?: string}[];
  touchedNodeIds: string[];
  /** The batch asked for the graph to be laid out once it is applied. */
  arrange: boolean;
}

/** Vertical gap below the node a new statement is placed near. */
const GAP_Y = 60;
const GAP_X = 40;

/**
 * Turn an agent's changes into graph operations against the current graph.
 * Nothing is applied here: the result is checked and applied as one undo group
 * (DrawingAreaComponent.applyOperations). Fails, with a message the agent can
 * act on, on the first change that refers to something that doesn't exist.
 *
 * New nodes get the bound diagram type's defaults and are placed below the
 * node they are `near` (or below everything), moved right past any overlap.
 */
export function planAgentChanges(
  graph: GraphSnapshot,
  changes: readonly AgentChange[],
  nextId: () => string,
): ChangePlan | {error: string} {
  const identity = resolveIdentity(graph.diagramType);
  const defaults = identity.nodeDefaults;
  const width = defaults.width ?? APP_NODE_DEFAULTS.width;
  const height = defaults.height ?? APP_NODE_DEFAULTS.height;
  const fontSize = defaults.fontSize ?? APP_NODE_DEFAULTS.fontSize;
  const nodeShape = (defaults.shape ?? APP_NODE_DEFAULTS.shape) as NodeShape;
  const textOverflowMode = (defaults.textOverflow ?? APP_NODE_DEFAULTS.textOverflow) as TextOverflowMode;
  const kinds = identity.edgeKinds ?? [];

  // Working copies, so later changes in the batch see earlier ones.
  const nodes = new Map(graph.nodes.map(node => [node.id, node]));
  const edges = new Map(graph.edges.map(edge => [edge.id, edge]));
  const handles = new Map<string, string>();
  const ops: GraphOperation[] = [];
  const created: ChangePlan['created'] = [];
  const touched = new Set<string>();
  const addedIds = new Set<string>();

  const nodeIdFor = (ref: string): string | null => {
    const id = handles.get(ref) ?? ref;
    return nodes.has(id) ? id : null;
  };
  const kindTagFor = (name: string): string | null => {
    const wanted = name.trim().toLowerCase();
    const kind = kinds.find(k => k.tag.toLowerCase() === wanted || k.name.toLowerCase() === wanted
      || k.tag.split('/').pop()!.toLowerCase() === wanted);
    return kind?.tag ?? null;
  };
  const kindList = () => kinds.length
    ? kinds.map(k => `"${k.tag.split('/').pop()}" (${k.name})`).join(', ')
    : 'none: this diagram type has no edge kinds';
  const nodeKinds = identity.nodeKinds ?? [];
  const nodeKindTags = new Set(nodeKinds.map(k => k.tag));
  const nodeKindTagFor = (name: string): string | null => {
    const wanted = name.trim().toLowerCase();
    const kind = nodeKinds.find(k => k.tag.toLowerCase() === wanted || k.name.toLowerCase() === wanted
      || k.tag.split('/').pop()!.toLowerCase() === wanted);
    return kind?.tag ?? null;
  };
  const nodeKindList = () => nodeKinds.length
    ? nodeKinds.map(k => `"${k.tag.split('/').pop()}" (${k.name})`).join(', ')
    : 'none: this diagram type has no node kinds';
  let arrange = false;

  const overlaps = (x: number, y: number) => [...nodes.values()].some(n =>
    x < n.x + n.width + GAP_X && n.x < x + width + GAP_X
    && y < n.y + n.height + GAP_Y / 2 && n.y < y + height + GAP_Y / 2);
  const place = (near: DANodeSnapshot | undefined) => {
    let x = 0;
    let y = 0;
    if (near) {
      x = near.x;
      y = near.y + near.height + GAP_Y;
    } else if (nodes.size > 0) {
      const all = [...nodes.values()];
      x = Math.min(...all.map(n => n.x));
      y = Math.max(...all.map(n => n.y + n.height)) + GAP_Y;
    }
    for (let tries = 0; tries < 40 && overlaps(x, y); tries++) x += width + GAP_X;
    return {x, y};
  };

  for (const [index, change] of changes.entries()) {
    const fail = (message: string) => ({error: `change ${index + 1} (${change.kind}): ${message}`});
    switch (change.kind) {
      case 'add_node': {
        const text = change.text?.trim() ?? '';
        if (!text) return fail('text is empty');
        if (change.handle !== undefined && (handles.has(change.handle) || nodes.has(change.handle))) {
          return fail(`handle "${change.handle}" is already in use`);
        }
        let near: DANodeSnapshot | undefined;
        if (change.near !== undefined) {
          const nearId = nodeIdFor(change.near);
          if (!nearId) return fail(`no node "${change.near}" to place it near`);
          near = nodes.get(nearId);
        }
        let kindTag: string | null = null;
        if (change.nodeKind !== undefined) {
          kindTag = nodeKindTagFor(change.nodeKind);
          if (!kindTag) return fail(`unknown node kind "${change.nodeKind}"; kinds: ${nodeKindList()}`);
        }
        const tags = [...new Set([...(change.tags ?? []).filter(t => !nodeKindTags.has(t)), ...(kindTag ? [kindTag] : [])])];
        const id = nextId();
        const node: DANodeSnapshot = {
          id, ...place(near), text, width, height, fontSize, isSelected: false, nodeShape, textOverflowMode,
          ...(tags.length ? {tags} : {}),
        };
        nodes.set(id, node);
        addedIds.add(id);
        if (change.handle !== undefined) handles.set(change.handle, id);
        ops.push({op: 'add_node', node});
        created.push({kind: 'node', id, ...(change.handle !== undefined ? {handle: change.handle} : {})});
        touched.add(id);
        break;
      }
      case 'update_node': {
        const id = nodeIdFor(change.node);
        if (!id) return fail(`no node "${change.node}"`);
        if (handles.get(change.node) === id) return fail('give a new node its final text in add_node instead');
        const node = nodes.get(id)!;
        const after: {text?: string; tags?: string[]} = {
          ...(change.text !== undefined ? {text: change.text} : {}),
          ...(change.tags !== undefined ? {tags: [...change.tags]} : {}),
        };
        if (change.nodeKind !== undefined) {
          const tag = change.nodeKind === null ? null : nodeKindTagFor(change.nodeKind);
          if (change.nodeKind !== null && !tag) return fail(`unknown node kind "${change.nodeKind}"; kinds: ${nodeKindList()}`);
          after.tags = [...(after.tags ?? node.tags ?? []).filter(t => !nodeKindTags.has(t)), ...(tag ? [tag] : [])];
        }
        if (Object.keys(after).length === 0) return fail('nothing to change');
        ops.push(updateNodeOperation({nodes: [node], edges: []}, id, after));
        nodes.set(id, {...node, ...after});
        touched.add(id);
        break;
      }
      case 'delete_node': {
        const id = nodeIdFor(change.node);
        if (!id) return fail(`no node "${change.node}"`);
        for (const edge of [...edges.values()]) {
          if (edge.srcNodeId === id || edge.destNodeId === id) {
            ops.push({op: 'remove_edge', edge});
            edges.delete(edge.id);
          }
        }
        ops.push({op: 'remove_node', node: nodes.get(id)!});
        nodes.delete(id);
        touched.delete(id);
        break;
      }
      case 'add_edge': {
        const from = nodeIdFor(change.from);
        if (!from) return fail(`no node "${change.from}"`);
        const to = nodeIdFor(change.to);
        if (!to) return fail(`no node "${change.to}"`);
        let tags: string[] = [];
        if (change.edgeKind !== undefined) {
          const tag = kindTagFor(change.edgeKind);
          if (!tag) return fail(`unknown edge kind "${change.edgeKind}"; kinds: ${kindList()}`);
          tags = [tag];
        }
        const id = nextId();
        const edge: DAEdgeSnapshot = {
          id, srcNodeId: from, destNodeId: to, isSelected: false,
          labels: change.label ? [{id: nextId(), x: 0, y: 0, text: change.label, fontSize: 12, isSelected: false, edgeT: 0.5, side: 'on'}] : [],
          tags, directedness: 'directed' as EdgeDirectedness,
        };
        edges.set(id, edge);
        ops.push({op: 'add_edge', edge});
        created.push({kind: 'edge', id});
        touched.add(from).add(to);
        break;
      }
      case 'update_edge': {
        const edge = edges.get(change.edge);
        if (!edge) return fail(`no edge "${change.edge}" (edges are referenced by id; see get_outline)`);
        const after: {labels?: string[]; tags?: string[]} = {};
        if (change.label !== undefined) after.labels = change.label === '' ? [] : [change.label];
        if (change.tags !== undefined) after.tags = [...change.tags];
        if (change.edgeKind !== undefined) {
          const tag = change.edgeKind === null ? null : kindTagFor(change.edgeKind);
          if (change.edgeKind !== null && !tag) return fail(`unknown edge kind "${change.edgeKind}"; kinds: ${kindList()}`);
          const kindTags = new Set(kinds.map(k => k.tag));
          after.tags = [...(after.tags ?? edge.tags ?? []).filter(t => !kindTags.has(t)), ...(tag ? [tag] : [])];
        }
        if (Object.keys(after).length === 0) return fail('nothing to change');
        ops.push(updateEdgeOperation({nodes: [], edges: [edge]}, edge.id, after));
        edges.set(edge.id, {
          ...edge,
          ...(after.tags ? {tags: after.tags} : {}),
          ...(after.labels ? {labels: after.labels.map(text => ({id: '', x: 0, y: 0, text, fontSize: 12, isSelected: false}))} : {}),
        });
        break;
      }
      case 'delete_edge': {
        const edge = edges.get(change.edge);
        if (!edge) return fail(`no edge "${change.edge}" (edges are referenced by id; see get_outline)`);
        ops.push({op: 'remove_edge', edge});
        edges.delete(edge.id);
        break;
      }
      case 'arrange':
        // Layout needs the live canvas, so it runs after the batch is applied.
        arrange = true;
        break;
      case 'set_reading_order': {
        // The whole order at once, so inserting a step can't leave the numbering broken.
        const order = identity.readingOrder;
        if (!order) return fail('this diagram type has no reading order');
        if (!Array.isArray(change.nodes) || change.nodes.length === 0) return fail('list the statements in reading order');
        const steps = new Map<string, number[]>();
        for (const [position, ref] of change.nodes.entries()) {
          const id = nodeIdFor(ref);
          if (!id) return fail(`no node "${ref}"`);
          steps.set(id, [...(steps.get(id) ?? []), position + 1]);
        }
        const isStepTag = (tag: string) => tag.startsWith(order.tagPrefix) && /^\d+$/.test(tag.slice(order.tagPrefix.length));
        for (const node of [...nodes.values()]) {
          const before = node.tags ?? [];
          const after = [...before.filter(tag => !isStepTag(tag)), ...(steps.get(node.id) ?? []).map(step => `${order.tagPrefix}${step}`)];
          if (after.length === before.length && after.every((tag, i) => tag === before[i])) continue;
          if (addedIds.has(node.id)) {
            // Added in this batch: its add_node operation still holds this snapshot.
            node.tags = after;
          } else {
            ops.push(updateNodeOperation({nodes: [node], edges: []}, node.id, {tags: after}));
            nodes.set(node.id, {...node, tags: after});
          }
        }
        break;
      }
      default:
        return {error: `change ${index + 1}: unknown kind "${(change as {kind: unknown}).kind}"`};
    }
  }
  return {ops, created, touchedNodeIds: [...touched].filter(id => nodes.has(id)), arrange};
}

/** Plan an agent's changes and apply them as one undo group through `apply`
 *  (DrawingAreaComponent.applyOperations), reporting failures in terms the
 *  agent can act on. Lives here so the drawing area's own bundle stays small. */
export async function applyAgentChanges(
  graph: GraphSnapshot,
  changes: readonly AgentChange[],
  meta: AgentEditMeta,
  nextId: () => string,
  apply: (group: UndoGroup) => Promise<string | null>,
  arrange: () => Promise<unknown> = async () => {},
): Promise<AgentChangeResult> {
  const plan = planAgentChanges(graph, changes, nextId);
  if ('error' in plan) return {ok: false, error: plan.error, created: [], touchedNodeIds: []};
  if (plan.ops.length > 0) {
    const conflict = await apply({author: meta.author, label: meta.label, ops: plan.ops, changeSetId: meta.changeSetId});
    if (conflict) {
      return {
        ok: false, created: [], touchedNodeIds: [],
        error: `Nothing was changed: the graph changed while you were working (${conflict}). Call get_outline and try again.`,
      };
    }
  }
  if (plan.arrange) await arrange();
  return {ok: true, created: plan.created, touchedNodeIds: plan.touchedNodeIds};
}
