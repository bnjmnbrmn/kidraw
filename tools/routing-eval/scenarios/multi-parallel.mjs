import { placeNode, connect } from './_helpers.mjs';

export const name = 'multi-parallel';
export const description = 'Three same-direction parallel edges between A and B. Tests lane-spread behavior under more than two siblings.';

export function build({ DANode, DAEdge }) {
  const a = placeNode(DANode, 'A', 200, 300);
  const b = placeNode(DANode, 'B', 600, 300);
  const edges = [
    connect(DAEdge, 'AB1', a, b),
    connect(DAEdge, 'AB2', a, b),
    connect(DAEdge, 'AB3', a, b),
  ];
  return { nodes: [a, b], edges };
}
