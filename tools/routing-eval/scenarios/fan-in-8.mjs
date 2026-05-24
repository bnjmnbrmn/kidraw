import { placeNode, connect } from './_helpers.mjs';

export const name = 'fan-in-8';
export const description = 'Eight source nodes ringing a single sink — every edge terminates at the same hub. Mirror of fan-out-8 for arrowhead/face-side behavior on incoming traffic.';

export function build({ DANode, DAEdge }) {
  const cx = 500;
  const cy = 400;
  const radius = 300;
  const hub = placeNode(DANode, 'HUB', cx, cy);
  const nodes = [hub];
  const edges = [];
  for (let i = 0; i < 8; i++) {
    const theta = (i / 8) * 2 * Math.PI;
    const x = cx + Math.cos(theta) * radius;
    const y = cy + Math.sin(theta) * radius;
    const n = placeNode(DANode, `S${i}`, x, y);
    nodes.push(n);
    edges.push(connect(DAEdge, `e${i}`, n, hub));
  }
  return { nodes, edges };
}
