import { placeNode, connect } from './_helpers.mjs';

export const name = 'branched-line';
export const description = 'A horizontal line of 5 nodes with 3 side-branches off the middle nodes. Tests a "river with tributaries" pattern — short branches off a main trunk.';

export function build({ DANode, DAEdge }) {
  const a = placeNode(DANode, 'A',  150, 500);
  const b = placeNode(DANode, 'B',  400, 500);
  const c = placeNode(DANode, 'C',  650, 500);
  const d = placeNode(DANode, 'D',  900, 500);
  const e = placeNode(DANode, 'E', 1150, 500);
  // Branches.
  const b1 = placeNode(DANode, 'b1', 400, 250);
  const b2 = placeNode(DANode, 'b2', 650, 250);
  const b3 = placeNode(DANode, 'b3', 900, 750);
  return {
    nodes: [a, b, c, d, e, b1, b2, b3],
    edges: [
      connect(DAEdge, 'AB', a, b),
      connect(DAEdge, 'BC', b, c),
      connect(DAEdge, 'CD', c, d),
      connect(DAEdge, 'DE', d, e),
      connect(DAEdge, 'Bb1', b, b1),
      connect(DAEdge, 'Cb2', c, b2),
      connect(DAEdge, 'Db3', d, b3),
    ],
  };
}
