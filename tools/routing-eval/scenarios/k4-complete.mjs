import { placeNode, connect } from './_helpers.mjs';

export const name = 'k4-complete';
export const description = 'K4: 4 nodes, all 6 possible undirected edges (rendered as 6 directed edges). Tests dense local connectivity — every pair connected. Planar, so 0 crossings should be achievable.';

export function build({ DANode, DAEdge }) {
  // 4 nodes at the corners of a square.
  const a = placeNode(DANode, 'A', 300, 300);
  const b = placeNode(DANode, 'B', 700, 300);
  const c = placeNode(DANode, 'C', 700, 700);
  const d = placeNode(DANode, 'D', 300, 700);
  const all = [a, b, c, d];
  const edges = [];
  for (let i = 0; i < 4; i++) {
    for (let j = i + 1; j < 4; j++) {
      edges.push(connect(DAEdge, `${all[i].id}${all[j].id}`, all[i], all[j]));
    }
  }
  return { nodes: all, edges };
}
