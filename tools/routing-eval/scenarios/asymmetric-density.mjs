import { placeNode, connect } from './_helpers.mjs';

export const name = 'asymmetric-density';
export const description = 'Dense cluster on the left (6 nodes, fully connected = 15 edges) + sparse area on the right (3 nodes, 2 edges) + 3 spanning edges between the two regions. Probes whether router parameters adapt locally — dense side needs tight lane spacing, sparse side benefits from straight lines.';

export function build({ DANode, DAEdge }) {
  // Dense cluster: 6 nodes in a hexagonal arrangement.
  const dense = [];
  for (let i = 0; i < 6; i++) {
    const angle = (i / 6) * 2 * Math.PI;
    const cx = 320 + 130 * Math.cos(angle);
    const cy = 500 + 130 * Math.sin(angle);
    dense.push(placeNode(DANode, `D${i}`, cx, cy));
  }
  // Sparse area: 3 nodes in a triangle on the right.
  const s0 = placeNode(DANode, 'S0', 1000, 300);
  const s1 = placeNode(DANode, 'S1', 1200, 500);
  const s2 = placeNode(DANode, 'S2', 1000, 700);
  const edges = [];
  // Dense: fully connect (15 edges).
  for (let i = 0; i < 6; i++) {
    for (let j = i + 1; j < 6; j++) {
      edges.push(connect(DAEdge, `D${i}${j}`, dense[i], dense[j]));
    }
  }
  // Sparse: 2 edges.
  edges.push(connect(DAEdge, 'S01', s0, s1));
  edges.push(connect(DAEdge, 'S12', s1, s2));
  // Spans: 3 edges bridging the two clusters.
  edges.push(connect(DAEdge, 'span0', dense[0], s0));
  edges.push(connect(DAEdge, 'span1', dense[2], s1));
  edges.push(connect(DAEdge, 'span2', dense[4], s2));
  return { nodes: [...dense, s0, s1, s2], edges };
}
