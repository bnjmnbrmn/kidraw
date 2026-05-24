import { placeNode, connect } from './_helpers.mjs';

export const name = 'line-3';
export const description = 'Three nodes in a horizontal line: A → B → C. The shortest natural shape; verifies routers don\'t introduce gratuitous bends on the trivial case.';

export function build({ DANode, DAEdge }) {
  const a = placeNode(DANode, 'A', 200, 300);
  const b = placeNode(DANode, 'B', 500, 300);
  const c = placeNode(DANode, 'C', 800, 300);
  return {
    nodes: [a, b, c],
    edges: [
      connect(DAEdge, 'AB', a, b),
      connect(DAEdge, 'BC', b, c),
    ],
  };
}
