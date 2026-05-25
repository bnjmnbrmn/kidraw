import { placeNode, connect } from './_helpers.mjs';

export const name = 'diamond-x';
export const description = '4 nodes at the corners of a square with two diagonal edges (the classic "X" pattern). Crossing at exactly 90° — should render pristinely. Probe for unnecessary curvature: a perfect X needs straight lines.';

export function build({ DANode, DAEdge }) {
  const tl = placeNode(DANode, 'TL', 200, 200);
  const tr = placeNode(DANode, 'TR', 800, 200);
  const bl = placeNode(DANode, 'BL', 200, 800);
  const br = placeNode(DANode, 'BR', 800, 800);
  const d1 = connect(DAEdge, 'TLBR', tl, br);
  const d2 = connect(DAEdge, 'TRBL', tr, bl);
  return { nodes: [tl, tr, bl, br], edges: [d1, d2] };
}
