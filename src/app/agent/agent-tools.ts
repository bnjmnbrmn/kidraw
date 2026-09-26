/**
 * The canvas tools, as the tab runs them. The server offers them to the agent
 * over MCP (agent/src/tools.ts has their schemas and descriptions) and relays
 * each call here; a test there checks that the two lists match.
 *
 * Most tools read the graph or guide the user's view. `apply_changes` and
 * `define_plugin` change things, and are refused after the user presses Stop.
 */
import {resolveIdentity} from '../plugins/plugin-registry';
import {fuzzyMatch} from '../lib/fuzzy-match';
import type {CanvasPort, CanvasChange, CanvasChangeResult, CanvasNode} from '../drawing-area/canvas-port';
import type {KidrawPlugin} from '../plugins/plugin.model';
import {resolveChanges, resolveNodeRef} from './agent-changes';

/** What the tools may do beyond reading the canvas: the session's view
 *  control, marks and edit turns (AgentService). */
export interface AgentToolHost {
  canvas: CanvasPort;
  /** 'free' means the user has taken control of the view, or is busy editing. */
  followMode(): 'following' | 'free';
  /** Move the view onto the node and mark it; never touches the selection. */
  focus(node: CanvasNode): void;
  /** Shown instead of moving the view while the user has control. */
  showLookHere(node: CanvasNode): void;
  addCaption(node: CanvasNode, text: string): void;
  setHighlights(nodes: CanvasNode[]): void;
  clearAnnotations(): void;
  /** Apply changes as one undo step of the current agent turn. */
  applyChanges(changes: CanvasChange[]): Promise<CanvasChangeResult>;
  /** Why the agent may not change the graph right now (e.g. the user pressed Stop), or null. */
  editsRefused(): string | null;
  /** Add a diagram type written as YAML (plugins/declarative-plugin.ts).
   *  Throws with every problem when it is refused. */
  definePlugin(source: string): {id: string; name: string};
}

type Args = Record<string, unknown>;
type Tool = (args: Args, host: AgentToolHost) => unknown;

/** Every tool, by the name the agent calls it. */
const TOOLS: Record<string, Tool> = {
  get_outline: (_, host) => outline(host.canvas),
  find_nodes: (args, host) => findNodes(host.canvas, String(args['query'] ?? ''), Number(args['limit'] ?? 10)),
  get_selection: (_, host) => selection(host.canvas),
  get_view: (_, host) => view(host),
  focus: (args, host) => focus(host, requireNode(host, args['node'])),
  highlight: (args, host) => highlight(host, Array.isArray(args['nodes']) ? args['nodes'] : []),
  caption: (args, host) => caption(host, requireNode(host, args['node']), String(args['text'] ?? '')),
  clear_annotations: (_, host) => {
    host.clearAnnotations();
    return {cleared: true};
  },
  apply_changes: (args, host) => applyChanges(host, args['changes']),
  define_plugin: (args, host) => definePlugin(host, String(args['source'] ?? '')),
};

/** Run one canvas tool call. Throws with a message the agent can act on. */
export function executeAgentTool(name: string, args: Args, host: AgentToolHost): unknown {
  const tool = TOOLS[name];
  if (!tool) throw new Error(`Unknown KiDraw tool "${name}"`);
  return tool(args, host);
}

// ─── Reading ──────────────────────────────────────────────────────────────

const brief = (n: CanvasNode) => ({id: n.id, label: n.label});

const isPresent = <T>(value: T | undefined): value is T => value !== undefined;

/** The whole graph, and the diagram type's vocabulary for changing it. */
function outline(canvas: CanvasPort) {
  return {
    diagramType: describeDiagramType(resolveIdentity(canvas.diagramTypeId())),
    nodes: canvas.nodes().map(n => (n.tags.length ? {...brief(n), tags: n.tags} : brief(n))),
    edges: canvas.edges().map(e => ({
      id: e.id, from: e.from, to: e.to,
      ...(e.labels.length ? {labels: e.labels} : {}),
      ...(e.tags.length ? {tags: e.tags} : {}),
    })),
  };
}

/** The kinds of node and edge the type knows, its tag groups, and how it
 *  records a reading order: what apply_changes can name. */
