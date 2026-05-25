import { placeNode, connect } from './_helpers.mjs';

export const name = 'clock-face';
export const description = '12 nodes on a circle (like clock numerals) with 6 edges crossing the interior at various angles. Probes how the router handles many edges traversing the same central region — must keep them visually distinct.';

export function build({ DANode, DAEdge }) {
  const cx = 550, cy = 500, r = 360;
  const nodes = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * 2 * Math.PI - Math.PI / 2;
    nodes.push(placeNode(DANode, `n${i}`, cx + r * Math.cos(a), cy + r * Math.sin(a)));
  }
  // 6 crossing chords: opposite pairs and some near-opposite pairs.
  const edges = [
    connect(DAEdge, 'n0n6', nodes[0], nodes[6]),     // diameter (12→6)
    connect(DAEdge, 'n3n9', nodes[3], nodes[9]),     // diameter (3→9)
    connect(DAEdge, 'n1n7', nodes[1], nodes[7]),     // diameter (1→7)
    connect(DAEdge, 'n2n8', nodes[2], nodes[8]),
    connect(DAEdge, 'n4n10', nodes[4], nodes[10]),
    connect(DAEdge, 'n5n11', nodes[5], nodes[11]),
  ];
  return { nodes, edges };
}
