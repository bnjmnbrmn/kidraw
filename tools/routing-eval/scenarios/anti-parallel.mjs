import { placeNode, connect } from './_helpers.mjs';

export const name = 'anti-parallel';
export const description = 'A pair of nodes connected by edges in both directions. Bug-hunt: bezier-route is known to collapse these.';

export function build({ DANode, DAEdge }) {
  const a = placeNode(DANode, 'A', 200, 300);
  const b = placeNode(DANode, 'B', 600, 300);
  const e1 = connect(DAEdge, 'AB', a, b);
  const e2 = connect(DAEdge, 'BA', b, a);
  return { nodes: [a, b], edges: [e1, e2] };
}
