import { placeNode, connect } from './_helpers.mjs';

export const name = 'wall-with-gap';
export const description = 'A long wall of 6 obstacle nodes with a single small gap, separating a source and destination. More extreme version of bottleneck-channel — exactly one edge but the gap is narrow.';

export function build({ DANode, DAEdge }) {
  const s = placeNode(DANode, 'S', 200, 500);
  const t = placeNode(DANode, 'T', 1200, 500);
  // Wall at x=700, spanning y=100..900 with a gap at y=500.
  const wallYs = [100, 250, 400, 600, 750, 900];
  const wall = wallYs.map((y, i) => placeNode(DANode, `W${i}`, 700, y));
  const e = connect(DAEdge, 'ST', s, t);
  return { nodes: [s, t, ...wall], edges: [e] };
}
