/**
 * The canvas tools: each tool's name, the description the model reads, and
 * the schema of its arguments, including the changes apply_changes accepts.
 * The server offers them over MCP (agent/src/mcp-bridge.ts); the tab runs
 * them (src/app/agent/agent-tools.ts), and must implement exactly these,
 * which the compiler checks there.
 *
 * This file imports nothing but zod, and messages.ts nothing at all: the
 * app's test bundler can't follow the `.js` imports Node needs between them.
 *
 * Every tool runs in the user's tab; kidraw-agent only relays calls and
 * results. Most read the graph or guide the user's view; apply_changes edits
 * the graph, as one undoable step per call.
 */
import { z } from 'zod';

// ─── The changes apply_changes accepts ────────────────────────────────────
//
// The schema the model is given (it reads the descriptions), and
// `CanvasChange`, the type both programs use for one change. Node references
// are free text here, a label, id or batch handle; the tab resolves them to
// ids before anything is applied (src/app/agent/agent-changes.ts).

export const NODE_REF = 'A node label (fuzzy-matched) or a node id from get_outline, e.g. "n12".';

/** One entry in an apply_changes batch. */
export const CHANGE = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('add_node'),
    text: z.string().min(1).describe('The node text. For explanations, one statement: a single sentence.'),
    handle: z.string().optional().describe('A name for the new node, to refer to it later in the same batch.'),
    near: z.string().optional().describe('Place it near this node: a label, id or handle.'),
    nodeKind: z.string().optional().describe('One of the diagram type\'s node kinds from get_outline, e.g. "definition"; omit for a plain statement.'),
    tags: z.array(z.string()).optional(),
  }),
  z.object({
    kind: z.literal('update_node'),
    node: z.string().describe(NODE_REF),
    nodeKind: z.string().nullable().optional().describe('New node kind; null makes it a plain statement.'),
    text: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }),
  z.object({ kind: z.literal('delete_node'), node: z.string().describe(`${NODE_REF} Its edges are deleted too.`) }),
  z.object({
    kind: z.literal('add_edge'),
    from: z.string().describe('Source node: a label, id or handle.'),
    to: z.string().describe('Target node: a label, id or handle.'),
    edgeKind: z.string().optional().describe('One of the diagram type\'s edge kinds from get_outline, e.g. "supports".'),
    label: z.string().optional().describe('Edge label.'),
  }),
  z.object({
    kind: z.literal('update_edge'),
    edge: z.string().describe('Edge id from get_outline.'),
    label: z.string().optional().describe('New label; "" removes it.'),
    edgeKind: z.string().nullable().optional().describe('New edge kind; null makes it a plain edge.'),
    tags: z.array(z.string()).optional().describe('Replaces the edge\'s tags, e.g. to remove a feedback mark (keep its kind tag).'),
  }),
  z.object({ kind: z.literal('delete_edge'), edge: z.string().describe('Edge id from get_outline.') }),
  z.object({
    kind: z.literal('set_reading_order'),
    nodes: z.array(z.string()).min(1).describe(
      'Every statement in reading order, by label, id or handle. List a statement again only where the reader '
      + 'should reread it just before a later step that depends on it (not as a recap). Replaces the whole order '
      + 'and renumbers every statement.'),
  }),
  z.object({ kind: z.literal('arrange') }).describe(
    'Lay the whole graph out top-down along its edges, prerequisites above what builds on them, once the rest '
    + 'of the batch is applied.'),
]);

/** One change a client asks for. */
export type CanvasChange = z.infer<typeof CHANGE>;

/** A batch of changes, as apply_changes takes it. */
export const CHANGES = z.array(CHANGE).min(1).max(100);

// ─── The tools ────────────────────────────────────────────────────────────

export interface CanvasToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodRawShape;
  /** False for tools that change the graph. Defaults to read-only. */
  readOnly?: boolean;
}

