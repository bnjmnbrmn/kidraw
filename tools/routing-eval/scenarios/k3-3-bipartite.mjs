import { placeNode, connect } from './_helpers.mjs';

export const name = 'k3-3-bipartite';
export const description = 'K3,3: two groups of 3 nodes with all 9 inter-group edges. The other famous non-planar graph (alongside K5). Tests bipartite crossings — every left node connects to every right node, forcing some edges to cross.';

export function build({ DANode, DAEdge }) {
  const left = [
    placeNode(DANode, 'L0', 300, 250),
    placeNode(DANode, 'L1', 300, 500),
    placeNode(DANode, 'L2', 300, 750),
  ];
  const right = [
    placeNode(DANode, 'R0', 900, 250),
    placeNode(DANode, 'R1', 900, 500),
    placeNode(DANode, 'R2', 900, 750),
  ];
  const edges = [];
  for (const l of left) for (const r of right) {
    edges.push(connect(DAEdge, `${l.id}${r.id}`, l, r));
  }
  return { nodes: [...left, ...right], edges };
}
