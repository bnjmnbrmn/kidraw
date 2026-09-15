import {resolveIdentity} from '../extensions/extension-registry';
import {fuzzyMatch} from '../lib/fuzzy-match';
import type {AgentCanvasTarget, AgentChange, AgentChangeResult, AgentNodeInfo} from './agent-canvas';

/** Hooks the tool executor needs from the agent session (view control, annotations). */
export interface AgentToolHost {
  canvas: AgentCanvasTarget;
  /** 'free' means the user has taken control of the view, or is busy editing. */
  followMode(): 'following' | 'free';
  /** Move the view onto the node and mark it; never touches the selection. */
  focus(node: AgentNodeInfo): void;
  /** Shown instead of moving the view while the user has control. */
  showLookHere(node: AgentNodeInfo): void;
  addCaption(node: AgentNodeInfo, text: string): void;
  setHighlights(nodes: AgentNodeInfo[]): void;
  clearAnnotations(): void;
  /** Apply changes as one undo step of the current agent turn. */
  applyChanges(changes: AgentChange[]): Promise<AgentChangeResult>;
  /** Why the agent may not change the graph right now (e.g. the user pressed Stop), or null. */
  editsRefused(): string | null;
}

/**
 * Check an apply_changes batch and resolve its node references: a handle
 * declared by an earlier add_node in the batch stays as it is; anything else
 * is resolved like any node reference (id, label, fuzzy) to an id. Edges are
 * referenced by id. Throws with the change number on the first bad entry.
 */
export function resolveChanges(raw: unknown, nodes: AgentNodeInfo[]): AgentChange[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new Error('changes must be a non-empty array');
  const handles = new Set<string>();
  return raw.map((item, index): AgentChange => {
    const change = (item ?? {}) as Record<string, unknown>;
    const where = `change ${index + 1}`;
    const nodeRef = (key: string): string => {
      const value = String(change[key] ?? '');
      if (handles.has(value)) return value;
      const resolution = resolveNodeRef(value, nodes);
      if ('error' in resolution) throw new Error(`${where} ${key}: ${resolution.error}`);
      return resolution.node.id;
    };
    const text = (key: string) => (change[key] !== undefined ? {[key]: String(change[key])} : {});
    const tags = Array.isArray(change['tags']) ? {tags: change['tags'].map(String)} : {};
    switch (change['kind']) {
      case 'add_node': {
        const handle = typeof change['handle'] === 'string' ? change['handle'] : undefined;
        const resolved: AgentChange = {
          kind: 'add_node', text: String(change['text'] ?? ''),
          ...(handle !== undefined ? {handle} : {}),
          ...(change['near'] !== undefined ? {near: nodeRef('near')} : {}),
          ...tags,
        };
        if (handle !== undefined) handles.add(handle);
        return resolved;
      }
      case 'update_node':
        return {kind: 'update_node', node: nodeRef('node'), ...text('text'), ...tags};
      case 'delete_node':
        return {kind: 'delete_node', node: nodeRef('node')};
      case 'add_edge':
        return {kind: 'add_edge', from: nodeRef('from'), to: nodeRef('to'), ...text('edgeKind'), ...text('label')};
      case 'update_edge':
        return {
          kind: 'update_edge', edge: String(change['edge'] ?? ''), ...text('label'),
          ...(change['edgeKind'] === null ? {edgeKind: null} : text('edgeKind')),
          ...tags,
        };
      case 'delete_edge':
        return {kind: 'delete_edge', edge: String(change['edge'] ?? '')};
      case 'set_reading_order': {
        const refs = change['nodes'];
        if (!Array.isArray(refs) || refs.length === 0) throw new Error(`${where} nodes: list the statements in reading order`);
        return {
          kind: 'set_reading_order',
          nodes: refs.map((ref, position) => {
            const value = String(ref ?? '');
            if (handles.has(value)) return value;
            const resolution = resolveNodeRef(value, nodes);
            if ('error' in resolution) throw new Error(`${where} nodes[${position}]: ${resolution.error}`);
            return resolution.node.id;
          }),
        };
      }
      default:
        throw new Error(`${where}: unknown kind "${String(change['kind'])}"`);
    }
  });
}

export type NodeResolution = {node: AgentNodeInfo} | {error: string};

/**
 * Resolve an agent's node reference: an exact id, an exact label (ignoring
 * case), a unique substring, or a clearly best fuzzy match. Ambiguity is an
 * error that lists candidates, so the agent can retry with an id.
 */
export function resolveNodeRef(query: string, nodes: AgentNodeInfo[]): NodeResolution {
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
    .filter((s): s is {node: AgentNodeInfo; match: NonNullable<typeof s.match>} => s.match !== null)
    .sort((a, b) => b.match.score - a.match.score);
  if (scored.length === 1 || (scored.length > 1 && scored[0].match.score >= scored[1].match.score + 8)) {
    return {node: scored[0].node};
  }
  const candidates = (containing.length > 1 ? containing : scored.map(s => s.node)).slice(0, 6);
  return candidates.length > 0
    ? {error: ambiguous(q, candidates)}
    : {error: `No node matches "${q}". Call get_outline or find_nodes for ids.`};
}

