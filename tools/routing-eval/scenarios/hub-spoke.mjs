import { placeNode, connect } from './_helpers.mjs';

export const name = 'hub-spoke';
export const description = 'One central hub with six bidirectional spoke pairs (each spoke has a hub→leaf and a leaf→hub edge). Stresses the anti-parallel grouping at six different angles simultaneously.';

export function build({ DANode, DAEdge }) {
  const cx = 500;
  const cy = 400;
  const radius = 280;
  const hub = placeNode(DANode, 'HUB', cx, cy);
  const nodes = [hub];
  const edges = [];
  for (let i = 0; i < 6; i++) {
    const theta = (i / 6) * 2 * Math.PI;
    const x = cx + Math.cos(theta) * radius;
    const y = cy + Math.sin(theta) * radius;
    const n = placeNode(DANode, `S${i}`, x, y);
    nodes.push(n);
    edges.push(connect(DAEdge, `out${i}`, hub, n));
    edges.push(connect(DAEdge, `in${i}`,  n, hub));
  }
  return { nodes, edges };
}
