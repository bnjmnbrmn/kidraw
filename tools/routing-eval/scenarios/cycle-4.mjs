import { placeNode, connect } from './_helpers.mjs';

export const name = 'cycle-4';
export const description = 'Square cycle: A→B→C→D→A. Tests that adjacent-edge endpoints on a shared node spread cleanly rather than stacking.';

export function build({ DANode, DAEdge }) {
  const a = placeNode(DANode, 'A', 300, 200);
  const b = placeNode(DANode, 'B', 700, 200);
  const c = placeNode(DANode, 'C', 700, 600);
  const d = placeNode(DANode, 'D', 300, 600);
  return {
    nodes: [a, b, c, d],
    edges: [
      connect(DAEdge, 'AB', a, b),
      connect(DAEdge, 'BC', b, c),
      connect(DAEdge, 'CD', c, d),
      connect(DAEdge, 'DA', d, a),
    ],
  };
}