function ambiguous(query: string, nodes: AgentNodeInfo[]): string {
  const list = nodes.map(n => `${n.id}: "${n.label}"`).join(', ');
  return `"${query}" matches several nodes (${list}). Use an id.`;
}

const brief = (n: AgentNodeInfo) => ({id: n.id, label: n.label});

const isPresent = <T>(value: T | undefined): value is T => value !== undefined;

function requireNode(host: AgentToolHost, ref: unknown): AgentNodeInfo {
  const resolution = resolveNodeRef(String(ref ?? ''), host.canvas.agentNodes());
  if ('error' in resolution) throw new Error(resolution.error);
  return resolution.node;
}

/** Run one canvas tool call. Throws with a message the agent can act on. */
export function executeAgentTool(name: string, args: Record<string, unknown>, host: AgentToolHost): unknown {
  const canvas = host.canvas;
  switch (name) {
    case 'get_outline': {
      const nodes = canvas.agentNodes();
      const edges = canvas.agentEdges();
      const identity = resolveIdentity(canvas.agentDiagramTypeId());
      return {
        diagramType: {
          id: identity.id, name: identity.name,
          edgeKinds: (identity.edgeKinds ?? []).map(kind => ({
            edgeKind: kind.tag.split('/').pop(), tag: kind.tag, name: kind.name, description: kind.description,
          })),
          tagGroups: (identity.tagGroups ?? []).map(group => ({
            id: group.id, name: group.name, tags: group.choices.map(choice => ({tag: choice.tag, label: choice.label})),
          })),
          ...(identity.readingOrder ? {
            readingOrder: `Nodes carry ${identity.readingOrder.tagPrefix}N tags; set them all with a set_reading_order change.`,
          } : {}),
        },
        nodes: nodes.map(n => (n.tags.length ? {...brief(n), tags: n.tags} : brief(n))),
        edges: edges.map(e => ({
          id: e.id, from: e.from, to: e.to,
          ...(e.labels.length ? {labels: e.labels} : {}),
          ...(e.tags.length ? {tags: e.tags} : {}),
        })),
      };
    }
    case 'find_nodes': {
      const query = String(args['query'] ?? '');
      const limit = Math.min(Math.max(Number(args['limit'] ?? 10), 1), 50);
      const matches = canvas.agentNodes()
        .map(n => ({node: n, match: fuzzyMatch(query, n.label)}))
        .filter(s => s.match !== null)
        .sort((a, b) => b.match!.score - a.match!.score)
        .slice(0, limit)
        .map(s => brief(s.node));
      return {matches};
    }
    case 'get_selection': {
      const nodes = new Map(canvas.agentNodes().map(n => [n.id, n]));
      const edges = new Map(canvas.agentEdges().map(e => [e.id, e]));
      const selection = canvas.agentSelection();
      const under = selection.underCrosshairsId ? nodes.get(selection.underCrosshairsId) : undefined;
      return {
        selectedNodes: selection.nodeIds.map(id => nodes.get(id)).filter(isPresent).map(brief),
        selectedEdges: selection.edgeIds.map(id => edges.get(id)).filter(isPresent)
          .map(e => ({id: e.id, from: e.from, to: e.to})),
        underCrosshairs: under ? brief(under) : null,
      };
    }
    case 'get_view': {
      const nodes = new Map(canvas.agentNodes().map(n => [n.id, n]));
      return {
        zoomPercent: canvas.agentZoomPercent(),
        userHasControl: host.followMode() === 'free',
        visibleNodes: canvas.agentVisibleNodeIds().map(id => nodes.get(id)).filter(isPresent).map(brief),
      };
    }
    case 'focus': {
      const node = requireNode(host, args['node']);
      if (host.followMode() === 'free') {
        host.showLookHere(node);
        return {focused: brief(node), viewMoved: false,
          note: 'The user is leading the view or busy editing; they were shown a "look here" hint instead.'};
      }
      host.focus(node);
      return {focused: brief(node), viewMoved: true};
    }
    case 'highlight': {
      const refs = Array.isArray(args['nodes']) ? args['nodes'] : [];
      const found: AgentNodeInfo[] = [];
      const notFound: string[] = [];
      for (const ref of refs) {
        const resolution = resolveNodeRef(String(ref), canvas.agentNodes());
        if ('node' in resolution) found.push(resolution.node);
        else notFound.push(`${ref}: ${resolution.error}`);
      }
      host.setHighlights(found);
      return {highlighted: found.map(brief), ...(notFound.length ? {notFound} : {})};
    }
    case 'caption': {
      const node = requireNode(host, args['node']);
      const text = String(args['text'] ?? '').trim();
      if (!text) throw new Error('Caption text is empty');
      host.addCaption(node, text.slice(0, 400));
      return {captioned: brief(node)};
    }
    case 'clear_annotations':
      host.clearAnnotations();
      return {cleared: true};
    case 'apply_changes': {
      const refused = host.editsRefused();
      if (refused) throw new Error(refused);
      const changes = resolveChanges(args['changes'], canvas.agentNodes());
      return host.applyChanges(changes).then(result => {
        if (!result.ok) throw new Error(result.error ?? 'The changes were not applied');
        return {applied: changes.length, created: result.created};
      });
    }
    default:
      throw new Error(`Unknown KiDraw tool "${name}"`);
  }
}
