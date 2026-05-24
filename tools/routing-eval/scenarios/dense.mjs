import { placeNode, connect } from './_helpers.mjs';

export const name = 'dense';
export const description = '12 nodes on a circle with ring edges, a few chords, and a couple of anti-parallel pairs (~26 edges). The stress test — many obstacles, many parallel/anti-parallel groups in one frame.';

export function build({ DANode, DAEdge }) {
  const cx = 500;
  const cy = 450;
  const radius = 320;
  const N = 12;
  const nodes = [];
  for (let i = 0; i < N; i++) {
    const theta = (i / N) * 2 * Math.PI - Math.PI / 2;
    nodes.push(placeNode(DANode, `n${i}`, cx + Math.cos(theta) * radius, cy + Math.sin(theta) * radius));
  }
  const edges = [];
  let eid = 0;
  // Ring
  for (let i = 0; i < N; i++) {
    edges.push(connect(DAEdge, `r${eid++}`, nodes[i], nodes[(i + 1) % N]));
  }
  // Chords across the circle
  const chordPairs = [[0, 6], [2, 7], [3, 9], [4, 10], [1, 5], [8, 11]];
  for (const [a, b] of chordPairs) {
    edges.push(connect(DAEdge, `c${eid++}`, nodes[a], nodes[b]));
  }
  // A couple anti-parallel pairs to make sibling logic earn its keep
  edges.push(connect(DAEdge, `ap${eid++}`, nodes[6], nodes[0]));
  edges.push(connect(DAEdge, `ap${eid++}`, nodes[7], nodes[2]));
  // A near-parallel duplicate
  edges.push(connect(DAEdge, `dp${eid++}`, nodes[3], nodes[9]));
  // A few skip-one edges to add short congested routes
  edges.push(connect(DAEdge, `s${eid++}`, nodes[0], nodes[2]));
  edges.push(connect(DAEdge, `s${eid++}`, nodes[4], nodes[6]));
  edges.push(connect(DAEdge, `s${eid++}`, nodes[8], nodes[10]));
  return { nodes, edges };
}
