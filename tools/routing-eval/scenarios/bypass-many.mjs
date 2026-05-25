import { placeNode, connect } from './_helpers.mjs';

export const name = 'bypass-many';
export const description = 'A→B with 5 obstacle nodes scattered along the natural straight-line path. Tests obstacle avoidance with more clutter than bypass-obstacle — the router has to navigate a real obstacle field.';

export function build({ DANode, DAEdge }) {
  const a = placeNode(DANode, 'A',  150, 400);
  const b = placeNode(DANode, 'B', 1250, 400);
  // 5 obstacles roughly between A and B at varying y offsets.
  const obstacles = [
    placeNode(DANode, 'O0', 350, 380),
    placeNode(DANode, 'O1', 550, 430),
    placeNode(DANode, 'O2', 750, 370),
    placeNode(DANode, 'O3', 950, 420),
    placeNode(DANode, 'O4', 700, 480),  // slightly below the main line
  ];
  const ab = connect(DAEdge, 'AB', a, b);
  return { nodes: [a, b, ...obstacles], edges: [ab] };
}
