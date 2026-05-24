import { placeNode, connect } from './_helpers.mjs';

export const name = 'tree-5';
export const description = 'A balanced tree: root → (L, R); L → LL; R → RR. Common org-chart shape; tests downward fan-out edges with no obstacles in the routes.';

export function build({ DANode, DAEdge }) {
  const root = placeNode(DANode, 'root', 500, 150);
  const l = placeNode(DANode, 'L', 300, 350);
  const r = placeNode(DANode, 'R', 700, 350);
  const ll = placeNode(DANode, 'LL', 300, 550);
  const rr = placeNode(DANode, 'RR', 700, 550);
  return {
    nodes: [root, l, r, ll, rr],
    edges: [
      connect(DAEdge, 'root-L', root, l),
      connect(DAEdge, 'root-R', root, r),
      connect(DAEdge, 'L-LL', l, ll),
      connect(DAEdge, 'R-RR', r, rr),
    ],
  };
}
