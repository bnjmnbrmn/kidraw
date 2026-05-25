import { placeNode, connect } from './_helpers.mjs';

export const name = 'maze';
export const description = '"S"-shaped wall of 8 obstacle nodes with a start and end node positioned so the only sensible route follows the S. Tests if the router finds the natural channel rather than trying to power-through.';

export function build({ DANode, DAEdge }) {
  // Start bottom-left, end top-right. Walls form an S.
  const start = placeNode(DANode, 'START', 200, 800);
  const end   = placeNode(DANode, 'END',  1200, 200);
  // Wall 1: horizontal across the middle (y=600), x = 200..900
  const w1a = placeNode(DANode, 'W1a', 350, 600);
  const w1b = placeNode(DANode, 'W1b', 550, 600);
  const w1c = placeNode(DANode, 'W1c', 750, 600);
  const w1d = placeNode(DANode, 'W1d', 900, 600);  // wall extends to (900, 600); gap is from x=900 onward
  // Wall 2: horizontal across (y=400), x = 400..1200 (gap is from x=200 to x=350)
  const w2a = placeNode(DANode, 'W2a', 450, 400);
  const w2b = placeNode(DANode, 'W2b', 650, 400);
  const w2c = placeNode(DANode, 'W2c', 850, 400);
  const w2d = placeNode(DANode, 'W2d', 1050, 400);
  const e = connect(DAEdge, 'SE', start, end);
  return { nodes: [start, end, w1a, w1b, w1c, w1d, w2a, w2b, w2c, w2d], edges: [e] };
}
