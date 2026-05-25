import { placeNode, connect } from './_helpers.mjs';

export const name = 'petersen';
export const description = 'Petersen graph: 10 nodes (outer pentagon + inner pentagram) with 15 edges. Classic graph-theory stress test — non-planar, complex symmetry, lots of crossings in any 2D layout.';

export function build({ DANode, DAEdge }) {
  const cx = 600, cy = 500;
  const outerR = 320, innerR = 150;
  const outer = [], inner = [];
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * 2 * Math.PI - Math.PI / 2;
    outer.push(placeNode(DANode, `O${i}`, cx + outerR * Math.cos(a), cy + outerR * Math.sin(a)));
    inner.push(placeNode(DANode, `I${i}`, cx + innerR * Math.cos(a), cy + innerR * Math.sin(a)));
  }
  const edges = [];
  // Outer pentagon (5 edges).
  for (let i = 0; i < 5; i++) edges.push(connect(DAEdge, `O${i}O${(i+1)%5}`, outer[i], outer[(i+1)%5]));
  // Inner pentagram — connect each inner node to the one 2 ahead (5 edges).
  for (let i = 0; i < 5; i++) edges.push(connect(DAEdge, `I${i}I${(i+2)%5}`, inner[i], inner[(i+2)%5]));
  // Spokes (5 edges).
  for (let i = 0; i < 5; i++) edges.push(connect(DAEdge, `O${i}I${i}`, outer[i], inner[i]));
  return { nodes: [...outer, ...inner], edges };
}
