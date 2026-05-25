import { placeNode, connect } from './_helpers.mjs';

export const name = 'wide-anti-parallel';
export const description = '2 nodes very close together (~200 px apart) with anti-parallel edges (A→B, B→A). Tight quarters: tests whether lane spacing leaves enough gap that the two edges read distinctly.';

export function build({ DANode, DAEdge }) {
  const a = placeNode(DANode, 'A', 400, 300);
  const b = placeNode(DANode, 'B', 600, 300);
  const e1 = connect(DAEdge, 'AB', a, b);
  const e2 = connect(DAEdge, 'BA', b, a);
  return { nodes: [a, b], edges: [e1, e2] };
}
