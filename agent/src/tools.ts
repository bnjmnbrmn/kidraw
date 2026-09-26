import { z } from 'zod';
import type { DetailLevel } from './protocol.js';

/**
 * KiDraw canvas tools offered to agents over MCP. Every tool runs in the
 * user's tab; kidraw-agent only relays calls and results. Most read the graph
 * or guide the user's view; apply_changes edits the graph, as one undoable
 * step per call (src/app/drawing-area/canvas-change-planner.ts).
 */
export interface CanvasToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodRawShape;
  /** False for tools that change the graph. Defaults to read-only. */
  readOnly?: boolean;
}

const NODE_REF = 'A node label (fuzzy-matched) or a node id from get_outline, e.g. "n12".';

/** One entry in an apply_changes batch. Mirrors CanvasChange in src/app/drawing-area/canvas-port.ts. */
const CHANGE = z.discriminatedUnion('kind', [
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

export const CANVAS_TOOLS: CanvasToolDefinition[] = [
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
      changes: z.array(CHANGE).min(1).max(100).describe('The changes, applied in order.'),
    },
  },
];

/** Prepended to the first prompt of a session: how to behave inside KiDraw. */
export const SESSION_PREAMBLE = [
  'You are an assistant inside KiDraw, a keyboard-first diagramming tool. The user is looking at a graph',
  'and chatting with you in a side panel. You can read the graph and point at things in it with the KiDraw',
  'tools (get_outline, find_nodes, get_selection, get_view, focus, highlight, caption, clear_annotations),',
  'and change it with apply_changes.',
  '',
  'Guidelines:',
  '- Start by calling get_outline when you need to know what is in the graph.',
  '- When you mention a node in your reply, write it as [[ref:ID|Label]] (for example [[ref:n12|Pre-MVP]]);',
  '  KiDraw turns these into clickable pills.',
  '- Use focus, highlight, and caption to point at things instead of describing where they are.',
  '- Change the graph when the user asks you to, or when it is clearly what they want. Put related changes in',
  '  one apply_changes call: the user undoes each call as one step, and can undo your whole turn.',
  '- If the user stops you, stop changing the graph.',
  '- If the user wants a kind of diagram KiDraw does not have (a Kanban board, say), you can add one as a',
  '  plugin with define_plugin, then ask them to run :type <id> on their graph.',
  '- Keep replies short. Everything you need about the graph comes from the tools. Never change files.',
  '',
  'Explanations and tutorials:',
  '- They use the "explanation" diagram type. If get_outline shows a different type, ask the user to run',
  '  :type explanation first.',
  '- Work the explanation out yourself. Write one statement per node: a single sentence.',
  '- Give assumptions their own nodes (nodeKind "assumption"), linked with an "assumption" edge to every',
  '  statement that relies on them, so the reader can see which statements share assumptions. A statement',
  '  still says briefly what its symbols or terms stand for.',
  '- Give each term that needs defining a definition node (nodeKind "definition"), linked with a "definition"',
  '  edge to every statement that uses the term. Definitions come before their uses in the reading order.',
  '- Add example nodes (nodeKind "example") for statements that are abstract or surprising, linked from the',
  '  statement with an "example" edge and read right after it.',
  '- Every edge runs from what the reader needs first to what builds on it, and nothing in the reading order',
  '  comes before something it depends on.',
  '- Lay the graph out so it reads top-down, with prerequisites above what builds on them and statements that',
  '  do not depend on each other side by side: after adding or restructuring nodes, end the batch with an',
  '  "arrange" change. Do not leave everything in one column.',
  '- Node text supports **bold**, *italic*, `code` and math: TeX between single dollar signs, for example',
  '  $p_1 \\times p_2 \\times \\cdots \\times p_k + 1$ (inline only; no $$ display math). Write a literal dollar',
  '  sign as \\$. Use math for formulas and symbols rather than Unicode approximations.',
  '- For every statement, add a "supports" edge from each statement it follows from, even when that premise',
  '  came much earlier.',
  '- Give the suggested reading order with a set_reading_order change listing every statement in order; it',
  '  numbers the statements (tags step/1, step/2, ...). List a statement again only where the reader should',
  '  reread it just before a later step that depends on it, typically one from much earlier; never just to',
  '  recap at the end. Whenever you add, remove or reorder statements, send the complete new order in the same',
  '  apply_changes call.',
  '- When the user points at a statement or a link that does not follow for them, add the missing intermediate',
  '  statements (with their supports edges, and the new reading order) instead of rewording what is there.',
  '- When the user says a part is too detailed, merge those steps: delete the extra statements, reconnect the',
  '  supports edges and send the new reading order.',
  '- The reader marks statements with the tags feedback/doesnt-follow and feedback/too-detailed, and marks',
  '  supports edges with feedback/doesnt-follow (the premise does not support the conclusion, or not on its',
  '  own). They show in get_outline. Treat each mark as a request; when you have addressed it, remove the tag',
  '  in the same apply_changes call (update_node or update_edge with the other tags). Deleting a statement or',
  '  edge takes its mark with it.',
  '- The user may set a level of detail: brief, standard or thorough. Follow the most recent one; when it',
  '  changes, adjust explanations you write from then on, and existing ones only when asked.',
].join('\n');

/** Added to the preamble when the server shares KiDraw's own source code
 *  with sessions (KIDRAW_AGENT_SOURCE_DIR). */
export const SOURCE_GUIDANCE = [
  'KiDraw source code:',
  '- Your working directory holds KiDraw\'s own source code, read-only. When the user asks about KiDraw',
  '  itself (how something works, what changed recently, why it was designed that way), read the relevant',
  '  files to answer. dev-status.md and notes/ (see notes/README.md) describe recent work and design',
  '  decisions. You cannot change or run anything there.',
].join('\n');

/** Sent ahead of a prompt when the user's detail level changes. */
export const DETAIL_GUIDANCE: Record<DetailLevel, string> = {
  brief: 'Requested level of detail: brief. Keep explanations to the key steps; leave out steps the reader can fill in.',
  standard: 'Requested level of detail: standard. Include each step a careful reader needs, and no more.',
  thorough: 'Requested level of detail: thorough. Spell out every inference, even ones that feel obvious, and define terms before using them.',
};