function describeDiagramType(identity: KidrawPlugin) {
  const kind = (k: {tag: string; name: string; description?: string}) =>
    ({tag: k.tag, name: k.name, description: k.description});
  return {
    id: identity.id, name: identity.name,
    edgeKinds: (identity.edgeKinds ?? []).map(k => ({edgeKind: k.tag.split('/').pop(), ...kind(k)})),
    nodeKinds: (identity.nodeKinds ?? []).map(k => ({nodeKind: k.tag.split('/').pop(), ...kind(k)})),
    tagGroups: (identity.tagGroups ?? []).map(group => ({
      id: group.id, name: group.name, tags: group.choices.map(choice => ({tag: choice.tag, label: choice.label})),
    })),
    ...(identity.readingOrder ? {
      readingOrder: `Nodes carry ${identity.readingOrder.tagPrefix}N tags; set them all with a set_reading_order change.`,
    } : {}),
  };
}

function findNodes(canvas: CanvasPort, query: string, limit: number) {
  const matches = canvas.nodes()
    .map(n => ({node: n, match: fuzzyMatch(query, n.label)}))
    .filter(s => s.match !== null)
    .sort((a, b) => b.match!.score - a.match!.score)
    .slice(0, Math.min(Math.max(limit, 1), 50))
    .map(s => brief(s.node));
  return {matches};
}

function selection(canvas: CanvasPort) {
  const nodes = new Map(canvas.nodes().map(n => [n.id, n]));
  const edges = new Map(canvas.edges().map(e => [e.id, e]));
  const current = canvas.selection();
  const under = current.underCrosshairsId ? nodes.get(current.underCrosshairsId) : undefined;
  return {
    selectedNodes: current.nodeIds.map(id => nodes.get(id)).filter(isPresent).map(brief),
    selectedEdges: current.edgeIds.map(id => edges.get(id)).filter(isPresent)
      .map(e => ({id: e.id, from: e.from, to: e.to})),
    underCrosshairs: under ? brief(under) : null,
  };
}

function view(host: AgentToolHost) {
  const nodes = new Map(host.canvas.nodes().map(n => [n.id, n]));
  return {
    zoomPercent: host.canvas.zoomPercent(),
    userHasControl: host.followMode() === 'free',
    visibleNodes: host.canvas.visibleNodeIds().map(id => nodes.get(id)).filter(isPresent).map(brief),
  };
}

// ─── Pointing ─────────────────────────────────────────────────────────────

function requireNode(host: AgentToolHost, ref: unknown): CanvasNode {
  const resolution = resolveNodeRef(String(ref ?? ''), host.canvas.nodes());
  if ('error' in resolution) throw new Error(resolution.error);
  return resolution.node;
}

/** Move the view onto a node, unless the user is leading it: then only hint. */
function focus(host: AgentToolHost, node: CanvasNode) {
  if (host.followMode() === 'free') {
    host.showLookHere(node);
    return {focused: brief(node), viewMoved: false,
      note: 'The user is leading the view or busy editing; they were shown a "look here" hint instead.'};
  }
  host.focus(node);
  return {focused: brief(node), viewMoved: true};
}

/** Highlight what can be found, and say what couldn't. */
function highlight(host: AgentToolHost, refs: unknown[]) {
  const found: CanvasNode[] = [];
  const notFound: string[] = [];
  for (const ref of refs) {
    const resolution = resolveNodeRef(String(ref), host.canvas.nodes());
    if ('node' in resolution) found.push(resolution.node);
    else notFound.push(`${ref}: ${resolution.error}`);
  }
  host.setHighlights(found);
  return {highlighted: found.map(brief), ...(notFound.length ? {notFound} : {})};
}

function caption(host: AgentToolHost, node: CanvasNode, text: string) {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Caption text is empty');
  host.addCaption(node, trimmed.slice(0, 400));
  return {captioned: brief(node)};
}

// ─── Changing ─────────────────────────────────────────────────────────────

function refuseIfStopped(host: AgentToolHost): void {
  const refused = host.editsRefused();
  if (refused) throw new Error(refused);
}

/** A refused or malformed batch throws at once; the canvas's answer comes later. */
function applyChanges(host: AgentToolHost, raw: unknown) {
  refuseIfStopped(host);
  const changes = resolveChanges(raw, host.canvas.nodes());
  return host.applyChanges(changes).then(result => {
    if (!result.ok) throw new Error(result.error ?? 'The changes were not applied');
    return {applied: changes.length, created: result.created};
  });
}

function definePlugin(host: AgentToolHost, source: string) {
  refuseIfStopped(host);
  const {id, name} = host.definePlugin(source);
  return {added: id, name, next: `Ask the user to run :type ${id} to use it on their graph.`};
}
