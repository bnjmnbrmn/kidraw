import { placeNode, connect } from './_helpers.mjs';

export const name = 'tight-cluster';
export const description = '6 nodes packed into a tight 400-px area with 9 edges (mostly ring + a few cross-connections). Stress test for short-edge routing where nearly every other node is an obstacle.';

export function build({ DANode, DAEdge }) {
  const cx = 500, cy = 500, r = 180;
  const nodes = [];
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * 2 * Math.PI;
    nodes.push(placeNode(DANode, `N${i}`, cx + r * Math.cos(a), cy + r * Math.sin(a)));
  }
  const edges = [];
  // Ring (6 edges).
  for (let i = 0; i < 6; i++) edges.push(connect(DAEdge, `N${i}N${(i+1)%6}`, nodes[i], nodes[(i+1)%6]));
  // 3 cross-connections (chords).
  edges.push(connect(DAEdge, 'N0N3', nodes[0], nodes[3]));
  edges.push(connect(DAEdge, 'N1N4', nodes[1], nodes[4]));
  edges.push(connect(DAEdge, 'N2N5', nodes[2], nodes[5]));
  return { nodes, edges };
}
