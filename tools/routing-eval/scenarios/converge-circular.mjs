import { connect } from './_helpers.mjs';

export const name = 'converge-circular';
export const description = 'The KiDraw nudge-converge sample after applying circular layout: four sources funnel into In→Out, then fan to four destinations. Reproduces D1 overlapping the Out→D2 route and near-converging S→In routes.';

export function build({ DANode, DAEdge }) {
  const nodes = [
    new DANode('S1', 60, 80),
    new DANode('S2', 60, 180),
    new DANode('S3', 60, 280),
    new DANode('S4', 60, 380),
    new DANode('In', 280, 180),
    new DANode('Out', 280, 280),
    new DANode('D1', 500, 80),
    new DANode('D2', 500, 180),
    new DANode('D3', 500, 280),
    new DANode('D4', 500, 380),
  ];
  const edges = [
    connect(DAEdge, 'S1-In', nodes[0], nodes[4]),
    connect(DAEdge, 'S2-In', nodes[1], nodes[4]),
    connect(DAEdge, 'S3-In', nodes[2], nodes[4]),
    connect(DAEdge, 'S4-In', nodes[3], nodes[4]),
    connect(DAEdge, 'In-Out', nodes[4], nodes[5]),
    connect(DAEdge, 'Out-D1', nodes[5], nodes[6]),
    connect(DAEdge, 'Out-D2', nodes[5], nodes[7]),
    connect(DAEdge, 'Out-D3', nodes[5], nodes[8]),
    connect(DAEdge, 'Out-D4', nodes[5], nodes[9]),
  ];

  applyCircularLayout(nodes, edges, 200);
  return { nodes, edges };
}

function applyCircularLayout(nodes, edges, spacing) {
  const children = new Map(nodes.map(n => [n, []]));
  const incomingCount = new Map(nodes.map(n => [n, 0]));
  for (const e of edges) {
    children.get(e.srcNode).push(e.destNode);
    incomingCount.set(e.destNode, (incomingCount.get(e.destNode) ?? 0) + 1);
  }

  const roots = nodes.filter(n => (incomingCount.get(n) ?? 0) === 0);
  const queue = roots.length > 0 ? [...roots] : [nodes[0]];
  const visited = new Set(queue);
  const order = [];
  while (queue.length > 0) {
    const node = queue.shift();
    order.push(node);
    for (const child of children.get(node) ?? []) {
      if (!visited.has(child)) {
        visited.add(child);
        queue.push(child);
      }
    }
  }
  for (const n of nodes) {
    if (!visited.has(n)) order.push(n);
  }

  const cx = nodes.reduce((sum, n) => sum + n.konvaGroup.x(), 0) / nodes.length;
  const cy = nodes.reduce((sum, n) => sum + n.konvaGroup.y(), 0) / nodes.length;
  const radius = (spacing * order.length) / (2 * Math.PI);
  for (let i = 0; i < order.length; i++) {
    const angle = (2 * Math.PI * i) / order.length - Math.PI / 2;
    order[i].konvaGroup.setPosition?.({
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    });
    if (!order[i].konvaGroup.setPosition) {
      order[i].konvaGroup._x = cx + radius * Math.cos(angle);
      order[i].konvaGroup._y = cy + radius * Math.sin(angle);
    }
  }
}
