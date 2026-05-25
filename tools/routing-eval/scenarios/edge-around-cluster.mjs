import { placeNode, connect } from './_helpers.mjs';

export const name = 'edge-around-cluster';
export const description = 'A single edge from S to T must route around a tight cluster of 5 unrelated obstacle nodes sitting between them. Tests the "detour vs straight" tradeoff with a clear "no-go zone".';

export function build({ DANode, DAEdge }) {
  const s = placeNode(DANode, 'S',  150, 400);
  const t = placeNode(DANode, 'T', 1050, 400);
  // 5-node cluster in the middle blocking the direct path.
  const cluster = [
    placeNode(DANode, 'C0', 500, 350),
    placeNode(DANode, 'C1', 600, 350),
    placeNode(DANode, 'C2', 700, 350),
    placeNode(DANode, 'C3', 550, 450),
    placeNode(DANode, 'C4', 650, 450),
  ];
  const e = connect(DAEdge, 'ST', s, t);
  return { nodes: [s, t, ...cluster], edges: [e] };
}
