import { placeNode, connect } from './_helpers.mjs';

export const name = 'k5-complete';
export const description = 'K5: 5 nodes, all 10 possible edges. The smallest non-planar complete graph — at least one crossing is geometrically required. Tests how the router handles unavoidable crossings (and whether they cross at sensible angles).';

export function build({ DANode, DAEdge }) {
  // 5 nodes on a circle.
  const nodes = [];
  const cx = 500, cy = 500, r = 280;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * 2 * Math.PI - Math.PI / 2;
    nodes.push(placeNode(DANode, `N${i}`, cx + r * Math.cos(a), cy + r * Math.sin(a)));
  }
  const edges = [];
  for (let i = 0; i < 5; i++) {
    for (let j = i + 1; j < 5; j++) {
      edges.push(connect(DAEdge, `N${i}N${j}`, nodes[i], nodes[j]));
    }
  }
  return { nodes, edges };
}
