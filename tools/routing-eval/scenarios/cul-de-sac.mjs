import { placeNode, connect } from './_helpers.mjs';

export const name = 'cul-de-sac';
export const description = 'Source and destination nearly adjacent but separated by a "U" of obstacles open in the opposite direction. The only route is around the U — a sharp 180° backtrack relative to the direct chord.';

export function build({ DANode, DAEdge }) {
  const s = placeNode(DANode, 'S', 500, 400);
  const t = placeNode(DANode, 'T', 800, 400);
  // U opens to the LEFT — bottom of U faces RIGHT, so going right is blocked.
  // U nodes form ⊂ around (S, T).
  const u1 = placeNode(DANode, 'U1', 950, 250);
  const u2 = placeNode(DANode, 'U2', 950, 400);
  const u3 = placeNode(DANode, 'U3', 950, 550);
  const u4 = placeNode(DANode, 'U4', 800, 250);
  const u5 = placeNode(DANode, 'U5', 650, 250);
  const u6 = placeNode(DANode, 'U6', 800, 550);
  const u7 = placeNode(DANode, 'U7', 650, 550);
  const e = connect(DAEdge, 'ST', s, t);
  return { nodes: [s, t, u1, u2, u3, u4, u5, u6, u7], edges: [e] };
}
