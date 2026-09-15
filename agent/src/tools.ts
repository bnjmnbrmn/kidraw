import { z } from 'zod';

/**
 * KiDraw canvas tools offered to agents over MCP. Every tool runs in the
 * user's tab; kidraw-agent only relays calls and results.
 *
 * Read-only in this first draft: tools inspect the graph and guide the
 * user's view, but never change the graph.
 */
export interface CanvasToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodRawShape;
}

const NODE_REF = 'A node label (fuzzy-matched) or a node id from get_outline, e.g. "n12".';

export const CANVAS_TOOLS: CanvasToolDefinition[] = [
  {
    name: 'get_outline',
    description:
      'Read the graph the user has open: every node (id, label, tags, notes) and every edge ' +
      '(id, from, to, labels). Call this first to understand the graph.',
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
      'Move the user\'s view to a node and select it. If the user has taken control of the ' +
      'view, they see a "look here" hint instead of the view moving.',
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
];

/** Prepended to the first prompt of a session: how to behave inside KiDraw. */
export const SESSION_PREAMBLE = [
  'You are an assistant inside KiDraw, a keyboard-first diagramming tool. The user is looking at a graph',
  'and chatting with you in a side panel. You can inspect the graph and guide their view with the KiDraw',
  'tools (get_outline, find_nodes, get_selection, get_view, focus, highlight, caption, clear_annotations).',
  'You cannot change the graph in this version.',
  '',
  'Guidelines:',
  '- Start by calling get_outline when you need to know what is in the graph.',
  '- When you mention a node in your reply, write it as [[ref:ID|Label]] (for example [[ref:n12|Pre-MVP]]);',
  '  KiDraw turns these into clickable pills.',
  '- Use focus, highlight, and caption to point at things instead of describing where they are.',
  '- Keep replies short. Do not run shell commands or read files; everything you need comes from the tools.',
].join('\n');
