import { placeNode, connect } from './_helpers.mjs';

export const name = 'concentric-rings';
export const description = 'Inner ring of 4 nodes + outer ring of 6 nodes around it, with the inner ring fully connected and a few inter-ring spokes. Tests routing in a wraparound geometry where edges have to choose "go around" vs "go through".';

export function build({ DANode, DAEdge }) {
  const cx = 600, cy = 560;
  const innerR = 200, outerR = 470;
  const inner = [], outer = [];
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * 2 * Math.PI;
    inner.push(placeNode(DANode, `i${i}`, cx + innerR * Math.cos(a), cy + innerR * Math.sin(a)));
  }
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * 2 * Math.PI;
    outer.push(placeNode(DANode, `o${i}`, cx + outerR * Math.cos(a), cy + outerR * Math.sin(a)));
  }
  const edges = [];
  // Inner ring fully connected (6 edges).
  for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
    edges.push(connect(DAEdge, `i${i}i${j}`, inner[i], inner[j]));
  }
  // Outer ring (6 edges).
  for (let i = 0; i < 6; i++) edges.push(connect(DAEdge, `o${i}o${(i+1)%6}`, outer[i], outer[(i+1)%6]));
  // 4 inter-ring spokes.
  edges.push(connect(DAEdge, 'i0o0', inner[0], outer[0]));
  edges.push(connect(DAEdge, 'i1o2', inner[1], outer[2]));
  edges.push(connect(DAEdge, 'i2o3', inner[2], outer[3]));
  edges.push(connect(DAEdge, 'i3o5', inner[3], outer[5]));
  return { nodes: [...inner, ...outer], edges };
}
