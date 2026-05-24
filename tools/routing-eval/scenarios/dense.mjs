import { placeNode, connect } from './_helpers.mjs';

// Rationale: Round-1 feedback flagged this scenario as having nodes that
// felt visually crowded ("we should switch out this example for one where
// the nodes don't touch each other") and as forcing routers into wiggly,
// crammed paths between adjacent ring nodes. The original ring radius
// (320 px with 120 px boxes) left only ~40 px of axis-aligned gap between
// adjacent boxes — small enough that chord/anti-parallel edges had to
// thread through narrow slots near the ring, producing the visual mess.
//
// Fix: widen the ring (radius 460 around a 560,560 centre) so the
// minimum axis-aligned gap between adjacent boxes is ~110 px. Edge
// topology is unchanged — still 24 edges with a mix of ring,
// long-haul chords, anti-parallel pairs, a near-parallel duplicate,
// and short skip-one edges — so the scenario keeps stressing routers
// for the right reasons (lots of edges, mixed parallel groups) rather
// than for the wrong reason (boxes shoulder-to-shoulder).

export const name = 'dense';
export const description = '12 nodes on a wide circle (radius 460) with ring edges, six chords, two anti-parallel pairs, a near-parallel duplicate, and three skip-one edges (24 edges total). The stress test — many edges and parallel/anti-parallel groups in one frame, but nodes are well-separated so any wiggles come from routing pressure, not node overlap.';

export function build({ DANode, DAEdge }) {
  const cx = 560;
  const cy = 560;
  const radius = 460;
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
