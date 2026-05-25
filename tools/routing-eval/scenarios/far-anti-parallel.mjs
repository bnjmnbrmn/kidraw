import { placeNode, connect } from './_helpers.mjs';

export const name = 'far-anti-parallel';
export const description = '2 nodes very far apart (~1300 px) with anti-parallel edges. Tests whether lane spacing scales sensibly — at long distance the two lanes should still be visibly separated but not absurdly far apart.';

export function build({ DANode, DAEdge }) {
  const a = placeNode(DANode, 'A',  150, 300);
  const b = placeNode(DANode, 'B', 1450, 300);
  const e1 = connect(DAEdge, 'AB', a, b);
  const e2 = connect(DAEdge, 'BA', b, a);
  return { nodes: [a, b], edges: [e1, e2] };
}
