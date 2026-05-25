import { placeNode, connect } from './_helpers.mjs';

export const name = 'bottleneck-channel';
export const description = '4 source nodes on the left, 4 destination nodes on the right, with 2 obstacle nodes forming a wall in the middle leaving a single gap. Every source→dest edge must funnel through the gap. Tests channel routing — multiple edges through one narrow passage without merging visually.';

export function build({ DANode, DAEdge }) {
  // Sources at x=200, dests at x=1200, wall obstacles at x=700.
  const srcs = [];
  const dsts = [];
  for (let i = 0; i < 4; i++) {
    srcs.push(placeNode(DANode, `S${i}`, 200, 200 + i * 200));
    dsts.push(placeNode(DANode, `D${i}`, 1200, 200 + i * 200));
  }
  // Wall: 2 nodes blocking top and bottom of the channel, gap at y=500.
  const wallTop = placeNode(DANode, 'WT', 700, 250);
  const wallBot = placeNode(DANode, 'WB', 700, 750);
  const edges = [];
  for (let i = 0; i < 4; i++) edges.push(connect(DAEdge, `E${i}`, srcs[i], dsts[i]));
  return { nodes: [...srcs, ...dsts, wallTop, wallBot], edges };
}
