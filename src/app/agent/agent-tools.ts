import {fuzzyMatch} from '../lib/fuzzy-match';
import {AgentCanvasTarget, AgentNodeInfo} from './agent-canvas';

/** Hooks the tool executor needs from the agent session (view control, annotations). */
export interface AgentToolHost {
  canvas: AgentCanvasTarget;
  /** 'free' means the user has taken control of the view. */
  followMode(): 'following' | 'free';
  /** Shown instead of moving the view while the user has control. */
  showLookHere(node: AgentNodeInfo): void;
  addCaption(node: AgentNodeInfo, text: string): void;
  setHighlights(nodes: AgentNodeInfo[]): void;
  clearAnnotations(): void;
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
      return {
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
        selectedNodes: selection.nodeIds.map(id => nodes.get(id)).filter(Boolean).map(n => brief(n!)),
        selectedEdges: selection.edgeIds.map(id => edges.get(id)).filter(Boolean)
          .map(e => ({id: e!.id, from: e!.from, to: e!.to})),
        underCrosshairs: under ? brief(under) : null,
      };
    }
    case 'get_view': {
      const nodes = new Map(canvas.agentNodes().map(n => [n.id, n]));
      return {
        zoomPercent: canvas.agentZoomPercent(),
        userHasControl: host.followMode() === 'free',
        visibleNodes: canvas.agentVisibleNodeIds().map(id => nodes.get(id)).filter(Boolean).map(n => brief(n!)),
      };
    }
    case 'focus': {
      const node = requireNode(host, args['node']);
      if (host.followMode() === 'free') {
        host.showLookHere(node);
        return {focused: brief(node), viewMoved: false,
          note: 'The user has taken control of the view; they were shown a "look here" hint instead.'};
      }
      canvas.agentFocusNode(node.id);
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
    default:
      throw new Error(`Unknown KiDraw tool "${name}"`);
  }
}
