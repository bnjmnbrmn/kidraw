import { placeNode, connect } from './_helpers.mjs';

export const name = 'near-parallel-cross-6';
export const description = '6 nodes positioned to create 3 near-parallel crossings in the same area (~6° angles). Compounds the near-parallel-cross challenge: the router must widen all three crossings simultaneously without making the curves so big they bulge into each other.';

export function build({ DANode, DAEdge }) {
  // Three left-right pairs offset vertically — each pair would cross the next
  // at a very shallow angle if drawn straight.
  const lefts = [
    placeNode(DANode, 'L0', 200, 280),
    placeNode(DANode, 'L1', 200, 320),
    placeNode(DANode, 'L2', 200, 360),
  ];
  const rights = [
    placeNode(DANode, 'R0', 900, 360),
    placeNode(DANode, 'R1', 900, 320),
    placeNode(DANode, 'R2', 900, 280),
  ];
  const edges = [];
  for (let i = 0; i < 3; i++) {
    edges.push(connect(DAEdge, `E${i}`, lefts[i], rights[i]));
  }
  return { nodes: [...lefts, ...rights], edges };
}
