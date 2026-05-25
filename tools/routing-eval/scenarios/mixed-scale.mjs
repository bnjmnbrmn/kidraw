import { placeNode, connect } from './_helpers.mjs';

export const name = 'mixed-scale';
export const description = 'A small tight triangle of 3 close-packed nodes + a single far-away node connected to all three. Tests whether one set of router parameters can handle both very short (intra-triangle ~150 px) and very long (triangle-to-distant ~900 px) edges in the same graph.';

export function build({ DANode, DAEdge }) {
  // Tight triangle in the bottom-left.
  const a = placeNode(DANode, 'A',  200, 700);
  const b = placeNode(DANode, 'B',  350, 700);
  const c = placeNode(DANode, 'C',  275, 570);
  // Far node in the top-right.
  const f = placeNode(DANode, 'F', 1100, 200);
  const e1 = connect(DAEdge, 'AB', a, b);
  const e2 = connect(DAEdge, 'BC', b, c);
  const e3 = connect(DAEdge, 'CA', c, a);
  const fa = connect(DAEdge, 'FA', f, a);
  const fb = connect(DAEdge, 'FB', f, b);
  const fc = connect(DAEdge, 'FC', f, c);
  return { nodes: [a, b, c, f], edges: [e1, e2, e3, fa, fb, fc] };
}
