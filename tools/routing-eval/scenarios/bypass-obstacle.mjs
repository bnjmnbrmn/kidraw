import { placeNode, connect } from './_helpers.mjs';

export const name = 'bypass-obstacle';
export const description = 'A→C with B sitting on the straight line between them. The natural straight-line route would pass through B (a non-incident node). Tests pure obstacle avoidance — the router must detour around B.';

export function build({ DANode, DAEdge }) {
  const a = placeNode(DANode, 'A',  200, 300);
  const b = placeNode(DANode, 'B',  500, 300);   // obstacle, not connected
  const c = placeNode(DANode, 'C',  800, 300);
  const ac = connect(DAEdge, 'AC', a, c);
  return { nodes: [a, b, c], edges: [ac] };
}