export const CANVAS_TOOLS = [
  {
    name: 'get_outline',
    description:
      'Read the graph the user has open: its diagram type and edge kinds, every node (id, label, tags) and ' +
      'every edge (id, from, to, labels, tags). Call this first to understand the graph.',
    inputSchema: {},
  },
  {
    name: 'find_nodes',
    description: 'Fuzzy-search node labels. Returns the best matches with ids.',
    inputSchema: {
      query: z.string().describe('Text to search for.'),
      limit: z.number().int().min(1).max(50).optional().describe('Maximum matches (default 10).'),
    },
  },
  {
    name: 'get_selection',
    description: 'What the user currently has selected, plus the node under their crosshairs.',
    inputSchema: {},
  },
  {
    name: 'get_view',
    description: 'Which part of the graph is visible to the user right now, and the nodes in view.',
    inputSchema: {},
  },
  {
    name: 'focus',
    description:
      'Move the user\'s view to a node and mark it (their selection is left alone). If the user has taken ' +
      'control of the view or is editing, they see a "look here" hint instead of the view moving.',
    inputSchema: { node: z.string().describe(NODE_REF) },
  },
  {
    name: 'highlight',
    description: 'Make nodes glow so the user can see what you are talking about. Replaces any previous highlight.',
    inputSchema: { nodes: z.array(z.string()).min(1).describe('Node labels or ids.') },
  },
  {
    name: 'caption',
    description:
      'Show a short caption next to a node (or at the bottom of the window if the node is off-screen). ' +
      'Use it to point things out on the canvas; keep it to a sentence or two.',
    inputSchema: {
      node: z.string().describe(NODE_REF),
      text: z.string().max(400).describe('Caption text.'),
    },
  },
  {
    name: 'clear_annotations',
    description: 'Remove all captions and highlights you have added.',
    inputSchema: {},
  },
  {
    name: 'define_plugin',
    readOnly: false,
    description:
      'Add a new diagram type to KiDraw, written as YAML data (nothing in it runs). Fields: id (lower-case, ' +
      'dashes; must be new), name, description, labels (plain | markdown), nodes {shape: box|circle|diamond, ' +
      'width, height, fontSize, textOverflow: fit|clip|...}, tagGroups [{id, name, choices [{tag: family/name, ' +
      'label, color: "#rrggbb", dims?}]}] (drawn as badges; a node has at most one tag per group), edgeKinds ' +
      '[{tag, name, color, description, faint?}], nodeKinds [{tag, name, color, description}], and menu ' +
      '[{label, set: <tag>} or {label, clear: <group id>}, key?] for the user\'s root `t` menu. It is kept in ' +
      'the user\'s browser and they can remove it in Settings > Plugins. To use it on the open graph, ask the ' +
      'user to run :type <id>. Every problem with the YAML comes back at once.',
    inputSchema: {
      source: z.string().min(1).max(20000).describe('The plugin, as YAML.'),
    },
  },
  {
    name: 'apply_changes',
    readOnly: false,
    description:
      'Change the graph: add, update or delete nodes and edges, or set the reading order, in one batch, applied in order and ' +
      'all-or-nothing. The user can undo the batch as one step. If the graph changed in a way that ' +
      'conflicts, nothing is applied and you get an error: call get_outline and try again.',
    inputSchema: {
      changes: CHANGES.describe('The changes, applied in order.'),
    },
  },
] as const satisfies readonly CanvasToolDefinition[];

/** A tool's name. */
export type ToolName = (typeof CANVAS_TOOLS)[number]['name'];

type ToolWithName<N extends ToolName> = Extract<(typeof CANVAS_TOOLS)[number], {name: N}>;

/** A tool's arguments, as its schema describes them. */
export type ToolArgs<N extends ToolName> = z.infer<z.ZodObject<ToolWithName<N>['inputSchema']>>;

const argSchemas = new Map<string, z.ZodType>(CANVAS_TOOLS.map(tool => [tool.name, z.object(tool.inputSchema)]));

/** Check a call's arguments against its tool's schema. Throws with every
 *  problem, worded for the agent. */
export function parseToolArgs<N extends ToolName>(name: N, args: unknown): ToolArgs<N> {
  const schema = argSchemas.get(name);
  if (!schema) throw new Error(`Unknown KiDraw tool "${name}"`);
  const parsed = schema.safeParse(args ?? {});
  if (!parsed.success) {
    const problems = parsed.error.issues.map(issue => `${issue.path.join('.') || 'arguments'}: ${issue.message}`);
    throw new Error(`Invalid arguments for ${name}: ${problems.join('; ')}`);
  }
  return parsed.data as ToolArgs<N>;
}

/** Whether `name` is one of the tools. */
export function isToolName(name: string): name is ToolName {
  return argSchemas.has(name);
}
