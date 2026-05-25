import { placeNode, connect } from './_helpers.mjs';

export const name = 'linear-then-branch';
export const description = 'A linear chain A→B→C→D then D fans out to E, F, G. Tests the transition from a clean line to a fan — should produce a "trunk with branches" silhouette.';

export function build({ DANode, DAEdge }) {
  const a = placeNode(DANode, 'A',  150, 400);
  const b = placeNode(DANode, 'B',  350, 400);
  const c = placeNode(DANode, 'C',  550, 400);
  const d = placeNode(DANode, 'D',  750, 400);
  const e = placeNode(DANode, 'E', 1000, 250);
  const f = placeNode(DANode, 'F', 1050, 400);
  const g = placeNode(DANode, 'G', 1000, 550);
  return {
    nodes: [a, b, c, d, e, f, g],
    edges: [
      connect(DAEdge, 'AB', a, b),
      connect(DAEdge, 'BC', b, c),
      connect(DAEdge, 'CD', c, d),
      connect(DAEdge, 'DE', d, e),
      connect(DAEdge, 'DF', d, f),
      connect(DAEdge, 'DG', d, g),
    ],
  };
}
