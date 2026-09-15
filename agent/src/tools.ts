import { z } from 'zod';

/**
 * KiDraw canvas tools offered to agents over MCP. Every tool runs in the
 * user's tab; kidraw-agent only relays calls and results. Most read the graph
 * or guide the user's view; apply_changes edits the graph, as one undoable
 * step per call (src/app/drawing-area/agent-change-planner.ts).
 */
export interface CanvasToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodRawShape;
  /** False for tools that change the graph. Defaults to read-only. */
  readOnly?: boolean;
}

const NODE_REF = 'A node label (fuzzy-matched) or a node id from get_outline, e.g. "n12".';

/** One entry in an apply_changes batch. Mirrors AgentChange in src/app/agent/agent-canvas.ts. */
const CHANGE = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('add_node'),
    text: z.string().min(1).describe('The node text. For explanations, one statement: a single sentence.'),
    handle: z.string().optional().describe('A name for the new node, to refer to it later in the same batch.'),
    near: z.string().optional().describe('Place it near this node: a label, id or handle.'),
    tags: z.array(z.string()).optional(),
  }),
  z.object({
    kind: z.literal('update_node'),
    node: z.string().describe(NODE_REF),
    text: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }),
  z.object({ kind: z.literal('delete_node'), node: z.string().describe(`${NODE_REF} Its edges are deleted too.`) }),
  z.object({
    kind: z.literal('add_edge'),
    from: z.string().describe('Source node: a label, id or handle.'),
    to: z.string().describe('Target node: a label, id or handle.'),
    edgeKind: z.string().optional().describe('One of the diagram type\'s edge kinds from get_outline, e.g. "supports" or "path".'),
    label: z.string().optional().describe('Edge label. For path edges, the step number, e.g. "3".'),
  }),
  z.object({
    kind: z.literal('update_edge'),
    edge: z.string().describe('Edge id from get_outline.'),
    label: z.string().optional().describe('New label; "" removes it.'),
    edgeKind: z.string().nullable().optional().describe('New edge kind; null makes it a plain edge.'),
  }),
  z.object({ kind: z.literal('delete_edge'), edge: z.string().describe('Edge id from get_outline.') }),
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
    name: 'apply_changes',
    readOnly: false,
    description:
      'Change the graph: add, update or delete nodes and edges in one batch, applied in order and ' +
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
  '- Keep replies short. Do not run shell commands or read files; everything you need comes from the tools.',
  '',
  'Explanations and tutorials:',
  '- They use the "explanation" diagram type. If get_outline shows a different type, ask the user to run',
  '  :type explanation first.',
  '- Work the explanation out yourself. Write one statement per node: a single sentence.',
  '- Node text supports **bold**, *italic* and `code` (for names, symbols and short formulas). There is no',
  '  math rendering yet, so write formulas in plain text or code.',
  '- For every statement, add a "supports" edge from each statement it follows from, even when that premise',
  '  came much earlier.',
  '- Add "path" edges for the suggested reading order, labelled with step numbers 1, 2, 3, ... When you insert',
  '  or remove a step, renumber the later path edges in the same apply_changes call.',
  '- When the user points at a statement or edge that does not follow for them, add the missing intermediate',
  '  statements (with their supports and path edges) instead of rewording what is there.',
  '- When the user says a part is too detailed, merge those steps: delete the extra statements and reconnect',
  '  the supports and path edges.',
].join('\n');
