import { placeNode, connect } from './_helpers.mjs';

export const name = 'mixed-scale';
export const description = 'A triangle of 3 nodes (well-separated, ~300 px sides) + a single far-away node connected to all three. Tests whether one set of router parameters can handle both moderate (intra-triangle ~300 px) and very long (triangle-to-distant ~900 px) edges in the same graph.';

export function build({ DANode, DAEdge }) {
  // Separated triangle in the bottom-left (~300 px sides, ~180 px node gaps).
  const a = placeNode(DANode, 'A',  200, 780);
  const b = placeNode(DANode, 'B',  520, 780);
  const c = placeNode(DANode, 'C',  360, 520);
  // Far node in the top-right.
  const f = placeNode(DANode, 'F', 1150, 180);
  const e1 = connect(DAEdge, 'AB', a, b);
  const e2 = connect(DAEdge, 'BC', b, c);
  const e3 = connect(DAEdge, 'CA', c, a);
  const fa = connect(DAEdge, 'FA', f, a);
  const fb = connect(DAEdge, 'FB', f, b);
  const fc = connect(DAEdge, 'FC', f, c);
  return { nodes: [a, b, c, f], edges: [e1, e2, e3, fa, fb, fc] };
}
