import { placeNode, connect } from './_helpers.mjs';

export const name = 'tangent-grazing';
export const description = '4 nodes in a row + 1 obstacle right above the middle of the line. Tests whether an edge from a node to a distant peer routes ABOVE the obstacle (clean clearance) vs. just grazes its edge (visually messy).';

export function build({ DANode, DAEdge }) {
  const a = placeNode(DANode, 'A',  200, 500);
  const b = placeNode(DANode, 'B',  450, 500);
  const c = placeNode(DANode, 'C',  700, 500);
  const d = placeNode(DANode, 'D',  950, 500);
  // Obstacle slightly above the line: forces edges going up-and-over to find clearance.
  const obs = placeNode(DANode, 'OBS', 575, 360);
  // Long edges that would naturally pass near the obstacle.
  const ac = connect(DAEdge, 'AC', a, c);
  const ad = connect(DAEdge, 'AD', a, d);
  const bd = connect(DAEdge, 'BD', b, d);
  return { nodes: [a, b, c, d, obs], edges: [ac, ad, bd] };
}
