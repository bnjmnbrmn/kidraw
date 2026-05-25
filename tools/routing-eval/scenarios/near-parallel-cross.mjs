import { placeNode, connect } from './_helpers.mjs';

export const name = 'near-parallel-cross';
export const description = '4 nodes positioned so the natural straight-line edges between (A→C) and (B→D) would intersect at a very shallow angle (~6°). Tests whether the router curves edges to widen the crossing angle into the visually unambiguous range — a key tradeoff between length/curvature and crossing-angle metrics.';

export function build({ DANode, DAEdge }) {
  // A at (0, 0), C at (1000, 50): line slope +0.05
  // B at (0, 50), D at (1000, 0): line slope -0.05
  // Acute angle between lines: ~5.7°
  const a = placeNode(DANode, 'A',  200, 280);
  const b = placeNode(DANode, 'B',  200, 320);
  const c = placeNode(DANode, 'C',  900, 320);
  const d = placeNode(DANode, 'D',  900, 280);
  const ac = connect(DAEdge, 'AC', a, c);
  const bd = connect(DAEdge, 'BD', b, d);
  return { nodes: [a, b, c, d], edges: [ac, bd] };
}
