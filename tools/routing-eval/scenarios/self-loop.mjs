import { placeNode, connect } from './_helpers.mjs';

export const name = 'self-loop';
export const description = 'A single node with an edge back to itself. Every router should skip the edge without crashing.';

export function build({ DANode, DAEdge }) {
  const a = placeNode(DANode, 'A', 400, 300);
  const e = connect(DAEdge, 'AA', a, a);
  return { nodes: [a], edges: [e] };
}
